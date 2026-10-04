/*
 * The ranked table every hall of fame is built on (the arcade's `ArcadeScores`, the home cabinet's
 * `HomeScores`, the party's `PartyScores`, the collector's), so insert, sort, qualify and trim are
 * written once. Ranks are 0-based everywhere: the end cards add the 1 when they say "3RD ON THE BOARD".
 * A tie keeps its order (best first, the earlier entry ahead): a score must beat one to pass it.
 */

/** `entries` best first; a tie keeps its order. A copy. */
export function byScore<T extends { readonly score: number }>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => b.score - a.score);
}

/** Whether `score` makes a table of `size` lines: a free place, or better than the last one. */
export function makesTable(entries: readonly { readonly score: number }[], score: number, size: number): boolean {
  return score > 0 && (entries.length < size || score > entries[entries.length - 1]!.score);
}

/** The place `score` would take on `entries` (best first, 0-based): under every entry it does not beat, so the last place on a table not yet full. */
export function placeOf(entries: readonly { readonly score: number }[], score: number): number {
  const above = entries.findIndex((e) => score > e.score);
  return above < 0 ? entries.length : above;
}

/** `entries` with `entry` in its place, best first, trimmed to `size`. A copy. */
export function withEntry<T extends { readonly score: number }>(entries: readonly T[], entry: T, size: number): T[] {
  return byScore([...entries, entry]).slice(0, size);
}

/** Where `entry` (the same object) stands in `entries`, 0-based, or null when it fell off the table. */
export function rankOf<T>(entries: readonly T[], entry: T): number | null {
  const i = entries.indexOf(entry);
  return i < 0 ? null : i;
}
