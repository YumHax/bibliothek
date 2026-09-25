import * as THREE from 'three';
import { ChipSpeaker } from '@/audio/ChipSpeaker';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { boxMesh, cylinderMesh, invisibleHitbox } from '../meshUtils';
import { matte } from '../props/Prop';
import { type ArcadeControls, NO_CONTROLS, drawText } from './games/ArcadeGame';
import { TicketMachine, type TicketMachineWiring } from './TicketMachine';
import { TicketStrip } from './TicketStrip';

/** One slice of the wheel: what it pays (or the jackpot) and how wide it is (its odds). */
export interface WheelSlice {
  tickets: number | 'jackpot';
  weight: number;
}

export interface TicketWheelOptions {
  slices: readonly WheelSlice[];
  /** The progressive jackpot: its value, growing with every spin, back to its start when hit. */
  jackpot: { readonly value: number; grow(): void; hit(): number; subscribe(cb: () => void): () => void };
  title?: string;
  color?: number;
}

const BOARD_W = 1.3;
const BOARD_H = 2.35;
const WHEEL_R = 0.56;
const WHEEL_Y = 1.62;
const WHEEL_Z = 0.1;
const PODIUM = { w: 0.5, h: 1.0, d: 0.4, z: 0.55 };
const BULBS = 28;
const STAND_Z = 1.15;
/** The spin: a fling at this speed (radians a second, plus up to `SPIN_EXTRA` of luck), braked by friction and the pegs. */
const SPIN_SPEED = 9;
const SPIN_EXTRA = 7;
const FRICTION = 0.6;
const DRAG = 0.45;
const PEG_BRAKE = 0.012;
const STOP_BELOW = 0.06;
const SLICE_COLORS = ['#e8303a', '#ffd23a', '#2f6bd8', '#39c26a', '#ff7a1a', '#b05cff'];

/**
 * The ticket wheel on the wall: a big painted wheel of sixteen slices ringed by chasing bulbs,
 * with a flapper at the top and a podium with a button under it. A coin, then Space (or a click
 * on it) spins it; it slows on friction and the pegs, the flapper ticking over them, and pays the
 * slice it stops on in tickets (score = tickets). The slices are as wide as their odds, so what
 * you see is what you get; one thin gold slice is the progressive JACKPOT (on the podium's
 * display), which every spin anyone takes feeds and a hit empties. Pure luck: it keeps no table.
 * Regulars spin it too, jackpot and all. Wall-standing: origin on the floor at the wall, +z into
 * the room.
 */
export class TicketWheel extends TicketMachine {
  readonly hitboxes: THREE.Object3D[];
  readonly game: { readonly id: string; readonly title: string; readonly hint: string };
  readonly standAt = new THREE.Vector3(0.1, 0, STAND_Z - 0.2);
  readonly focus = new THREE.Vector3(0, WHEEL_Y, WHEEL_Z);
  readonly lean = 0;
  readonly luck = true;
  protected readonly speaker: ChipSpeaker;
  protected readonly strip: TicketStrip;

  private readonly options: TicketWheelOptions;
  private readonly wheel: THREE.Group;
  private readonly flapper: THREE.Group;
  private readonly bulbs: THREE.Mesh[] = [];
  private readonly button: THREE.Mesh;
  private readonly hands: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly display: { ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture };
  /** Slice boundaries, radians counter-clockwise from +x on the wheel's face; slice i spans [edges[i], edges[i+1]). */
  private readonly edges: number[];
  private readonly unsubscribe: () => void;
  private angle = 0;
  private spin = 0;
  private spinning = false;
  private landed: number | null = null;
  private won = 0;
  private lastPeg = 0;
  private flap = 0;
  private waitClock = 0;
  private displayClock = 0;
  private dirty = true;

  constructor(options: TicketWheelOptions, wiring: TicketMachineWiring) {
    super(wiring);
    this.name = 'TicketWheel';
    this.options = options;
    const title = options.title ?? 'TICKET WHEEL';
    this.game = { id: 'wheel', title, hint: 'Space or click to spin · the slice under the flapper pays' };
    const total = options.slices.reduce((sum, s) => sum + s.weight, 0);
    this.edges = [0];
    for (const s of options.slices) this.edges.push(this.edges[this.edges.length - 1]! + (s.weight / total) * Math.PI * 2);

    const paint = matte(options.color ?? 0x2a0f24, 0.5);
    const gold = new THREE.MeshStandardMaterial({ color: 0xd4a52a, metalness: 0.8, roughness: 0.3 });
    // The backboard with the marquee on top.
    this.add(boxMesh(BOARD_W, BOARD_H, 0.06, paint, { y: BOARD_H / 2 + 0.3, z: 0.03 }));
    const marquee = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W - 0.1, 0.24), new THREE.MeshBasicMaterial({ map: paintMarquee(title), toneMapped: false }));
    marquee.position.set(0, BOARD_H + 0.3 - 0.18, 0.062);
    this.add(marquee);
    // The wheel: a painted disc on a hub, pegs at the slice edges, a gold rim.
    this.wheel = new THREE.Group();
    this.wheel.position.set(0, WHEEL_Y, WHEEL_Z);
    const face = new THREE.Mesh(new THREE.CircleGeometry(WHEEL_R, 64), new THREE.MeshStandardMaterial({ map: this.paintFace(), roughness: 0.45 }));
    this.wheel.add(face);
    const back = cylinderMesh(WHEEL_R, 0.04, matte(0x151518, 0.5), { z: -0.021 }, { segments: 48 });
    back.rotation.x = Math.PI / 2;
    this.wheel.add(back);
    for (const edge of this.edges.slice(0, -1)) {
      const peg = cylinderMesh(0.008, 0.035, gold, { x: Math.cos(edge) * (WHEEL_R - 0.02), y: Math.sin(edge) * (WHEEL_R - 0.02), z: 0.017 }, { segments: 8 });
      peg.rotation.x = Math.PI / 2;
      this.wheel.add(peg);
    }
    const hub = cylinderMesh(0.07, 0.05, gold, { z: 0.02 }, { segments: 20 });
    hub.rotation.x = Math.PI / 2;
    this.wheel.add(hub);
    this.add(this.wheel);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_R + 0.02, 0.018, 8, 64), gold);
    rim.position.set(0, WHEEL_Y, WHEEL_Z);
    this.add(rim);
    // The bulbs round it, chasing.
    for (let i = 0; i < BULBS; i++) {
      const a = (i / BULBS) * Math.PI * 2;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), BULB_OFF);
      bulb.position.set(Math.cos(a) * (WHEEL_R + 0.09), WHEEL_Y + Math.sin(a) * (WHEEL_R + 0.09), 0.075);
      this.bulbs.push(bulb);
      this.add(bulb);
    }
    // The flapper at the top, pivoting where it is bolted on.
    this.flapper = new THREE.Group();
    this.flapper.position.set(0, WHEEL_Y + WHEEL_R + 0.1, WHEEL_Z + 0.04);
    const tongue = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 3), matte(0xe8303a, 0.4));
    tongue.rotation.z = Math.PI;
    tongue.position.y = -0.07;
    this.flapper.add(tongue, cylinderMesh(0.02, 0.03, gold, {}, { segments: 12 }).rotateX(Math.PI / 2));
    this.add(this.flapper);
    // The podium: the button, the display, the ticket slot.
    this.add(boxMesh(PODIUM.w, PODIUM.h, PODIUM.d, paint, { y: PODIUM.h / 2, z: PODIUM.z }));
    const top = boxMesh(PODIUM.w + 0.04, 0.03, PODIUM.d + 0.04, matte(0x151518, 0.5), { y: PODIUM.h + 0.015, z: PODIUM.z });
    this.add(top);
    this.button = cylinderMesh(0.07, 0.05, new THREE.MeshStandardMaterial({ color: 0xe8303a, emissive: 0xe8303a, emissiveIntensity: 0.3, roughness: 0.4 }), { x: 0.08, y: PODIUM.h + 0.05, z: PODIUM.z + 0.05 }, { segments: 20 });
    this.add(this.button);
    const [canvas, ctx] = createCanvas(256, 96);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.display = { ctx, texture };
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.15), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
    screen.position.set(0, PODIUM.h - 0.14, PODIUM.z + PODIUM.d / 2 + 0.002);
    this.add(screen);
    this.strip = new TicketStrip(0.4);
    this.strip.position.set(-0.14, 0.4, PODIUM.z + PODIUM.d / 2 + 0.001);
    this.add(this.strip);

    const hitbox = invisibleHitbox(BOARD_W, BOARD_H + 0.3, PODIUM.z + PODIUM.d / 2 + 0.05, { y: (BOARD_H + 0.3) / 2, z: (PODIUM.z + PODIUM.d / 2 + 0.05) / 2 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
    this.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh !== marquee && mesh !== screen) mesh.receiveShadow = true;
    });
    this.speaker = new ChipSpeaker(this.wheel, wiring.listener, { volume: 0.26 });
    this.unsubscribe = options.jackpot.subscribe(() => (this.dirty = true));
    this.newGame();
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-PODIUM.w / 2, 0, 0), new THREE.Vector3(PODIUM.w / 2, PODIUM.h, PODIUM.z + PODIUM.d / 2));
  }

  eyePose(): { position: THREE.Vector3; yaw: number } {
    const position = this.localToWorld(new THREE.Vector3(0, 1.58, STAND_Z));
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.getWorldQuaternion(new THREE.Quaternion()));
    return { position, yaw: Math.atan2(-forward.x, -forward.z) };
  }

  /** One hand on the button, the other resting on the podium. */
  handsAt(): readonly [THREE.Vector3, THREE.Vector3] {
    this.button.getWorldPosition(this.hands[0]).y += 0.04;
    this.localToWorld(this.hands[1].set(-0.15, PODIUM.h + 0.04, PODIUM.z + 0.1));
    return this.hands;
  }

  setHovered(hovered: boolean): void {
    (this.button.material as THREE.MeshStandardMaterial).emissiveIntensity = hovered ? 0.8 : 0.3;
  }

  dispose(): void {
    super.dispose();
    this.unsubscribe();
  }

  protected get score(): number {
    return this.won;
  }

  protected newGame(): void {
    this.spin = 0;
    this.spinning = false;
    this.landed = null;
    this.won = 0;
    this.waitClock = 0;
    this.dirty = true;
  }

  protected attractLabel(price: string): string {
    return `${this.game.title} — click to insert a coin (${price}) · jackpot ${this.options.jackpot.value} tickets`;
  }

  protected playingLabel(): string {
    return this.spinning || this.landed !== null ? 'Round and round it goes…' : 'Space or click to spin · E to walk away';
  }

  /** A click on the wheel mid-play pulls it. */
  protected clickWhilePlaying(): boolean {
    if (!this.spinning && this.landed === null) this.fling();
    return true;
  }

  protected play(dt: number, controls: ArcadeControls): boolean {
    if (!this.spinning && this.landed === null) {
      this.waitClock += dt;
      if (controls.firePressed) this.fling();
      return false;
    }
    if (this.spinning) {
      this.spin -= (FRICTION + DRAG * this.spin) * dt;
      this.angle += this.spin * dt;
      // The flapper over a peg: a tick, a little brake.
      const peg = this.pegIndex();
      if (peg !== this.lastPeg) {
        this.lastPeg = peg;
        this.flap = 1;
        this.spin = Math.max(0, this.spin - PEG_BRAKE * (1 + 3 / Math.max(0.5, this.spin)));
        this.speaker.play('tick', 0.9 + Math.random() * 0.2);
      }
      if (this.spin <= STOP_BELOW) this.land();
      return false;
    }
    this.waitClock += dt;
    return this.waitClock > 1.2;
  }

  protected demoControls(): ArcadeControls {
    return { ...NO_CONTROLS, fire: this.waitClock > 1.5, firePressed: this.waitClock > 1.5 && !this.spinning && this.landed === null };
  }

  /** A regular hit the jackpot: it is theirs, and it starts again. */
  protected regularFinished(): void {
    if (this.landed !== null && this.options.slices[this.landed]!.tickets === 'jackpot') this.options.jackpot.hit();
  }

  protected paint(dt: number): void {
    this.wheel.rotation.z = this.angle;
    this.flap = Math.max(0, this.flap - dt * 12);
    this.flapper.rotation.z = this.flap * 0.5 * Math.sign(this.spin || 1);
    this.button.position.y = PODIUM.h + 0.05 - (this.spinning && this.spin > SPIN_SPEED ? 0.012 : 0);
    // The bulbs chase while it spins, blink on a win, crawl when idle.
    const rate = this.spinning ? 18 : this.landed !== null ? 0 : 4;
    const phase = Math.floor(this.clock * rate);
    const winBlink = this.landed !== null && Math.floor(this.clock * 6) % 2 === 0;
    this.bulbs.forEach((b, i) => (b.material = (this.landed !== null ? winBlink : (i + phase) % 4 === 0) ? BULB_ON : BULB_OFF));
    this.displayClock += dt;
    if (this.dirty || this.displayClock > 0.2) {
      this.displayClock = 0;
      this.dirty = false;
      this.paintDisplay();
    }
  }

  private fling(): void {
    this.spinning = true;
    this.spin = SPIN_SPEED + Math.random() * SPIN_EXTRA;
    this.lastPeg = this.pegIndex();
    this.options.jackpot.grow();
    this.speaker.play('launch');
  }

  private land(): void {
    this.spinning = false;
    this.spin = 0;
    this.waitClock = 0;
    this.landed = this.sliceUnderFlapper();
    const slice = this.options.slices[this.landed]!;
    // The player's jackpot is paid by the Session from the score; a regular's is hit in `regularFinished`.
    this.won = slice.tickets === 'jackpot' ? (this.who === 'player' ? this.options.jackpot.hit() : this.options.jackpot.value) : slice.tickets;
    this.speaker.play(slice.tickets === 'jackpot' ? 'jackpot' : this.won >= 50 ? 'win' : this.won >= 15 ? 'bonus' : 'score');
    this.dirty = true;
  }

  /** The slice the flapper (at the top) points at: the face's angle there is a quarter turn minus the wheel's turn. */
  private sliceUnderFlapper(): number {
    const a = (((Math.PI / 2 - this.angle) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const i = this.edges.findIndex((edge, k) => k > 0 && a < edge) - 1;
    return i < 0 ? this.options.slices.length - 1 : i;
  }

  /** Which gap between pegs is under the flapper (changes as a peg passes). */
  private pegIndex(): number {
    return this.sliceUnderFlapper();
  }

  private paintDisplay(): void {
    const { ctx, texture } = this.display;
    ctx.fillStyle = '#090410';
    ctx.fillRect(0, 0, 256, 96);
    const jackpot = this.options.jackpot.value;
    if (this.state === 'over' || (this.landed !== null && this.state !== 'attract')) {
      const shown = this.state === 'over' ? Math.floor(this.won * this.countUp) : this.won;
      const jack = this.landed !== null && this.options.slices[this.landed]!.tickets === 'jackpot';
      drawText(ctx, jack ? 'JACKPOT!!!' : 'YOU WIN', 128, 28, jack ? 24 : 18, jack ? '#ffd23a' : '#7ee787');
      drawText(ctx, `${shown} TICKETS`, 128, 66, 20, '#ffe066');
    } else if (this.spinning) {
      drawText(ctx, 'SPINNING…', 128, 34, 20, '#33e0ff');
      drawText(ctx, `JACKPOT ${jackpot}`, 128, 70, 14, '#ffd23a');
    } else if (this.state === 'playing' || this.state === 'demo') {
      drawText(ctx, Math.floor(this.clock * 2) % 2 ? 'PRESS SPACE' : 'TO SPIN', 128, 34, 18, '#ff8a80');
      drawText(ctx, `JACKPOT ${jackpot}`, 128, 70, 14, '#ffd23a');
    } else {
      drawText(ctx, 'JACKPOT', 128, 26, 16, '#ffd23a');
      drawText(ctx, `${jackpot}`, 128, 62, 30, Math.floor(this.clock * 1.5) % 2 ? '#ffe066' : '#ffffff');
    }
    texture.needsUpdate = true;
  }

  /** The face: the slices as wide as their odds, their payouts written outwards, the jackpot in gold. */
  private paintFace(): THREE.Texture {
    const S = 1024;
    const [canvas, ctx] = createCanvas(S, S);
    const c = S / 2;
    this.options.slices.forEach((slice, i) => {
      const a0 = this.edges[i]!;
      const a1 = this.edges[i + 1]!;
      ctx.beginPath();
      ctx.moveTo(c, c);
      // The face's angles run counter-clockwise with y up; the canvas's y runs down.
      ctx.arc(c, c, c, -a1, -a0);
      ctx.closePath();
      ctx.fillStyle = slice.tickets === 'jackpot' ? '#ffd23a' : SLICE_COLORS[i % SLICE_COLORS.length]!;
      ctx.fill();
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 4;
      ctx.stroke();
      const mid = -(a0 + a1) / 2;
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(mid);
      const label = slice.tickets === 'jackpot' ? 'JACKPOT' : `${slice.tickets}`;
      const size = slice.tickets === 'jackpot' ? 22 : Math.min(64, 30 + (a1 - a0) * 120);
      drawText(ctx, label, c * 0.68, 0, Math.round(size), slice.tickets === 'jackpot' ? '#8a1a00' : '#ffffff');
      ctx.restore();
    });
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(c, c, c * 0.18, 0, Math.PI * 2);
    ctx.fill();
    return toTexture(canvas, 8);
  }
}

const BULB_ON = new THREE.MeshBasicMaterial({ color: 0xfff1b0, toneMapped: false });
const BULB_OFF = new THREE.MeshStandardMaterial({ color: 0x6a5a30, roughness: 0.4 });

function paintMarquee(title: string): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(512, 96);
  const g = ctx.createLinearGradient(0, 0, 512, 0);
  g.addColorStop(0, '#ff2fa0');
  g.addColorStop(1, '#ffd23a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 96);
  drawText(ctx, title, 256, 50, 40, '#2a0f24');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
