import { KEYS, PersistedStore } from '@/persistence';
import type { NoticeActions } from '@/notices';
import { HUNT, type ClueId } from './huntPlan';

/*
 * The building's treasure hunt (`HUNT`): which clues are found, saved, and the file the journal
 * shows. A module-level store, so every place a clue lies (the cellars, the hall's mailboxes and
 * board, the courtyard's chestnut, the stairs' residents, the cat, the attic, the roof) asks it
 * without wiring; `connectHunt` gives it the journal and the notices once at boot. Words are in
 * `huntPlan.ts`; placing the clues is `world/hunt/placeHunt.ts`.
 */

interface State {
  /** The clues found, in the order they were. */
  found: ClueId[];
  /** The game day the last one was found. */
  since: number;
}

/** What the hunt tells: the journal's line, the "new lead" word. */
interface HuntOutlets {
  journal?: { note(kind: string, text: string, options?: { weight?: 'headline' | 'line' | 'note' }): void };
  notices?: NoticeActions;
  day: () => number;
}

const CLUES = Object.keys(HUNT.clues) as ClueId[];

const store = new PersistedStore<State>({ key: KEYS.buildingHunt, version: 1, defaults: () => ({ found: [], since: 0 }), read: readState });
let state: State | null = null;
let outlets: HuntOutlets | null = null;
const listeners = new Set<() => void>();

function current(): State {
  return (state ??= store.load());
}

function readState(data: unknown): State | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as { found?: unknown; since?: unknown };
  const found = Array.isArray(d.found) ? d.found.filter((id): id is ClueId => typeof id === 'string' && (CLUES as string[]).includes(id)) : [];
  return { found: [...new Set(found)], since: typeof d.since === 'number' && Number.isFinite(d.since) ? d.since : 0 };
}

/** The journal and the notices (once, at boot). */
export function connectHunt(next: HuntOutlets): void {
  outlets = next;
}

/** Whether `clue` was found. */
export function huntFound(clue: ClueId): boolean {
  return current().found.includes(clue);
}

/** Whether `clue` may be found now: what it needs is found, and it is not yet. */
export function huntOpen(clue: ClueId): boolean {
  return !huntFound(clue) && HUNT.clues[clue].needs.every(huntFound);
}

/** The game day the last clue was found. */
export function huntSince(): number {
  return current().since;
}

/** When the "new lead" word is said: at once, a moment later (after what was said there), or not (the card read there says it). */
type LeadWord = 'now' | 'later' | 'never';

/** Seconds after which a `later` word comes. */
const LATER_MS = 3500;

/** The "new lead" word under the crosshair. */
export const NEW_LEAD = `A new lead: in the journal, ${HUNT.fileTitle.toLowerCase()}`;

/** `clue` is found (saved, the journal's line, the word as `tell` says). Returns whether it was new. */
export function findClue(clue: ClueId, tell: LeadWord = 'now'): boolean {
  if (!huntOpen(clue)) return false;
  const now = current();
  state = { found: [...now.found, clue], since: outlets?.day() ?? now.since };
  store.save(state);
  outlets?.journal?.note('hunt', HUNT.clues[clue].note, { weight: clue === 'chest' ? 'headline' : 'line' });
  const notices = outlets?.notices;
  if (notices && tell === 'now') notices.react(NEW_LEAD);
  else if (notices && tell === 'later') window.setTimeout(() => notices.react(NEW_LEAD), LATER_MS);
  for (const cb of [...listeners]) cb();
  return true;
}

/** Calls `cb` whenever a clue is found; returns the unsubscribe. */
export function onHunt(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The journal's page of it (`JournalPanel` files): the clues in the player's words, where to look next. Null before the first. */
export function huntFile(): { title: string; clues: string[]; total: number; next?: string; done?: boolean } | null {
  const { found } = current();
  if (!found.length) return null;
  const clues = found.map((id) => HUNT.clues[id].note);
  const total = Object.keys(HUNT.clues).length;
  if (found.includes('chest')) return { title: HUNT.fileTitle, clues, total, done: true };
  // The furthest of the main way's clues found says where next.
  const main: ClueId[] = ['chestnut', 'board', 'mailbox', 'chalk', 'letter'];
  const last = main.find((id) => found.includes(id));
  const next = last ? HUNT.next[last] : undefined;
  return { title: HUNT.fileTitle, clues, total, ...(next ? { next } : {}) };
}
