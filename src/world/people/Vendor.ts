import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { Furniture } from '../Furniture';
import { PersonModel } from './PersonModel';
import { randomLook, type PersonLook } from './looks';
import type { Pose } from './poses';

export interface VendorOptions {
  /** Whose gaze to meet: the camera. */
  viewer: THREE.Object3D;
  /** What they say when clicked, one line at a time, round and round. */
  lines: readonly string[];
  /** Fixes the look (and the order of the lines). */
  seed?: number;
  look?: PersonLook;
  /** The caption when hovered. Default a stallholder's. */
  label?: string;
  /** Where they look when nobody is about, in their own frame (x, y, z): the wares on a table by default; a screen, a claw, a coin bowl. */
  focus?: [x: number, y: number, z: number];
}

/** A player nearer than this, in front of the stall, gets looked at. */
const NOTICE_RANGE = 4.5;
/** Where the stall's wares are, from where the vendor stands: a little ahead and down, for the idle glance at the table. */
const TABLE_POINT = new THREE.Vector3(0, 0.85, 0.8);
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
  readonly hitboxes: THREE.Object3D[];
  private readonly model: PersonModel;
  private readonly viewer: THREE.Object3D;
  private readonly lines: readonly string[];
  private readonly caption: string;
  private readonly focus: THREE.Vector3;
  private nextLine: number;
  private glanceTimer = 0;
  private stanceTimer = 0;
  private glance = new THREE.Vector3();
  private readonly viewerPos = new THREE.Vector3();
  private readonly local = new THREE.Vector3();

  constructor(options: VendorOptions) {
    super();
    this.name = 'Vendor';
    this.viewer = options.viewer;
    this.lines = options.lines;
    this.caption = options.label ?? 'Click to chat with the stallholder';
    this.focus = options.focus ? new THREE.Vector3(...options.focus) : TABLE_POINT.clone();
    const seed = options.seed ?? 1;
    this.nextLine = this.lines.length ? seed % this.lines.length : 0;
    this.model = new PersonModel(options.look ?? randomLook(seed, 'vendor'));
    this.add(this.model);
    this.hitboxes = [this.model.hitbox];
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

  setHovered(): void {
    // A person does not glow; the caption says it all.
  }

  label(): string {
    return this.caption;
  }

  activate(session: SessionActions): void {
    if (!this.lines.length) return;
    session.hint(this.lines[this.nextLine]!);
    this.nextLine = (this.nextLine + 1) % this.lines.length;
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
