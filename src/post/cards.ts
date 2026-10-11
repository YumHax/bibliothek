import { KEYS, PersistedStore } from '@/persistence';

/*
 * Cards posted in Front Street's pillar box (docs/zones.md "The street", the post box): one card to someone a game
 * week, picked off the newsagent's rack and stamped there. Kept: to whom, which week.
 */

/** A game week: seven game days. */
function gameWeek(day: number): number {
  return Math.floor(day / 7);
}

const store = new PersistedStore<{ sent: Record<string, number> }>({
  key: KEYS.postCards,
  version: 1,
  defaults: () => ({ sent: {} }),
  read: (data) => {
    if (typeof data !== 'object' || data === null) return null;
    const sent: Record<string, number> = {};
    for (const [id, week] of Object.entries((data as { sent?: Record<string, unknown> }).sent ?? {})) if (typeof week === 'number') sent[id] = week;
    return { sent };
  },
});

let sent = store.load().sent;

export const postCards = {
  /** A card went to `id` this game week already. */
  sentThisWeek(id: string, day: number): boolean {
    return sent[id] === gameWeek(day);
  },
  post(id: string, day: number): void {
    sent = { ...sent, [id]: gameWeek(day) };
    store.save({ sent });
  },
};
