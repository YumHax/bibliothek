/*
 * Easing a value towards a target every frame, whatever the frame time. `x += (target - x) * dt * k` closes a fixed
 * share of the gap per frame, so at 20 fps it snaps and at 144 fps it crawls; the exponential form closes the same
 * share per second at any rate. `rate` is per second: the gap is down to a third after 1 / rate seconds, to 5 % after
 * 3 / rate. The same as THREE.MathUtils.damp. A motion with its own 0..1 progress eases with `./easing` instead.
 */
import { angleTo } from './angles';

/** The share of the gap closed in `dt` seconds at `rate` per second. */
export function dampFactor(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

/** `current` eased towards `target` at `rate` per second. */
export function damp(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * dampFactor(rate, dt);
}

/** `current` (an angle) eased towards `target` the short way round at `rate` per second. */
export function dampAngle(current: number, target: number, rate: number, dt: number): number {
  return current + angleTo(current, target) * dampFactor(rate, dt);
}
