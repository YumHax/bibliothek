import type { Game } from '@/catalog/types';
import { canonicalGameId } from '@/catalog';
import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import type { GameSource } from './GameSource';

export const DELIVERIES_STORAGE_KEY = KEYS.deliveries;

/** For a source that does not say what its changes are: more new games than this in one change is an import (the editor), not a purchase. */
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
  private readonly store: PersistedStore<string[]>;
  /** Whether a waiting game is still in the post (`setInPost`). */
  private inPost: (id: string) => boolean = () => false;

  constructor(
    private readonly collection: GameSource,
    storage: Storage | null = safeStorage(),
    key: string = DELIVERIES_STORAGE_KEY,
  ) {
    // Version 1: the waiting ids, an array (old seed ids mapped on read).
    this.store = new PersistedStore<string[]>({ key, version: 1, storage, defaults: () => [], read: readIds });
    this.known = new Set(collection.games.map((g) => g.id));
    this.waiting = new Set(this.store.load().filter((id) => this.known.has(id)));
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

  /** The games in the parcel, in the order they were bought (not those still in the post). */
  get pending(): Game[] {
    return this.collection.games.filter((g) => this.waiting.has(g.id) && !this.inPost(g.id));
  }

  get count(): number {
    let n = 0;
    for (const id of this.waiting) if (!this.inPost(id)) n++;
    return n;
  }

  /** Not on the shelves yet: in the parcel, or still in the post. */
  isPending(id: string): boolean {
    return this.waiting.has(id);
  }

  /**
   * Games still on their way (a mail order the postman has not brought, `MailPost`): off the
   * shelves like the parcel's, but not in it yet. Call `postChanged()` when the answer changes.
   */
  setInPost(test: (id: string) => boolean): void {
    this.inPost = test;
    this.commit();
  }

  /** Something came out of the post: the parcel shows it now. */
  postChanged(): void {
    this.commit();
  }

  /** Empties the parcel onto the shelves; returns what was in it (what is still in the post stays waiting). */
  unpack(): Game[] {
    const games = this.pending;
    if (!games.length) return games;
    for (const game of games) this.waiting.delete(game.id);
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
    const imported = this.collection.lastChange === undefined ? arrived.length > BULK : this.collection.lastChange === 'import';
    if (!imported) for (const id of arrived) this.waiting.add(id);
    for (const id of this.waiting) if (!ids.has(id)) this.waiting.delete(id);
    this.commit();
  }

  private commit(): void {
    this.store.save([...this.waiting]);
    this.refilter();
    for (const cb of [...this.listeners]) cb();
    for (const cb of [...this.shelvedListeners]) cb();
  }

  private refilter(): void {
    this.shelvedGames = this.collection.games.filter((g) => !this.waiting.has(g.id));
  }
}

function readIds(data: unknown): string[] | null {
  if (!Array.isArray(data)) return null;
  return data.filter((id): id is string => typeof id === 'string').map(canonicalGameId);
}
