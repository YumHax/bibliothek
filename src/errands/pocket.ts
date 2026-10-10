import { dayKey } from '@/economy/calendar';
import { KEYS, PersistedStore } from '@/persistence';
import type { ErrandId } from './errands';

const IDS: readonly ErrandId[] = ['croissant', 'scrap', 'treats', 'bunch'];

interface PocketState {
  /** What is carried, by errand. */
  held: Partial<Record<ErrandId, number>>;
  /** The day `bought` counts: the game day (`g12`), or a real `dayKey` from before the limits followed the game's days. */
  day: string;
  /** Buys today, by what was bought (the errands and the bar's lemonade). */
  bought: Record<string, number>;
}

const store = new PersistedStore<PocketState>({
  key: KEYS.pocket,
  version: 1,
  defaults: () => ({ held: {}, day: '', bought: {} }),
  read: (data) => {
    if (typeof data !== 'object' || data === null) return null;
    const o = data as Partial<PocketState>;
    const held: Partial<Record<ErrandId, number>> = {};
    for (const id of IDS) {
      const n = (o.held as Record<string, unknown> | undefined)?.[id];
      if (typeof n === 'number' && Number.isFinite(n) && n > 0) held[id] = Math.floor(n);
    }
    const bought: Record<string, number> = {};
    for (const [k, n] of Object.entries(o.bought ?? {})) if (typeof n === 'number' && Number.isFinite(n)) bought[k] = n;
    return { held, day: typeof o.day === 'string' ? o.day : '', bought };
  },
});

let state: PocketState = store.load();
const listeners = new Set<() => void>();
/** Today's mark for the shops' daily limits: the real date until `followGameDay` (then the game day, `g12`). */
let todayMark: () => string = () => dayKey();

function save(): void {
  store.save(state);
  for (const cb of listeners) cb();
}

/**
 * What the player carries from Front Street's counters (`errands.ts`), kept across reloads: a croissant, a scrap for
 * the stray, the pet shop's treats, the florist's bunches; and how many of each (and lemonades) were bought today, for
 * the shops' daily limits. One pocket for the whole game.
 */
export const pocket = {
  count(id: ErrandId): number {
    return state.held[id] ?? 0;
  },
  /** Puts `n` of `id` in the pocket, never more than `max`. */
  add(id: ErrandId, n: number, max: number): void {
    state = { ...state, held: { ...state.held, [id]: Math.min(max, this.count(id) + n) } };
    save();
  },
  /** Takes one of the first of `ids` carried; returns which, or null when none is. */
  take(...ids: ErrandId[]): ErrandId | null {
    const id = ids.find((i) => this.count(i) > 0);
    if (!id) return null;
    state = { ...state, held: { ...state.held, [id]: this.count(id) - 1 } };
    save();
    return id;
  },
  /** How many of `what` were bought today (an errand's id, or another counter's: 'lemonade'). */
  boughtToday(what: string): number {
    return state.day === todayMark() ? state.bought[what] ?? 0 : 0;
  },
  recordBuy(what: string): void {
    const today = todayMark();
    const bought = state.day === today ? { ...state.bought } : {};
    bought[what] = (bought[what] ?? 0) + 1;
    state = { ...state, day: today, bought };
    save();
  },
  /** The shops' daily limits follow the game's days (`Today.gameDay`, wired once in `bootstrap/services`), like the market's. */
  followGameDay(day: () => number): void {
    todayMark = () => `g${day()}`;
  },
  subscribe(cb: () => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
};
