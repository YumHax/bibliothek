/*
 * Scalar helpers, one of each. THREE.MathUtils already has `clamp`, `lerp`, `smoothstep` and `damp`: the ones here
 * agree with them name for name and argument for argument, so a caller may take either and change nothing; what
 * three.js lacks (a clamped unit smoothstep, a ramp that may run downhill, the bell curves) lives here only.
 * A validator that also substitutes a default is not a clamp (`settings` calls its own `numberIn`), and a function
 * that rounds is not one either: those keep their own names so a reader is never misled.
 */

/** `value` held within `min`..`max`. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** `a` at `t = 0`, `b` at `t = 1`, straight in between (and beyond: `t` is not clamped). */
export function lerp(a: number, b: number, t: number): number {
  return (1 - t) * a + t * b;
}

/** Smoothstep of `t` clamped to 0..1: slow at both ends, zero speed at them. */
export function smooth(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

/** Smootherstep (zero speed and acceleration at both ends) of `t` clamped to 0..1. */
export function smoother(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/** 0 at `from`, 1 at `to`, smooth in between; `from` may be above `to` (THREE's `smoothstep` cannot run downhill). */
export function ramp(x: number, from: number, to: number): number {
  return smooth((x - from) / (to - from));
}

/** A bell of height 1 at `centre`, `sigma` its standard deviation. */
export function gaussian(x: number, centre: number, sigma: number): number {
  const d = (x - centre) / sigma;
  return Math.exp(-0.5 * d * d);
}

/** A tent of height 1 at `centre`, down to 0 at `centre ± half`, flat beyond. */
export function triangle(x: number, centre: number, half: number): number {
  return Math.max(0, 1 - Math.abs(x - centre) / half);
}
