import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { Furniture } from '../Furniture';
import { angleBetween, Glance, idleGlance, nextLeg, stepAlong, turnTowards, viewerWithin, type Leg } from './locomotion';
import { PersonModel } from './PersonModel';
import { randomLook, type PersonLook } from './looks';
import type { Pose } from './poses';
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
}

/** How fast the body turns towards its heading, per second. */
const TURN_RATE = 5;
const ARRIVE = 0.04;
/** A player nearer than this gets a look. */
const NOTICE_RANGE = 1.6;
/** The bubble's height over the floor. */
const BUBBLE_Y = 2.05;
/** Out of the hall: parked out of sight and reach. */
const AWAY_Y = -50;

type State = { kind: 'walk'; path: THREE.Vector3[]; then: (() => void) | null } | { kind: 'stand'; yaw: number };

/**
 * Someone the hall directs: walks a path of floor points (zone-local), then stands facing a
 * given way in a given pose, eyes on a given point (a screen, the player's play) or wandering, and
 * glances at the player brushing past. Says a word in a `SpeechBubble` when told to, and a line
 * when clicked. `setPresent(false)` takes them out of the hall (walked out of the door). Who goes
 * where is decided outside (the arcade's `ArcadeCrowd`); this class only walks and stands. Origin on
 * the floor; the group moves itself in zone-local coordinates. Never collides.
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
    this.caption = options.label ?? 'Click to chat';
    this.speaker = options.speaker;
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
    this.model.setOpacity(amount);
    this.model.visible = amount > 0.01;
    if (this.blob) this.blob.visible = amount > 0.5;
  }

  /** Sits down where they are, on a seat `height` metres high, facing `yaw`, arms in `pose`, eyes on `focus` or wandering. */
  sit(yaw: number, height: number, pose: Pose = 'lap', focus: THREE.Vector3 | null = null): void {
    this.stand(yaw, pose, focus);
    this.model.sit(height);
  }

  /** Walks through `path` (floor points, zone-local), then calls `then`. */
  walk(path: THREE.Vector3[], then?: () => void): void {
    this.model.sit(null);
    this.state = { kind: 'walk', path: path.map((p) => p.clone().setY(0)), then: then ?? null };
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

  setFocus(focus: THREE.Vector3 | null): void {
    this.focus = focus;
  }

  /** A word in passing, over their head ("Bye!"). */
  say(text: string, seconds?: number): void {
    this.bubble.say(text, seconds);
  }

  /** A line to the player, over their head with their name (or in the subtitles, out of view); `name` overrides theirs. */
  speak(text: string, name = this.speaker): void {
    this.bubble.speak(text, name);
  }

  update(dt: number): void {
    if (!this.present) return;
    if (Number.isNaN(this.heading)) this.heading = this.rotation.y;
    if (this.state.kind === 'walk') this.step(dt, this.state);
    else {
      this.face(this.state.yaw, dt);
      this.model.setSpeed(0);
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
    return this.present && (this.lines.length || this.talk) ? this.caption : null;
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

  private step(dt: number, state: { path: THREE.Vector3[]; then: (() => void) | null }): void {
    const leg = nextLeg(this.position, state.path, ARRIVE, this.leg);
    if (leg === 'done') {
      this.state = { kind: 'stand', yaw: this.heading };
      this.model.setSpeed(0);
      state.then?.();
      return;
    }
    if (leg === 'reached') return;
    stepAlong(this.position, this.leg, this.speed * dt);
    this.face(Math.atan2(this.leg.dx, this.leg.dz), dt);
    this.model.setSpeed(this.speed);
    this.look(dt);
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
    if (near && (!this.focus || Math.random() < 0.01)) {
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
