import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { Furniture } from '../Furniture';
import { angleBetween, Glance, idleGlance, nextLeg, roundCorners, stepAlong, turnTowards, viewerWithin, type Leg } from './locomotion';
import { PersonModel } from './PersonModel';
import { randomLook, type PersonLook } from './looks';
import type { Pose } from './poses';
import type { Performer, Reaction } from './performer';
import type { GestureName } from './motion/gestures';
import type { Held } from './held';
import { SpeechBubble } from './SpeechBubble';
import { Attention, STANDING, WALKING } from './attention';
import { blobShadow } from '../zone/ContactShadows';

export interface WalkerOptions {
  /** Whose passing to notice: the camera. */
  viewer: THREE.Object3D;
  seed?: number;
  look?: PersonLook;
  /** Walking speed, m/s. Default 0.8. */
  speed?: number;
  /** What they say when clicked, one line at a time. */
  lines?: readonly string[];
  /** The caption when hovered. */
  label?: string;
  /** What they say when clicked, asked afresh each time (the street's passers-by); wins over `lines`. */
  talk?: () => string;
  /** Can be faded in and out (`setFade`): set once, as it changes their shaders. */
  fade?: boolean;
  /** The name on what they say to the player (a friend's, "Postman"); none for a stranger. */
  speaker?: string;
  /** The caption shows only while the player is within this many metres (a stranger across the street says nothing). */
  labelWithin?: number;
  /** Corners of a walked path are rounded with this radius (metres) and taken a little slower (`roundCorners`); 0: pivot on the spot. */
  corners?: number;
  /** Makes way for the player: slows, stops a moment and edges aside when they stand in the way (default true; a friend's `Visit` does its own). */
  yields?: boolean;
  /**
   * The others walking about (a street's crowd, a live list): coming the other way, both keep to their right and
   * pass; behind someone slower, they slow down. Their `partner` (walking with them) is left alone. None by default.
   */
  crowd?: () => readonly Walker[];
  /** Clicked while walking, they stop for what they say, facing the player, then walk on (default: they talk walking). */
  stopsToTalk?: boolean;
}

/** How fast the body turns towards its heading, per second, walking; standing, a turn is slower (the feet step it round). */
const TURN_RATE = 5;
const STAND_TURN_RATE = 2.6;
const ARRIVE = 0.04;
/** The bubble's height over the floor. */
const BUBBLE_Y = 2.05;
/** How much slower a rounded corner is walked. */
const CORNER_PACE = 0.82;
/** Out of the hall: parked out of sight and reach. */
const AWAY_Y = -50;
/** Seconds to get up to walking speed from standing (and, as a braking distance, to come to a stop at the end). */
const ACCEL_S = 0.3;
/** The slowest the last steps into a stop are walked (m/s), so the end is always reached. */
const ARRIVE_SPEED = 0.15;
/**
 * Making way: the player within `ahead` m in front and `wide` m either side of the way slows them; nearer than
 * `stop` m they stop, for `patience` s at most (then go on through, as before); meanwhile they edge aside at
 * `side` m/s, `sideMax` m at most per leg, away from the player.
 */
const YIELD = { ahead: 1, wide: 0.5, stop: 0.55, patience: 1.8, side: 0.45, sideMax: 0.3 };
/** Past their patience they step round the player: further aside, this far at most, slowly. */
const GO_ROUND = { sideMax: 0.75, pace: 0.45 };
/**
 * Passing others (`crowd`): someone coming the other way within `ahead` m and `wide` m either side of the way: both
 * edge right at `side` m/s, `sideMax` m at most per leg, a little slower; someone ahead going the same way, slower,
 * within `follow` m: they slow to that pace.
 */
const PASS = { ahead: 2.2, wide: 0.7, side: 0.55, sideMax: 0.4, pace: 0.85, follow: 1.1 };

type State = { kind: 'walk'; path: THREE.Vector3[]; then: (() => void) | null } | { kind: 'stand'; yaw: number };
/** What they keep their eyes on: a world point, the player (in conversation: mostly on them, a glance aside now and then), or nothing (their own glances). */
type Focus = THREE.Vector3 | 'viewer' | null;
/** Seconds they keep their eyes on the player after a line said to them, beyond its own length. */
const LINE_ATTENTION = 3;

/**
 * Someone the hall directs: walks a path of floor points (zone-local), then stands facing a
 * given way in a given pose, eyes on a given point (a screen, the player's play) or wandering, and
 * looks at the player as people do (`Attention`: on noticing them, now and then, never a stare;
 * mostly at them while talking to them). Says a word in a `SpeechBubble` when told to, and a line
 * when clicked. `setPresent(false)` takes them out of the hall (walked out of the door). Who goes
 * where is decided outside (the arcade's `ArcadeCrowd`); this class only walks and stands: setting
 * off and stopping over a moment, shuffling round a wide turn, making way for the player in front
 * (slowing, a moment's stop, a little aside, then round them) and, given the others (`crowd`),
 * keeping right to pass them. Origin on the floor; the group moves itself in zone-local
 * coordinates. Never collides. Faded right out, the body is not posed (it costs nothing).
 */
export class Walker extends THREE.Group implements Furniture, Updatable, Interactable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly model: PersonModel;
  private readonly viewer: THREE.Object3D;
  private readonly speed: number;
  private readonly bubble = new SpeechBubble();
  private readonly lines: readonly string[];
  private readonly talk: (() => string) | null;
  private readonly blob: THREE.Mesh | null;
  private readonly caption: string;
  private readonly speaker: string | undefined;
  private readonly labelWithin: number;
  private readonly corners: number;
  private readonly yields: boolean;
  private readonly crowd: (() => readonly Walker[]) | null;
  private readonly stopsToTalk: boolean;
  private readonly fades: boolean;
  /** Who walks with them (a friend, a parent): not someone to make way for. */
  partner: Walker | null = null;
  /** The street's people budget's share of them (0..1, times the fade asked for: `setAllowance`). */
  private allowance = 1;
  /** Seconds they stand still for a line said to the player (`stopsToTalk`). */
  private halted = 0;
  /** How far they have edged right on this leg to pass someone. */
  private passed = 0;
  /** Points of the current path on a rounded corner (walked at `CORNER_PACE`). */
  private arcs: Set<THREE.Vector3> | null = null;
  /** For each point of the current path, the index of the given point it stands for (a rounded corner is several). */
  private owners: number[] = [];
  private passedPoints = 0;
  /** The speed they walk at right now (m/s): up from 0 on setting off, down into a stop. */
  private current = 0;
  /** How long the player has stood in their way (s), and how far they have edged aside on this leg (m). */
  private yielding = 0;
  private edged = 0;
  private seated = false;
  private blobHidden = false;
  private fadeAmount = 1;
  /** Their walking speed times this (quicker in the rain). */
  private pace = 1;
  private nextLine: number;
  private state: State = { kind: 'stand', yaw: 0 };
  private heading = NaN;
  private present = true;
  private focus: Focus = null;
  private readonly attention: Attention;
  private hands: (() => readonly [THREE.Vector3, THREE.Vector3]) | null = null;
  private readonly glance = new Glance();
  private readonly leg: Leg = { dx: 0, dz: 0, dist: 0 };
  private readonly viewerPos = new THREE.Vector3();
  private readonly here = new THREE.Vector3();
  private readonly gazePoint = new THREE.Vector3();

  constructor(options: WalkerOptions) {
    super();
    this.name = 'Walker';
    this.viewer = options.viewer;
    this.speed = options.speed ?? 0.8;
    const seed = options.seed ?? 1;
    this.model = new PersonModel(options.look ?? randomLook(seed + 200, 'shopper'), this.viewer, seed + 200);
    this.add(this.model);
    const blob = blobShadow(0.55, 0.5);
    if (blob) this.add(blob);
    this.blob = blob;
    if (options.fade) this.model.enableFade();
    this.bubble.position.y = BUBBLE_Y;
    this.add(this.bubble);
    this.hitboxes = [this.model.hitbox];
    this.lines = options.lines ?? [];
    this.talk = options.talk ?? null;
    this.caption = options.label ?? 'Chat';
    this.speaker = options.speaker;
    this.labelWithin = options.labelWithin ?? Infinity;
    this.corners = options.corners ?? 0;
    this.yields = options.yields ?? true;
    this.crowd = options.crowd ?? null;
    this.stopsToTalk = options.stopsToTalk ?? false;
    this.fades = options.fade ?? false;
    this.nextLine = seed;
    this.attention = new Attention(seed);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  get isPresent(): boolean {
    return this.present;
  }

  get isWalking(): boolean {
    return this.state.kind === 'walk';
  }

  /** The way they face (yaw, 0 = +z). */
  get facingYaw(): number {
    return Number.isNaN(this.heading) ? this.rotation.y : this.heading;
  }

  /** How fast they are walking right now (m/s). */
  get currentSpeed(): number {
    return this.state.kind === 'walk' ? this.current : 0;
  }

  /** Whether they can be faded (made with `fade`): only those join a people budget. */
  get canFade(): boolean {
    return this.fades;
  }

  /** Whether they would show now if nothing held them back: present and faded in at all. */
  get wantsShown(): boolean {
    return this.present && this.fadeAmount > 0.01;
  }

  /** The share a people budget lets show (1 without one): what goes with them (a dog, its lead) fades by it too. */
  get shownShare(): number {
    return this.allowance;
  }

  /** Whether any of them is drawn now. */
  get drawn(): boolean {
    return this.present && this.model.visible;
  }

  /**
   * The share of them a people budget lets show (0..1), times the fade their owner asks for (`setFade`): the
   * street draws only the nearest few, the rest faded out. Needs `fade` in the options.
   */
  setAllowance(amount: number): void {
    if (amount === this.allowance) return;
    this.allowance = amount;
    this.applyFade();
  }

  /** Their body, for a machine that directs it move by move (the hoops, the dance pad). */
  get performer(): Performer {
    return this.model;
  }

  /** Something happened to them (a point, a record, a miss): they show it their own way. */
  react(reaction: Reaction): void {
    this.model.react(reaction);
  }

  /** A gesture now (a wave, a coin put in). */
  gesture(name: GestureName): void {
    this.model.gesture(name);
  }

  /** How many points of the path last given to `walk` they have got past so far. */
  get pointsPassed(): number {
    return this.passedPoints;
  }

  /** In the hall (appearing where they are put), or out of it. */
  setPresent(present: boolean, at?: THREE.Vector3): void {
    this.present = present;
    this.visible = present;
    if (at) this.position.copy(at);
    if (!present) this.position.y = AWAY_Y;
    else this.position.y = 0;
    this.heading = NaN;
  }

  /**
   * How much of them shows, 0..1 (a passer-by fading out at the edge of sight or through a door);
   * needs `fade` in the options. At 0 they are not drawn; their blob goes before they do.
   */
  setFade(amount: number): void {
    this.fadeAmount = amount;
    this.applyFade();
  }

  private applyFade(): void {
    const amount = this.fadeAmount * this.allowance;
    this.model.setOpacity(amount);
    this.model.visible = amount > 0.01;
    if (this.blob) this.blob.visible = amount > 0.5 && !this.blobHidden;
  }

  /** Hides the blob shadow under them (on a flight of stairs a flat disc would cut through the tread above). */
  protected setBlobShown(shown: boolean): void {
    if (this.blobHidden === !shown) return;
    this.blobHidden = !shown;
    if (this.blob) this.blob.visible = this.fadeAmount * this.allowance > 0.5 && shown;
  }

  /** Talking with whoever walks with them (no words shown): the mouth and hands going for `seconds`. */
  talkAlong(seconds: number): void {
    this.model.talk(seconds);
  }

  /** Sits down where they are, on a seat `height` metres high, facing `yaw`, arms in `pose`, eyes on `focus` or wandering. */
  sit(yaw: number, height: number, pose: Pose = 'lap', focus: Focus = null): void {
    this.stand(yaw, pose, focus);
    this.seated = true;
    this.model.sit(height);
  }

  /** Walks through `path` (floor points, zone-local), then calls `then`. */
  walk(path: THREE.Vector3[], then?: () => void): void {
    this.model.sit(null);
    this.seated = false;
    let points = path.map((p) => p.clone().setY(0));
    this.arcs = null;
    this.owners = points.map((_, i) => i);
    if (this.corners > 0) {
      const rounded = roundCorners(this.position, points, this.corners);
      points = rounded.path;
      this.owners = rounded.owners;
      this.arcs = rounded.arcs.size ? rounded.arcs : null;
    }
    this.passedPoints = 0;
    this.yielding = 0;
    this.edged = 0;
    this.passed = 0;
    this.halted = 0;
    this.state = { kind: 'walk', path: points, then: then ?? null };
    this.focus = null;
    this.hands = null;
    this.model.release();
    this.model.setPose('stand');
    this.model.reach(null);
    this.model.lean(0);
  }

  /**
   * Stands where they are, turning to face `yaw` (0 = +z), arms in `pose`, eyes on `focus` (world)
   * or wandering. At a machine: `hands` gives the world points the hands stay on (read every frame,
   * so they follow a joystick), `lean` bends the upper body over it.
   */
  stand(yaw: number, pose: Pose, focus: Focus = null, hands: (() => readonly [THREE.Vector3, THREE.Vector3]) | null = null, lean = 0): void {
    this.state = { kind: 'stand', yaw };
    this.seated = false;
    this.current = 0;
    this.model.sit(null);
    this.model.setPose(pose);
    this.focus = focus;
    this.hands = hands;
    this.model.reach(null);
    this.model.lean(lean);
    this.model.setSpeed(0);
  }

  setPose(pose: Pose): void {
    this.model.setPose(pose);
  }

  /** Walking speed times `factor` from now on (1: their own). */
  setPace(factor: number): void {
    this.pace = factor;
  }

  /** Something in the right hand (a phone, a book, an umbrella up), or nothing. */
  hold(item: Held | null): void {
    this.model.hold(item);
  }

  /** The hood up (snow) or down. */
  setHood(up: boolean): void {
    this.model.setHood(up);
  }

  setFocus(focus: Focus): void {
    this.focus = focus;
  }

  /** Bends the upper body forward by `angle` radians (getting up from a seat, sitting down). */
  setLean(angle: number): void {
    this.model.lean(angle);
  }

  /** A word in passing, over their head ("Bye!"). */
  say(text: string, seconds?: number): void {
    this.bubble.say(text, seconds, () => this.lineShown(text));
  }

  /** A line to the player, over their head with their name (or in the subtitles, out of view); `name` overrides theirs. */
  speak(text: string, name = this.speaker): void {
    this.bubble.speak(text, name, () => {
      this.lineShown(text);
      this.attention.engage(this.lineSeconds(text) + LINE_ATTENTION);
    });
  }

  /** A line of theirs just showed (a queued one, after those before it): they nod along while it would take to say. */
  protected lineShown(text: string): void {
    this.model.talk(this.lineSeconds(text));
  }

  /** About how long `text` takes to say (s). */
  private lineSeconds(text: string): number {
    return Math.min(3.5, 0.5 + text.length * 0.045);
  }

  update(dt: number): void {
    if (!this.present) return;
    if (Number.isNaN(this.heading)) this.heading = this.rotation.y;
    // Faded right out (beyond sight, through a door, held back by a budget): they still go where they go, but
    // their body is not posed, nor their eyes moved, until it shows again.
    const drawn = this.model.visible;
    if (this.state.kind === 'walk') this.step(dt, this.state, drawn);
    else {
      // Turning on the spot, slower than walking: the planted feet step round with it (`PersonModel`).
      this.face(this.state.yaw, dt, this.seated ? TURN_RATE : STAND_TURN_RATE);
      this.model.setSpeed(0);
      // Hands on the controls once turned to them (reaching while still turning would twist the arms).
      if (this.hands) this.model.reach(this.facing(this.state.yaw) ? this.hands() : null);
      if (drawn) this.look(dt);
    }
    if (drawn) this.model.update(dt);
  }

  setHovered(): void {
    // A person does not glow; the caption says it all.
  }

  label(): string | null {
    if (!this.present || !(this.lines.length || this.talk)) return null;
    if (this.labelWithin < Infinity && !viewerWithin(this, this.viewer, this.labelWithin, this.viewerPos, this.here)) return null;
    return this.caption;
  }

  activate(_session: SessionActions): void {
    let line: string;
    if (this.talk) line = this.talk();
    else if (this.lines.length) {
      line = this.lines[this.nextLine % this.lines.length]!;
      this.nextLine++;
    } else return;
    if (this.stopsToTalk && this.state.kind === 'walk') this.halted = this.lineSeconds(line) + LINE_ATTENTION * 0.5;
    this.speak(line);
  }

  /**
   * A frame of walking: up to speed from standing, down into the stop at the end (no step starts or ends at full
   * pace), slower round a rounded corner, making way for the player in front; the distance of the frame carries
   * on past a point of the path into the next, so nobody halts a frame at every point.
   */
  private step(dt: number, state: { path: THREE.Vector3[]; then: (() => void) | null }, drawn = true): void {
    const own = this.speed * this.pace;
    const first = state.path[0];
    if (!first) return this.arrive(state);
    if (this.halted > 0) {
      // Stopped for a word with the player: brought to a stop, turned to them, then on again.
      this.halted -= dt;
      this.current = Math.max(0, this.current - (own / ACCEL_S) * dt * 2);
      this.leg.dx = first.x - this.position.x;
      this.leg.dz = first.z - this.position.z;
      this.leg.dist = Math.hypot(this.leg.dx, this.leg.dz);
      if (this.leg.dist > 1e-3) stepAlong(this.position, this.leg, this.current * dt);
      this.viewer.getWorldPosition(this.viewerPos);
      const parent = this.parent;
      if (parent) {
        const player = parent.worldToLocal(this.viewerPos);
        this.face(Math.atan2(player.x - this.position.x, player.z - this.position.z), dt, STAND_TURN_RATE);
      }
      this.model.setSpeed(this.current);
      if (drawn) this.look(dt);
      return;
    }
    let goal = own * (this.arcs?.has(first) ? CORNER_PACE : 1);
    // Braking into the last point: the speed from which `ACCEL_S`'s deceleration stops just there.
    let left = Math.hypot(first.x - this.position.x, first.z - this.position.z);
    for (let i = 1; i < state.path.length; i++) left += state.path[i]!.distanceTo(state.path[i - 1]!);
    goal = Math.min(goal, Math.max(ARRIVE_SPEED, Math.sqrt((2 * own * left) / ACCEL_S)));
    if (this.yields) goal = this.makeWay(dt, first, goal);
    if (this.crowd) goal = this.passOthers(dt, first, goal);
    const accel = (own / ACCEL_S) * dt;
    this.current = this.current < goal ? Math.min(goal, this.current + accel) : Math.max(goal, this.current - accel * 2);
    let move = this.current * dt;
    for (let guard = 0; guard < 12; guard++) {
      const leg = nextLeg(this.position, state.path, ARRIVE, this.leg);
      if (leg === 'done') return this.arrive(state);
      if (leg === 'reached') {
        const owner = this.owners.shift() ?? 0;
        if (this.owners[0] !== owner) {
          this.passedPoints = owner + 1;
          this.edged = 0;
          this.passed = 0;
        }
        continue;
      }
      if (move <= 1e-6) break;
      const moved = Math.min(move, this.leg.dist);
      stepAlong(this.position, this.leg, moved);
      move -= moved;
      if (move <= 1e-6) break;
    }
    if (this.leg.dist > 1e-4) this.face(Math.atan2(this.leg.dx, this.leg.dz), dt);
    this.model.setSpeed(this.current);
    if (drawn) this.look(dt);
  }

  private arrive(state: { then: (() => void) | null }): void {
    this.state = { kind: 'stand', yaw: this.heading };
    this.current = 0;
    this.model.setSpeed(0);
    state.then?.();
  }

  /**
   * The player in the way ahead: slower the nearer they are, stopped (a moment, `YIELD.patience`) when close, and
   * a little aside meanwhile, away from them. Returns the speed to walk at.
   */
  private makeWay(dt: number, next: THREE.Vector3, goal: number): number {
    const parent = this.parent;
    if (!parent) return goal;
    this.viewer.getWorldPosition(this.viewerPos);
    const player = parent.worldToLocal(this.viewerPos);
    const hx = next.x - this.position.x;
    const hz = next.z - this.position.z;
    const h = Math.hypot(hx, hz);
    if (h < 1e-3) return goal;
    const dx = player.x - this.position.x;
    const dz = player.z - this.position.z;
    const along = (dx * hx + dz * hz) / h;
    const side = (dx * hz - dz * hx) / h;
    if (along <= 0 || along > YIELD.ahead || Math.abs(side) > YIELD.wide) {
      this.yielding = 0;
      return goal;
    }
    this.yielding += dt;
    // Past their patience they step round: further aside, slowly on (not through the player).
    const round = this.yielding > YIELD.patience;
    const sideMax = round ? GO_ROUND.sideMax : YIELD.sideMax;
    // Edge aside, away from the player's side of the way.
    if (this.edged < sideMax) {
      const shift = Math.min(sideMax - this.edged, YIELD.side * dt);
      const away = side > 0 ? -1 : 1;
      this.position.x += (hz / h) * shift * away;
      this.position.z += (-hx / h) * shift * away;
      this.edged += shift;
    }
    if (round) return Math.abs(side) > YIELD.wide * 0.8 || this.edged >= sideMax ? goal * GO_ROUND.pace : 0;
    if (along < YIELD.stop) return 0;
    return goal * THREE.MathUtils.smoothstep(along, YIELD.stop, YIELD.ahead);
  }

  /**
   * Others on the move (`crowd`), not their partner: coming the other way close to their line, both keep to their
   * right (each edges right, a little slower) and pass; someone going the same way just ahead, slower, sets the pace.
   * Returns the speed to walk at.
   */
  private passOthers(dt: number, next: THREE.Vector3, goal: number): number {
    const hx = next.x - this.position.x;
    const hz = next.z - this.position.z;
    const h = Math.hypot(hx, hz);
    if (h < 1e-3) return goal;
    const fx = hx / h;
    const fz = hz / h;
    let speed = goal;
    let meeting = false;
    for (const other of this.crowd!()) {
      if (other === this || other === this.partner || !other.present || other.parent !== this.parent || !other.wantsShown) continue;
      const dx = other.position.x - this.position.x;
      const dz = other.position.z - this.position.z;
      const along = dx * fx + dz * fz;
      if (along <= 0 || along > PASS.ahead) continue;
      // Positive: they are on our left.
      const side = dx * fz - dz * fx;
      if (Math.abs(side) > PASS.wide) continue;
      const oyaw = other.facingYaw;
      const facing = Math.sin(oyaw) * fx + Math.cos(oyaw) * fz;
      if (facing < -0.3 && other.isWalking) meeting = true;
      else if (facing > 0.5 && along < PASS.follow && other.currentSpeed < speed) speed = Math.max(other.currentSpeed, 0.25);
      else if (!other.isWalking && along < 0.9) meeting = true;
    }
    if (meeting) {
      // Keep right: (fz, -fx) is our left, so step the other way.
      if (this.passed < PASS.sideMax) {
        const shift = Math.min(PASS.sideMax - this.passed, PASS.side * dt);
        this.position.x -= fz * shift;
        this.position.z += fx * shift;
        this.passed += shift;
      }
      speed = Math.min(speed, goal * PASS.pace);
    }
    return speed;
  }

  /** Whether the body has (nearly) finished turning to `yaw`. */
  private facing(yaw: number): boolean {
    return Math.abs(angleBetween(this.heading, yaw)) < 0.25;
  }

  private face(yaw: number, dt: number, rate = TURN_RATE): void {
    this.heading = turnTowards(this.heading, yaw, dt, rate);
    this.rotation.y = this.heading;
  }

  /**
   * The player when `Attention` says so (on noticing them, a nod sometimes; now and then after; mostly while
   * talking with them); else the focus, else a glance about now and then. Playing a machine, they keep their
   * eyes on it unless spoken to.
   */
  private look(dt: number): void {
    if (this.focus === 'viewer') this.attention.engage(1);
    const walking = this.state.kind === 'walk';
    const busy = this.hands !== null && !this.attention.inConversation;
    const atPlayer = this.attention.update(dt, this, this.viewer, walking ? WALKING : STANDING, this.viewerPos) && !busy;
    if (this.attention.takeNotice() && !busy) this.model.nod();
    if (atPlayer) {
      this.model.gaze(this.viewerPos);
      return;
    }
    if (this.focus instanceof THREE.Vector3) {
      this.model.gaze(this.focus);
      return;
    }
    this.model.gaze(this.localToWorld(this.gazePoint.copy(this.glance.update(dt, idleGlance))));
  }
}
