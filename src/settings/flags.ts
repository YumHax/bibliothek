/*
 * The URL's switches, read once. `?debug` (the seed collection, every progression done, the editor's add pane, the
 * debug panel, the debug save), `?stats` (the frame readout and the outlook views' counters), `?quality=low|medium|high`, `?fresh` (forget the
 * saved position), `?payout` (the arcade's payout statistics), `?auction` (every market day a sale day), `?tournament`
 * (the arcade's tournament today), `?intro` (the opening cutscene over any save). Every module asks here; nothing parses `location.search` on its own, so a switch is
 * named in one place and the headless runs (no `location`) see none set.
 */
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();

/** Whether `?name` is in the URL. */
export function flag(name: 'debug' | 'stats' | 'fresh' | 'payout' | 'auction' | 'tournament' | 'intro'): boolean {
  return params.has(name);
}

/** The value of `?name=value`, or null. */
export function flagValue(name: 'quality'): string | null {
  return params.get(name);
}
