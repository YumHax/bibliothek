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
