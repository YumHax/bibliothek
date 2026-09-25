/** Uniform in [min, max). One `Math.random` draw. */
export function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** True with probability `p`. One `Math.random` draw. */
export function chance(p: number): boolean {
  return Math.random() < p;
}
