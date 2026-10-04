/*
 * Easing curves for a motion that runs on its own 0..1 progress (a box sliding out of its row, a lid, a timeline).
 * Named by their shape, so a quadratic and a cubic ease-in-out are never both called `easeInOut` again; something
 * eased every frame towards a moving target takes `damp` instead (`./damp`).
 */

/** Slow start, slow finish, quadratic: brisk through the middle. */
export function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** Slow start, slow finish, cubic: lingers longer at both ends than the quadratic. */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
