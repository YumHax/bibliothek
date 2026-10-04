import * as THREE from 'three';
import type { CatBody, CatPose } from './types';
import type { FloorNav } from '../nav/FloorNav';
import { angleTo } from '@/math/angles';
import { lerp, smooth } from '@/math/scalar';
import { springAngle } from '@/math/springs';

/** Gaits (m/s). */
export const WALK_SPEED = 0.45;
export const TROT_SPEED = 1.1;
export const RUB_SPEED = 0.2;
/**
 * Yaw is a critically damped spring (it eases into a turn and settles without overshoot):
 * `omega` its natural frequency (1/s), `maxRate` the fastest it turns (rad/s). Walking or turning
 * in place, and during a hop.
 */
const TURN = { omega: 9, maxRate: 5 };
const HOP_TURN = { omega: 16, maxRate: 10 };
/** Integration step of the yaw spring (s): stable whatever the frame time. */
const TURN_STEP = 1 / 120;
/** Paw speed (m/s) handed to the gait per rad/s of turning in place, so the legs shuffle round. */
const SHUFFLE = 0.1;
/** From standstill to full pace in this long (s); the walk brakes over this last stretch (m) before its goal. */
const ACCEL_S = 0.2;
const BRAKE_DISTANCE = 0.3;
/** Slowest pace while braking, as a share of the gait, so it still reaches the goal briskly. */
const BRAKE_FLOOR = 0.2;
/** A waypoint counts as reached within this distance. */
const ARRIVE = 0.08;
/** Within this distance of a corner (m) the head already turns towards the next leg: it rounds it rather than pivoting on it. */
const CORNER = 0.25;
/**
 * The body goes where it faces, blended into the leg's direction by this much while the two are
 * within `HEADING_WITHIN` rad (further off, it steers straight along the leg, slowed right down): no sideways crab.
 */
const HEADING_SHARE = 0.7;
const HEADING_WITHIN = 0.6;
/** Turning in place further than this (rad) from sitting or lying, it stands for the turn (paws step round), then settles back. */
const STAND_TO_TURN = 0.3;
/** Extra height of a hop above the higher of its two ends. */
const HOP_CLEARANCE = 0.22;
/** The crouch before a hop leaves the ground (s). */
const HOP_WINDUP_S = 0.15;
/** How much of the flight's horizontal travel is eased in and out (0 linear .. 1 smoothstep). */
const HOP_EASE = 0.35;
/** Without progress for this long the walk is re-planned once, then given up. */
const STUCK_S = 1.5;
/** How far ahead along the leg, and how often, the walk checks that nothing moved into its way (a door swung shut). */
const LOOKAHEAD = 0.2;
const LOOK_EVERY_S = 0.2;
/**
 * Before turning in place on the floor: where the head and the tail tip will be (m from the body
 * centre, probe radius, height), and how far the cat shuffles away from whichever of them would
 * end up inside furniture.
 */
const REACH = { head: 0.24, tail: 0.26, radius: 0.05, y: 0.15, shuffle: 0.12, speed: 0.3 };

type Mode = 'idle' | 'walk' | 'hop';

/**
 * Moves the cat: follows a path from `FloorNav` (easing into its pace, turning towards the next leg,
 * slowing while the turn is wide, braking into its goal), hops in a parabola onto and off
 * furniture (a short crouch first, a squash on landing), and turns in place to face a point,
 * shuffling clear first when its head or tail would end up in furniture. Reports the ground speed
 * to the body for its gait. The cat's local +z is its forward, so yaw θ faces (sin θ, 0, cos θ).
 */
export class CatMotion {
  /** Called on every landing, with how hard it was (0..1). */
  onLand: ((strength: number) => void) | null = null;

  private mode: Mode = 'idle';
  private readonly path: THREE.Vector3[] = [];
  /** Path length left after each waypoint (to the goal), for the braking. */
  private readonly after: number[] = [];
  private index = 0;
  private speed = 0;
  /** The ground speed right now: eased towards what the leg allows. */
  private pace = 0;
  private yawRate = 0;
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
  private windup = 0;
  private _lift = 0;
  /** A walk asked for mid-hop: it sets off on landing. */
  private queued: { target: THREE.Vector3; speed: number } | null = null;

  private faceYaw: number | null = null;
  /** A shuffle before turning in place: direction (unit, floor) and metres left. */
  private readonly clearDirection = new THREE.Vector3();
  private clearLeft = 0;
  /** The posture the cat stood up from to shuffle clear, taken back once it has turned. */
  private resumePose: CatPose | null = null;
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly cat: THREE.Object3D,
    private readonly body: CatBody,
    private readonly nav: FloorNav,
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

  /** Height of the cat above the ground under it mid-hop (0 otherwise), for its shadow. */
  get lift(): number {
    return this._lift;
  }

  /**
   * Plans a walk to the floor point and starts following it; false when no path exists. Mid-hop, it
   * sets off on landing, and the answer is whether a path exists from where the hop lands.
   */
  walkTo(target: THREE.Vector3, speed = WALK_SPEED): boolean {
    if (this.mode === 'hop') {
      const path = this.nav.planPath(this.hopEnd, target);
      if (!path || path.length === 0) return false;
      this.queued = { target: target.clone().setY(0), speed };
      return true;
    }
    const path = this.nav.planPath(this.cat.position, target);
    if (!path || path.length === 0) return false;
    this.path.length = 0;
    for (const p of path) this.path.push(p);
    this.after.length = this.path.length;
    this.after[this.path.length - 1] = 0;
    // Walked back from the goal: every index is on the path, and `after[i + 1]` was just written.
    for (let i = this.path.length - 2; i >= 0; i--) this.after[i] = this.after[i + 1]! + this.path[i]!.distanceTo(this.path[i + 1]!);
    this.index = 0;
    this.speed = speed;
    // A re-plan mid-walk keeps its stride; from standstill it eases in.
    if (this.mode !== 'walk') this.pace = 0;
    this.target.copy(target).setY(0);
    this.mode = 'walk';
    this.faceYaw = null;
    this.clearLeft = 0;
    this.resumePose = null;
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
   * Parabolic hop from where the cat is to `target` (any height), landing `duration` s after it
   * leaves the ground (a short crouch comes first); `apex` is the world height of something in
   * between to clear (a tub's rim).
   */
  hopTo(target: THREE.Vector3, duration = 0.5, apex = -Infinity): void {
    this.hopFrom.copy(this.cat.position);
    this.hopEnd.copy(target);
    this.hopT = 0;
    this.hopDuration = Math.max(0.15, duration);
    this.hopHeight = Math.max(this.hopFrom.y, this.hopEnd.y, apex) + HOP_CLEARANCE;
    this.windup = HOP_WINDUP_S;
    this.mode = 'hop';
    this.faceYaw = null;
    this.clearLeft = 0;
    this.resumePose = null;
    this.queued = null;
    this._reached = false;
    this.body.setSpeed(0);
  }

  /**
   * Turns in place (smoothly) until the cat faces the point; ignored while walking or hopping.
   * With `keepClear`, it first shuffles away from furniture its head or tail would turn into.
   */
  faceTowards(point: THREE.Vector3, keepClear = true): void {
    const dx = point.x - this.cat.position.x;
    const dz = point.z - this.cat.position.z;
    if (dx * dx + dz * dz < 1e-6) return;
    this.faceYaw = Math.atan2(dx, dz);
    if (keepClear && this.mode === 'idle') this.makeRoom(this.faceYaw);
    // Not a turntable: a sitting, eating or lying cat gets up to turn round, the paws stepping, and sits back.
    const pose = this.body.pose;
    if (this.mode === 'idle' && this.resumePose === null && pose !== 'stand' && pose !== 'crouch' && Math.abs(angleTo(this.cat.rotation.y, this.faceYaw)) > STAND_TO_TURN) {
      this.resumePose = pose;
      this.body.setPose('stand');
    }
  }

  /** Stops where it is (used when the cat is petted or startled mid-walk). A hop always lands first. */
  stop(): void {
    this.faceYaw = null;
    this.clearLeft = 0;
    this.resumePose = null;
    if (this.mode === 'hop') {
      this.queued = null;
      return;
    }
    this.mode = 'idle';
    this.pace = 0;
    this.body.setSpeed(0);
  }

  /** Puts the cat at `point` facing `yaw` at once, whatever it was doing (while nobody sees: the night's sleep). */
  teleport(point: THREE.Vector3, yaw: number): void {
    this.mode = 'idle';
    this.queued = null;
    this.faceYaw = null;
    this.clearLeft = 0;
    this.resumePose = null;
    this._lift = 0;
    this.pace = 0;
    this.yawRate = 0;
    this._reached = true;
    this._blocked = false;
    this.cat.position.copy(point);
    this.cat.rotation.y = yaw;
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
        this.turnInPlace(dt);
        break;
    }
  }

  // --- internals ------------------------------------------------------------------------------

  private walk(dt: number): void {
    const position = this.cat.position;
    // Walking: `walkTo` set the index on a path with points, and the loop below stops at its end.
    let waypoint = this.path[this.index]!;
    let dx = waypoint.x - position.x;
    let dz = waypoint.z - position.z;
    let distance = Math.hypot(dx, dz);
    while (distance < ARRIVE) {
      this.index++;
      if (this.index >= this.path.length) {
        this.arrive(true);
        return;
      }
      waypoint = this.path[this.index]!;
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

    // Turn towards the leg (towards the next one already, near a corner); walk slower while the turn
    // is still wide (a cat turns first), and brake into the goal.
    let desiredYaw = Math.atan2(dx, dz);
    const next = this.path[this.index + 1];
    if (next && distance < CORNER) {
      const share = 0.5 * (1 - distance / CORNER);
      this.tmp.lerpVectors(waypoint, next, share);
      desiredYaw = Math.atan2(this.tmp.x - position.x, this.tmp.z - position.z);
    }
    const diff = Math.abs(angleTo(this.cat.rotation.y, Math.atan2(dx, dz)));
    this.turnTowards(desiredYaw, dt, TURN);
    const factor = THREE.MathUtils.clamp(1.15 - diff / Math.PI, 0.15, 1);
    const remaining = distance + this.after[this.index]!;
    const brake = THREE.MathUtils.clamp(Math.sqrt(remaining / BRAKE_DISTANCE), BRAKE_FLOOR, 1);
    const wanted = this.speed * factor * brake;
    const accel = (this.speed / ACCEL_S) * dt;
    // Speeds up at the gait's own rate, slows twice as readily (a sharp turn, the goal).
    this.pace = wanted > this.pace ? Math.min(wanted, this.pace + accel) : Math.max(wanted, this.pace - accel * 2);
    const step = Math.min(distance, this.pace * dt);
    // Mostly along its heading while that is close to the leg: the body follows the head through a turn.
    const heading = HEADING_SHARE * THREE.MathUtils.clamp(1 - diff / HEADING_WITHIN, 0, 1);
    let mx = (dx / distance) * (1 - heading) + Math.sin(this.cat.rotation.y) * heading;
    let mz = (dz / distance) * (1 - heading) + Math.cos(this.cat.rotation.y) * heading;
    const m = Math.hypot(mx, mz) || 1;
    mx /= m;
    mz /= m;
    position.x += mx * step;
    position.z += mz * step;
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
    this.pace = 0;
    this.body.setSpeed(0);
  }

  private hop(dt: number): void {
    const position = this.cat.position;
    this.tmp.subVectors(this.hopEnd, this.hopFrom);
    const aims = this.tmp.x * this.tmp.x + this.tmp.z * this.tmp.z > 1e-4;
    const aim = Math.atan2(this.tmp.x, this.tmp.z);
    // The wind-up: down on its haunches, lining up, then off.
    if (this.windup > 0) {
      this.windup -= dt;
      this.body.setPose(this.windup > 0 ? 'crouch' : 'pounce');
      if (aims) this.turnTowards(aim, dt, HOP_TURN);
      return;
    }
    this.hopT = Math.min(1, this.hopT + dt / this.hopDuration);
    const t = this.hopT;
    // Horizontal travel eased a little in and out; the height is a parabola in time through both ends, peaking at `hopHeight`.
    const eased = lerp(t, smooth(t), HOP_EASE);
    position.lerpVectors(this.hopFrom, this.hopEnd, eased);
    const base = THREE.MathUtils.lerp(this.hopFrom.y, this.hopEnd.y, t);
    position.y = base + (this.hopHeight - base) * 4 * t * (1 - t);
    this._lift = position.y - base;
    if (aims) this.turnTowards(aim, dt, HOP_TURN);
    if (t >= 1) {
      position.copy(this.hopEnd);
      this._lift = 0;
      this.mode = 'idle';
      this._reached = true;
      const strength = THREE.MathUtils.clamp((this.hopHeight - this.hopEnd.y) / 0.5, 0.3, 1);
      this.body.land(strength);
      this.onLand?.(strength);
      const queued = this.queued;
      this.queued = null;
      if (queued && !this.walkTo(queued.target, queued.speed)) {
        this._reached = false;
        this._blocked = true;
      }
    }
  }

  /** Idle: the shuffle clear of furniture, then the turn, legs stepping round with it. */
  private turnInPlace(dt: number): void {
    if (this.clearLeft > 0) {
      const step = Math.min(this.clearLeft, REACH.speed * dt);
      const p = this.cat.position;
      // Each step is probed live (the grid may be 10 s old) and kept inside the walkable area.
      this.tmp.set(p.x + this.clearDirection.x * (step + REACH.radius), 0, p.z + this.clearDirection.z * (step + REACH.radius));
      if (this.nav.blockedNow(this.tmp)) {
        this.clearLeft = 0;
      } else {
        this.clearLeft -= step;
        p.addScaledVector(this.clearDirection, step);
        this.nav.clampInside(p);
        this.body.setSpeed(REACH.speed);
      }
      if (this.clearLeft <= 0 && this.faceYaw === null) this.endShuffle();
      return;
    }
    if (this.faceYaw === null) return;
    const done = this.turnTowards(this.faceYaw, dt, TURN);
    this.body.setSpeed(done ? 0 : Math.abs(this.yawRate) * SHUFFLE);
    if (done) {
      this.faceYaw = null;
      this.endShuffle();
    }
  }

  /** The shuffle and turn are over: back to the posture the cat stood up from (unless a state changed it since). */
  private endShuffle(): void {
    this.body.setSpeed(0);
    if (this.resumePose && this.body.pose === 'stand') this.body.setPose(this.resumePose);
    this.resumePose = null;
  }

  /**
   * About to turn to `yaw` on the floor: if the head would end up in furniture (or the tail would),
   * step away a little first, when the floor there is free. Both or neither: stay. A cat never
   * glides backwards: a step that would go behind it goes sideways instead (or not at all), and a
   * sitting or lying cat stands up for it.
   */
  private makeRoom(yaw: number): void {
    const p = this.cat.position;
    if (p.y > 0.05) return;
    const sx = Math.sin(yaw);
    const sz = Math.cos(yaw);
    const head = this.nav.reachBlocked(p.x + sx * REACH.head, p.z + sz * REACH.head, REACH.y, REACH.radius);
    const tail = this.nav.reachBlocked(p.x - sx * REACH.tail, p.z - sz * REACH.tail, REACH.y, REACH.radius);
    if (head === tail) return;
    const sign = head ? -1 : 1;
    let dx = sx * sign;
    let dz = sz * sign;
    const fx = Math.sin(this.cat.rotation.y);
    const fz = Math.cos(this.cat.rotation.y);
    const along = dx * fx + dz * fz;
    if (along < -0.2) {
      // Behind it: keep only the sideways part of the step.
      dx -= along * fx;
      dz -= along * fz;
      const length = Math.hypot(dx, dz);
      if (length < 0.3) return;
      dx /= length;
      dz /= length;
    }
    for (const share of [0.5, 1]) {
      this.tmp.set(p.x + dx * REACH.shuffle * share, 0, p.z + dz * REACH.shuffle * share);
      if (!this.nav.isFree(this.tmp) || this.nav.blockedNow(this.tmp)) return;
    }
    this.clearDirection.set(dx, 0, dz);
    this.clearLeft = REACH.shuffle;
    const pose = this.body.pose;
    if (pose !== 'stand') {
      this.resumePose = pose;
      this.body.setPose('stand');
    }
  }

  /** Eases the yaw towards `yaw` on a critically damped spring; true once settled there. */
  private turnTowards(yaw: number, dt: number, spring: { omega: number; maxRate: number }): boolean {
    const rotation = this.cat.rotation;
    if (Math.abs(angleTo(rotation.y, yaw)) < 0.004 && Math.abs(this.yawRate) < 0.05) {
      rotation.y = yaw;
      this.yawRate = 0;
      return true;
    }
    [rotation.y, this.yawRate] = springAngle(rotation.y, this.yawRate, yaw, spring.omega, dt, spring.maxRate, TURN_STEP);
    return false;
  }
}
