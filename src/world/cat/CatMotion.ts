import * as THREE from 'three';
import type { CatBody } from './types';
import type { CatNav } from './CatNav';

/** Gaits (m/s). */
export const WALK_SPEED = 0.45;
export const TROT_SPEED = 1.1;
export const RUB_SPEED = 0.2;
/** Yaw turn rate while walking or turning in place (rad/s), and during a hop. */
const TURN_RATE = 4;
const HOP_TURN_RATE = 9;
/** A waypoint counts as reached within this distance. */
const ARRIVE = 0.08;
/** Extra height of a hop above the higher of its two ends. */
const HOP_CLEARANCE = 0.22;
/** Without progress for this long the walk is re-planned once, then given up. */
const STUCK_S = 1.5;
/** How far ahead along the leg, and how often, the walk checks that nothing moved into its way (a door swung shut). */
const LOOKAHEAD = 0.2;
const LOOK_EVERY_S = 0.2;

type Mode = 'idle' | 'walk' | 'hop';

/**
 * Moves the cat: follows a path from `CatNav` (turning towards the next leg, slowing while the
 * turn is wide, arriving within a few centimetres), hops in a parabola onto and off furniture,
 * and turns in place to face a point. Reports the ground speed to the body for its gait.
 * The cat's local +z is its forward, so yaw θ faces (sin θ, 0, cos θ).
 */
export class CatMotion {
  private mode: Mode = 'idle';
  private readonly path: THREE.Vector3[] = [];
  private index = 0;
  private speed = 0;
  private readonly target = new THREE.Vector3();
  private lastDistance = Infinity;
  private stuckFor = 0;
  private replanned = false;
  /** True after the last walk or hop ended at its goal (false when the walk was abandoned). */
  private _reached = true;
  /** True when the last walk was abandoned because something now stands in the way. */
  private _blocked = false;
  private lookIn = 0;

  private readonly hopFrom = new THREE.Vector3();
  private readonly hopEnd = new THREE.Vector3();
  private hopT = 0;
  private hopDuration = 0.5;
  private hopHeight = 0;

  private faceYaw: number | null = null;
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly cat: THREE.Object3D,
    private readonly body: CatBody,
    private readonly nav: CatNav,
  ) {}

  get busy(): boolean {
    return this.mode !== 'idle';
  }

  get walking(): boolean {
    return this.mode === 'walk';
  }

  /** The last walk stopped short: a door was shut across its path (the grid is refreshed for the next plan). */
  get blocked(): boolean {
    return this._blocked;
  }

  get hopping(): boolean {
    return this.mode === 'hop';
  }

  get reached(): boolean {
    return this._reached;
  }

  /** Plans a walk to the floor point and starts following it; false when no path exists. */
  walkTo(target: THREE.Vector3, speed = WALK_SPEED): boolean {
    const path = this.nav.planPath(this.cat.position, target);
    if (!path || path.length === 0) return false;
    this.path.length = 0;
    for (const p of path) this.path.push(p);
    this.index = 0;
    this.speed = speed;
    this.target.copy(target).setY(0);
    this.mode = 'walk';
    this.faceYaw = null;
    this.lastDistance = Infinity;
    this.stuckFor = 0;
    this.replanned = false;
    this._reached = false;
    this._blocked = false;
    this.lookIn = 0;
    this.cat.position.y = 0;
    return true;
  }

  /**
   * Parabolic hop from where the cat is to `target` (any height), landing after `duration` s;
   * `apex` is the world height of something in between to clear (a tub's rim).
   */
  hopTo(target: THREE.Vector3, duration = 0.5, apex = -Infinity): void {
    this.hopFrom.copy(this.cat.position);
    this.hopEnd.copy(target);
    this.hopT = 0;
    this.hopDuration = Math.max(0.15, duration);
    this.hopHeight = Math.max(this.hopFrom.y, this.hopEnd.y, apex) + HOP_CLEARANCE;
    this.mode = 'hop';
    this.faceYaw = null;
    this._reached = false;
    this.body.setSpeed(0);
  }

  /** Turns in place (smoothly) until the cat faces the point; ignored while walking or hopping. */
  faceTowards(point: THREE.Vector3): void {
    const dx = point.x - this.cat.position.x;
    const dz = point.z - this.cat.position.z;
    if (dx * dx + dz * dz < 1e-6) return;
    this.faceYaw = Math.atan2(dx, dz);
  }

  /** Stops where it is (used when the cat is petted or startled mid-walk). */
  stop(): void {
    if (this.mode === 'hop') {
      // Never leave the cat in mid-air.
      this.cat.position.copy(this.hopEnd);
    }
    this.mode = 'idle';
    this.faceYaw = null;
    this.body.setSpeed(0);
  }

  update(dt: number): void {
    switch (this.mode) {
      case 'walk':
        this.walk(dt);
        break;
      case 'hop':
        this.hop(dt);
        break;
      case 'idle':
        if (this.faceYaw !== null && this.turnTowards(this.faceYaw, TURN_RATE * dt)) this.faceYaw = null;
        break;
    }
  }

  // --- internals ------------------------------------------------------------------------------

  private walk(dt: number): void {
    const position = this.cat.position;
    let waypoint = this.path[this.index];
    let dx = waypoint.x - position.x;
    let dz = waypoint.z - position.z;
    let distance = Math.hypot(dx, dz);
    while (distance < ARRIVE) {
      this.index++;
      if (this.index >= this.path.length) {
        this.arrive(true);
        return;
      }
      waypoint = this.path[this.index];
      dx = waypoint.x - position.x;
      dz = waypoint.z - position.z;
      distance = Math.hypot(dx, dz);
      this.lastDistance = Infinity;
    }

    // Something moved into the leg since it was planned (a door shut in the cat's face): stop there.
    this.lookIn -= dt;
    if (this.lookIn <= 0) {
      this.lookIn = LOOK_EVERY_S;
      const ahead = Math.min(LOOKAHEAD, distance);
      this.tmp.set(position.x + (dx / distance) * ahead, 0, position.z + (dz / distance) * ahead);
      if (this.nav.blockedNow(this.tmp)) {
        this.nav.invalidate();
        this._blocked = true;
        this.arrive(false);
        return;
      }
    }

    // Turn towards the leg; walk slower while the turn is still wide (a cat turns first).
    const desiredYaw = Math.atan2(dx, dz);
    const diff = Math.abs(angleDelta(desiredYaw, this.cat.rotation.y));
    this.turnTowards(desiredYaw, TURN_RATE * dt);
    const factor = THREE.MathUtils.clamp(1.15 - diff / Math.PI, 0.15, 1);
    const step = Math.min(distance, this.speed * factor * dt);
    position.x += (dx / distance) * step;
    position.z += (dz / distance) * step;
    this.nav.clampInside(position);
    this.body.setSpeed(dt > 0 ? step / dt : 0);

    // Progress watch: re-plan once if the leg stopped shortening, then give up.
    if (distance < this.lastDistance - 0.002) {
      this.lastDistance = distance;
      this.stuckFor = 0;
    } else {
      this.stuckFor += dt;
      if (this.stuckFor > STUCK_S) {
        if (this.replanned) {
          this.arrive(false);
          return;
        }
        this.nav.invalidate();
        if (!this.walkTo(this.target, this.speed)) {
          this.arrive(false);
          return;
        }
        this.replanned = true;
      }
    }
  }

  private arrive(reached: boolean): void {
    this.mode = 'idle';
    this._reached = reached;
    this.body.setSpeed(0);
  }

  private hop(dt: number): void {
    this.hopT = Math.min(1, this.hopT + dt / this.hopDuration);
    const t = this.hopT;
    const position = this.cat.position;
    position.lerpVectors(this.hopFrom, this.hopEnd, t);
    // Parabola through both ends, peaking at `hopHeight` around the middle.
    const base = THREE.MathUtils.lerp(this.hopFrom.y, this.hopEnd.y, t);
    position.y = base + (this.hopHeight - base) * 4 * t * (1 - t);
    this.tmp.subVectors(this.hopEnd, this.hopFrom);
    if (this.tmp.x * this.tmp.x + this.tmp.z * this.tmp.z > 1e-4) this.turnTowards(Math.atan2(this.tmp.x, this.tmp.z), HOP_TURN_RATE * dt);
    if (t >= 1) {
      position.copy(this.hopEnd);
      this.mode = 'idle';
      this._reached = true;
    }
  }

  /** Rotates towards `yaw` by at most `maxStep`; true once aligned. */
  private turnTowards(yaw: number, maxStep: number): boolean {
    const delta = angleDelta(yaw, this.cat.rotation.y);
    if (Math.abs(delta) <= maxStep) {
      this.cat.rotation.y = yaw;
      return true;
    }
    this.cat.rotation.y += Math.sign(delta) * maxStep;
    return false;
  }
}

/** Signed shortest angle from `from` to `to`, in (-π, π]. */
export function angleDelta(to: number, from: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
