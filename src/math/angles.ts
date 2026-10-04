/*
 * Angles in radians, yaw growing anticlockwise seen from above (three.js's `rotation.y`). One sign convention for
 * the difference of two angles: `angleTo(from, to)` is the turn that takes `from` onto `to`, positive anticlockwise,
 * the short way round. The repo once had both `to - from` and `a - b` under one name, and six wrappers besides.
 */

/** `angle` brought into -π..π (the exact modulo form: no trigonometry, and an angle already in range is unchanged). */
export function wrapAngle(angle: number): number {
  const turn = Math.PI * 2;
  return ((((angle + Math.PI) % turn) + turn) % turn) - Math.PI;
}

/** The signed turn from `from` to `to` the short way round, within ±π: positive anticlockwise. */
export function angleTo(from: number, to: number): number {
  return wrapAngle(to - from);
}

/** `from` turned the fraction `t` of the short way round to `to`. */
export function lerpAngle(from: number, to: number, t: number): number {
  return from + angleTo(from, to) * t;
}
