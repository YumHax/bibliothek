import type { Rng } from './streams';

/*
 * THE DRAWS, written once. Every draw names its stream first: seeded code passes its own, a live draw passes
 * `random` and so says it is one. Each takes exactly one value from the stream (`shuffled` one per swap), so a
 * stream's sequence stays what its owner planned.
 */

/** One of `items`, which is never empty (a palette, a table of styles). */
export function pick<T>(stream: Rng, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(stream() * items.length))]!;
}

/** One of `items` by `weight` (a weight below zero counts as zero); the last when every weight is zero. */
export function pickWeighted<T>(stream: Rng, items: readonly T[], weight: (item: T) => number): T {
  const weights = items.map((item) => Math.max(0, weight(item)));
  let roll = stream() * weights.reduce((sum, w) => sum + w, 0);
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

/** A copy of `items` in a random order (Fisher-Yates: every order as likely as any other). */
export function shuffled<T>(stream: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(stream() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Uniform in [min, max). */
export function between(stream: Rng, min: number, max: number): number {
  return min + stream() * (max - min);
}

/** Uniform in the pair's [min, max) (a plan's `[lo, hi]`). */
export function within(stream: Rng, [min, max]: readonly [number, number]): number {
  return min + stream() * (max - min);
}

/** A whole number in [min, max], both ends in. */
export function integer(stream: Rng, min: number, max: number): number {
  return min + Math.floor(stream() * (max - min + 1));
}

/** True with probability `p`. */
export function chance(stream: Rng, p: number): boolean {
  return stream() < p;
}
