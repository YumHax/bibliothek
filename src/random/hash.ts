/*
 * THE HASHES: a name or a number turned into a stable value, the same on every load and in every engine (integer
 * arithmetic only: the `Math.sin` hashes these replace differed between JavaScript engines).
 * - `fnv1a(text)`: the 32-bit string hash every procedural detail keyed on an id has always used (a barcode, a
 *   serial, the day seeds of `time/daily`).
 * - `unit01(text)`: that hash folded into [0, 1) the way the economy prices with it (a price's jitter, a haggle's
 *   floor). Saved days depend on it: never change it.
 * - `mix32(n)`: the finaliser that spreads neighbouring integers apart (murmur3's fmix32) before one seeds a
 *   stream; `hashInts(...)` folds several integers into one hash, `unitOf(...)` gives that fold in [0, 1).
 */

/** FNV-1a of `text`, 32-bit. */
export function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic [0, 1) from `text`: one value, no stream (the economy's fold of `fnv1a`, frozen). */
export function unit01(text: string): number {
  return (fnv1a(text) % 100000) / 100000;
}

/** The 32-bit finaliser: `n` and `n + 1` come out unrelated. */
export function mix32(n: number): number {
  let h = n >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** One 32-bit hash of several integers (a row and a column, a seed and an index); a float is floored first. */
export function hashInts(...ns: readonly number[]): number {
  let h = 0x9e3779b9;
  for (const n of ns) h = mix32(h ^ mix32(Math.floor(n)));
  return h >>> 0;
}

/** `hashInts` in [0, 1): a steady draw for a tile, a lamp, a window, with no stream to keep. */
export function unitOf(...ns: readonly number[]): number {
  return hashInts(...ns) / 0x100000000;
}
