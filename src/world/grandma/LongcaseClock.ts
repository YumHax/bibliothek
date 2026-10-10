import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { Furniture } from '../Furniture';
import { ClockTick } from '@/audio/ambient';
import { LongcaseChime } from '@/audio/grandmaSounds';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { formatClock } from '@/text/clock';
import { cylinderMesh, invisibleHitbox } from '../meshUtils';
import { part } from '../props/Prop';
import { METAL, paint, timber } from '../materials/palette';
import { GLASS, asGlass } from '../materials/glass';
import { layMesh, WALL } from '../surface/layers';
import { PROUD, SEAM } from '../props/joinery';
import { HoverGlint } from '../props/hoverGlint';
import type { DayNight } from '../props/DayNight';

const OFF_WALL = 0.02;
/** The case's three parts (m), bottom up: the plinth, the trunk (its window on the pendulum), the hood (the dial). */
const PLINTH = { w: 0.5, h: 0.32, d: 0.28 };
const TRUNK = { w: 0.38, h: 1.18, d: 0.22 };
const HOOD = { w: 0.48, h: 0.5, d: 0.28 };
const MOULD = 0.025;
const BOARD = 0.018;
const DIAL = 0.15;
/** The pendulum: its length from the pivot, how far it swings (radians), a beat a second. */
const PENDULUM = { length: 0.82, swing: 0.09, period: 2 };
const HAND = { t: 0.003 };
/** How far out of the hood's front the hands, the bezel and the arbor's tip stand. */
const OUT = { hands: 0.004, bezel: 0.006, arbor: 0.012, column: 0.016 };

/** The dial, painted once a clock: cream enamel, Roman hours, a ring of minutes, roses in the corners' spandrels. */
function paintDial(): THREE.CanvasTexture {
  const S = 256;
  const [canvas, ctx] = createCanvas(S, S);
  const c = S / 2;
  ctx.fillStyle = '#2a1e14';
  ctx.fillRect(0, 0, S, S);
  // The spandrels: a painted rose in each corner.
  for (const [x, y] of [
    [0.12, 0.12],
    [0.88, 0.12],
    [0.12, 0.88],
    [0.88, 0.88],
  ] as const) {
    ctx.fillStyle = '#b8483a';
    ctx.beginPath();
    ctx.arc(x * S, y * S, S * 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5a7a3a';
    ctx.beginPath();
    ctx.ellipse(x * S + S * 0.05, y * S, S * 0.03, S * 0.012, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#efe6cf';
  ctx.beginPath();
  ctx.arc(c, c, c * 0.92, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2a201a';
  ctx.lineWidth = 2;
  for (const r of [0.86, 0.78]) {
    ctx.beginPath();
    ctx.arc(c, c, c * r, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const inner = i % 5 === 0 ? 0.74 : 0.78;
    ctx.beginPath();
    ctx.moveTo(c + Math.sin(a) * c * inner, c - Math.cos(a) * c * inner);
    ctx.lineTo(c + Math.sin(a) * c * 0.86, c - Math.cos(a) * c * 0.86);
    ctx.stroke();
  }
  const numerals = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  ctx.fillStyle = '#1e1812';
  ctx.font = `bold ${Math.round(S * 0.075)}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  numerals.forEach((numeral, i) => {
    const a = (i / 12) * Math.PI * 2;
    ctx.fillText(numeral, c + Math.sin(a) * c * 0.6, c - Math.cos(a) * c * 0.6);
  });
  ctx.font = `italic ${Math.round(S * 0.045)}px Georgia, serif`;
  ctx.fillText('Aubry · Besançon', c, c * 1.36);
  return toTexture(canvas, 'facing');
}

/** A hand: a dark slab from the arbor out to `length` (a stub past it), pointing up at 12. */
function hand(length: number, width: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, length + 0.02, HAND.t), paint(0x1a1612, 0.4));
  mesh.position.y = length / 2 - 0.01;
  return mesh;
}

/**
 * Mémé's longcase clock against the back wall (`furnishGrandmaDecor`): a walnut case on its plinth, the pendulum
 * swinging behind the trunk's glass, the two brass weights on their chains, the painted dial in the hood. Its hands
 * keep the room's time; it ticks a beat a second (`tick`, in step with the swing) and strikes the hours on its rods
 * (`chime`): the builder puts both voices on `PointSound`s. Hovered it reads the time. Origin on the floor at the
 * wall, front towards +z; `wall` placement with `y: 0`. Collides.
 */
export class LongcaseClock extends THREE.Group implements Furniture, Interactable, Updatable {
  readonly footprint = new THREE.Box3(new THREE.Vector3(-PLINTH.w / 2, 0, 0), new THREE.Vector3(PLINTH.w / 2, PLINTH.h + TRUNK.h + HOOD.h, OFF_WALL + HOOD.d));
  readonly hitboxes: THREE.Object3D[];
  /** The escapement's tick and the hour's chime, for the builder's `PointSound`s. */
  readonly tick = new ClockTick();
  readonly chime = new LongcaseChime();
  /** Where the sound comes from: the hood's middle, in the clock's frame. */
  readonly voiceAt: THREE.Vector3;
  private readonly pendulum = new THREE.Group();
  private readonly hourHand = new THREE.Group();
  private readonly minuteHand = new THREE.Group();
  private readonly glint: HoverGlint;
  private readonly unsubscribe: () => void;
  private hours = 0;
  private hour = -1;
  private time = 0;
  private side = 1;

  constructor(dayNight: DayNight) {
    super();
    this.name = 'LongcaseClock';
    const walnut = timber(0x5a3820, 0.45);
    const dark = timber(0x3e2614, 0.5);
    const brass = METAL.agedBrass();

    // The plinth and its moulding.
    part(this, PLINTH.w, PLINTH.h, PLINTH.d, walnut, { y: PLINTH.h / 2, z: OFF_WALL + PLINTH.d / 2 });
    const plinthTop = PLINTH.h + SEAM;
    part(this, PLINTH.w + 2 * MOULD, MOULD, PLINTH.d + MOULD, dark, { y: plinthTop + MOULD / 2, z: OFF_WALL + (PLINTH.d + MOULD) / 2 });

    // The trunk: back, sides, the front's frame round its window, the glass, the pendulum and the weights inside.
    const trunkY = plinthTop + MOULD + SEAM;
    const trunkZ = OFF_WALL + TRUNK.d / 2;
    part(this, TRUNK.w - 2 * BOARD, TRUNK.h, BOARD, paint(0x2a1a10, 0.8), { y: trunkY + TRUNK.h / 2, z: OFF_WALL + BOARD / 2 });
    for (const s of [-1, 1]) part(this, BOARD, TRUNK.h, TRUNK.d, walnut, { x: s * (TRUNK.w / 2 - BOARD / 2), y: trunkY + TRUNK.h / 2, z: trunkZ });
    const front = OFF_WALL + TRUNK.d + SEAM;
    const pane = { w: TRUNK.w * 0.5, h: TRUNK.h * 0.55, y: trunkY + TRUNK.h * 0.55 };
    const stile = (TRUNK.w - pane.w) / 2;
    for (const s of [-1, 1]) part(this, stile, TRUNK.h, BOARD, walnut, { x: s * (pane.w / 2 + stile / 2), y: trunkY + TRUNK.h / 2, z: front + BOARD / 2 });
    const below = pane.y - pane.h / 2 - trunkY;
    const above = trunkY + TRUNK.h - (pane.y + pane.h / 2);
    part(this, pane.w - 2 * SEAM, below, BOARD, walnut, { y: trunkY + below / 2, z: front + BOARD / 2 });
    part(this, pane.w - 2 * SEAM, above, BOARD, walnut, { y: trunkY + TRUNK.h - above / 2, z: front + BOARD / 2 });
    asGlass(part(this, pane.w + 0.01, pane.h + 0.01, 0.003, GLASS.clear, { y: pane.y, z: front + BOARD / 2 }));

    // The pendulum hangs from the hood's movement, swinging in the trunk's middle, between the back and the glass.
    const pivotY = trunkY + TRUNK.h + HOOD.h * 0.3;
    const pendulumZ = OFF_WALL + BOARD + (TRUNK.d - BOARD) * 0.45;
    this.pendulum.position.set(0, pivotY, pendulumZ);
    this.pendulum.userData.live = true;
    const rod = cylinderMesh(0.004, PENDULUM.length, brass, { y: -PENDULUM.length / 2 }, { segments: 6 });
    rod.castShadow = false;
    const bob = cylinderMesh(0.07, 0.016, METAL.brass(), { y: -PENDULUM.length }, { segments: 28 });
    bob.rotation.x = Math.PI / 2;
    this.pendulum.add(rod, bob);
    this.add(this.pendulum);
    // The weights on their chains, either side, behind the pendulum's swing.
    const weightZ = OFF_WALL + BOARD + 0.035;
    for (const [x, drop] of [
      [-0.09, 0.32],
      [0.09, 0.45],
    ] as const) {
      const chain = cylinderMesh(0.002, drop, paint(0x8a7a5a, 0.5), { x, y: pivotY - drop / 2, z: weightZ }, { segments: 4 });
      chain.castShadow = false;
      this.add(chain);
      this.add(cylinderMesh(0.03, 0.2, brass, { x, y: pivotY - drop - 0.1, z: weightZ }, { segments: 18 }));
    }

    // The hood: its box, a moulded cornice, a broken-arch crest, the dial and its hands, the turned columns.
    const hoodY = trunkY + TRUNK.h + SEAM;
    const hoodZ = OFF_WALL + HOOD.d / 2;
    part(this, HOOD.w, HOOD.h, HOOD.d, walnut, { y: hoodY + HOOD.h / 2, z: hoodZ });
    part(this, HOOD.w + 2 * MOULD, MOULD, HOOD.d + MOULD, dark, { y: hoodY + HOOD.h + SEAM + MOULD / 2, z: OFF_WALL + (HOOD.d + MOULD) / 2 });
    const crestY = hoodY + HOOD.h + 2 * SEAM + MOULD;
    for (const s of [-1, 1]) {
      const scroll = part(this, HOOD.w * 0.32, 0.09, 0.03, dark, { x: s * HOOD.w * 0.22, y: crestY + 0.04, z: OFF_WALL + HOOD.d - 0.02 });
      scroll.rotation.z = -s * 0.35;
    }
    this.add(cylinderMesh(0.02, 0.06, brass, { y: crestY + 0.03, z: OFF_WALL + HOOD.d - 0.02 }, { segments: 12 }));
    for (const s of [-1, 1]) this.add(cylinderMesh(0.016, HOOD.h - 0.04, METAL.brass(), { x: s * (HOOD.w / 2 - 0.03), y: hoodY + HOOD.h / 2, z: OFF_WALL + HOOD.d + OUT.column }, { segments: 12 }));
    const hoodFront = OFF_WALL + HOOD.d;
    const dialY = hoodY + HOOD.h * 0.5;
    const dial = new THREE.Mesh(new THREE.PlaneGeometry(2 * DIAL * 1.1, 2 * DIAL * 1.1), new THREE.MeshStandardMaterial({ map: paintDial(), roughness: 0.85 }));
    dial.position.set(0, dialY, hoodFront + WALL.print.lift);
    layMesh(dial, WALL.print);
    this.add(dial);
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(DIAL * 0.93, 0.008, 8, 40), brass);
    bezel.position.set(0, dialY, hoodFront + OUT.bezel);
    this.add(bezel);
    this.hourHand.position.set(0, dialY, hoodFront + OUT.hands);
    this.minuteHand.position.set(0, dialY, hoodFront + OUT.hands + HAND.t + SEAM);
    this.hourHand.add(hand(DIAL * 0.5, 0.012));
    this.minuteHand.add(hand(DIAL * 0.78, 0.008));
    this.hourHand.userData.live = this.minuteHand.userData.live = true;
    this.add(this.hourHand, this.minuteHand);
    const arbor = cylinderMesh(0.006, 0.012, brass, { y: dialY, z: hoodFront + OUT.arbor }, { segments: 10 });
    arbor.rotation.x = Math.PI / 2;
    this.add(arbor);
    this.glint = HoverGlint.of(bezel, arbor);
    this.voiceAt = new THREE.Vector3(0, dialY, hoodFront + PROUD);

    const total = PLINTH.h + TRUNK.h + HOOD.h;
    const hitbox = invisibleHitbox(PLINTH.w, total, HOOD.d + 0.04, { y: total / 2, z: OFF_WALL + (HOOD.d + 0.04) / 2 });
    this.hitboxes = [hitbox];
    this.add(hitbox);

    this.unsubscribe = dayNight.onChange((sky) => this.setTime(sky.hours));
  }

  /** The hands to `hours`; on a new hour, the chime. */
  private setTime(hours: number): void {
    this.hours = hours;
    this.hourHand.rotation.z = -((hours % 12) / 12) * Math.PI * 2;
    this.minuteHand.rotation.z = -(hours % 1) * Math.PI * 2;
    const hour = Math.floor(hours);
    if (this.hour >= 0 && hour !== this.hour) this.chime.ring(hour);
    this.hour = hour;
  }

  /** The swing, and the tick at each end of it. */
  update(dt: number): void {
    this.time += Math.min(dt, 0.5);
    const phase = Math.sin((this.time * 2 * Math.PI) / PENDULUM.period);
    this.pendulum.rotation.z = PENDULUM.swing * phase;
    const side = Math.cos((this.time * 2 * Math.PI) / PENDULUM.period) >= 0 ? 1 : -1;
    if (side !== this.side) {
      this.side = side;
      this.tick.strike();
    }
  }

  setHovered(hovered: boolean): void {
    this.glint.set(hovered);
  }

  label(): string {
    return `Longcase clock ${formatClock(this.hours)} · check the time`;
  }

  activate(session: SessionActions): void {
    session.react(`It’s ${formatClock(this.hours)}`);
  }

  dispose(): void {
    this.unsubscribe();
  }
}
