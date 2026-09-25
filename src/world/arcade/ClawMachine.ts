import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Input } from '@/core/Input';
import type { Interactable, LabelPlacement } from '@/interaction/Interactable';
import type { ArcadeMachineLike, ArcadeResult, SessionActions } from '@/game/SessionActions';
import { ChipSpeaker } from '@/audio/ChipSpeaker';
import { createCanvas, seededRandom, toTexture, FONT } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../Furniture';
import { boxMesh, cylinderMesh, invisibleHitbox } from '../meshUtils';
import { matte } from '../props/Prop';
import { drawText } from './games/ArcadeGame';
import { TAKEN_LINE, type Occupant, type Station, type StationEvents } from './Station';

export interface ClawMachineOptions {
  /** Paint of the base and the top. Default a fairground pink. */
  color?: number;
  seed?: number;
}

export interface ClawWiring {
  input: Input;
  listener: THREE.Object3D;
  /** The prize id a plush of this colour is (`economy/Prizes`), or undefined. */
  prizeFor: (color: number) => string | undefined;
}

const WIDTH = 0.8;
const DEPTH = 0.75;
const BASE_H = 0.8;
const CASE_H = 0.9;
const TOP_H = 0.22;
const TOTAL_H = BASE_H + CASE_H + TOP_H;
/** Where the gantry rails run, and how far the carriage may travel. */
const RAIL_Y = BASE_H + CASE_H - 0.06;
const TRAVEL_X = WIDTH / 2 - 0.14;
const TRAVEL_Z = DEPTH / 2 - 0.14;
/** The chute: the corner the claw returns to and lets go over. */
const CHUTE = new THREE.Vector3(-TRAVEL_X, 0, TRAVEL_Z);
const CLAW_UP = 0.1;
const CLAW_DOWN = CASE_H - 0.3;
/** Where a regular's feet go (close enough to reach the stick), and where the player's eye goes. */
const STAND_Z = DEPTH / 2 + 0.22;
const EYE_Z = DEPTH / 2 + 0.33;
/** Seconds to steer before the claw drops by itself, and how fast it moves. */
const AIM_SECONDS = 15;
const CARRIAGE_SPEED = 0.22;
/** Chance to close on a plush this far from the claw's centre (m), and how often a grabbed one slips out on the way. */
const GRIP = [
  { within: 0.035, chance: 0.6 },
  { within: 0.07, chance: 0.25 },
];
const SLIP_CHANCE = 0.3;
/** After this many misses in a row the claw grips properly once (fairground law, more or less). */
const PITY_AFTER = 6;
/** Where the top of a plush sits below the hub when it hangs in the claw. */
const HANG = 0.1;

const CHROME = new THREE.MeshStandardMaterial({ color: 0xc4c7cc, metalness: 0.75, roughness: 0.25 });
const BLACK = matte(0x111116, 0.5);
const PASTELS = [0xffb3c6, 0xa8d8ff, 0xfff1a8, 0xc8f7c5, 0xe0c3ff, 0xffd6a8, 0xffffff];

const LEFT_KEYS = ['KeyA', 'ArrowLeft'];
const RIGHT_KEYS = ['KeyD', 'ArrowRight'];
const UP_KEYS = ['KeyW', 'ArrowUp'];
const DOWN_KEYS = ['KeyS', 'ArrowDown'];
const DROP_KEYS = ['Space', 'Enter', 'NumpadEnter'];

type Mode = 'idle' | 'demo' | 'playing' | 'over';
type Phase = 'aim' | 'drop' | 'lift' | 'return' | 'release' | 'rest';

interface Plush {
  group: THREE.Group;
  color: number;
  /** Where it lies in the heap, machine-local (its origin). */
  home: THREE.Vector3;
  r: number;
}

/**
 * A crane game: a lit case full of plush on a bright base, a joystick and a button, a prize chute
 * in the corner, and a claw on a gantry. Paid for like a cabinet (`playArcade`, one coin, never
 * free): the player steers the claw with WASD for fifteen seconds (a display counts them down),
 * Space drops it; it closes, lifts, goes back over the chute and opens. Whether it held anything
 * is up to where it came down (and the machine's mood: a grabbed plush slips out a third of the
 * time; six misses in a row and it grips properly once). A plush that makes it down the chute is
 * a prize to take home. A regular playing it (`occupy`) roams, drops and comes up empty, as ever.
 * Origin on the floor under its centre, +z faces the room. Collides.
 */
export class ClawMachine extends THREE.Group implements Furniture, Interactable, Updatable, ArcadeMachineLike, Station {
  readonly hitboxes: THREE.Object3D[];
  readonly standAt = new THREE.Vector3(0, 0, STAND_Z);
  readonly lean = 0.15;
  readonly focus = new THREE.Vector3(0, BASE_H + CASE_H * 0.55, 0);
  readonly stationEvents: StationEvents = {};
  readonly freeWhenBroke = false;
  readonly game = { id: 'claw', title: 'GRAB A PRIZE', hint: 'WASD or arrows move the claw · Space drops it' };

  private readonly wiring: ClawWiring;
  private mode: Mode = 'idle';
  private who: Occupant = null;
  private phase: Phase = 'rest';
  private phaseLeft = 0;
  private aimLeft = 0;
  private readonly marquee: THREE.MeshBasicMaterial;
  private readonly chaser: THREE.Texture;
  private readonly beam: THREE.Mesh;
  private readonly carriage: THREE.Group;
  private readonly cable: THREE.Mesh;
  private readonly hub: THREE.Mesh;
  private readonly prongs: THREE.Group[] = [];
  private readonly stick: THREE.Group;
  private readonly stickBall: THREE.Mesh;
  private readonly button: THREE.Mesh;
  private readonly hands: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly plush: Plush[] = [];
  private readonly display: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture };
  private readonly speaker: ChipSpeaker;
  private readonly random: () => number;
  private clock = 0;
  private drop = CLAW_UP;
  private grip = 0;
  private carried: Plush | null = null;
  /** A plush on its way down: back to the heap (slipped) or down the chute (won). */
  private falling: { plush: Plush; to: number; won: boolean } | null = null;
  private misses = 0;
  private won: string | undefined;
  private onOver: ((result: ArcadeResult) => void) | null = null;
  private lastDrop = false;
  private whirClock = 0;
  private readonly from = new THREE.Vector3();
  private readonly scratch = new THREE.Vector3();

  constructor(options: ClawMachineOptions, wiring: ClawWiring) {
    super();
    this.name = 'ClawMachine';
    this.wiring = wiring;
    this.random = seededRandom((options.seed ?? 1) * 4099);
    const paint = matte(options.color ?? 0xd23a6a, 0.5);

    // Base: the box, a kick plate, the chute door with its chrome frame, the control panel.
    this.add(boxMesh(WIDTH, 0.06, DEPTH, BLACK, { y: 0.03 }));
    this.add(boxMesh(WIDTH, BASE_H - 0.06, DEPTH, paint, { y: 0.06 + (BASE_H - 0.06) / 2 }));
    this.add(boxMesh(0.3, 0.3, 0.02, CHROME, { x: -WIDTH / 2 + 0.22, y: 0.3, z: DEPTH / 2 + 0.006 }));
    this.add(boxMesh(0.25, 0.25, 0.02, new THREE.MeshStandardMaterial({ color: 0x8fb8d8, roughness: 0.1, transparent: true, opacity: 0.5 }), { x: -WIDTH / 2 + 0.22, y: 0.3, z: DEPTH / 2 + 0.012 }));
    const front = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH - 0.04, 0.26), new THREE.MeshStandardMaterial({ map: paintFront(options.color ?? 0xd23a6a), roughness: 0.6 }));
    front.position.set(0, BASE_H - 0.2, DEPTH / 2 + 0.002);
    this.add(front);
    const panel = boxMesh(0.4, 0.05, 0.16, BLACK, { x: 0.1, y: BASE_H + 0.02, z: DEPTH / 2 - 0.06 });
    panel.rotation.x = -0.2;
    this.add(panel);
    this.stick = new THREE.Group();
    this.stick.position.set(0, BASE_H + 0.04, DEPTH / 2 - 0.07);
    this.stick.add(cylinderMesh(0.008, 0.1, CHROME, { y: 0.05 }, { segments: 8 }));
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), matte(0xd23a3a, 0.4));
    ball.position.y = 0.11;
    this.stick.add(ball);
    this.stickBall = ball;
    this.add(this.stick);
    this.button = cylinderMesh(0.02, 0.015, matte(0xffd23a, 0.4), { x: 0.16, y: BASE_H + 0.05, z: DEPTH / 2 - 0.08 }, { segments: 14 });
    this.add(this.button);
    // The countdown display beside the button.
    const [canvas, ctx] = createCanvas(128, 48);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.display = { canvas, ctx, texture };
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.045), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
    screen.position.set(0.28, BASE_H - 0.035, DEPTH / 2 + 0.003);
    this.add(screen);

    // The case: chrome posts at the corners, glass all round, a lit top with the marquee.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.add(boxMesh(0.03, CASE_H, 0.03, CHROME, { x: sx * (WIDTH / 2 - 0.015), y: BASE_H + CASE_H / 2, z: sz * (DEPTH / 2 - 0.015) }));
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xdde8ee, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false });
    const pane = (w: number, x: number, z: number, ry: number): void => {
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, CASE_H), glassMat);
      glass.position.set(x, BASE_H + CASE_H / 2, z);
      glass.rotation.y = ry;
      glass.castShadow = false;
      this.add(glass);
    };
    pane(WIDTH - 0.06, 0, DEPTH / 2 - 0.005, 0);
    pane(WIDTH - 0.06, 0, -DEPTH / 2 + 0.005, Math.PI);
    pane(DEPTH - 0.06, -WIDTH / 2 + 0.005, 0, Math.PI / 2);
    pane(DEPTH - 0.06, WIDTH / 2 - 0.005, 0, -Math.PI / 2);
    this.add(boxMesh(WIDTH, TOP_H, DEPTH, paint, { y: BASE_H + CASE_H + TOP_H / 2 }));
    this.marquee = new THREE.MeshBasicMaterial({ map: paintMarquee(), toneMapped: false, color: 0xdddddd });
    const marquee = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH - 0.06, TOP_H - 0.1), this.marquee);
    marquee.position.set(0, BASE_H + CASE_H + TOP_H / 2, DEPTH / 2 + 0.002);
    this.add(marquee);
    // Chaser bulbs along the top and bottom edges of the marquee: a repeating strip whose texture slides.
    this.chaser = paintChaser();
    this.chaser.wrapS = THREE.RepeatWrapping;
    this.chaser.repeat.set(12, 1);
    const chaserMat = new THREE.MeshBasicMaterial({ map: this.chaser, toneMapped: false });
    for (const y of [BASE_H + CASE_H + 0.025, BASE_H + CASE_H + TOP_H - 0.025]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH - 0.06, 0.04), chaserMat);
      strip.position.set(0, y, DEPTH / 2 + 0.002);
      this.add(strip);
    }
    // The case is lit from the top: a strip and a small light so the plush reads through the glass.
    const strip = boxMesh(WIDTH - 0.1, 0.015, 0.03, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2dc, emissiveIntensity: 2 }), { y: BASE_H + CASE_H - 0.01, z: -DEPTH / 2 + 0.06 });
    strip.castShadow = false;
    this.add(strip);
    const light = new THREE.PointLight(0xfff0dc, 1.4, 1.8, 2);
    light.position.set(0, BASE_H + CASE_H - 0.1, 0);
    light.castShadow = false;
    this.add(light);

    // The plush: heaps of soft blobs with heads and ears, in pastels, on the floor of the case, clear of the chute.
    for (let i = 0; i < 11; i++) {
      const r = 0.06 + this.random() * 0.04;
      const home = this.heapSpot(r, i > 7);
      const color = PASTELS[Math.floor(this.random() * PASTELS.length)]!;
      const group = plush(r, color, this.random() * Math.PI * 2);
      group.position.copy(home);
      this.add(group);
      this.plush.push({ group, color, home, r });
    }

    // The gantry: two rails along z, a beam across them carrying the carriage, the cable and the claw.
    for (const sx of [-1, 1]) this.add(boxMesh(0.02, 0.02, DEPTH - 0.1, CHROME, { x: sx * (WIDTH / 2 - 0.06), y: RAIL_Y }));
    this.beam = boxMesh(WIDTH - 0.12, 0.02, 0.02, CHROME, { y: RAIL_Y - 0.02 });
    this.add(this.beam);
    this.carriage = new THREE.Group();
    this.carriage.position.set(CHUTE.x, RAIL_Y - 0.05, CHUTE.z);
    this.carriage.add(boxMesh(0.08, 0.05, 0.08, BLACK));
    this.cable = cylinderMesh(0.003, 1, BLACK, {}, { segments: 6 });
    this.carriage.add(this.cable);
    this.hub = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), CHROME);
    this.carriage.add(this.hub);
    for (let i = 0; i < 3; i++) {
      const prong = new THREE.Group();
      prong.rotation.y = (i / 3) * Math.PI * 2;
      const finger = boxMesh(0.012, 0.11, 0.02, CHROME, { y: -0.055, z: 0.02 });
      finger.rotation.x = 0.35;
      const tip = boxMesh(0.012, 0.05, 0.02, CHROME, { y: -0.12, z: 0.045 });
      tip.rotation.x = -0.3;
      prong.add(finger, tip);
      this.prongs.push(prong);
      this.carriage.add(prong);
    }
    this.add(this.carriage);
    this.placeClaw();

    const hitbox = invisibleHitbox(WIDTH + 0.04, TOTAL_H, DEPTH + 0.04, { y: TOTAL_H / 2 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
    this.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) mesh.receiveShadow = true;
    });
    this.speaker = new ChipSpeaker(this.carriage, wiring.listener, { volume: 0.18 });
    this.paintDisplay('INSERT COIN');
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-WIDTH / 2 - 0.02, 0, -DEPTH / 2 - 0.02), new THREE.Vector3(WIDTH / 2 + 0.02, TOTAL_H, DEPTH / 2 + 0.04));
  }

  /** From the coin until the claw has opened over the chute. */
  get isPlaying(): boolean {
    return this.mode === 'playing';
  }

  get occupant(): Occupant {
    return this.who;
  }

  start(onOver: (result: ArcadeResult) => void): void {
    this.onOver = onOver;
    this.mode = 'playing';
    this.won = undefined;
    this.enter('aim', 0);
    this.aimLeft = AIM_SECONDS;
    this.lastDrop = true;
    this.speaker.level = 1;
    this.speaker.play('coin');
    if (this.who !== 'player') {
      this.who = 'player';
      this.stationEvents.onPlayerStart?.();
    }
  }

  /** Walked away: the coin is lost; the claw goes home on its own. */
  abort(): void {
    this.onOver = null;
    this.who = null;
    this.mode = 'idle';
    if (this.carried) this.slip();
    this.from.copy(this.carriage.position);
    this.enter('return', 1.8);
    this.stationEvents.onPlayerLeave?.();
  }

  occupy(): boolean {
    if (this.who) return false;
    this.who = 'regular';
    this.mode = 'demo';
    this.speaker.level = 0.45;
    this.enter('rest', 1 + this.random() * 2);
    return true;
  }

  release(): void {
    if (this.who !== 'regular') return;
    this.who = null;
    this.mode = 'idle';
    this.from.copy(this.carriage.position);
    this.enter('return', 1.8);
  }

  /** A hand on the joystick's ball (it follows the stick), the other over the drop button. */
  handsAt(): readonly [THREE.Vector3, THREE.Vector3] {
    this.stickBall.getWorldPosition(this.hands[0]).y += 0.015;
    this.button.getWorldPosition(this.hands[1]).y += 0.02;
    return this.hands;
  }

  eyePose(): { position: THREE.Vector3; yaw: number } {
    const position = this.localToWorld(new THREE.Vector3(0, 1.55, EYE_Z));
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.getWorldQuaternion(new THREE.Quaternion()));
    return { position, yaw: Math.atan2(-forward.x, -forward.z) };
  }

  screenCentre(): THREE.Vector3 {
    return this.localToWorld(this.focus.clone());
  }

  setHovered(hovered: boolean): void {
    this.marquee.color.setHex(hovered ? 0xffffff : 0xdddddd);
  }

  label(): string {
    if (this.who === 'regular') return TAKEN_LINE;
    if (this.mode === 'playing') return 'Press E or click to walk away (the coin is lost)';
    if (this.mode === 'over') return 'Space or click to try again (1 coin) · E to walk away';
    return 'Claw machine — click to insert a coin (1 coin, prizes go home)';
  }

  labelPlacement(): LabelPlacement {
    return this.mode === 'playing' || this.mode === 'over' ? 'edge' : 'crosshair';
  }

  activate(session: SessionActions): void {
    if (this.who === 'regular') session.hint(TAKEN_LINE);
    else session.playArcade(this);
  }

  update(dt: number): void {
    this.clock += dt;
    this.chaser.offset.x -= dt * (this.mode === 'playing' ? 1.6 : 0.6);
    this.speaker.follow();
    this.phaseLeft -= dt;
    const c = this.carriage.position;
    switch (this.phase) {
      case 'aim':
        this.aim(dt);
        break;
      case 'rest':
        this.grip += (0 - this.grip) * Math.min(1, dt * 3);
        if (this.mode === 'demo' && this.phaseLeft <= 0) this.enter('aim', 4 + this.random() * 4);
        break;
      case 'drop':
        this.drop += ((CLAW_DOWN - this.drop) * dt) / Math.max(0.05, this.phaseLeft);
        if (this.phaseLeft <= 0.3) this.grip += (1 - this.grip) * Math.min(1, dt * 6);
        if (this.phaseLeft <= 0) {
          this.tryGrab();
          this.enter('lift', 1.4);
        }
        break;
      case 'lift':
        this.drop += ((CLAW_UP - this.drop) * dt) / Math.max(0.05, this.phaseLeft);
        if (this.phaseLeft <= 0) {
          this.from.copy(c);
          this.enter('return', 1.8);
          this.speaker.play('whir');
        }
        break;
      case 'return': {
        const t = 1 - Math.max(0, this.phaseLeft / 1.8);
        c.x = THREE.MathUtils.lerp(this.from.x, CHUTE.x, t);
        c.z = THREE.MathUtils.lerp(this.from.z, CHUTE.z, t);
        this.drop += (CLAW_UP - this.drop) * Math.min(1, dt * 4);
        // The rigged bit: halfway home, a grabbed plush may slip out.
        if (this.carried && t > 0.45 && t < 0.5 && this.random() < SLIP_CHANCE * dt * 20) this.slip();
        if (this.phaseLeft <= 0) this.enter('release', 1.2);
        break;
      }
      case 'release':
        this.grip += (0 - this.grip) * Math.min(1, dt * 4);
        if (this.carried && this.grip < 0.5) {
          const plush = this.carried;
          this.carried = null;
          this.falling = { plush, to: BASE_H - 0.25, won: true };
          this.speaker.play('clunk');
        }
        // Wait for a plush on its way down the chute before telling anyone.
        if (this.phaseLeft <= 0 && !this.falling?.won) this.endTry();
        break;
    }
    this.carry(dt);
    this.placeClaw();
  }

  dispose(): void {
    this.speaker.dispose();
  }

  /** Steering: the player's keys (or a regular's drifting hand) move the carriage; fire, a regular's whim or the clock drops it. */
  private aim(dt: number): void {
    const c = this.carriage.position;
    let dx = 0;
    let dz = 0;
    let drop = false;
    if (this.mode === 'playing') {
      const { input } = this.wiring;
      dx = (input.isDown(...RIGHT_KEYS) ? 1 : 0) - (input.isDown(...LEFT_KEYS) ? 1 : 0);
      dz = (input.isDown(...DOWN_KEYS) ? 1 : 0) - (input.isDown(...UP_KEYS) ? 1 : 0);
      const fire = input.isDown(...DROP_KEYS);
      drop = fire && !this.lastDrop;
      this.lastDrop = fire;
      this.aimLeft -= dt;
      this.paintDisplay(`${Math.max(0, Math.ceil(this.aimLeft))}`);
      if (this.aimLeft <= 0) drop = true;
    } else {
      // A regular's hand wandering over the heap.
      const tx = Math.sin(this.clock * 0.6) * TRAVEL_X;
      const tz = Math.cos(this.clock * 0.41) * TRAVEL_Z;
      dx = Math.abs(tx - c.x) > 0.01 ? Math.sign(tx - c.x) : 0;
      dz = Math.abs(tz - c.z) > 0.01 ? Math.sign(tz - c.z) : 0;
      drop = this.phaseLeft <= 0;
    }
    if (dx || dz) {
      c.x = THREE.MathUtils.clamp(c.x + dx * CARRIAGE_SPEED * dt, -TRAVEL_X, TRAVEL_X);
      c.z = THREE.MathUtils.clamp(c.z + dz * CARRIAGE_SPEED * dt, -TRAVEL_Z, TRAVEL_Z);
      this.whirClock -= dt;
      if (this.whirClock <= 0) {
        this.whirClock = 0.3;
        this.speaker.play('whir');
      }
    }
    this.stick.rotation.z += ((-dx * 0.35) - this.stick.rotation.z) * Math.min(1, dt * 18);
    this.stick.rotation.x += ((dz * 0.35) - this.stick.rotation.x) * Math.min(1, dt * 18);
    if (drop) {
      this.speaker.play('drop');
      this.enter('drop', 1.4);
      if (this.mode === 'playing') this.paintDisplay('GOOD LUCK');
    }
  }

  /** At the bottom of the drop: the nearest plush under the claw, and whether the claw holds it. */
  private tryGrab(): void {
    const c = this.carriage.position;
    let best: Plush | null = null;
    let bestD = Infinity;
    for (const p of this.plush) {
      if (!p.group.visible || this.falling?.plush === p) continue;
      const d = Math.hypot(p.group.position.x - c.x, p.group.position.z - c.z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    const chance = GRIP.find((g) => bestD <= g.within)?.chance ?? 0;
    const pity = this.mode === 'playing' && this.misses >= PITY_AFTER && bestD <= GRIP[GRIP.length - 1]!.within;
    // A regular never wins: the heap has to last.
    const holds = best && this.mode === 'playing' && (pity || this.random() < chance);
    this.speaker.play('clunk');
    if (holds && best) {
      this.carried = best;
      if (pity) this.misses = 0;
    }
  }

  private slip(): void {
    const plush = this.carried;
    if (!plush) return;
    this.carried = null;
    // It lands back on the heap where it fell.
    plush.home.set(plush.group.position.x, BASE_H + plush.r, plush.group.position.z);
    this.falling = { plush, to: plush.home.y, won: false };
    this.speaker.play('lose');
  }

  /** The claw is open over the chute: tell whoever paid how it went. */
  private endTry(): void {
    if (this.mode === 'demo') {
      this.enter('rest', 2 + this.random() * 3);
      return;
    }
    this.enter('rest', 0);
    if (this.mode !== 'playing') return;
    const prize = this.won;
    this.misses = prize ? 0 : this.misses + 1;
    this.mode = 'over';
    this.paintDisplay(prize ? 'WINNER!' : 'TRY AGAIN');
    if (prize) this.speaker.play('win');
    const handler = this.onOver;
    this.onOver = null;
    const result: ArcadeResult = { score: 0, best: false, ...(prize ? { prize } : {}) };
    handler?.(result);
    this.stationEvents.onPlayerResult?.(result);
  }

  /** A carried plush hangs from the claw; a falling one drops (to the heap, or down the chute and out of the case). */
  private carry(dt: number): void {
    if (this.carried) {
      this.scratch.set(0, -this.drop - HANG - this.carried.r, 0).add(this.carriage.position);
      this.carried.group.position.lerp(this.scratch, Math.min(1, dt * 12));
    }
    const falling = this.falling;
    if (!falling) return;
    const g = falling.plush.group.position;
    g.y -= dt * 1.4;
    if (g.y > falling.to) return;
    g.y = falling.to;
    this.falling = null;
    this.speaker.play('thud');
    if (!falling.won) return;
    // Down the chute: the prize is the player's; a fresh plush takes its place on the heap.
    if (this.mode === 'playing') this.won = this.wiring.prizeFor(falling.plush.color);
    this.restock(falling.plush);
  }

  /** The attendant tops the heap up: the plush comes back in a new colour at a new spot. */
  private restock(p: Plush): void {
    const color = PASTELS[Math.floor(this.random() * PASTELS.length)]!;
    p.color = color;
    p.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && (mesh.material as THREE.MeshStandardMaterial).userData.fur) (mesh.material as THREE.MeshStandardMaterial).color.setHex(color);
    });
    p.home.copy(this.heapSpot(p.r, true));
    p.group.position.copy(p.home);
  }

  /** A spot on the heap (away from the chute's corner), on the floor or (`high`) on top of the others. */
  private heapSpot(r: number, high: boolean): THREE.Vector3 {
    for (;;) {
      const x = (this.random() - 0.5) * (WIDTH - 0.3);
      const z = (this.random() - 0.5) * (DEPTH - 0.3);
      if (Math.hypot(x - CHUTE.x, z - CHUTE.z) < 0.14) continue;
      return new THREE.Vector3(x, BASE_H + r + (high ? r * 1.4 : 0), z);
    }
  }

  private enter(phase: Phase, seconds: number): void {
    this.phase = phase;
    this.phaseLeft = seconds;
  }

  /** The beam follows the carriage along the rails, the cable stretches to the claw, the prongs open or close. */
  private placeClaw(): void {
    this.beam.position.z = this.carriage.position.z;
    this.cable.scale.y = this.drop;
    this.cable.position.y = -this.drop / 2;
    this.hub.position.y = -this.drop;
    for (const prong of this.prongs) {
      prong.position.y = -this.drop;
      prong.rotation.x = THREE.MathUtils.lerp(0.55, 0.05, this.grip);
    }
  }

  private paintDisplay(text: string): void {
    const { ctx, canvas, texture } = this.display;
    ctx.fillStyle = '#140608';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawText(ctx, text, canvas.width / 2, canvas.height / 2 + 1, text.length > 3 ? 14 : 28, '#ff4a3a');
    texture.needsUpdate = true;
  }
}

/** A plush: a body sphere, a head on top, two ears; the plush's eyes as two dark dots facing `yaw`. Its fur material is tagged so a restock can recolour it. */
function plush(r: number, color: number, yaw: number): THREE.Group {
  const g = new THREE.Group();
  const fur = matte(color, 1);
  fur.userData.fur = true;
  const body = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), fur);
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(r * 0.7, 14, 10), fur);
  head.position.set(0, r * 1.15, r * 0.2);
  head.castShadow = true;
  const dark = matte(0x222222, 0.4);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(r * 0.28, 8, 6), fur);
    ear.position.set(sx * r * 0.55, r * 1.75, r * 0.1);
    g.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(r * 0.09, 6, 5), dark);
    eye.position.set(sx * r * 0.28, r * 1.25, r * 0.85);
    g.add(eye);
  }
  g.add(body, head);
  g.rotation.y = yaw;
  return g;
}

/** GRAB A PRIZE on a starburst. */
function paintMarquee(): THREE.Texture {
  const [canvas, ctx] = createCanvas(768, 128);
  const g = ctx.createLinearGradient(0, 0, 768, 0);
  g.addColorStop(0, '#ff2fa0');
  g.addColorStop(0.5, '#ffe23a');
  g.addColorStop(1, '#33e0ff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 768, 128);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    ctx.moveTo(384, 64);
    ctx.lineTo(384 + Math.cos((i / 12) * Math.PI * 2) * 500, 64 + Math.sin((i / 12) * Math.PI * 2) * 500);
    ctx.lineTo(384 + Math.cos(((i + 0.5) / 12) * Math.PI * 2) * 500, 64 + Math.sin(((i + 0.5) / 12) * Math.PI * 2) * 500);
    ctx.closePath();
    ctx.fill();
  }
  drawText(ctx, 'GRAB A PRIZE!', 384, 66, 48, '#2a0f3a');
  return toTexture(canvas, 4);
}

/** One bulb per tile, lit at the left and fading right, so sliding the texture chases the lit one along. */
function paintChaser(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(64, 32);
  ctx.fillStyle = '#2a0f1a';
  ctx.fillRect(0, 0, 64, 32);
  ctx.fillStyle = '#ffe680';
  ctx.beginPath();
  ctx.arc(16, 16, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6a4a2a';
  ctx.beginPath();
  ctx.arc(48, 16, 9, 0, Math.PI * 2);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** The base's front print: the rules and the price. */
function paintFront(color: number): THREE.Texture {
  const [canvas, ctx] = createCanvas(760, 260);
  ctx.fillStyle = `#${new THREE.Color(color).getHexString()}`;
  ctx.fillRect(0, 0, 760, 260);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(40, 40, 680, 180);
  ctx.fillStyle = '#2a0f3a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold 54px ${FONT}`;
  ctx.fillText('1 COIN = 1 TRY', 380, 100);
  ctx.font = `28px ${FONT}`;
  ctx.fillText('move the claw · press to drop · every play wins*', 380, 160);
  ctx.font = `18px ${FONT}`;
  ctx.fillText('*not every play wins', 380, 200);
  return toTexture(canvas, 4);
}
