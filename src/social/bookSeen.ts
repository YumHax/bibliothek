import { KEYS, PersistedStore } from '@/persistence';
import { atLeast } from './tiers';
import type { PersonId, TierId } from './types';

/*
 * What the People book showed of each person the last time their page was opened (`KEYS.peopleBookSeen`), so what
 * is new since is marked "new" (a fact, a memory, a need), on their page and on their card in the list, and a page
 * whose look changed with the tier (a typed card, then pencil notes, then their hand, then a photo) is shown changing
 * once. Presentation only: nothing here changes what anyone does.
 */

/** How a person's page looks at a tier (docs/social.md "The People book"): it ages as you get to know them. */
export type PageLook = 'typed' | 'pencil' | 'hand' | 'photo';

const LOOKS: readonly PageLook[] = ['typed', 'pencil', 'hand', 'photo'];

/** The page's look at `tier`: a typed index card up to polite, pencil notes from acquaintance, their hand from friend, a photo for a close friend. */
export function pageLook(tier: TierId): PageLook {
  if (tier === 'close') return 'photo';
  if (atLeast(tier, 'friend')) return 'hand';
  if (atLeast(tier, 'acquaintance')) return 'pencil';
  return 'typed';
}

/** What a page showed: the keys of its items (facts and fits learned, memories, threads) and its look. */
interface PageSeen {
  items: string[];
  look: PageLook;
}

interface SeenSave {
  pages: Record<PersonId, PageSeen>;
}

let store: PersistedStore<SeenSave> | null = null;
let state: SeenSave | null = null;

function loaded(): SeenSave {
  if (state) return state;
  store = new PersistedStore<SeenSave>({ key: KEYS.peopleBookSeen, version: 1, defaults: () => ({ pages: {} }), read: readSave });
  state = store.load();
  return state;
}

function readSave(data: unknown): SeenSave | null {
  if (!data || typeof data !== 'object') return null;
  const pages: Record<PersonId, PageSeen> = {};
  for (const [id, v] of Object.entries((data as { pages?: unknown }).pages ?? {})) {
    const p = v as Partial<PageSeen>;
    if (!Array.isArray(p?.items) || typeof p.look !== 'string' || !LOOKS.includes(p.look)) continue;
    pages[id] = { items: p.items.filter((x): x is string => typeof x === 'string'), look: p.look };
  }
  return { pages };
}

/** What `id`'s page showed last time, or null when it was never opened (then nothing on it is new). */
export function seenOf(id: PersonId): Readonly<PageSeen> | null {
  return loaded().pages[id] ?? null;
}

/** `id`'s page was shown with `items` and `look`. */
export function markSeen(id: PersonId, items: readonly string[], look: PageLook): void {
  loaded().pages[id] = { items: [...items], look };
  store?.save(loaded());
}

/** Whether the look went up a step since last time (the change is shown once). */
export function lookGrew(before: PageLook, now: PageLook): boolean {
  return LOOKS.indexOf(now) > LOOKS.indexOf(before);
}

