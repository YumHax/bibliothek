import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Input } from '@/core/Input';
import type { Interactable, LabelPlacement } from '@/interaction/Interactable';
import type { ArcadeMachineLike, ArcadeResult, SessionActions } from '@/game/SessionActions';
import { ChipSpeaker } from '@/audio/ChipSpeaker';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../Furniture';
import { boxMesh, cylinderMesh, invisibleHitbox } from '../meshUtils';
import { matte } from '../props/Prop';
import { type ArcadeControls, drawText } from './games/ArcadeGame';
import { InitialsEntry, ordinal } from './InitialsEntry';
import { TicketStrip } from './TicketStrip';
import { TAKEN_LINE, type Occupant, type Station, type StationEvents } from './Station';
import type { ScoreTable } from './scoreTable';

export interface AlleyRollerOptions {
  /** Paint of the cabinet. Default a racing red. */
  color?: number;
  /** The title on the backboard. Default ALLEY ROLL. */
  title?: string;
}

export interface AlleyWiring {
  input: Input;
  scores: ScoreTable;
  nextPlayCost: () => number;
  pointsPerTicket: number;
  listener: THREE.Object3D;
}

type AlleyState = 'attract' | 'playing' | 'initials' | 'over' | 'demo';
type BallPhase = 'aim' | 'roll' | 'fly' | 'sink' | 'back';

const WIDTH = 0.8;
const LANE_W = 0.56;
/** The lane, from the player's end (near) up to the hump (far): z and height of its surface. */
const LANE_NEAR = { z: 1.0, y: 0.78 };
const LANE_FAR = { z: -0.4, y: 0.92 };
/** The target board: its front edge at the hump, tilted up to its back edge. */
const BOARD_FRONT = { z: -0.5, y: 0.96 };
const BOARD_BACK = { z: -1.08, y: 1.34 };
const BOARD_W = 0.6;
const BACK_Z = -1.16;
const BACK_H = 2.2;
const BALL_R = 0.045;
const BALLS = 9;
/** The rings' centre on the board (u across, v up the board from its front edge, metres) and the corner pockets. */
const RING_CENTRE = { u: 0, v: 0.36 };
const RINGS = [
  { within: 0.05, points: 50 },
  { within: 0.1, points: 40 },
  { within: 0.15, points: 30 },
  { within: 0.21, points: 20 },
];
const POCKETS = [
  { u: -0.22, v: 0.62 },
  { u: 0.22, v: 0.62 },
];
const POCKET_R = 0.04;
const POCKET_POINTS = 100;
const BOARD_V = Math.hypot(BOARD_BACK.z - BOARD_FRONT.z, BOARD_BACK.y - BOARD_FRONT.y);
/** Aim: how fast the ball in hand moves across, and how far. */
const AIM_SPEED = 0.35;
const AIM_MAX = LANE_W / 2 - BALL_R - 0.02;
/** The power meter swings up and down while fire is held (a full swing in this many seconds). */
const POWER_PERIOD = 1.1;
const STAND_Z = 1.45;
/** Where a regular's feet go: close enough to reach the ball in hand, bending over the lane's end. */
const PERSON_Z = 1.3;
const COUNT_UP_SECONDS = 1.2;
const REGULAR_PAUSE = 3;

const LEFT_KEYS = ['KeyA', 'ArrowLeft'];
const RIGHT_KEYS = ['KeyD', 'ArrowRight'];
const UP_KEYS = ['KeyW', 'ArrowUp'];
const DOWN_KEYS = ['KeyS', 'ArrowDown'];
const FIRE_KEYS = ['Space', 'Enter', 'NumpadEnter'];

const WOOD = matte(0xb7874f, 0.55);
const BLACK = matte(0x131318, 0.6);
const CHROME = new THREE.MeshStandardMaterial({ color: 0xc4c7cc, metalness: 0.75, roughness: 0.25 });
const BALL_MAT = matte(0xf2e6c8, 0.35);

/**
 * The ticket alley every funfair has: roll a wooden ball up an inclined lane, over the hump and
 * into the rings (10 to 50, 100 in the corner pockets). Nine balls a play. A / D move the ball in
 * hand across the lane; hold Space and the power meter on the backboard swings up and down, let
 * go to roll at that strength (too soft and it rolls back: nothing). Paid for like a cabinet
 * (`playArcade`), pays tickets from a slot at the front, asks for initials on the backboard for a
 * score that makes the table; a regular can take it (`occupy`). Origin on the floor under the
 * middle of the lane; +z is the player's end. Collides.
 */
export class AlleyRoller extends THREE.Group implements Furniture, Interactable, Updatable, ArcadeMachineLike, Station {
  readonly hitboxes: THREE.Object3D[];
  readonly standAt = new THREE.Vector3(0, 0, PERSON_Z);
  readonly lean = 0.35;
  readonly focus = new THREE.Vector3(0, 1.15, -0.8);
  readonly stationEvents: StationEvents = {};
  readonly freeWhenBroke = true;
  readonly game: { readonly id: string; readonly title: string; readonly hint: string };

  private readonly wiring: AlleyWiring;
  private state: AlleyState = 'attract';
  private who: Occupant = null;
  private phase: BallPhase = 'aim';
  private phaseClock = 0;
  private aimU = 0;
  private charging = false;
  private chargeClock = 0;
  private power = 0;
  private ballsLeft = BALLS;
  private score = 0;
  private lastPoints: number | null = null;
  private flightFrom = new THREE.Vector3();
  private flightTo = new THREE.Vector3();
  private landing: { u: number; v: number; points: number } = { u: 0, v: 0, points: 0 };
  private rollSeconds = 1;
  private overClock = 0;
  private demoPause = 0;
  private demoTarget = { u: 0, power: 0.4, holdFor: 0.5 };
  private demoClock = 0;
  private entry: InitialsEntry | null = null;
  private last: ArcadeResult = { score: 0, best: false };
  private lastRank: number | null = null;
  private onOver: ((result: ArcadeResult) => void) | null = null;
  private lastFire = false;
  private clock = 0;
  private readonly ball: THREE.Mesh;
  private readonly trough: THREE.Mesh[] = [];
  private readonly display: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture };
  private readonly marquee: THREE.MeshBasicMaterial;
  private readonly strip: TicketStrip;
  private readonly speaker: ChipSpeaker;
  private readonly title: string;
  private readonly hands: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
  private displayClock = 0;

  constructor(options: AlleyRollerOptions, wiring: AlleyWiring) {
    super();
    this.name = 'AlleyRoller';
    this.wiring = wiring;
    this.title = options.title ?? 'ALLEY ROLL';
    this.game = { id: 'alley', title: this.title, hint: 'A / D aim · hold Space, let go at the power you want' };
    const paint = matte(options.color ?? 0xb8202a, 0.5);

    // The cabinet: side walls the length of the machine, rising to the backboard.
    const length = LANE_NEAR.z - BACK_Z + 0.15;
    const centreZ = (LANE_NEAR.z + 0.15 + BACK_Z) / 2;
    for (const sx of [-1, 1]) {
      this.add(boxMesh(0.1, 0.7, length, paint, { x: sx * (WIDTH / 2 - 0.05), y: 0.35, z: centreZ }));
      // The side rail rises with the lane, then with the board.
      const rail = boxMesh(0.1, 0.3, LANE_NEAR.z - LANE_FAR.z, paint, { x: sx * (WIDTH / 2 - 0.05), y: (LANE_NEAR.y + LANE_FAR.y) / 2 - 0.02, z: (LANE_NEAR.z + LANE_FAR.z) / 2 });
      rail.rotation.x = Math.atan2(LANE_FAR.y - LANE_NEAR.y, LANE_NEAR.z - LANE_FAR.z);
      this.add(rail);
      const cage = boxMesh(0.1, BACK_H - 1.0, BOARD_FRONT.z - BACK_Z, paint, { x: sx * (WIDTH / 2 - 0.05), y: 1.0 + (BACK_H - 1.0) / 2, z: (BOARD_FRONT.z + BACK_Z) / 2 });
      this.add(cage);
      this.add(boxMesh(0.012, 0.012, LANE_NEAR.z - LANE_FAR.z, CHROME, { x: sx * (WIDTH / 2 - 0.1), y: LANE_NEAR.y + 0.1, z: (LANE_NEAR.z + LANE_FAR.z) / 2 }));
    }
    // A plinth under it all, and the front with the ball trough.
    this.add(boxMesh(WIDTH - 0.2, 0.7, length, BLACK, { y: 0.35, z: centreZ }));
    this.add(boxMesh(WIDTH, 0.08, 0.2, paint, { y: LANE_NEAR.y - 0.04, z: LANE_NEAR.z + 0.08 }));
    // The lane: wood, inclined up to the hump.
    const laneLen = Math.hypot(LANE_NEAR.z - LANE_FAR.z, LANE_FAR.y - LANE_NEAR.y);
    const lane = boxMesh(LANE_W, 0.02, laneLen, WOOD, { y: (LANE_NEAR.y + LANE_FAR.y) / 2 - 0.01, z: (LANE_NEAR.z + LANE_FAR.z) / 2 });
    lane.rotation.x = Math.atan2(LANE_FAR.y - LANE_NEAR.y, LANE_NEAR.z - LANE_FAR.z);
    this.add(lane);
    const hump = cylinderMesh(0.05, LANE_W, WOOD, { y: LANE_FAR.y - 0.02, z: LANE_FAR.z }, { segments: 16 });
    hump.rotation.z = Math.PI / 2;
    this.add(hump);
    // The target board with its rings, tilted back.
    const board = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W, BOARD_V), new THREE.MeshStandardMaterial({ map: paintBoard(), roughness: 0.6 }));
    board.position.set(0, (BOARD_FRONT.y + BOARD_BACK.y) / 2, (BOARD_FRONT.z + BOARD_BACK.z) / 2);
    board.rotation.x = -Math.PI / 2 + Math.atan2(BOARD_BACK.y - BOARD_FRONT.y, BOARD_FRONT.z - BOARD_BACK.z);
    board.receiveShadow = true;
    this.add(board);
    this.add(boxMesh(BOARD_W, BOARD_BACK.y - 0.2, 0.04, BLACK, { y: (BOARD_BACK.y - 0.2) / 2 + 0.2, z: BOARD_BACK.z - 0.03 }));
    // The backboard: marquee, the score display, and a mesh screen in front of the rings.
    this.add(boxMesh(WIDTH, BACK_H - BOARD_BACK.y, 0.06, paint, { y: BOARD_BACK.y + (BACK_H - BOARD_BACK.y) / 2, z: BACK_Z }));
    this.marquee = new THREE.MeshBasicMaterial({ map: paintMarquee(this.title), toneMapped: false, color: 0xdddddd });
    const marquee = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH - 0.06, 0.2), this.marquee);
    marquee.position.set(0, BACK_H - 0.14, BACK_Z + 0.032);
    this.add(marquee);
    const [canvas, ctx] = createCanvas(320, 200);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.display = { canvas, ctx, texture };
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.35), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
    screen.position.set(0, BACK_H - 0.47, BACK_Z + 0.032);
    this.add(screen);
    // The net over the rings starts above the ball's flight, so the player sees the board under it.
    const NET_Y = 1.45;
    const net = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH - 0.2, BACK_H - NET_Y), new THREE.MeshBasicMaterial({ map: paintNet(), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    net.position.set(0, NET_Y + (BACK_H - NET_Y) / 2 - 0.05, BOARD_FRONT.z - 0.05);
    net.rotation.x = 0.35;
    this.add(net);

    // The ball in play, and the trough of balls waiting at the front.
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 16, 12), BALL_MAT);
    this.ball.castShadow = true;
    this.add(this.ball);
    for (let i = 0; i < BALLS - 1; i++) {
      const waiting = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 12, 10), BALL_MAT);
      waiting.position.set(-LANE_W / 2 + BALL_R + 0.005 + i * (BALL_R * 2 + 0.004), LANE_NEAR.y + BALL_R - 0.02, LANE_NEAR.z + 0.08);
      this.trough.push(waiting);
      this.add(waiting);
    }
    this.strip = new TicketStrip(0.55);
    this.strip.position.set(WIDTH / 2 - 0.16, 0.55, LANE_NEAR.z + 0.15 + 0.001);
    this.add(this.strip);

    const hitbox = invisibleHitbox(WIDTH + 0.04, BACK_H, length + 0.04, { y: BACK_H / 2, z: centreZ });
    this.hitboxes = [hitbox];
    this.add(hitbox);
    this.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh !== net) mesh.receiveShadow = true;
    });
    this.speaker = new ChipSpeaker(screen, wiring.listener);
    this.resetBall();
    this.paintDisplay();
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-WIDTH / 2, 0, BACK_Z - 0.03), new THREE.Vector3(WIDTH / 2, BACK_H, LANE_NEAR.z + 0.18));
  }

  get isPlaying(): boolean {
    return this.state === 'playing' || this.state === 'initials';
  }

  get occupant(): Occupant {
    return this.who;
  }

  start(onOver: (result: ArcadeResult) => void): void {
    this.onOver = onOver;
    this.state = 'playing';
    this.newGame();
    this.speaker.level = 1;
    this.speaker.play('coin');
    this.strip.tear();
    this.lastFire = true;
    if (this.who !== 'player') {
      this.who = 'player';
      this.stationEvents.onPlayerStart?.();
    }
  }

  abort(): void {
    if (this.state === 'initials' && this.entry) this.sign(this.entry.value);
    this.onOver = null;
    this.entry = null;
    this.state = 'attract';
    this.who = null;
    this.strip.tear();
    this.ballsLeft = BALLS;
    this.resetBall();
    this.stationEvents.onPlayerLeave?.();
  }

  occupy(): boolean {
    if (this.who) return false;
    this.who = 'regular';
    this.state = 'demo';
    this.speaker.level = 0.45;
    this.newGame();
    return true;
  }

  release(): void {
    if (this.who !== 'regular') return;
    this.who = null;
    this.state = 'attract';
    this.ballsLeft = BALLS;
    this.resetBall();
  }

  /** The left hand on the rail, the right on the ball in hand while aiming (else resting on the lane's end). */
  handsAt(): readonly [THREE.Vector3, THREE.Vector3] {
    this.localToWorld(this.hands[0].set(-(WIDTH / 2 - 0.1), LANE_NEAR.y + 0.13, LANE_NEAR.z + 0.04));
    if (this.phase === 'aim' && this.ball.visible) this.localToWorld(this.hands[1].copy(this.ball.position).setY(this.ball.position.y + BALL_R * 0.8));
    else this.localToWorld(this.hands[1].set(0.12, LANE_NEAR.y + 0.06, LANE_NEAR.z + 0.12));
    return this.hands;
  }

  eyePose(): { position: THREE.Vector3; yaw: number } {
    const position = this.localToWorld(new THREE.Vector3(0, 1.5, STAND_Z - 0.05));
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
    if (this.state === 'playing') return 'Press E or click to walk away (the play is lost)';
    if (this.state === 'initials') return 'Sign the hall of fame · E to walk away';
    if (this.state === 'over') return `Space or click to play again (${this.priceText()}) · E to walk away`;
    return `${this.title} — click to insert a coin (${this.priceText()}, nine balls)`;
  }

  labelPlacement(): LabelPlacement {
    return this.state === 'attract' || this.who === 'regular' ? 'crosshair' : 'edge';
  }

  activate(session: SessionActions): void {
    if (this.who === 'regular') session.hint(TAKEN_LINE);
    else session.playArcade(this);
  }

  update(dt: number): void {
    this.clock += dt;
    this.speaker.follow();
    this.strip.update(dt);
    switch (this.state) {
      case 'playing':
        this.play(dt, this.readControls());
        if (this.ballsLeft === 0 && this.phase === 'aim') this.finish();
        break;
      case 'demo':
        if (this.ballsLeft === 0 && this.phase === 'aim') {
          if (this.demoPause === 0) this.stationEvents.onRegularResult?.(this.score);
          this.demoPause += dt;
          if (this.demoPause > REGULAR_PAUSE) {
            this.demoPause = 0;
            this.speaker.play('coin');
            this.newGame();
          }
        } else this.play(dt, this.demoControls(dt));
        break;
      case 'initials': {
        const sfx = this.entry?.update(dt, this.readControls());
        if (sfx) this.speaker.play(sfx);
        if (this.entry?.done) {
          this.sign(this.entry.value);
          this.entry = null;
          this.state = 'over';
          this.overClock = 0;
        }
        break;
      }
      case 'over': {
        this.overClock += dt;
        const tickets = Math.floor(this.last.score / this.wiring.pointsPerTicket);
        const shown = Math.floor(tickets * Math.min(1, this.overClock / COUNT_UP_SECONDS));
        this.strip.setTickets(shown);
        break;
      }
      case 'attract':
        break;
    }
    this.displayClock += dt;
    if (this.state !== 'attract' || this.displayClock > 0.25) {
      this.displayClock = 0;
      this.paintDisplay();
    }
  }

  dispose(): void {
    this.speaker.dispose();
  }

  // --- The roll ---------------------------------------------------------------------------------

  private newGame(): void {
    this.score = 0;
    this.ballsLeft = BALLS;
    this.lastPoints = null;
    this.resetBall();
  }

  /** One frame of the play: aim and power with the ball in hand, then the ball's roll, flight and sinking. */
  private play(dt: number, controls: ArcadeControls): void {
    this.phaseClock += dt;
    switch (this.phase) {
      case 'aim': {
        if (this.ballsLeft === 0) return;
        const dir = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
        this.aimU = THREE.MathUtils.clamp(this.aimU + dir * AIM_SPEED * dt, -AIM_MAX, AIM_MAX);
        if (controls.fire) {
          if (!this.charging) {
            this.charging = true;
            this.chargeClock = 0;
          }
          this.chargeClock += dt;
          // A triangle wave: up to full over half a period, back down, and again.
          const t = (this.chargeClock % POWER_PERIOD) / POWER_PERIOD;
          this.power = t < 0.5 ? t * 2 : 2 - t * 2;
        } else if (this.charging) {
          this.charging = false;
          this.roll();
        }
        this.placeBallInHand();
        break;
      }
      case 'roll': {
        const t = Math.min(1, this.phaseClock / this.rollSeconds);
        // Slowing as it climbs: position eases out.
        const s = 1 - (1 - t) * (1 - t);
        const soft = this.landing.points < 0;
        const reach = soft ? 0.6 : 1;
        this.ball.position.set(
          THREE.MathUtils.lerp(this.aimU, this.aimU * 0.95, s),
          THREE.MathUtils.lerp(LANE_NEAR.y, LANE_FAR.y, s * reach) + BALL_R,
          THREE.MathUtils.lerp(LANE_NEAR.z - 0.02, LANE_FAR.z, s * reach),
        );
        this.ball.rotation.x -= dt * 20;
        if (t >= 1) {
          if (soft) this.enterPhase('back');
          else {
            this.flightFrom.copy(this.ball.position);
            this.flightTo.copy(this.boardPoint(this.landing.u, this.landing.v)).add(new THREE.Vector3(0, BALL_R, 0));
            this.enterPhase('fly');
          }
        }
        break;
      }
      case 'fly': {
        const t = Math.min(1, this.phaseClock / 0.35);
        this.ball.position.lerpVectors(this.flightFrom, this.flightTo, t);
        this.ball.position.y += Math.sin(t * Math.PI) * 0.12;
        if (t >= 1) {
          this.speaker.play('thud');
          this.enterPhase('sink');
        }
        break;
      }
      case 'sink': {
        const t = Math.min(1, this.phaseClock / 0.3);
        this.ball.position.y = this.flightTo.y - t * BALL_R * 2.2;
        if (t >= 1) {
          const points = this.landing.points;
          this.score += points;
          this.lastPoints = points;
          this.speaker.play(points >= POCKET_POINTS ? 'bonus' : points >= 40 ? 'score' : 'blip', 1 + points / 200);
          this.nextBall();
        }
        break;
      }
      case 'back': {
        // Too soft: it rolls back down to the trough.
        const t = Math.min(1, this.phaseClock / 0.8);
        this.ball.position.z = THREE.MathUtils.lerp(this.ball.position.z, LANE_NEAR.z, t);
        this.ball.position.y = THREE.MathUtils.lerp(this.ball.position.y, LANE_NEAR.y + BALL_R, t);
        this.ball.rotation.x += dt * 14;
        if (t >= 1) {
          this.lastPoints = 0;
          this.speaker.play('lose');
          this.nextBall();
        }
        break;
      }
    }
  }

  /** Lets go: where it lands follows the power (and a little luck); too soft, it never clears the hump. */
  private roll(): void {
    const power = this.power;
    this.ballsLeft -= 1;
    this.syncTrough();
    this.speaker.play('roll');
    this.rollSeconds = 0.9 - power * 0.35;
    if (power < 0.12) {
      this.landing = { u: this.aimU, v: 0, points: -1 };
      this.enterPhase('roll');
      return;
    }
    const noise = (): number => (Math.random() + Math.random() - 1) * 0.035;
    let v = 0.04 + power * 0.72 + noise();
    // Over the top: it hits the back of the cage and drops somewhere on the upper board.
    if (v > BOARD_V - 0.02) v = BOARD_V - 0.1 - Math.random() * 0.2;
    const u = THREE.MathUtils.clamp(this.aimU * 1.05 + noise(), -BOARD_W / 2 + 0.05, BOARD_W / 2 - 0.05);
    this.landing = { u, v, points: scoreAt(u, v) };
    this.enterPhase('roll');
  }

  private nextBall(): void {
    this.resetBall();
  }

  private resetBall(): void {
    this.phase = 'aim';
    this.phaseClock = 0;
    this.power = 0;
    this.charging = false;
    this.syncTrough();
    this.placeBallInHand();
    this.ball.visible = this.ballsLeft > 0 || this.state === 'attract';
  }

  private enterPhase(phase: BallPhase): void {
    this.phase = phase;
    this.phaseClock = 0;
  }

  private placeBallInHand(): void {
    this.ball.position.set(this.aimU, LANE_NEAR.y + BALL_R + 0.01, LANE_NEAR.z - 0.02);
  }

  /** The waiting balls in the trough: one fewer per ball rolled (the one in hand is not in it). */
  private syncTrough(): void {
    const waiting = this.state === 'attract' ? BALLS - 1 : Math.max(0, this.ballsLeft - 1);
    this.trough.forEach((b, i) => (b.visible = i < waiting));
  }

  /** A point on the target board's surface: `u` across, `v` up the board from its front edge. */
  private boardPoint(u: number, v: number): THREE.Vector3 {
    const t = v / BOARD_V;
    return new THREE.Vector3(u, THREE.MathUtils.lerp(BOARD_FRONT.y, BOARD_BACK.y, t), THREE.MathUtils.lerp(BOARD_FRONT.z, BOARD_BACK.z, t));
  }

  /** A regular: aims at the rings (or, feeling lucky, a pocket), holds for about the right power. */
  private demoControls(dt: number): ArcadeControls {
    const out: ArcadeControls = { left: false, right: false, up: false, down: false, fire: false, firePressed: false };
    if (this.phase !== 'aim') return out;
    if (!this.charging && this.phaseClock === 0) {
      const pocket = Math.random() < 0.2 ? POCKETS[Math.floor(Math.random() * 2)]! : null;
      const u = pocket ? pocket.u : RING_CENTRE.u + (Math.random() - 0.5) * 0.06;
      const v = pocket ? pocket.v : RING_CENTRE.v;
      const power = THREE.MathUtils.clamp((v - 0.04) / 0.72 + (Math.random() - 0.5) * 0.12, 0.15, 1);
      // Once lined up: a beat's wait, then fire held until the meter has climbed to that power on its first way up.
      this.demoTarget = { u, power, holdFor: 0.6 + power * (POWER_PERIOD / 2) };
      this.demoClock = 0;
    }
    const diff = this.demoTarget.u - this.aimU;
    if (Math.abs(diff) > 0.01 && !this.charging) {
      out.left = diff < 0;
      out.right = diff > 0;
      return out;
    }
    this.demoClock += dt;
    out.fire = this.demoClock > 0.6 && this.demoClock < this.demoTarget.holdFor;
    return out;
  }

  private finish(): void {
    const { scores } = this.wiring;
    const score = this.score;
    this.last = { score, best: score > 0 && score > scores.bestOf(this.game.id) };
    this.lastRank = null;
    if (scores.qualifies(this.game.id, score)) {
      const rank = Math.max(0, scores.table(this.game.id).findIndex((e) => score > e.score));
      this.entry = new InitialsEntry(scores.initials, rank, score);
      this.state = 'initials';
    } else {
      this.sign(scores.initials);
      this.state = 'over';
      this.overClock = 0;
    }
    this.speaker.play(this.last.best ? 'best' : 'over');
    const handler = this.onOver;
    this.onOver = null;
    handler?.(this.last);
    this.stationEvents.onPlayerResult?.(this.last);
  }

  private sign(initials: string): void {
    this.lastRank = this.wiring.scores.submit(this.game.id, this.last.score, initials).rank;
  }

  /** The keys; the Space (or click) that started the play counts only once it has been let go. */
  private readControls(): ArcadeControls {
    const { input } = this.wiring;
    let fire = input.isDown(...FIRE_KEYS);
    if (this.lastFire) {
      if (!fire) this.lastFire = false;
      fire = false;
    }
    return { left: input.isDown(...LEFT_KEYS), right: input.isDown(...RIGHT_KEYS), up: input.isDown(...UP_KEYS), down: input.isDown(...DOWN_KEYS), fire, firePressed: false };
  }

  private priceText(): string {
    const cost = this.wiring.nextPlayCost();
    return cost === 0 ? 'free play' : `${cost} coin${cost > 1 ? 's' : ''}`;
  }

  /** The backboard's display: the score and balls left, the power meter while charging, the initials or the end card. */
  private paintDisplay(): void {
    const { ctx, canvas, texture } = this.display;
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = '#0a0612';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#ffd23a';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, W - 8, H - 8);
    if (this.state === 'initials' && this.entry) {
      this.entry.draw(ctx, W / 2, H / 2, 0.75);
      texture.needsUpdate = true;
      return;
    }
    const blink = Math.floor(this.clock * 3) % 2 === 0;
    if (this.state === 'attract') {
      const top = this.wiring.scores.topOf(this.game.id);
      drawText(ctx, this.title, W / 2, 40, 22, '#ffe680');
      drawText(ctx, `HI ${top.name} ${top.score}`, W / 2, 80, 14, top.you ? '#7ee787' : '#c9c4ff');
      drawText(ctx, `9 BALLS · ${this.wiring.pointsPerTicket} PTS = 1 TICKET`, W / 2, 112, 10, '#9a96c0');
      if (blink) drawText(ctx, 'INSERT COIN', W / 2, 152, 18, '#ff8a80');
      texture.needsUpdate = true;
      return;
    }
    if (this.state === 'over') {
      const tickets = Math.floor(this.last.score / this.wiring.pointsPerTicket);
      const shown = Math.floor(tickets * Math.min(1, this.overClock / COUNT_UP_SECONDS));
      drawText(ctx, `SCORE ${this.last.score}`, W / 2, 36, 18, '#fff2a8');
      drawText(ctx, `${shown} TICKETS`, W / 2, 80, 24, '#ffd23a');
      const note = this.lastRank !== null ? `${ordinal(this.lastRank + 1)} ON THE BOARD!` : this.last.best ? 'NEW BEST!' : '';
      if (note) drawText(ctx, note, W / 2, 118, 14, blink ? '#7ee787' : '#ffffff');
      drawText(ctx, `SPACE: AGAIN (${this.priceText().toUpperCase()})`, W / 2, 160, 11, '#ff8a80');
      texture.needsUpdate = true;
      return;
    }
    drawText(ctx, `${this.score}`, W / 2, 50, 40, '#ff8a3a');
    drawText(ctx, `BALLS ${this.ballsLeft}`, 20, 100, 12, '#c9c4ff', 'left');
    if (this.lastPoints !== null && this.phase === 'aim') drawText(ctx, this.lastPoints > 0 ? `+${this.lastPoints}` : 'MISS', W - 20, 100, 14, this.lastPoints >= 100 ? '#ffd23a' : this.lastPoints > 0 ? '#7ee787' : '#ff8a80', 'right');
    // The power meter.
    ctx.fillStyle = '#222233';
    ctx.fillRect(20, 130, W - 40, 26);
    const grad = ctx.createLinearGradient(20, 0, W - 20, 0);
    grad.addColorStop(0, '#4dff7a');
    grad.addColorStop(0.6, '#ffe23a');
    grad.addColorStop(1, '#ff4a3a');
    ctx.fillStyle = grad;
    ctx.fillRect(20, 130, (W - 40) * (this.phase === 'aim' ? this.power : 0), 26);
    drawText(ctx, this.phase === 'aim' ? 'HOLD SPACE · LET GO' : 'ROLLING...', W / 2, 176, 10, '#9a96c0');
    texture.needsUpdate = true;
  }
}

/** Points for a ball that lands at (u, v) on the board: a corner pocket, else the ring it drops into, else the 10 at the bottom. */
function scoreAt(u: number, v: number): number {
  for (const p of POCKETS) if (Math.hypot(u - p.u, v - p.v) <= POCKET_R) return POCKET_POINTS;
  const d = Math.hypot(u - RING_CENTRE.u, v - RING_CENTRE.v);
  return RINGS.find((r) => d <= r.within)?.points ?? 10;
}

/** The board: concentric rings round the 50, the numbers, the two 100 pockets in the top corners. */
function paintBoard(): THREE.Texture {
  const PX = 700;
  const W = Math.round(BOARD_W * PX);
  const H = Math.round(BOARD_V * PX);
  const [canvas, ctx] = createCanvas(W, H);
  ctx.fillStyle = '#1b3a6b';
  ctx.fillRect(0, 0, W, H);
  // Canvas y grows down; the board's v grows up from the front edge.
  const at = (u: number, v: number): [number, number] => [(u + BOARD_W / 2) * PX, H - v * PX];
  const [cx, cy] = at(RING_CENTRE.u, RING_CENTRE.v);
  const colours = ['#e8e2d0', '#c8443a', '#e8e2d0', '#c8443a'];
  [...RINGS].reverse().forEach((ring, i) => {
    ctx.fillStyle = colours[i]!;
    ctx.beginPath();
    ctx.arc(cx, cy, ring.within * PX, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(cx, cy, 0.03 * PX, 0, Math.PI * 2);
  ctx.fill();
  RINGS.forEach((ring, i) => drawText(ctx, `${ring.points}`, cx, cy - (i === 0 ? 0.035 : (ring.within - 0.025)) * PX, 18, i % 2 ? '#e8e2d0' : '#1b3a6b'));
  for (const p of POCKETS) {
    const [px, py] = at(p.u, p.v);
    ctx.fillStyle = '#ffd23a';
    ctx.beginPath();
    ctx.arc(px, py, POCKET_R * PX + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(px, py, POCKET_R * PX, 0, Math.PI * 2);
    ctx.fill();
    drawText(ctx, '100', px, py - POCKET_R * PX - 16, 16, '#ffd23a');
  }
  drawText(ctx, '10', W / 2, H - 22, 18, '#e8e2d0');
  return toTexture(canvas, 4);
}

function paintMarquee(title: string): THREE.Texture {
  const [canvas, ctx] = createCanvas(512, 128);
  const g = ctx.createLinearGradient(0, 0, 512, 0);
  g.addColorStop(0, '#ffd23a');
  g.addColorStop(1, '#ff7a33');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let x = 0; x < 512; x += 32) ctx.fillRect(x, 0, 16, 10);
  drawText(ctx, title, 256, 70, 52, '#3a0f10');
  return toTexture(canvas, 4);
}

/** A see-through wire mesh in front of the rings (it keeps the balls in). */
function paintNet(): THREE.Texture {
  const [canvas, ctx] = createCanvas(256, 256);
  ctx.clearRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(200,200,210,0.35)';
  ctx.lineWidth = 2;
  for (let i = -256; i < 512; i += 24) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 256, 256);
    ctx.moveTo(i + 256, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 3);
  return texture;
}
