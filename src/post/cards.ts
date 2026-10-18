import { KEYS, PersistedStore } from '@/persistence';

/*
 * Cards posted in Front Street's pillar box (docs/zones.md "The street", the post box): one card to someone a game
 * week, picked off the newsagent's rack and stamped there. Kept: to whom, which week, and the day it went (a friend
 * writes back now and then, a few days later: `post/replies`).
 */

/** A game week: seven game days. */
function gameWeek(day: number): number {
  return Math.floor(day / 7);
}

interface CardsState {
  /** The game week of the last card to each person. */
  sent: Record<string, number>;
  /** The game day of the last card to each person (cards posted before it was kept have none). */
  on: Record<string, number>;
}

function numbers(data: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof data !== 'object' || data === null) return out;
  for (const [id, n] of Object.entries(data as Record<string, unknown>)) if (typeof n === 'number' && Number.isFinite(n)) out[id] = n;
  return out;
}

const store = new PersistedStore<CardsState>({
  key: KEYS.postCards,
  version: 1,
  defaults: () => ({ sent: {}, on: {} }),
  read: (data) => {
    if (typeof data !== 'object' || data === null) return null;
    const o = data as { sent?: unknown; on?: unknown };
    return { sent: numbers(o.sent), on: numbers(o.on) };
  },
});

let state = store.load();

export const postCards = {
  /** A card went to `id` this game week already. */
  sentThisWeek(id: string, day: number): boolean {
    return state.sent[id] === gameWeek(day);
  },
  post(id: string, day: number): void {
    state = { sent: { ...state.sent, [id]: gameWeek(day) }, on: { ...state.on, [id]: day } };
    store.save(state);
  },
  /** Whether a card went into the box on game day `day`. */
  postedOn(day: number): boolean {
    return Object.values(state.on).includes(day);
  },
  /** The last card to each person and the game day it was posted. */
  lastPosted(): Readonly<Record<string, number>> {
    return state.on;
  },
};
