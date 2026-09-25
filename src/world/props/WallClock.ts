import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { createCanvas, toTexture, FONT } from '@/covers/generated/canvasUtils';
import { invisibleHitbox } from '../meshUtils';
import { Prop, matte } from './Prop';
import type { DayNight } from './DayNight';
import { wood as woodMaterial } from '@/world/materials/finishes';
import { playAlarm } from '@/audio/alarm';

export interface WallClockOptions {
  /** Outer diameter of the case. Default 0.32 m. */
  diameter?: number;
  /** Colour of the case. Default dark walnut. */
  caseColor?: number;
}

const CASE_DEPTH = 0.05;
const DIAL_PX = 512;
const DIAL_COLOR = '#f2ecdf';
const INK = '#1c1a17';
const SEGMENTS = 48;
/** A second click within this long of the first sets (or cancels) the alarm. */
const DOUBLE_CLICK_MS = 2000;
/** The alarm goes off this many in-game hours after it is set. */
const ALARM_IN_HOURS = 1;

/**
 * A round wall clock that keeps the room's time: its hands follow the `DayNight` cycle (a whole
 * day in ten minutes, so the minute hand visibly sweeps). Hovering it reads the time; clicking it
 * says the time, and a second click within two seconds sets an alarm an in-game hour later (or
 * cancels the one set), which beeps when the clock gets there (wherever the player is by then).
 * Local origin is the centre of the clock, on the wall; local +z faces into the room (`wallMount()`).
 */
export class WallClock extends Prop implements Interactable {
  readonly hitboxes: THREE.Object3D[];

  private readonly hourHand = new THREE.Group();
  private readonly minuteHand = new THREE.Group();
  private readonly bezel: THREE.MeshStandardMaterial;
  private hours = 0;
  /** In-game hours until the alarm rings, and the time it was set for; null when none is set. */
  private alarm: { left: number; at: number } | null = null;
  private lastClickAt = -Infinity;
  /** Who set the alarm: told when it rings. */
  private session: SessionActions | null = null;

  constructor(
    dayNight: DayNight,
    options: WallClockOptions = {},
  ) {
    super();
    this.name = 'WallClock';
    const diameter = options.diameter ?? 0.32;
    const radius = diameter / 2;
    const dialRadius = radius * 0.88;
    const faceZ = CASE_DEPTH;

    // Case: a shallow cylinder proud of the wall, axis along z.
    const wood = woodMaterial(options.caseColor ?? 0x3a2c22, 0.55);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, CASE_DEPTH, SEGMENTS), wood);
    body.rotation.x = Math.PI / 2;
    body.position.z = CASE_DEPTH / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    this.add(body);

    // Dial: a painted disc on the front face.
    const dial = new THREE.Mesh(
      new THREE.CircleGeometry(dialRadius, SEGMENTS),
      new THREE.MeshStandardMaterial({ map: paintDial(), roughness: 0.9 }),
    );
    dial.position.z = faceZ + 0.0005;
    dial.receiveShadow = true;
    this.add(dial);

    // Hands: dark slabs pivoting at the centre, slightly above the dial; the hour hand under the minute hand.
    const ink = matte(0x1c1a17, 0.4);
    this.hourHand.add(hand(dialRadius * 0.55, 0.011, ink));
    this.minuteHand.add(hand(dialRadius * 0.82, 0.008, ink));
    this.hourHand.position.z = faceZ + 0.004;
    this.minuteHand.position.z = faceZ + 0.008;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.006, 16), ink);
    cap.rotation.x = Math.PI / 2;
    cap.position.z = faceZ + 0.011;
    this.add(this.hourHand, this.minuteHand, cap);

    // Bezel ring and a faint glass over the face; the bezel glints when hovered.
    this.bezel = new THREE.MeshStandardMaterial({ color: 0xb8a37a, metalness: 0.7, roughness: 0.35, emissive: 0xb8a37a, emissiveIntensity: 0 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.93, radius * 0.06, 12, SEGMENTS), this.bezel);
    ring.position.z = faceZ + 0.006;
    ring.castShadow = true;
    const glass = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.9, SEGMENTS),
      new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, roughness: 0.05, metalness: 0.1, depthWrite: false }),
    );
    glass.position.z = faceZ + 0.016;
    this.add(ring, glass);

    const hitbox = invisibleHitbox(diameter, diameter, CASE_DEPTH + 0.03, { z: (CASE_DEPTH + 0.03) / 2 });
    this.add(hitbox);
    this.hitboxes = [hitbox];

    dayNight.onChange((sky) => this.setTime(sky.hours));
  }

  /** Turns the hands to `hours` (0 ≤ hours < 24, fractional). */
  setTime(hours: number): void {
    this.tickAlarm(hours);
    this.hours = hours;
    // Clockwise as seen from the room = negative rotation about local +z.
    this.hourHand.rotation.z = -((hours % 12) / 12) * Math.PI * 2;
    this.minuteHand.rotation.z = -(hours % 1) * Math.PI * 2;
  }

  // --- Interactable -------------------------------------------------------------------------

  setHovered(hovered: boolean): void {
    this.bezel.emissiveIntensity = hovered ? 0.35 : 0;
  }

  label(): string {
    const alarm = this.alarm ? ` · alarm ${formatTime(this.alarm.at)}` : '';
    return `${formatTime(this.hours)}${alarm} — click to check the time`;
  }

  activate(session: SessionActions): void {
    this.session = session;
    const now = performance.now();
    const again = now - this.lastClickAt < DOUBLE_CLICK_MS;
    this.lastClickAt = again ? -Infinity : now;
    if (!again) {
      const next = this.alarm ? `cancel the ${formatTime(this.alarm.at)} alarm` : `set an alarm for ${formatTime(this.hours + ALARM_IN_HOURS)}`;
      session.hint(`It's ${formatTime(this.hours)} · click again to ${next}`);
      return;
    }
    if (this.alarm) {
      this.alarm = null;
      session.hint('Alarm off');
      return;
    }
    this.alarm = { left: ALARM_IN_HOURS, at: (this.hours + ALARM_IN_HOURS) % 24 };
    session.hint(`Alarm set for ${formatTime(this.alarm.at)}`);
  }

  /** Counts the clock's forward run down to the alarm; a jump back (the N key's afternoon) is not time passing. */
  private tickAlarm(hours: number): void {
    if (!this.alarm) return;
    const step = (((hours - this.hours) % 24) + 24) % 24;
    if (step >= 12) return;
    this.alarm.left -= step;
    if (this.alarm.left > 0) return;
    const at = this.alarm.at;
    this.alarm = null;
    playAlarm();
    this.session?.hint(`The alarm rings: ${formatTime(at)}`);
  }
}

/** "HH:MM" of a fractional hour of the day. */
export function formatTime(hours: number): string {
  const total = Math.floor((((hours % 24) + 24) % 24) * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** A hand of `length` pointing up (+y) from the pivot, with a short tail past it. */
function hand(length: number, width: number, material: THREE.Material): THREE.Mesh {
  const tail = 0.015;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, length + tail, 0.003), material);
  mesh.position.y = (length - tail) / 2;
  mesh.castShadow = false;
  return mesh;
}

/** Cream dial with minute ticks, bold hour markers and the four cardinal numerals. */
function paintDial(): THREE.CanvasTexture {
  const S = DIAL_PX;
  const c = S / 2;
  const [canvas, ctx] = createCanvas(S, S);

  const shade = ctx.createRadialGradient(c, c, S * 0.2, c, c, S * 0.5);
  shade.addColorStop(0, DIAL_COLOR);
  shade.addColorStop(1, '#ddd5c4');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, S, S);

  ctx.strokeStyle = INK;
  ctx.lineCap = 'round';
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const hour = i % 5 === 0;
    const outer = S * 0.46;
    const inner = outer - (hour ? S * 0.05 : S * 0.022);
    ctx.lineWidth = hour ? S * 0.014 : S * 0.005;
    ctx.beginPath();
    ctx.moveTo(c + Math.sin(a) * inner, c - Math.cos(a) * inner);
    ctx.lineTo(c + Math.sin(a) * outer, c - Math.cos(a) * outer);
    ctx.stroke();
  }

  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.round(S * 0.11)}px ${FONT}`;
  const numeralR = S * 0.33;
  const numerals: [string, number][] = [
    ['12', 0],
    ['3', Math.PI / 2],
    ['6', Math.PI],
    ['9', (3 * Math.PI) / 2],
  ];
  for (const [text, a] of numerals) ctx.fillText(text, c + Math.sin(a) * numeralR, c - Math.cos(a) * numeralR + S * 0.005);

  ctx.font = `500 ${Math.round(S * 0.035)}px ${FONT}`;
  ctx.fillStyle = '#6a6259';
  ctx.fillText('BIBLIOTHEK', c, c + S * 0.17);

  return toTexture(canvas, 4);
}
