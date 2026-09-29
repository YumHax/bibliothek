import * as THREE from 'three';

/*
 * What the people who walk about (Walker, Shopper) do alike: turn the body onto a heading, walk a
 * path of floor points one leg at a time, glance about now and then, notice the player close by.
 * Each owner keeps its own rates and ranges and decides what to do with them.
 */

/** The signed angle from `from` to `to` the short way round, in (-pi, pi]. */
export function angleBetween(from: number, to: number): number {
  const delta = to - from;
  return Math.atan2(Math.sin(delta), Math.cos(delta));
}

/** `heading` turned towards `yaw` the short way round, by `rate` of the gap per second. */
export function turnTowards(heading: number, yaw: number, dt: number, rate: number): number {
  return heading + angleBetween(heading, yaw) * Math.min(1, dt * rate);
}

/** The way from where someone stands to the next point of their path, on the floor. */
export interface Leg {
  dx: number;
  dz: number;
  dist: number;
}

/**
 * The next leg of `path` (floor points) from `from`, written to `leg`: 'done' once the path is
 * empty; 'reached' when within `arrive` of its first point, which is dropped (no step this frame);
 * else 'go', towards it.
 */
export function nextLeg(from: THREE.Vector3, path: THREE.Vector3[], arrive: number, leg: Leg): 'done' | 'reached' | 'go' {
  const next = path[0];
  if (!next) return 'done';
  leg.dx = next.x - from.x;
  leg.dz = next.z - from.z;
  leg.dist = Math.hypot(leg.dx, leg.dz);
  if (leg.dist < arrive) {
    path.shift();
    return 'reached';
  }
  return 'go';
}

/** Moves `position` along `leg` by `distance`, never past its end. */
export function stepAlong(position: THREE.Vector3, leg: Leg, distance: number): void {
  const move = Math.min(leg.dist, distance);
  position.x += (leg.dx / leg.dist) * move;
  position.z += (leg.dz / leg.dist) * move;
}

/**
 * A point to look at that changes every few seconds: `update` counts down and, when due, has
 * `pick` set a new point (in the owner's frame) and say how long until the next.
 */
export class Glance {
  readonly point = new THREE.Vector3();
  private timer = 0;

  update(dt: number, pick: (point: THREE.Vector3) => number): THREE.Vector3 {
    this.timer -= dt;
    if (this.timer <= 0) this.timer = pick(this.point);
    return this.point;
  }
}

/** Walking or standing about: somewhere ahead, a little to one side, for 2 to 6 seconds. */
export function idleGlance(point: THREE.Vector3): number {
  point.set((Math.random() - 0.5) * 4, 1.2 + Math.random() * 0.6, 2.5);
  return 2 + Math.random() * 4;
}

/** Whether `viewer` stands within `range` of `self` on the floor; its world position is left in `viewerPos`. */
export function viewerWithin(self: THREE.Object3D, viewer: THREE.Object3D, range: number, viewerPos: THREE.Vector3, here: THREE.Vector3): boolean {
  viewer.getWorldPosition(viewerPos);
  self.getWorldPosition(here);
  return Math.hypot(viewerPos.x - here.x, viewerPos.z - here.z) < range;
}

/** A turn sharper than this (radians) at a path's corner is rounded by `roundCorners`. */
const ROUND_ABOVE = 0.35;

/**
 * `path` with its corners rounded: each interior point where the way turns is replaced by a short
 * arc (a quadratic curve through it, `radius` metres either side, less on a short leg), so a
 * walker sweeps round a street corner instead of pivoting on the spot. The last point is kept as
 * it is (where they stop). Returns the new points, those on an arc (walked a little slower), and
 * for each new point the index of the point of `path` it stands for (`owners`).
 */
export function roundCorners(from: THREE.Vector3, path: readonly THREE.Vector3[], radius: number): { path: THREE.Vector3[]; arcs: Set<THREE.Vector3>; owners: number[] } {
  const out: THREE.Vector3[] = [];
  const arcs = new Set<THREE.Vector3>();
  const owners: number[] = [];
  for (let i = 0; i < path.length; i++) {
    const v = path[i]!;
    const prev = i === 0 ? from : path[i - 1]!;
    const next = path[i + 1];
    if (!next) {
      out.push(v.clone());
      owners.push(i);
      continue;
    }
    const ax = prev.x - v.x;
    const az = prev.z - v.z;
    const bx = next.x - v.x;
    const bz = next.z - v.z;
    const la = Math.hypot(ax, az);
    const lb = Math.hypot(bx, bz);
    const turn = la > 1e-3 && lb > 1e-3 ? Math.PI - Math.acos(Math.max(-1, Math.min(1, (ax * bx + az * bz) / (la * lb)))) : 0;
    const r = Math.min(radius, la * 0.45, lb * 0.45);
    if (turn < ROUND_ABOVE || r < 0.05) {
      out.push(v.clone());
      owners.push(i);
      continue;
    }
    // A quadratic curve from `r` before the corner to `r` after it, the corner its control point (weights sum to 1).
    for (let k = 0; k <= 4; k++) {
      const t = k / 4;
      const p0 = (1 - t) * (1 - t);
      const p2 = t * t;
      const point = new THREE.Vector3(v.x + (ax / la) * r * p0 + (bx / lb) * r * p2, v.y, v.z + (az / la) * r * p0 + (bz / lb) * r * p2);
      out.push(point);
      owners.push(i);
      arcs.add(point);
    }
  }
  return { path: out, arcs, owners };
}
