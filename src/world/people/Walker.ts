import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { Furniture } from '../Furniture';
import { angleBetween, Glance, idleGlance, nextLeg, roundCorners, stepAlong, turnTowards, viewerWithin, type Leg } from './locomotion';
import { PersonModel } from './PersonModel';
import { randomLook, type PersonLook } from './looks';
import type { Pose } from './poses';
import type { Held } from './held';
import { SpeechBubble } from './SpeechBubble';
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
}

/** How fast the body turns towards its heading, per second. */
const TURN_RATE = 5;
const ARRIVE = 0.04;
/** A player nearer than this gets a look. */
const NOTICE_RANGE = 1.6;
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
/** Standing, a turn wider than this (radians) is shuffled round on the feet rather than swivelled. */
const SHUFFLE_ABOVE = 0.3;
/** Chance per second, with the player near and a focus of their own, of a glance at the player. */
const GLANCE_RATE = 0.6;
/**
 * Making way: the player within `ahead` m in front and `wide` m either side of the way slows them; nearer than
 * `stop` m they stop, for `patience` s at most (then go on through, as before); meanwhile they edge aside at
 * `side` m/s, `sideMax` m at most per leg, away from the player.
 */
const YIELD = { ahead: 1, wide: 0.5, stop: 0.55, patience: 1.8, side: 0.45, sideMax: 0.3 };

type State = { kind: 'walk'; path: THREE.Vector3[]; then: (() => void) | null } | { kind: 'stand'; yaw: number };

/**
 * Someone the hall directs: walks a path of floor points (zone-local), then stands facing a
 * given way in a given pose, eyes on a given point (a screen, the player's play) or wandering, and
 * glances at the player brushing past. Says a word in a `SpeechBubble` when told to, and a line
 * when clicked. `setPresent(false)` takes them out of the hall (walked out of the door). Who goes
 * where is decided outside (the arcade's `ArcadeCrowd`); this class only walks and stands: setting
 * off and stopping over a moment, shuffling round a wide turn, and making way for the player in front
 * (slowing, a moment's stop, a little aside). Origin on the floor; the group moves itself in
 * zone-local coordinates. Never collides.
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
  private focus: THREE.Vector3 | null = null;
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
    this.model = new PersonModel(options.look ?? randomLook(seed + 200, 'shopper'), this.viewer);
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
    this.nextLine = seed;
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
    this.model.setOpacity(amount);
    this.model.visible = amount > 0.01;
    if (this.blob) this.blob.visible = amount > 0.5 && !this.blobHidden;
  }

  /** Hides the blob shadow under them (on a flight of stairs a flat disc would cut through the tread above). */
  protected setBlobShown(shown: boolean): void {
    if (this.blobHidden === !shown) return;
    this.blobHidden = !shown;
    if (this.blob) this.blob.visible = this.fadeAmount > 0.5 && shown;
  }

  /** Sits down where they are, on a seat `height` metres high, facing `yaw`, arms in `pose`, eyes on `focus` or wandering. */
  sit(yaw: number, height: number, pose: Pose = 'lap', focus: THREE.Vector3 | null = null): void {
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
    this.state = { kind: 'walk', path: points, then: then ?? null };
    this.focus = null;
    this.hands = null;
    this.model.setPose('stand');
    this.model.reach(null);
    this.model.lean(0);
  }

  /**
   * Stands where they are, turning to face `yaw` (0 = +z), arms in `pose`, eyes on `focus` (world)
   * or wandering. At a machine: `hands` gives the world points the hands stay on (read every frame,
   * so they follow a joystick), `lean` bends the upper body over it.
   */
  stand(yaw: number, pose: Pose, focus: THREE.Vector3 | null = null, hands: (() => readonly [THREE.Vector3, THREE.Vector3]) | null = null, lean = 0): void {
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

  setFocus(focus: THREE.Vector3 | null): void {
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
    this.bubble.speak(text, name, () => this.lineShown(text));
  }

  /** A line of theirs just showed (a queued one, after those before it): they nod along while it would take to say. */
  protected lineShown(text: string): void {
    this.model.talk(Math.min(3.5, 0.5 + text.length * 0.045));
  }

  update(dt: number): void {
    if (!this.present) return;
    if (Number.isNaN(this.heading)) this.heading = this.rotation.y;
    if (this.state.kind === 'walk') this.step(dt, this.state);
    else {
      // A wide turn standing: the feet shuffle round with it (a seated body only turns its head).
      const gap = Math.abs(angleBetween(this.heading, this.state.yaw));
      this.face(this.state.yaw, dt);
      this.model.setSpeed(!this.seated && gap > SHUFFLE_ABOVE ? Math.min(0.4, gap * TURN_RATE * 0.1) : 0);
      // Hands on the controls once turned to them (reaching while still turning would twist the arms).
      if (this.hands) this.model.reach(this.facing(this.state.yaw) ? this.hands() : null);
      this.look(dt);
    }
    this.model.update(dt);
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
    if (this.talk) {
      this.speak(this.talk());
      return;
    }
    if (!this.lines.length) return;
    this.speak(this.lines[this.nextLine % this.lines.length]!);
    this.nextLine++;
  }

  /**
   * A frame of walking: up to speed from standing, down into the stop at the end (no step starts or ends at full
   * pace), slower round a rounded corner, making way for the player in front; the distance of the frame carries
   * on past a point of the path into the next, so nobody halts a frame at every point.
   */
  private step(dt: number, state: { path: THREE.Vector3[]; then: (() => void) | null }): void {
    const own = this.speed * this.pace;
    const first = state.path[0];
    if (!first) return this.arrive(state);
    let goal = own * (this.arcs?.has(first) ? CORNER_PACE : 1);
    // Braking into the last point: the speed from which `ACCEL_S`'s deceleration stops just there.
    let left = Math.hypot(first.x - this.position.x, first.z - this.position.z);
    for (let i = 1; i < state.path.length; i++) left += state.path[i]!.distanceTo(state.path[i - 1]!);
    goal = Math.min(goal, Math.max(ARRIVE_SPEED, Math.sqrt((2 * own * left) / ACCEL_S)));
    if (this.yields) goal = this.makeWay(dt, first, goal);
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
    this.look(dt);
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
    if (this.yielding > YIELD.patience) return goal;
    // Edge aside, away from the player's side of the way.
    if (this.edged < YIELD.sideMax) {
      const shift = Math.min(YIELD.sideMax - this.edged, YIELD.side * dt);
      const away = side > 0 ? -1 : 1;
      this.position.x += (hz / h) * shift * away;
      this.position.z += (-hx / h) * shift * away;
      this.edged += shift;
    }
    if (along < YIELD.stop) return 0;
    return goal * THREE.MathUtils.smoothstep(along, YIELD.stop, YIELD.ahead);
  }

  /** Whether the body has (nearly) finished turning to `yaw`. */
  private facing(yaw: number): boolean {
    return Math.abs(angleBetween(this.heading, yaw)) < 0.25;
  }

  private face(yaw: number, dt: number): void {
    this.heading = turnTowards(this.heading, yaw, dt, TURN_RATE);
    this.rotation.y = this.heading;
  }

  /** The player close by gets a look; else the focus, else a glance about now and then. */
  private look(dt: number): void {
    const near = viewerWithin(this, this.viewer, NOTICE_RANGE, this.viewerPos, this.here);
    if (near && (!this.focus || Math.random() < GLANCE_RATE * dt)) {
      this.model.gaze(this.viewerPos);
      return;
    }
    if (this.focus) {
      this.model.gaze(this.focus);
      return;
    }
    this.model.gaze(this.localToWorld(this.gazePoint.copy(this.glance.update(dt, idleGlance))));
  }
}
