import * as THREE from 'three';
import type { GestureName } from '../../people/motion/gestures';
import type { PaintedFront } from '../Buildings';
import { FacadeFrame } from '../relief/facadeFrame';
import { hasShopfront } from '../shopfronts/shopfrontPlan';
import { isWalkable, WORKS, type Vec2 } from '../streetPlan';

/*
 * A passer-by's trip (`StreetCrowd`): a route of the plan walked as steps, with stops on the way: a look in a
 * shop's window (from the painted fronts, `windowStops`), at the newsstand's front page, a minute's listen to the
 * busker, the bills on the Morris column (`STREET_PLAN.crowd.attractions`). A stop is a step off the lane to the
 * spot, a pause facing it, and back onto the lane a little further on.
 */

export interface CrowdRoute {
  path: readonly Vec2[];
  /** Index of the kerb point before a crossing: wait there before stepping off. */
  crossing?: number;
  /** Walked only at night (from the bars), or never at night. */
  night?: boolean;
}

/** Somewhere a passer-by may stop: where to stand, the way to face, what to look at (zone-local, y up). */
export interface Stop {
  at: Vec2;
  yaw: number;
  focus: THREE.Vector3;
  kind: 'window' | 'kiosk' | 'busker' | 'column';
  /** How long they stay (seconds). */
  seconds: readonly [number, number];
  /** Only in these game hours (the busker's, the kiosk's). */
  hours?: readonly [number, number];
  /** Only while it is dry (nobody lingers at a window in the rain). */
  dry: boolean;
  /** What they do there now and then (a coin in the busker's case). */
  gesture?: GestureName;
  /** The facade's direction (for windows: the lane must run along it). */
  along?: THREE.Vector2;
}

/** An attraction in the plan (`STREET_PLAN.crowd.attractions`). */
export interface AttractionSpec {
  at: Vec2;
  /** What they look at: a point (x, y, z). */
  look: readonly [number, number, number];
  kind: 'kiosk' | 'busker' | 'column';
  seconds: readonly [number, number];
  hours?: readonly [number, number];
  dry?: boolean;
}

/** Something on the pavement a window-shopper must not stand in (a terrace, a bench, a queue's spot): a disc. */
export interface Clear {
  at: Vec2;
  r: number;
}

/** A stop on a route: on segment `segment` (path[segment] to the next), `t` of the way along it, from the lane at `lane`. */
export interface RouteStop {
  stop: Stop;
  segment: number;
  t: number;
  lane: Vec2;
  after: Vec2;
}

export type Step =
  | { kind: 'walk'; points: THREE.Vector3[] }
  | { kind: 'kerb'; crossing: number }
  | { kind: 'pause'; seconds: number; yaw: number; focus: THREE.Vector3; gesture?: GestureName };

/** A window-shopper stands this far out from the wall (further for a walk-in shop's display, which stands out 0.45 m). */
const WINDOW_OUT = 0.95;
const DISPLAY_OUT = 1.35;
/** A stop is taken from a lane this close to it and no closer (metres), and only off a straight stretch along it. */
const LANE = { near: 0.35, far: 2.1, margin: 0.12 };
/** Back onto the lane this far past the stop. */
const ON_PAST = 0.6;
const WINDOW_SECONDS = [3, 8] as const;

/** Shop windows worth a look along the walkable pavements, from the painted fronts, clear of `clear`. */
export function windowStops(fronts: readonly PaintedFront[], clear: readonly Clear[]): Stop[] {
  const stops: Stop[] = [];
  for (const front of fronts) {
    const frame = new FacadeFrame(front.spec);
    const doors = front.features.doors.map((d) => d.s);
    for (const w of front.features.windows) {
      if (w.kind === 'shut') continue;
      const mid = (w.s0 + w.s1) / 2;
      // The door's own glass is not a window to stop at.
      if (doors.some((s) => Math.abs(s - mid) < 0.7) || w.s1 - w.s0 < 0.8) continue;
      const out = hasShopfront(w.kind) ? DISPLAY_OUT : WINDOW_OUT;
      const p = frame.point(mid, 0, out);
      const at: Vec2 = [p.x, p.z];
      if (!isWalkable(at) || at[0] > WORKS.front - 2 || clear.some((c) => Math.hypot(c.at[0] - at[0], c.at[1] - at[1]) < c.r)) continue;
      const focus = frame.point(mid, 1.45, 0);
      stops.push({ at, yaw: frame.yaw + Math.PI, focus, kind: 'window', seconds: WINDOW_SECONDS, dry: true, along: frame.u.clone() });
    }
  }
  return stops;
}

/** The plan's attractions as stops. */
export function attractionStops(specs: readonly AttractionSpec[]): Stop[] {
  return specs.map((a) => {
    const focus = new THREE.Vector3(...a.look);
    const yaw = Math.atan2(focus.x - a.at[0], focus.z - a.at[1]);
    return { at: a.at, yaw, focus, kind: a.kind, seconds: a.seconds, hours: a.hours, dry: a.dry ?? false, gesture: a.kind === 'busker' ? 'insertCoin' : undefined };
  });
}

/** The stops `route` passes close enough to take, off its straight stretches (never the crossing's). */
export function stopsOnRoute(route: CrowdRoute, stops: readonly Stop[]): RouteStop[] {
  const found: RouteStop[] = [];
  const { path } = route;
  for (let i = 0; i < path.length - 1; i++) {
    if (route.crossing !== undefined && i === route.crossing) continue;
    const [ax, az] = path[i]!;
    const [bx, bz] = path[i + 1]!;
    const length = Math.hypot(bx - ax, bz - az);
    if (length < 2) continue;
    const ux = (bx - ax) / length;
    const uz = (bz - az) / length;
    for (const stop of stops) {
      if (stop.along && Math.abs(stop.along.x * ux + stop.along.y * uz) < 0.9) continue;
      const dx = stop.at[0] - ax;
      const dz = stop.at[1] - az;
      const s = dx * ux + dz * uz;
      const d = Math.abs(dx * uz - dz * ux);
      // A window is a step off the lane; an attraction (the newsstand's counter) may be right on it.
      if (d < (stop.along ? LANE.near : 0) || d > LANE.far || s < length * LANE.margin || s + ON_PAST > length * (1 - LANE.margin)) continue;
      found.push({ stop, segment: i, t: s / length, lane: [ax + ux * s, az + uz * s], after: [ax + ux * (s + ON_PAST), az + uz * (s + ON_PAST)] });
    }
  }
  return found;
}

/**
 * The steps of `route` from point `from` (`t0` of the way to the next), with `chosen` stops on the way: walks, the
 * wait at the crossing's kerb (`crossingOf` its index in the plan's crossings), pauses at the stops.
 */
export function planTrip(route: CrowdRoute, from: number, t0: number, chosen: readonly RouteStop[], crossingOf: (x: number) => number, pause: (stop: Stop) => number): Step[] {
  const { path } = route;
  const steps: Step[] = [];
  let walk: THREE.Vector3[] = [];
  const flush = (): void => {
    if (walk.length) steps.push({ kind: 'walk', points: walk });
    walk = [];
  };
  for (let i = from; i < path.length - 1; i++) {
    const here = chosen.filter((c) => c.segment === i && (i > from || c.t > t0 + 0.05)).sort((a, b) => a.t - b.t);
    for (const c of here) {
      walk.push(v3(c.lane), v3(c.stop.at));
      flush();
      steps.push({ kind: 'pause', seconds: pause(c.stop), yaw: c.stop.yaw, focus: c.stop.focus, gesture: c.stop.gesture });
      walk.push(v3(c.after));
    }
    walk.push(v3(path[i + 1]!));
    if (route.crossing !== undefined && i + 1 === route.crossing && route.crossing > from) {
      flush();
      steps.push({ kind: 'kerb', crossing: crossingOf(path[route.crossing]![0]) });
    }
  }
  flush();
  return steps;
}

/**
 * The same trip for someone walking beside: every point `side` metres to the right of the way (negative: the
 * left), from `start` (where the trip begins); pauses beside the other's.
 */
export function besideSteps(steps: readonly Step[], start: THREE.Vector3, side: number): Step[] {
  let prev = start.clone();
  const right = new THREE.Vector3();
  return steps.map((step): Step => {
    if (step.kind !== 'walk') return step;
    const points = step.points.map((p, k) => {
      const next = step.points[k + 1];
      // The way at this point: from the one before (or on to the next, at the first).
      const from = k === 0 && next ? p : prev;
      const to = k === 0 && next ? next : p;
      right.set(-(to.z - from.z), 0, to.x - from.x);
      if (right.lengthSq() < 1e-6) right.set(0, 0, 0);
      else right.normalize().multiplyScalar(side);
      prev = p;
      return p.clone().add(right);
    });
    return { kind: 'walk', points };
  });
}

/** The point a trip's steps start from, offset like `besideSteps`. */
export function besideStart(start: THREE.Vector3, steps: readonly Step[], side: number): THREE.Vector3 {
  const first = steps.find((s): s is Extract<Step, { kind: 'walk' }> => s.kind === 'walk')?.points[0];
  if (!first) return start.clone();
  const right = new THREE.Vector3(-(first.z - start.z), 0, first.x - start.x);
  if (right.lengthSq() < 1e-6) return start.clone();
  return start.clone().add(right.normalize().multiplyScalar(side));
}

function v3([x, z]: Vec2): THREE.Vector3 {
  return new THREE.Vector3(x, 0, z);
}
