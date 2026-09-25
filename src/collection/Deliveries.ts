import type { Game } from '@/catalog/types';
import type { GameSource } from './GameSource';

export const DELIVERIES_STORAGE_KEY = 'bibliothek.deliveries.v1';

/** More new games than this in one change is an import (the editor), not a purchase: they go straight onto the shelves. */
const BULK = 5;

/**
 * Games bought but not unpacked yet. It watches the collection: a game that appears in it while
 * playing (a copy off a stall, a mail order) waits in a parcel in the hallway instead of jumping
 * onto the shelves, and `unpack()` puts every waiting game away at once. `shelved` is the
 * collection minus the parcel, what the shelves show. The waiting ids persist (localStorage); a
 * game that leaves the collection (sold back) leaves the parcel too.
 */
export class Deliveries {
  /** The collection without the games still in the parcel. */
  readonly shelved: GameSource;
  private waiting: Set<string>;
  private known: Set<string>;
  private shelvedGames: readonly Game[] = [];
  private readonly listeners = new Set<() => void>();
  private readonly shelvedListeners = new Set<() => void>();

  constructor(
    private readonly collection: GameSource,
    private readonly storage: Storage | null = safeLocalStorage(),
    private readonly key = DELIVERIES_STORAGE_KEY,
  ) {
    this.known = new Set(collection.games.map((g) => g.id));
    this.waiting = new Set(this.load().filter((id) => this.known.has(id)));
    this.refilter();
    const self = this;
    this.shelved = {
      get games() {
        return self.shelvedGames;
      },
      subscribe: (cb) => {
        this.shelvedListeners.add(cb);
        return () => this.shelvedListeners.delete(cb);
      },
    };
    collection.subscribe(() => this.onCollectionChange());
  }

  /** The games in the parcel, in the order they were bought. */
  get pending(): Game[] {
    return this.collection.games.filter((g) => this.waiting.has(g.id));
  }

  get count(): number {
    return this.waiting.size;
  }

  isPending(id: string): boolean {
    return this.waiting.has(id);
  }

  /** Empties the parcel onto the shelves; returns what was in it. */
  unpack(): Game[] {
    const games = this.pending;
    if (!games.length) return games;
    this.waiting.clear();
    this.commit();
    return games;
  }

  /** Fires when the parcel's contents change. */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private onCollectionChange(): void {
    const ids = new Set(this.collection.games.map((g) => g.id));
    const arrived = [...ids].filter((id) => !this.known.has(id));
    this.known = ids;
    if (arrived.length <= BULK) for (const id of arrived) this.waiting.add(id);
    for (const id of this.waiting) if (!ids.has(id)) this.waiting.delete(id);
    this.commit();
  }

  private commit(): void {
    this.save();
    this.refilter();
    for (const cb of [...this.listeners]) cb();
    for (const cb of [...this.shelvedListeners]) cb();
  }

  private refilter(): void {
    this.shelvedGames = this.collection.games.filter((g) => !this.waiting.has(g.id));
  }

  private load(): string[] {
    try {
      const raw = this.storage?.getItem(this.key);
      const ids: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  }

  private save(): void {
    try {
      this.storage?.setItem(this.key, JSON.stringify([...this.waiting]));
    } catch {
      // storage full or blocked: the parcel just does not survive a reload
    }
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
