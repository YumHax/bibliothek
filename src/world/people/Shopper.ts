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
  /** Spots someone is standing at, shared by all the shoppers of a hall so no two browse in the same place. */
  claims?: Set<BrowseSpot>;
  seed?: number;
  look?: PersonLook;
}

type State = { kind: 'walk'; path: THREE.Vector3[]; then: BrowseSpot | null } | { kind: 'browse'; spot: BrowseSpot; left: number } | { kind: 'linger'; left: number };

/** How fast the body turns towards its heading, per second. */
const TURN_RATE = 4;
const ARRIVE = 0.05;
/** A player nearer than this gets a look. */
const NOTICE_RANGE = 1.8;
/** Walkers keep to the right of the aisle's centre line by this much, so two never walk through each other. */
const LANE = 0.28;
/** A player this close ahead of a walker makes them stop and wait (up to `YIELD_PATIENCE` seconds, then they squeeze past). */
const YIELD_RANGE = 0.75;
const YIELD_PATIENCE = 2.5;
/** What the arms do in front of a table, and while waiting in the aisle. */
const BROWSE_POSES: Pose[] = ['think', 'think', 'stand', 'pockets', 'crossed'];
const LINGER_POSES: Pose[] = ['pockets', 'crossed', 'hips', 'stand'];

/**
 * Someone browsing the market: walks the aisle from stall to stall, stops in front of one to look
 * the boxes over for a while (head down, a hand at the chin, the odd glance up), lingers in the
 * aisle now and then with their hands in their pockets,
 * glances at the player brushing past. Paths follow the aisle, keeping right of its centre line so
 * nobody cuts through a stall or walks through someone coming the other way; a browse spot taken
 * by another shopper (`claims`) is left alone; a walker stops for the player standing in the way.
 * `setPresent(false)` sends them home (the market at night). Origin on the floor; the group moves
 * itself in zone-local coordinates. Never collides: a moving collider is more trouble than a body
 * the player walks through.
 */
export class Shopper extends THREE.Group implements Furniture, Updatable {
  /** They walk: they carry their own blob instead. */
  readonly contactShadow = false;
  private readonly model: PersonModel;
  private readonly viewer: THREE.Object3D;
  private readonly spots: readonly BrowseSpot[];
  private readonly aisle: ShopperOptions['aisle'];
  private readonly speed: number;
  private readonly claims: Set<BrowseSpot>;
  private claimed: BrowseSpot | null = null;
  private waited = 0;
  private present = true;
  private state: State;
  private heading = NaN;
  private glanceTimer = 0;
  private lookUp = false;
  private readonly viewerPos = new THREE.Vector3();
  private readonly scratch = new THREE.Vector3();
  private readonly mine = new THREE.Vector3();

  constructor(options: ShopperOptions) {
    super();
    this.name = 'Shopper';
    this.viewer = options.viewer;
    this.spots = options.spots;
    this.aisle = options.aisle;
    this.speed = options.speed ?? 0.75;
    this.claims = options.claims ?? new Set();
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

  /** The spot this shopper stands browsing at, or null while walking, lingering or away. */
  get browsing(): BrowseSpot | null {
    return this.present && this.state.kind === 'browse' ? this.state.spot : null;
  }

  /** They make up their mind and buy something: a cheer, and they move on a little later. */
  buy(): void {
    if (this.state.kind !== 'browse') return;
    this.model.setPose('cheer');
    this.state.left = Math.min(this.state.left, 1.8);
  }

  /** Out of the hall (hidden, their spot given up) or back in it. */
  setPresent(present: boolean): void {
    if (present === this.present) return;
    this.present = present;
    this.visible = present;
    if (!present) {
      this.release();
      this.state = { kind: 'linger', left: 1 + Math.random() * 3 };
    }
  }

  update(dt: number): void {
    if (!this.present) return;
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
    if (this.blocked(dx / dist, dz / dist, dt)) {
      this.model.setSpeed(0);
      this.idleGaze(dt);
      return;
    }
    const step = Math.min(dist, this.speed * dt);
    this.position.x += (dx / dist) * step;
    this.position.z += (dz / dist) * step;
    this.face(Math.atan2(dx, dz), dt);
    this.model.setSpeed(this.speed);
    this.idleGaze(dt);
  }

  /** Pick the next free spot (or a pause in the aisle) and route there along the aisle, keeping right. */
  private setOff(): void {
    this.release();
    const here = this.position;
    const free = this.spots.filter((s) => !this.claims.has(s) && Math.hypot(s.at[0] - here.x, s.at[1] - here.z) >= 0.5);
    const spot = Math.random() < 0.2 ? undefined : free[Math.floor(Math.random() * free.length)];
    const x = spot ? spot.at[0] : THREE.MathUtils.lerp(this.aisle.x[0], this.aisle.x[1], Math.random());
    // Keep right: heading +x walks on one side of the centre line, heading -x on the other.
    const lane = this.aisle.z + (x >= here.x ? LANE : -LANE);
    const path = [new THREE.Vector3(here.x, 0, lane), new THREE.Vector3(x, 0, lane)];
    if (spot) {
      path.push(new THREE.Vector3(spot.at[0], 0, spot.at[1]));
      this.claims.add(spot);
      this.claimed = spot;
    }
    this.state = { kind: 'walk', path, then: spot ?? null };
  }

  /** Gives up the spot this shopper had reserved or stood at. */
  private release(): void {
    if (this.claimed) this.claims.delete(this.claimed);
    this.claimed = null;
  }

  /** The player stands just ahead in the walking direction: wait a moment, then go on regardless. */
  private blocked(dirX: number, dirZ: number, dt: number): boolean {
    this.viewer.getWorldPosition(this.viewerPos);
    const mine = this.getWorldPosition(this.mine);
    const px = this.viewerPos.x - mine.x;
    const pz = this.viewerPos.z - mine.z;
    // The walking direction is zone-local; the zone is never rotated, so it is also the world direction.
    const ahead = px * dirX + pz * dirZ;
    const aside = Math.abs(px * dirZ - pz * dirX);
    if (ahead > 0 && ahead < YIELD_RANGE && aside < 0.4 && this.waited < YIELD_PATIENCE) {
      this.waited += dt;
      return true;
    }
    if (ahead <= 0 || ahead >= YIELD_RANGE || aside >= 0.4) this.waited = 0;
    return false;
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
