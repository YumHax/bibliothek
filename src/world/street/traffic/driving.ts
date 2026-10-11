import * as THREE from 'three';
import { STREET_PLAN, type Vec2 } from '../streetPlan';
import { FRONT, KERB_HEIGHT } from '@/world/measures/street';
import { isRoad } from '../relief/ground';
import type { RoadObstacle, RoadVehicle, StreetTraffic } from './StreetTraffic';
import { angleTo, lerpAngle } from '@/math/angles';

/** Route samples every this many metres (positions and headings looked up, never computed per frame). */
const STEP = 0.5;
/** The road's surface, a kerb below the pavements. */
export const ROAD_Y = -KERB_HEIGHT;
/** Firm braking, m/s² (what a driver plans a stop with). */
const BRAKE = 5;

/** A route sampled every `STEP` metres: x, z, heading (yaw of the nose, 0 = +x) per sample. */
export interface Route {
  samples: Float32Array;
  length: number;
}

/**
 * Samples a smooth route through `points` every `STEP` metres, `offset` metres to the right of
 * the line (a bike keeps to the kerb side of the car lane).
 */
export function sampleRoute(points: readonly (readonly [number, number])[], offset = 0): Route {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal', 0.3);
  const length = curve.getLength();
  const n = Math.max(2, Math.ceil(length / STEP) + 1);
  const samples = new Float32Array(n * 3);
  const p = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const u = Math.min(1, (i * STEP) / length);
    curve.getPointAt(u, p);
    curve.getTangentAt(u, tangent);
    // Facing (tx, tz), the right-hand side is (-tz, tx).
    samples[i * 3] = p.x - tangent.z * offset;
    samples[i * 3 + 1] = p.z + tangent.x * offset;
    samples[i * 3 + 2] = Math.atan2(-tangent.z, tangent.x);
  }
  return { samples, length };
}

/** Where `distance` along `route` is: sets `out` (zone-local, on the road) and returns the nose's yaw. */
export function placeOnRoute(route: Route, distance: number, out: THREE.Vector3): number {
  const { samples } = route;
  const f = Math.max(0, distance) / STEP;
  const i = Math.min(Math.floor(f), samples.length / 3 - 2);
  const t = Math.min(1, f - i);
  const a = i * 3;
  out.set(samples[a]! + (samples[a + 3]! - samples[a]!) * t, ROAD_Y, samples[a + 1]! + (samples[a + 4]! - samples[a + 1]!) * t);
  const h0 = samples[a + 2]!;
  const h1 = samples[a + 5]!;
  return lerpAngle(h0, h1, t);
}

export function headingAt(route: Route, distance: number): number {
  const i = Math.min(Math.max(0, Math.round(distance / STEP)), route.samples.length / 3 - 1);
  return route.samples[i * 3 + 2]!;
}

/** How sharply `route` bends at `distance` (radians per metre, positive to the left), over the 2 m either side. */
export function curvatureAt(route: Route, distance: number): number {
  return angleTo(headingAt(route, distance - 2), headingAt(route, distance + 2)) / 4;
}

/** The distance along `route` whose sample is nearest to `point`. */
export function distanceNearest(route: Route, [x, z]: Vec2): number {
  const { samples } = route;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < samples.length / 3; i++) {
    const d = (samples[i * 3]! - x) ** 2 + (samples[i * 3 + 1]! - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best * STEP;
}

/** A speed the corner ahead allows: slower the sharper the bend within the next 8 m. */
export function corneringSpeed(route: Route, distance: number, cruise: number): number {
  const here = headingAt(route, distance);
  const ahead = headingAt(route, distance + 8);
  const turn = Math.abs(angleTo(here, ahead));
  return cruise * (1 - 0.6 * Math.min(1, turn / 1.2));
}

/**
 * What a driver is waiting for, when held up: the lights, someone at or on a plain zebra (no horn for either), the
 * player, someone or something on the road, the vehicle ahead, a siren (pulling over for it, or slowing as it passes),
 * a gap at a junction it gives way at.
 */
export type HeldBy = 'signal' | 'crossing' | 'viewer' | 'obstacle' | 'vehicle' | 'siren' | 'junction' | null;

/** The driver's view of itself, for `allowedSpeed`. */
export interface DriverView {
  readonly position: THREE.Vector3;
  readonly yaw: number;
  readonly speed: number;
  readonly length: number;
  readonly width: number;
  /** Itself in the traffic's sets (never stops for itself). */
  readonly self?: RoadVehicle;
  readonly own?: ReadonlySet<RoadObstacle>;
  /** On a call, siren on: through a red light at a crawl, never pulling over for itself, never giving way. */
  readonly emergency?: boolean;
}

/** What `allowedSpeed` found (reused: read it before the next call). */
export interface Allowed {
  readonly target: number;
  readonly heldBy: HeldBy;
  /** A siren behind or coming the other way: get out of its way. */
  readonly pullOver: boolean;
  /** The obstacle holding the driver up (when `heldBy` is 'obstacle'). */
  readonly obstacle: RoadObstacle | null;
  /** The vehicle ahead holding the driver up (when `heldBy` is 'vehicle'). */
  readonly vehicle: RoadVehicle | null;
  /** The player stepped out closer than the driver can stop: a blast of the horn, a stamp on the brakes. */
  readonly startled: boolean;
}

/** An emergency vehicle coming up behind within this many metres: the driver pulls over and crawls; one this near going by: slow down. */
const YIELD = { reach: 40, crawl: 1.5, near: 30, slow: 3, oncoming: 45 } as const;
/** How fast an emergency vehicle goes through a red light. */
const THROUGH_RED = 4.5;

const scratch = { target: 0, heldBy: null as HeldBy, pullOver: false, obstacle: null as RoadObstacle | null, vehicle: null as RoadVehicle | null, startled: false };
/** The driver being asked about, while `allowedSpeed` runs (no closures a frame). */
let hx = 0;
let hz = 0;
let px = 0;
let pz = 0;
let halfWidth = 0;

/** Speed that brings the nose to rest `room` metres ahead at `brake` m/s². */
function stoppingSpeed(room: number, brake: number): number {
  return room <= 0 ? 0 : Math.sqrt(2 * brake * room);
}

function hold(speed: number, why: HeldBy): boolean {
  if (speed < scratch.target) {
    scratch.target = speed;
    scratch.heldBy = why;
    return true;
  }
  return false;
}

/** How far ahead of the driver `p` is, if it is in its path (within `widthRoom` of its sides) and within 40 m; else null. */
function ahead(p: THREE.Vector3, widthRoom: number): number | null {
  const rx = p.x - px;
  const rz = p.z - pz;
  const along = rx * hx + rz * hz;
  if (along <= 0 || along > 40) return null;
  const lateral = Math.abs(rx * hz - rz * hx);
  return lateral < halfWidth + widthRoom ? along : null;
}

/**
 * How fast a driver may go right now, given what is ahead: the player standing in its path
 * (`viewer`, zone-local; stops `stopFor` short), anything on the road (`traffic.obstacles`),
 * the vehicle ahead going the same way (queues 2.5 m behind it, matching its speed; a vehicle
 * pulled out of the lane is passed), on Front Street the crossings (red or amber at the lights,
 * amber only if it can still stop; a plain zebra someone is on or waiting at), the junctions it
 * gives way at (`STREET_PLAN.traffic.giveWay`), and the sirens (`traffic.sirens`: one coming up
 * behind or the other way, pull over and crawl; one going by near, slow down). Braking distances
 * follow the road's grip (`traffic.grip`: wet, snow). Returns the cap, what caused it (the lowest
 * wins), whether to pull over, and whether the player gave it a fright.
 */
export function allowedSpeed(traffic: StreetTraffic, me: DriverView, cap: number, viewer: THREE.Vector3 | null, stopFor: number): Allowed {
  scratch.target = cap;
  scratch.heldBy = null;
  scratch.pullOver = false;
  scratch.obstacle = null;
  scratch.vehicle = null;
  scratch.startled = false;
  hx = Math.cos(me.yaw);
  hz = -Math.sin(me.yaw);
  px = me.position.x;
  pz = me.position.z;
  halfWidth = me.width / 2;
  const nose = me.length / 2;
  const brake = BRAKE * traffic.grip;

  // Each rule lowers the cap it is given; the lowest wins, the first to reach it names the cause.
  if (viewer) holdForViewer(viewer, me, nose, brake, stopFor);
  holdForObstacles(traffic, me, nose, brake, stopFor);
  holdForQueue(traffic, me, nose, brake);
  if (!me.emergency) {
    holdForSirens(traffic, me);
    holdAtJunctions(traffic, me, nose, brake);
  }
  holdAtCrossings(traffic, me, nose, brake);
  return scratch;
}

/**
 * The player standing in the path: stop `stopFor` short of them; closer than the driver can stop, a fright. Only on
 * the road: up on the pavement they are out of every path, even where a heading swinging in to the kerb (the bus
 * pulling in to its stop) points at them for a moment.
 */
function holdForViewer(viewer: THREE.Vector3, me: DriverView, nose: number, brake: number, stopFor: number): void {
  if (!isRoad(viewer.x, viewer.z)) return;
  const along = ahead(viewer, 0.6);
  if (along === null) return;
  hold(stoppingSpeed(along - nose - stopFor, brake), 'viewer');
  // Stepped out under its nose: it cannot stop short of them at its speed.
  const room = along - nose - 0.8;
  if (me.speed > 3 && room < (me.speed * me.speed) / (2 * brake)) scratch.startled = true;
}

/** Anything on the road (`traffic.obstacles`) in the path, but not the driver's own; someone at a plain zebra is a crossing. */
function holdForObstacles(traffic: StreetTraffic, me: DriverView, nose: number, brake: number, stopFor: number): void {
  for (const o of traffic.obstacles) {
    if (!o.active || me.own?.has(o)) continue;
    const along = ahead(o.position, o.radius);
    if (along !== null && hold(stoppingSpeed(along - nose - o.radius - (o.gap ?? stopFor), brake), o.wantsToCross != null ? 'crossing' : 'obstacle')) scratch.obstacle = o;
  }
}

/** The vehicle ahead going the same way: queue 2.5 m behind it, matching its speed (a vehicle pulled out of the lane is passed). */
function holdForQueue(traffic: StreetTraffic, me: DriverView, nose: number, brake: number): void {
  for (const v of traffic.vehicles) {
    if (v === me.self || v === (me as unknown) || !v.active) continue;
    // Same way only (a car coming the other way through a bend is not a queue).
    if (Math.cos(v.yaw - me.yaw) < 0.6) continue;
    const along = ahead(v.position, Math.min(0.6, v.width / 2));
    if (along === null) continue;
    const room = along - nose - v.length / 2 - 2.5;
    if (hold(room <= 0 ? 0 : Math.min(stoppingSpeed(room, brake) + v.speed, v.speed + room * 0.8), 'vehicle')) scratch.vehicle = v;
  }
}

/** The sirens: one coming up behind or towards the driver, pull over and crawl; one going by near, slow down. */
function holdForSirens(traffic: StreetTraffic, me: DriverView): void {
  for (const s of traffic.sirens) {
    if (!s.active || !s.sirenOn) continue;
    const rx = px - s.position.x;
    const rz = pz - s.position.z;
    const sx = Math.cos(s.yaw);
    const sz = -Math.sin(s.yaw);
    const along = rx * sx + rz * sz;
    const lateral = Math.abs(rx * sz - rz * sx);
    const sameWay = Math.cos(s.yaw - me.yaw);
    if (sameWay > 0.6 && along > 0 && along < YIELD.reach && lateral < 3) {
      scratch.pullOver = true;
      hold(YIELD.crawl, 'siren');
    } else if (sameWay < -0.6 && along > 0 && along < YIELD.oncoming && lateral < 6) {
      // Coming the other way: to the kerb, to leave it the middle of the road.
      scratch.pullOver = true;
      hold(YIELD.slow, 'siren');
    } else if (rx * rx + rz * rz < YIELD.near * YIELD.near) hold(YIELD.slow, 'siren');
  }
}

/**
 * The junctions a driver gives way at (`STREET_PLAN.traffic.giveWay`): coming up to its line (heading its way), it
 * holds there while anything else heading another way is in or coming into the conflict circle.
 */
function holdAtJunctions(traffic: StreetTraffic, me: DriverView, nose: number, brake: number): void {
  for (const junction of STREET_PLAN.traffic.giveWay) {
    if (Math.cos(me.yaw - junction.yaw) < 0.8) continue;
    const rx = junction.line[0] - px;
    const rz = junction.line[1] - pz;
    const along = rx * hx + rz * hz;
    if (along < -0.5 || along > 30 || Math.abs(rx * hz - rz * hx) > 2.5) continue;
    if (!junctionBusy(traffic, me, junction.conflict, junction.radius)) continue;
    hold(stoppingSpeed(along - nose - 0.3, brake), 'junction');
  }
}

/** Whether something other than `me`, heading another way, is in or coming into the circle round `at`. */
function junctionBusy(traffic: StreetTraffic, me: DriverView, [cx, cz]: Vec2, radius: number): boolean {
  for (const v of traffic.vehicles) {
    if (v === me.self || !v.active || Math.cos(v.yaw - me.yaw) > 0.5) continue;
    const dx = cx - v.position.x;
    const dz = cz - v.position.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > radius * radius) continue;
    if (d2 < 16 || dx * Math.cos(v.yaw) - dz * Math.sin(v.yaw) > 0) return true;
  }
  return false;
}

/**
 * The crossings on Front Street, for a driver going along it: red or amber at the lights (amber only if it can still
 * stop), a plain zebra someone is on or waiting at; an ambulance on a call goes through the red, slowly, never over
 * someone on a zebra.
 */
function holdAtCrossings(traffic: StreetTraffic, me: DriverView, nose: number, brake: number): void {
  const east = hx > 0.75;
  const west = hx < -0.75;
  if (!(east || west) || Math.abs(pz) >= FRONT.farKerb) return;
  const direction = east ? 1 : -1;
  const crossings = STREET_PLAN.crossings;
  for (let i = 0; i < crossings.length; i++) {
    const crossing = crossings[i]!;
    const line = traffic.stopLineX(crossing, direction);
    const room = direction * (line - px) - nose;
    if (room < -0.2 || room > 45) continue;
    if (!traffic.mustHoldAt(crossing, i)) continue;
    if (crossing.signals && traffic.amber && (me.speed * me.speed) / (2 * brake) > room) continue;
    if (me.emergency && crossing.signals) {
      if (room < 14) hold(THROUGH_RED, 'signal');
      continue;
    }
    hold(stoppingSpeed(room - 0.3, brake), crossing.signals ? 'signal' : 'crossing');
  }
}

/**
 * Whether the other side of the road is clear for `me` to swing out into it: nothing coming the other way within
 * `reach` metres ahead (or alongside), within `across` metres to its left.
 */
export function oncomingClear(traffic: StreetTraffic, me: DriverView, reach: number, across = 5.5): boolean {
  const fx = Math.cos(me.yaw);
  const fz = -Math.sin(me.yaw);
  for (const v of traffic.vehicles) {
    if (v === me.self || !v.active || Math.cos(v.yaw - me.yaw) > -0.5) continue;
    const rx = v.position.x - me.position.x;
    const rz = v.position.z - me.position.z;
    const along = rx * fx + rz * fz;
    // Left of the heading is (-sin yaw, -cos yaw) = (fz, -fx).
    const left = rx * fz - rz * fx;
    if (along > -me.length - v.length / 2 && along < reach + v.speed * 3 && left > -1 && left < across) return false;
  }
  return true;
}

/** What a driver may swing out round (a standing vehicle, a slow rider on the right of the lane): how far left of its line it must be to clear it. */
export function clearanceLeft(me: DriverView, at: THREE.Vector3, halfWidthOf: number): number {
  const fx = Math.cos(me.yaw);
  const fz = -Math.sin(me.yaw);
  const rx = at.x - me.position.x;
  const rz = at.z - me.position.z;
  // Right of the heading is (sin yaw, cos yaw) = (-fz, fx).
  const right = -rx * fz + rz * fx;
  return right - halfWidthOf - me.width / 2 - 0.35;
}

/** Eases `speed` towards `target`: brakes hard (less hard on a slippery road: `grip`), pulls away gently. */
export function approach(speed: number, target: number, dt: number, accel = 2.4, grip = 1): number {
  const dv = target - speed;
  return Math.max(0, speed + THREE.MathUtils.clamp(dv, -8 * grip * dt, accel * dt));
}

/** Seconds of patience, before a toot, by what keeps a driver waiting (`Horn`; a temper shortens or lengthens it). */
const PATIENCE = { viewer: 2.5, person: 4, standing: 7, idle: 5 } as const;

/**
 * A horn for a held-up driver, by its temper (`temper`: under 1 patient, over 1 quick to toot): at the player in the
 * way (2.5 s), at someone dawdling on the road (not at a crossing), at a vehicle standing in the lane (the van
 * delivering, the lorry at the bins), at the vehicle ahead that stands for nothing (no lights, nobody in front of it:
 * slow off the mark); one toot per 4 s at most. A fright (`startled`) is a blast at once. Never at the lights, a
 * zebra, a junction or a siren. `atViewer` counts the toots at the player in this wait (after a few the driver edges
 * round them).
 */
export class Horn {
  honks = 0;
  atViewer = 0;
  /** Under 1 patient, over 1 quick to toot: drawn per driver. */
  temper = 1;
  private waited = 0;
  private cooldown = 0;

  update(dt: number, speed: number, allowed: Allowed): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (allowed.startled && this.cooldown < 2.5) {
      this.honks++;
      this.cooldown = 4;
      return;
    }
    const heldBy = allowed.heldBy;
    if (speed > 0.3 || heldBy === null || heldBy === 'signal' || heldBy === 'crossing' || heldBy === 'siren' || heldBy === 'junction') {
      this.waited = 0;
      if (speed > 0.3) this.atViewer = 0;
      return;
    }
    this.waited += dt;
    const patience = this.patienceFor(allowed);
    if (this.waited >= patience / this.temper && this.cooldown === 0) {
      this.honks++;
      if (heldBy === 'viewer') this.atViewer++;
      this.cooldown = 4;
    }
  }

  private patienceFor(allowed: Allowed): number {
    switch (allowed.heldBy) {
      case 'viewer':
        return PATIENCE.viewer;
      case 'obstacle':
        return allowed.obstacle?.passable ? PATIENCE.standing : PATIENCE.person;
      case 'vehicle': {
        // Only at the front of a queue that stands for nothing (it waits for the lights or someone crossing: no horn).
        const why = allowed.vehicle?.holdUp;
        return why === null || why === undefined ? (allowed.vehicle && allowed.vehicle.speed < 0.3 ? PATIENCE.idle : Infinity) : Infinity;
      }
      default:
        return Infinity;
    }
  }
}
