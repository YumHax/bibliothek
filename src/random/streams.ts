import { fnv1a, mix32 } from './hash';

/*
 * THE STREAMS: every random number the game draws comes from one of these.
 * - `random()`: the live stream, a fresh draw each call (a sound's jitter, a visitor's whim). Behind it is
 *   `Math.random`, called nowhere else in the game; `seedLiveRandom` swaps a seeded stream in for the headless
 *   checks, so a run builds the same props every time.
 * - `lcg(seed)`: the frozen LCG the plans, the arcade replays and the day draws have always used. Weakly seeded
 *   (seeds 1..99 start alike): a new use takes `seededRng`.
 * - `frozenRng(text)`: the economy's frozen stream (a day's stock, a challenge, a visit): same text, same draws, on
 *   every load and for every player. Never change it: every saved day depends on it.
 * - `seededRng(seed)`: the stream for new code, well seeded (`mix32` of the seed before the first draw), from a
 *   number or a string; no seed takes one from the live stream (traffic that differs on every load).
 */

/** A stream of draws in [0, 1). */
export type Rng = () => number;

let live: Rng = Math.random;

/** The live stream: never the same twice. Passed by name (`pick(random, ...)`) so a live draw says it is one. */
export function random(): number {
  return live();
}

/** Seeds the live stream (the headless checks: the same geometry every run); `null` hands it back to `Math.random`. */
export function seedLiveRandom(seed: number | null): void {
  live = seed === null ? Math.random : mulberry32(seed);
}

/** The frozen LCG (`seededRandom` of old): what the plans, the replays and the day draws were drawn with. */
export function lcg(seed: number): Rng {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** mulberry32 from a 32-bit state: the generator behind `frozenRng` and `seededRng`. */
export function mulberry32(state: number): Rng {
  let a = state >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The economy's frozen stream from a text seed (`${day}:stock`): the same draws on every load. */
export function frozenRng(text: string): Rng {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return mulberry32(h);
}

/** A well-seeded stream for new code; without a seed, a different stream on every load. */
export function seededRng(seed: number | string = Math.floor(random() * 0x100000000)): Rng {
  return mulberry32(mix32(typeof seed === 'string' ? fnv1a(seed) : seed));
}
