import { KEYS, PersistedStore } from '@/persistence';

/*
 * FRONT STREET'S MOMENTS (docs/social.md "Front Street and the arcade"): what happened out there that the collector's
 * book counts and the story remembers, once each: the stray come home, a big scratch-card win, a find off the garage
 * sale's table, one of Félix's copies bought back from Victor's suitcase, a favour done at the Mansions, a secret
 * found. Read by the milestones (`economy/milestoneList`), told to whoever listens (`onStreetMark`: the book's watch).
 */

/** A moment of the street, kept once. */
export type StreetMark =
  | 'strayHome'
  | 'scratchBig'
  | 'garageFind'
  | 'felixFromVictor'
  | 'mansionFavour'
  | 'mansionFind'
  | 'wagerWon'
  | 'felixGuide'
  | 'secret:dust'
  | 'secret:chalk'
  | 'secret:carving'
  | 'phoneFelix'
  | 'worksOpen'
  /** Mr Ferrand, across Mémé's landing, opened his door once (`world/linden/FerrandDoor`). */
  | 'ferrandOpened'
  /** LE TILLEUL's owner told what the café saw before the sale, once (`world/linden/TilleulWindow`). */
  | 'tilleulTold';

const store = new PersistedStore<string[]>({
  key: KEYS.streetMarks,
  version: 1,
  defaults: () => [],
  read: (data) => (Array.isArray(data) ? data.filter((m): m is string => typeof m === 'string') : null),
});

let marks: Set<string> = new Set(store.load());
const listeners = new Set<(mark: StreetMark) => void>();

/** Whether `mark` happened already. */
export function streetMarked(mark: StreetMark): boolean {
  return marks.has(mark);
}

/** How many of the marks starting `prefix` happened ("secret:"). */
export function streetMarkCount(prefix: string): number {
  let n = 0;
  for (const m of marks) if (m.startsWith(prefix)) n++;
  return n;
}

/** `mark` happened (once: the first time is told, later ones are not). */
export function markStreet(mark: StreetMark): void {
  if (marks.has(mark)) return;
  marks = new Set([...marks, mark]);
  store.save([...marks]);
  for (const cb of listeners) cb(mark);
}

/** Hears every new mark (the collector's book takes its facts again). */
export function onStreetMark(cb: (mark: StreetMark) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
