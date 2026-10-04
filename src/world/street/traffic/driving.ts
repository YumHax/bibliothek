import * as THREE from 'three';
import { FRONT, KERB_HEIGHT, STREET_PLAN, type Vec2 } from '../streetPlan';
import type { RoadObstacle, RoadVehicle, StreetTraffic } from './StreetTraffic';

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
  return h0 + Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0)) * t;
}

export function headingAt(route: Route, distance: number): number {
  const i = Math.min(Math.max(0, Math.round(distance / STEP)), route.samples.length / 3 - 1);
  return route.samples[i * 3 + 2]!;
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
  const turn = Math.abs(Math.atan2(Math.sin(ahead - here), Math.cos(ahead - here)));
  return cruise * (1 - 0.6 * Math.min(1, turn / 1.2));
}

/**
 * What a driver is waiting for, when held up: the lights (no horn for those), the player, someone or
 * something on the road, the vehicle ahead, a siren (pulling over for it, or slowing as it passes).
 */
type HeldBy = 'signal' | 'viewer' | 'obstacle' | 'vehicle' | 'siren' | null;

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
  /** On a call, siren on: through a red light at a crawl, never pulling over for itself. */
  readonly emergency?: boolean;
}

/** An emergency vehicle coming up behind within this many metres: the driver pulls over and crawls; one this near going by: slow down. */
const YIELD = { reach: 40, crawl: 1.5, near: 30, slow: 3 } as const;
/** How fast an emergency vehicle goes through a red light. */
const THROUGH_RED = 4.5;

/** What `allowedSpeed` returns (reused: read it before the next call). `pullOver`: a siren behind, get out of its way. */
const scratch = { target: 0, heldBy: null as HeldBy, pullOver: false };
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

function hold(speed: number, why: HeldBy): void {
  if (speed < scratch.target) {
    scratch.target = speed;
    scratch.heldBy = why;
  }
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
 * amber only if it can still stop; a plain zebra someone is on or waiting at), and the sirens
 * (`traffic.sirens`: one coming up behind, pull over and crawl; one going by near, slow down).
 * Braking distances follow the road's grip (`traffic.grip`: wet, snow). Returns the cap, what
 * caused it (the lowest wins) and whether to pull over.
 */
export function allowedSpeed(traffic: StreetTraffic, me: DriverView, cap: number, viewer: THREE.Vector3 | null, stopFor: number): { readonly target: number; readonly heldBy: HeldBy; readonly pullOver: boolean } {
  scratch.target = cap;
  scratch.heldBy = null;
  scratch.pullOver = false;
  hx = Math.cos(me.yaw);
  hz = -Math.sin(me.yaw);
  px = me.position.x;
  pz = me.position.z;
  halfWidth = me.width / 2;
  const nose = me.length / 2;
  const brake = BRAKE * traffic.grip;

  if (viewer) {
    const along = ahead(viewer, 0.6);
    if (along !== null) hold(stoppingSpeed(along - nose - stopFor, brake), 'viewer');
  }
  for (const o of traffic.obstacles) {
    if (!o.active || me.own?.has(o)) continue;
    const along = ahead(o.position, o.radius);
    if (along !== null) hold(stoppingSpeed(along - nose - o.radius - (o.gap ?? stopFor), brake), 'obstacle');
  }
  for (const v of traffic.vehicles) {
    if (v === me.self || v === (me as unknown) || !v.active) continue;
    // Same way only (a car coming the other way through a bend is not a queue).
    if (Math.cos(v.yaw - me.yaw) < 0.6) continue;
    const along = ahead(v.position, Math.min(0.6, v.width / 2));
    if (along === null) continue;
    const room = along - nose - v.length / 2 - 2.5;
    hold(room <= 0 ? 0 : Math.min(stoppingSpeed(room, brake) + v.speed, v.speed + room * 0.8), 'vehicle');
  }
  if (!me.emergency) {
    for (const s of traffic.sirens) {
      if (!s.active || !s.sirenOn) continue;
      const rx = px - s.position.x;
      const rz = pz - s.position.z;
      const sx = Math.cos(s.yaw);
      const sz = -Math.sin(s.yaw);
      const along = rx * sx + rz * sz;
      const lateral = Math.abs(rx * sz - rz * sx);
      if (Math.cos(s.yaw - me.yaw) > 0.6 && along > 0 && along < YIELD.reach && lateral < 3) {
        scratch.pullOver = true;
        hold(YIELD.crawl, 'siren');
      } else if (rx * rx + rz * rz < YIELD.near * YIELD.near) hold(YIELD.slow, 'siren');
    }
  }

  // The crossings on Front Street, for a driver going along it.
  const east = hx > 0.75;
  const west = hx < -0.75;
  if ((east || west) && Math.abs(pz) < FRONT.farKerb) {
    const direction = east ? 1 : -1;
    const crossings = STREET_PLAN.crossings;
    for (let i = 0; i < crossings.length; i++) {
      const crossing = crossings[i]!;
      const line = traffic.stopLineX(crossing, direction);
      const room = direction * (line - px) - nose;
      if (room < -0.2 || room > 45) continue;
      if (!traffic.mustHoldAt(crossing, i)) continue;
      // Amber: go on if it cannot stop in time any more.
      if (crossing.signals && traffic.amber && (me.speed * me.speed) / (2 * brake) > room) continue;
      // An ambulance on a call goes through the red, slowly; never over someone on a zebra.
      if (me.emergency && crossing.signals) {
        if (room < 14) hold(THROUGH_RED, 'signal');
        continue;
      }
      hold(stoppingSpeed(room - 0.3, brake), crossing.signals ? 'signal' : 'obstacle');
    }
  }
  return scratch;
}

/** Eases `speed` towards `target`: brakes hard (less hard on a slippery road: `grip`), pulls away gently. */
export function approach(speed: number, target: number, dt: number, accel = 2.4, grip = 1): number {
  const dv = target - speed;
  return Math.max(0, speed + THREE.MathUtils.clamp(dv, -8 * grip * dt, accel * dt));
}

/**
 * A horn for a held-up driver: when kept waiting by the player (2.5 s), or by the vehicle ahead not
 * moving off at green (6 s); one toot per 4 s at most. `atViewer` counts the toots at the player in
 * this wait (the driver's patience: after a few it gives up and edges round).
 */
export class Horn {
  honks = 0;
  atViewer = 0;
  private waited = 0;
  private cooldown = 0;

  update(dt: number, speed: number, heldBy: HeldBy, green: boolean): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (speed > 0.3 || heldBy === null || heldBy === 'signal' || heldBy === 'obstacle' || heldBy === 'siren') {
      this.waited = 0;
      if (speed > 0.3) this.atViewer = 0;
      return;
    }
    this.waited += dt;
    const patience = heldBy === 'viewer' ? 2.5 : green ? 6 : Infinity;
    if (this.waited >= patience && this.cooldown === 0) {
      this.honks++;
      if (heldBy === 'viewer') this.atViewer++;
      this.cooldown = 4;
    }
  }
}
