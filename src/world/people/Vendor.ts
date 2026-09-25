import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { Furniture } from '../Furniture';
import { PersonModel } from './PersonModel';
import { randomLook, type PersonLook } from './looks';
import type { Pose } from './poses';
import { blobShadow } from '../zone/ContactShadows';
import { SpeechBubble } from './SpeechBubble';

export interface VendorOptions {
  /** Whose gaze to meet: the camera. */
  viewer: THREE.Object3D;
  /** What they say when clicked, one line at a time, round and round; a function is asked afresh at every click (a stallholder talking about their table). */
  lines: readonly string[] | (() => readonly string[]);
  /** Fixes the look (and the order of the lines). */
  seed?: number;
  look?: PersonLook;
  /** The caption when hovered. Default a stallholder's. */
  label?: string;
  /** Where they look when nobody is about, in their own frame (x, y, z): the wares on a table by default; a screen, a claw, a coin bowl. */
  focus?: [x: number, y: number, z: number];
  /** Short cries now and then when the player comes by (a speech bubble): "All tested!". None by default. */
  callOuts?: readonly string[];
}

/** A player nearer than this, in front of the stall, gets looked at. */
const NOTICE_RANGE = 4.5;
/** Where the stall's wares are, from where the vendor stands: a little ahead and down, for the idle glance at the table. */
const TABLE_POINT = new THREE.Vector3(0, 0.85, 0.8);
/** The speech bubble's height over the floor. */
const BUBBLE_Y = 2.05;
/** Seconds between two cries at a player hanging about, drawn in this range. */
const CALL_OUT_EVERY: [number, number] = [18, 40];
/** How a stallholder stands while waiting; they change their mind every so often. */
const STANCES: Pose[] = ['stand', 'crossed', 'hips', 'pockets', 'crossed'];

/**
 * The stallholder: stands behind the table facing the aisle, shifts their weight, looks over
 * their wares, folds their arms or puts their hands on their hips for a while, and turns to the
 * player when they come up to the stall. Clicking them gets a line
 * (`SessionActions.hint`). Origin on the floor, faces local +z like the stall. Collides (a
 * standing person is not walked through), but never moves.
 */
export class Vendor extends THREE.Group implements Furniture, Interactable, Updatable {
  /** They shift about: they carry their own blob instead. */
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly model: PersonModel;
  private readonly viewer: THREE.Object3D;
  private readonly lines: () => readonly string[];
  private readonly caption: string;
  private readonly focus: THREE.Vector3;
  private nextLine: number;
  private glanceTimer = 0;
  private stanceTimer = 0;
  private glance = new THREE.Vector3();
  private readonly bubble = new SpeechBubble();
  private readonly callOuts: readonly string[];
  private callOutTimer: number;
  private readonly viewerPos = new THREE.Vector3();
  private readonly local = new THREE.Vector3();

  constructor(options: VendorOptions) {
    super();
    this.name = 'Vendor';
    this.viewer = options.viewer;
    const lines = options.lines;
    this.lines = typeof lines === 'function' ? lines : () => lines;
    this.caption = options.label ?? 'Click to chat with the stallholder';
    this.focus = options.focus ? new THREE.Vector3(...options.focus) : TABLE_POINT.clone();
    const seed = options.seed ?? 1;
    this.nextLine = seed;
    this.model = new PersonModel(options.look ?? randomLook(seed, 'vendor'));
    this.add(this.model);
    const blob = blobShadow(0.55, 0.5);
    if (blob) this.add(blob);
    this.hitboxes = [this.model.hitbox];
    this.bubble.position.y = BUBBLE_Y;
    this.add(this.bubble);
    this.callOuts = options.callOuts ?? [];
    this.callOutTimer = CALL_OUT_EVERY[0] * (0.3 + (seed % 5) * 0.2);
    this.pickGlance();
    this.model.setPose(STANCES[seed % STANCES.length]!);
    this.stanceTimer = 8 + (seed % 7) * 3;
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-0.25, 0, -0.2), new THREE.Vector3(0.25, 1.8, 0.2));
  }

  update(dt: number): void {
    this.viewer.getWorldPosition(this.viewerPos);
    this.local.copy(this.viewerPos);
    this.worldToLocal(this.local);
    const near = this.local.z > 0.3 && Math.hypot(this.local.x, this.local.z) < NOTICE_RANGE;
    this.bubble.update(dt);
    if (near && this.callOuts.length) {
      this.callOutTimer -= dt;
      if (this.callOutTimer <= 0) {
        this.callOutTimer = THREE.MathUtils.lerp(CALL_OUT_EVERY[0], CALL_OUT_EVERY[1], Math.random());
        this.say(this.callOuts[Math.floor(Math.random() * this.callOuts.length)]!);
      }
    }
    if (near) {
      this.model.gaze(this.viewerPos);
    } else {
      this.glanceTimer -= dt;
      if (this.glanceTimer <= 0) this.pickGlance();
      this.model.gaze(this.localToWorld(this.local.copy(this.glance)));
    }
    this.stanceTimer -= dt;
    if (this.stanceTimer <= 0) {
      this.stanceTimer = 12 + Math.random() * 25;
      this.model.setPose(STANCES[Math.floor(Math.random() * STANCES.length)]!);
    }
    this.model.update(dt);
  }

  /** A word or two in a bubble over their head ("Sold!", "Good eye!"). */
  say(text: string, seconds?: number): void {
    this.bubble.say(text, seconds);
  }

  /** Strikes a pose for a moment (a shrug, a wave), then goes back to waiting. */
  gesture(pose: Pose, seconds = 2.5): void {
    this.model.setPose(pose);
    this.stanceTimer = seconds;
  }

  setHovered(): void {
    // A person does not glow; the caption says it all.
  }

  label(): string {
    return this.caption;
  }

  activate(session: SessionActions): void {
    const lines = this.lines();
    if (!lines.length) return;
    session.hint(lines[this.nextLine % lines.length]!);
    this.nextLine++;
  }

  /** Now the focus (the table), now the aisle, now the far wall, each for a few seconds. */
  private pickGlance(): void {
    this.glanceTimer = 3 + Math.random() * 6;
    const roll = Math.random();
    if (roll < 0.5) this.glance.copy(this.focus).x += (Math.random() - 0.5) * 0.6;
    else if (roll < 0.85) this.glance.set((Math.random() - 0.5) * 6, 1.6, 3 + Math.random() * 3);
    else this.glance.set((Math.random() - 0.5) * 3, 1.5, -2);
  }
}
