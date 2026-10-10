import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';
import { dampAngle } from '@/math/damp';
import { Glance, idleGlance, nextLeg, stepAlong, type Leg } from './locomotion';
import { Attention, STANDING, WALKING } from './attention';
import { PersonModel } from './PersonModel';
import { randomLook, type PersonLook } from './looks';
import type { Pose } from './poses';
import { random } from '@/random';

/** A place to stand and browse: a spot on the floor (zone-local) and the way to face there, in radians about y (0 = facing +z). */
export interface BrowseSpot {
  at: [x: number, z: number];
  yaw: number;
}

interface ShopperOptions {
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
  /**
   * The way out of the hall: through the gap between two stalls nearest them (`gaps`, x) past the row (`rowZ`),
   * then `out` to the door (its last point). With it, a shopper sent home walks out and fades at the door, and
   * comes back in by it (while the player is not looking that way); without it they blink out and in.
   */
  exit?: { gaps: readonly number[]; rowZ: number; out: readonly [x: number, z: number][] };
}

type State = { kind: 'walk'; path: THREE.Vector3[]; then: BrowseSpot | null } | { kind: 'browse'; spot: BrowseSpot; left: number } | { kind: 'linger'; left: number }
  /** Walking out (`exit`), then fading at the door; waiting outside to be let back in; walking back in. */
  | { kind: 'exit'; path: THREE.Vector3[] }
  | { kind: 'gone' }
  | { kind: 'enter'; path: THREE.Vector3[] };

/** How fast the body turns towards its heading, per second. */
const TURN_RATE = 4;
const ARRIVE = 0.05;
/** Walkers keep to the right of the aisle's centre line by this much, so two never walk through each other. */
const LANE = 0.28;
/** A player this close ahead of a walker makes them stop and wait (up to `YIELD_PATIENCE` seconds, then they squeeze past). */
const YIELD_RANGE = 0.75;
const YIELD_PATIENCE = 2.5;
/** What the arms do in front of a table, and while waiting in the aisle. */
const BROWSE_POSES: Pose[] = ['think', 'think', 'stand', 'pockets', 'crossed'];
const LINGER_POSES: Pose[] = ['pockets', 'crossed', 'hips', 'stand'];
/** Seconds to get up to walking speed from standing. */
const ACCEL_S = 0.3;
/** Seconds of a fade at the door. */
const DOOR_FADE_S = 0.7;
/** The player looking this close to the door (cosine) keeps anyone from popping in or out under their nose. */
const DOOR_UNSEEN_COS = 0.5;

/**
 * Someone browsing the market: walks the aisle from stall to stall, stops in front of one to look
 * the boxes over for a while (head down, a hand at the chin, the odd glance up), lingers in the
 * aisle now and then with their hands in their pockets,
 * glances at the player brushing past. Paths follow the aisle, keeping right of its centre line so
 * nobody cuts through a stall or walks through someone coming the other way; a browse spot taken
 * by another shopper (`claims`) is left alone; a walker stops for the player standing in the way.
 * `setPresent(false)` sends them home (the market at night): out through the door with `exit`, fading there, and
 * back in by it (unseen) on `setPresent(true)`. Origin on the floor; the group moves
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
  /** The speed they walk at right now (m/s), up from 0 on setting off. */
  private current = 0;
  private readonly claims: Set<BrowseSpot>;
  private claimed: BrowseSpot | null = null;
  private waited = 0;
  private present = true;
  private state: State;
  private heading = NaN;
  /** One glance for browsing and walking alike: a new one waits for the last to run out. */
  private readonly glance = new Glance();
  private readonly leg: Leg = { dx: 0, dz: 0, dist: 0 };
  private readonly viewerPos = new THREE.Vector3();
  private readonly gazePoint = new THREE.Vector3();
  private readonly mine = new THREE.Vector3();
  private readonly exit: ShopperOptions['exit'];
  private readonly blob: THREE.Object3D | null;
  private fade = 1;
  private fadeTo = 1;
  private readonly attention: Attention;

  constructor(options: ShopperOptions) {
    super();
    this.name = 'Shopper';
    this.viewer = options.viewer;
    this.spots = options.spots;
    this.aisle = options.aisle;
    this.speed = options.speed ?? 0.75;
    this.claims = options.claims ?? new Set();
    const seed = options.seed ?? 1;
    this.model = new PersonModel(options.look ?? randomLook(seed + 100, 'shopper'), this.viewer, seed + 100);
    this.add(this.model);
    // Under the hips and each foot, sized to them.
    this.blob = this.model.groundShadow();
    this.exit = options.exit;
    if (this.exit) this.model.enableFade();
    this.attention = new Attention(seed + 100);
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
    this.model.react('great');
    this.state.left = Math.min(this.state.left, 1.8);
  }

  /** Out of the hall (hidden, their spot given up) or back in it. */
  /** `instant`: at once where they are, no walk to the door (the hall just built, nobody saw them go). */
  setPresent(present: boolean, instant = false): void {
    if (present === this.present) return;
    this.present = present;
    if (!this.exit || instant) {
      this.visible = present;
      if (this.exit) {
        this.fade = this.fadeTo = present ? 1 : 0;
        this.model.setOpacity(this.fade);
        this.model.visible = present;
        if (this.blob) this.blob.visible = present;
      }
      if (!present) {
        this.release();
        this.state = { kind: 'linger', left: 1 + random() * 3 };
      }
      return;
    }
    this.release();
    // Sent home: out by the door. Asked back while still inside (walking out): they turn round at once.
    if (!present) this.state = this.visible ? { kind: 'exit', path: this.pathOut() } : { kind: 'gone' };
    else if (this.visible && this.fadeTo > 0) this.setOff();
    else this.state = { kind: 'gone' };
  }

  update(dt: number): void {
    this.stepFade(dt);
    if (this.state.kind === 'exit') {
      this.walkDoor(dt, this.state.path, () => {
        this.fadeTo = 0;
        this.state = { kind: 'gone' };
      });
      this.model.update(dt);
      return;
    }
    if (!this.present) return;
    if (this.state.kind === 'gone') {
      // Back in by the door once the player is not looking at it.
      if (this.fadeTo === 0 && this.fade > 0) return;
      if (this.doorInView()) return;
      this.comeIn();
      return;
    }
    if (this.state.kind === 'enter') {
      this.walkDoor(dt, this.state.path, () => this.setOff());
      this.model.update(dt);
      return;
    }
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
    const leg = nextLeg(this.position, state.path, ARRIVE, this.leg);
    if (leg === 'done') {
      this.current = 0;
      this.state = state.then ? { kind: 'browse', spot: state.then, left: 4 + random() * 7 } : { kind: 'linger', left: 1.5 + random() * 3 };
      const poses = state.then ? BROWSE_POSES : LINGER_POSES;
      this.model.setPose(poses[Math.floor(random() * poses.length)]!);
      return;
    }
    // Past a point of the path: on to the next in the same frame (no halt at every point).
    if (leg === 'reached') return this.walk(dt, state);
    const { dx, dz, dist } = this.leg;
    if (this.blocked(dx / dist, dz / dist, dt)) {
      this.current = 0;
      this.model.setSpeed(0);
      this.idleGaze(dt);
      return;
    }
    stepAlong(this.position, this.leg, this.pace(dt) * dt);
    this.face(Math.atan2(dx, dz), dt);
    this.model.setSpeed(this.current);
    this.idleGaze(dt);
  }

  /** Their speed this frame: up from standing over `ACCEL_S`, then their own. */
  private pace(dt: number): number {
    this.current = Math.min(this.speed, this.current + (this.speed / ACCEL_S) * dt);
    return this.current;
  }

  /** The door's fade in or out: hidden once it reaches 0. */
  private stepFade(dt: number): void {
    if (this.fade === this.fadeTo) return;
    const step = dt / DOOR_FADE_S;
    this.fade = this.fadeTo > this.fade ? Math.min(this.fadeTo, this.fade + step) : Math.max(this.fadeTo, this.fade - step);
    this.model.setOpacity(this.fade);
    this.model.visible = this.fade > 0.01;
    if (this.blob) this.blob.visible = this.fade > 0.5;
    if (this.fade === 0) this.visible = false;
  }

  /** From here along the aisle to the nearest gap between stalls, past the row, out to the door (`exit`). */
  private pathOut(): THREE.Vector3[] {
    const { gaps, rowZ, out } = this.exit!;
    const here = this.position;
    const gap = gaps.reduce((best, x) => (Math.abs(x - here.x) < Math.abs(best - here.x) ? x : best), gaps[0] ?? 0);
    const lane = this.aisle.z + (gap >= here.x ? LANE : -LANE);
    return [new THREE.Vector3(here.x, 0, lane), new THREE.Vector3(gap, 0, lane), new THREE.Vector3(gap, 0, rowZ), ...out.map(([x, z]) => new THREE.Vector3(x, 0, z))];
  }

  /** Steps in at the door, fading in, and walks back to the aisle by a gap; then off to a stall. */
  private comeIn(): void {
    const { gaps, rowZ, out } = this.exit!;
    const door = out[out.length - 1] ?? [0, 0];
    const gap = gaps[Math.floor(random() * gaps.length)] ?? 0;
    this.position.set(door[0], 0, door[1]);
    this.heading = Math.PI;
    this.rotation.y = Math.PI;
    this.visible = true;
    this.fade = 0;
    this.fadeTo = 1;
    this.model.setOpacity(0);
    const path = [...out.slice(0, -1).reverse().map(([x, z]) => new THREE.Vector3(x, 0, z)), new THREE.Vector3(gap, 0, rowZ), new THREE.Vector3(gap, 0, this.aisle.z - LANE)];
    this.state = { kind: 'enter', path };
    this.model.setPose('stand');
  }

  /** Walks `path` (to or from the door: nobody browses on the way), then `then`. */
  private walkDoor(dt: number, path: THREE.Vector3[], then: () => void): void {
    const leg = nextLeg(this.position, path, ARRIVE, this.leg);
    if (leg === 'done') {
      this.current = 0;
      this.model.setSpeed(0);
      then();
      return;
    }
    if (leg === 'reached') return this.walkDoor(dt, path, then);
    const { dx, dz } = this.leg;
    stepAlong(this.position, this.leg, this.pace(dt) * dt);
    this.face(Math.atan2(dx, dz), dt);
    this.model.setSpeed(this.current);
    this.idleGaze(dt);
  }

  /** Whether the player is looking towards the door. */
  private doorInView(): boolean {
    const out = this.exit!.out;
    const [x, z] = out[out.length - 1] ?? [0, 0];
    const door = this.parent ? this.parent.localToWorld(this.gazePoint.set(x, 1.2, z)) : this.gazePoint.set(x, 1.2, z);
    this.viewer.getWorldPosition(this.viewerPos);
    const look = this.viewer.getWorldDirection(this.mine).setY(0).normalize();
    return look.dot(door.sub(this.viewerPos).setY(0).normalize()) > DOOR_UNSEEN_COS;
  }

  /** Pick the next free spot (or a pause in the aisle) and route there along the aisle, keeping right. */
  private setOff(): void {
    this.release();
    const here = this.position;
    const free = this.spots.filter((s) => !this.claims.has(s) && Math.hypot(s.at[0] - here.x, s.at[1] - here.z) >= 0.5);
    const spot = random() < 0.2 ? undefined : free[Math.floor(random() * free.length)];
    const x = spot ? spot.at[0] : THREE.MathUtils.lerp(this.aisle.x[0], this.aisle.x[1], random());
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
    this.heading = dampAngle(this.heading, yaw, TURN_RATE, dt);
    this.rotation.y = this.heading;
  }

  /** Browsing: eyes on the table ahead, wandering along it, an occasional look up. */
  private browseGaze(dt: number): void {
    if (this.playerGlance(dt)) return;
    this.gazeAt(this.glance.update(dt, browseGlance));
  }

  /** Walking or lingering: ahead, with the odd look aside. */
  private idleGaze(dt: number): void {
    if (this.playerGlance(dt)) return;
    this.gazeAt(this.glance.update(dt, idleGlance));
  }

  /** Looks at `point`, in this shopper's frame. */
  private gazeAt(point: THREE.Vector3): void {
    this.model.gaze(this.localToWorld(this.gazePoint.copy(point)));
  }

  /** The player looked at when `Attention` says so (on noticing them, a nod sometimes; now and then after); true when that is what the head is doing. */
  private playerGlance(dt: number): boolean {
    const looking = this.attention.update(dt, this, this.viewer, this.state.kind === 'browse' || this.state.kind === 'linger' ? STANDING : WALKING, this.viewerPos);
    if (this.attention.takeNotice()) this.model.nod();
    if (!looking) return false;
    this.model.gaze(this.viewerPos);
    return true;
  }
}

/** Browsing: somewhere along the table ahead, once in five a look up across the hall; for 1.5 to 4.5 seconds. */
function browseGlance(point: THREE.Vector3): number {
  const timer = 1.5 + random() * 3;
  const up = random() < 0.2;
  point.set((random() - 0.5) * 1.2, up ? 1.7 : 0.9, up ? 3 : 0.9);
  return timer;
}
