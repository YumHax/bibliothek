import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';
import { PersonModel } from './PersonModel';
import { randomLook, type PersonLook } from './looks';
import type { Pose } from './poses';
import { blobShadow } from '../zone/ContactShadows';

/** A place to stand and browse: a spot on the floor (zone-local) and the way to face there, in radians about y (0 = facing +z). */
export interface BrowseSpot {
  at: [x: number, z: number];
  yaw: number;
}

export interface ShopperOptions {
  /** Whose passing to notice: the camera. */
  viewer: THREE.Object3D;
  /** Where they stop to look at the wares. */
  spots: readonly BrowseSpot[];
  /** The aisle they walk along between spots: x range at z = `aisle.z`, zone-local. */
  aisle: { x: [min: number, max: number]; z: number };
  /** Walking speed, m/s. Default 0.75. */
  speed?: number;
  seed?: number;
  look?: PersonLook;
}

type State = { kind: 'walk'; path: THREE.Vector3[]; then: BrowseSpot | null } | { kind: 'browse'; spot: BrowseSpot; left: number } | { kind: 'linger'; left: number };

/** How fast the body turns towards its heading, per second. */
const TURN_RATE = 4;
const ARRIVE = 0.05;
/** A player nearer than this gets a look. */
const NOTICE_RANGE = 1.8;
/** What the arms do in front of a table, and while waiting in the aisle. */
const BROWSE_POSES: Pose[] = ['think', 'think', 'stand', 'pockets', 'crossed'];
const LINGER_POSES: Pose[] = ['pockets', 'crossed', 'hips', 'stand'];

/**
 * Someone browsing the market: walks the aisle from stall to stall, stops in front of one to look
 * the boxes over for a while (head down, a hand at the chin, the odd glance up), lingers in the
 * aisle now and then with their hands in their pockets,
 * glances at the player brushing past. Paths go through the aisle's centre line so nobody cuts
 * through a stall. Origin on the floor; the group moves itself in zone-local coordinates. Never
 * collides: a moving collider is more trouble than a body the player walks through.
 */
export class Shopper extends THREE.Group implements Furniture, Updatable {
  /** They walk: they carry their own blob instead. */
  readonly contactShadow = false;
  private readonly model: PersonModel;
  private readonly viewer: THREE.Object3D;
  private readonly spots: readonly BrowseSpot[];
  private readonly aisle: ShopperOptions['aisle'];
  private readonly speed: number;
  private state: State;
  private heading = NaN;
  private glanceTimer = 0;
  private lookUp = false;
  private readonly viewerPos = new THREE.Vector3();
  private readonly scratch = new THREE.Vector3();

  constructor(options: ShopperOptions) {
    super();
    this.name = 'Shopper';
    this.viewer = options.viewer;
    this.spots = options.spots;
    this.aisle = options.aisle;
    this.speed = options.speed ?? 0.75;
    const seed = options.seed ?? 1;
    this.model = new PersonModel(options.look ?? randomLook(seed + 100, 'shopper'));
    this.add(this.model);
    const blob = blobShadow(0.55, 0.5);
    if (blob) this.add(blob);
    // Everyone starts somewhere different along the aisle, already walking.
    this.state = { kind: 'linger', left: 0.5 + (seed % 5) };
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    // The builder set the way we face when it placed us; turn from there, not from +z.
    if (Number.isNaN(this.heading)) this.heading = this.rotation.y;
    switch (this.state.kind) {
      case 'walk':
        this.walk(dt, this.state);
        break;
      case 'browse':
        this.state.left -= dt;
        this.face(this.state.spot.yaw, dt);
        this.model.setSpeed(0);
        this.browseGaze(dt);
        if (this.state.left <= 0) this.setOff();
        break;
      case 'linger':
        this.state.left -= dt;
        this.model.setSpeed(0);
        this.idleGaze(dt);
        if (this.state.left <= 0) this.setOff();
        break;
    }
    this.model.update(dt);
  }

  private walk(dt: number, state: { path: THREE.Vector3[]; then: BrowseSpot | null }): void {
    const next = state.path[0];
    if (!next) {
      this.state = state.then ? { kind: 'browse', spot: state.then, left: 4 + Math.random() * 7 } : { kind: 'linger', left: 1.5 + Math.random() * 3 };
      const poses = state.then ? BROWSE_POSES : LINGER_POSES;
      this.model.setPose(poses[Math.floor(Math.random() * poses.length)]!);
      return;
    }
    const dx = next.x - this.position.x;
    const dz = next.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < ARRIVE) {
      state.path.shift();
      return;
    }
    const step = Math.min(dist, this.speed * dt);
    this.position.x += (dx / dist) * step;
    this.position.z += (dz / dist) * step;
    this.face(Math.atan2(dx, dz), dt);
    this.model.setSpeed(this.speed);
    this.idleGaze(dt);
  }

  /** Pick the next spot (or a pause in the aisle) and route there through the aisle's centre line. */
  private setOff(): void {
    const here = this.position;
    const path: THREE.Vector3[] = [];
    if (Math.random() < 0.2 || !this.spots.length) {
      const x = THREE.MathUtils.lerp(this.aisle.x[0], this.aisle.x[1], Math.random());
      path.push(new THREE.Vector3(here.x, 0, this.aisle.z), new THREE.Vector3(x, 0, this.aisle.z));
      this.state = { kind: 'walk', path, then: null };
      return;
    }
    let spot = this.spots[Math.floor(Math.random() * this.spots.length)]!;
    if (this.spots.length > 1) while (Math.hypot(spot.at[0] - here.x, spot.at[1] - here.z) < 0.5) spot = this.spots[Math.floor(Math.random() * this.spots.length)]!;
    path.push(new THREE.Vector3(here.x, 0, this.aisle.z), new THREE.Vector3(spot.at[0], 0, this.aisle.z), new THREE.Vector3(spot.at[0], 0, spot.at[1]));
    this.state = { kind: 'walk', path, then: spot };
  }

  private face(yaw: number, dt: number): void {
    let delta = yaw - this.heading;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    this.heading += delta * Math.min(1, dt * TURN_RATE);
    this.rotation.y = this.heading;
  }

  /** Browsing: eyes on the table ahead, wandering along it, an occasional look up. */
  private browseGaze(dt: number): void {
    if (this.playerGlance()) return;
    this.glanceTimer -= dt;
    if (this.glanceTimer <= 0) {
      this.glanceTimer = 1.5 + Math.random() * 3;
      this.lookUp = Math.random() < 0.2;
      this.scratch.set((Math.random() - 0.5) * 1.2, this.lookUp ? 1.7 : 0.9, this.lookUp ? 3 : 0.9);
    }
    this.model.gaze(this.localToWorld(this.scratch.clone()));
  }

  /** Walking or lingering: ahead, with the odd look aside. */
  private idleGaze(dt: number): void {
    if (this.playerGlance()) return;
    this.glanceTimer -= dt;
    if (this.glanceTimer <= 0) {
      this.glanceTimer = 2 + Math.random() * 4;
      this.scratch.set((Math.random() - 0.5) * 4, 1.2 + Math.random() * 0.6, 2.5);
    }
    this.model.gaze(this.localToWorld(this.scratch.clone()));
  }

  /** The player close by gets looked at; true when that is what the head is doing. */
  private playerGlance(): boolean {
    this.viewer.getWorldPosition(this.viewerPos);
    const mine = this.getWorldPosition(new THREE.Vector3());
    if (Math.hypot(this.viewerPos.x - mine.x, this.viewerPos.z - mine.z) > NOTICE_RANGE) return false;
    this.model.gaze(this.viewerPos);
    return true;
  }
}
