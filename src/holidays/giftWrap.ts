import { KEYS, PersistedStore } from '@/persistence';

/*
 * Games wrapped at the Christmas stall on Front Street (docs/zones.md "The street", the holidays): a game of the
 * collection in paper and ribbon, waiting to be given to someone. Given wrapped, it means more to them
 * (`social/gifts.giftWarmth`, `WRAPPED_GIFT`); once given (or no longer the player's) it is forgotten.
 */

/** Games wrapped at most at once: the stall's paper is not endless. */
export const WRAPPED_MAX = 6;

const store = new PersistedStore<{ ids: string[] }>({
  key: KEYS.giftWrap,
  version: 1,
  defaults: () => ({ ids: [] }),
  read: (data) => {
    if (typeof data !== 'object' || data === null) return null;
    const ids = (data as { ids?: unknown }).ids;
    return { ids: Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string').slice(-WRAPPED_MAX) : [] };
  },
});

let ids = store.load().ids;
const listeners = new Set<() => void>();

function commit(next: string[]): void {
  ids = next;
  store.save({ ids });
  for (const listener of listeners) listener();
}

export const giftWrap = {
  isWrapped(id: string): boolean {
    return ids.includes(id);
  },
  /** How many are wrapped and waiting. */
  get count(): number {
    return ids.length;
  },
  wrap(id: string): void {
    if (!ids.includes(id)) commit([...ids, id].slice(-WRAPPED_MAX));
  },
  /** Given away (or gone from the collection): the paper goes with it. */
  unwrap(id: string): void {
    if (ids.includes(id)) commit(ids.filter((i) => i !== id));
  },
  /** Forgets the paper of every wrapped game no longer the player's (sold, traded, given): `owns` says which stay. */
  prune(owns: (id: string) => boolean): void {
    const kept = ids.filter(owns);
    if (kept.length !== ids.length) commit(kept);
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
