import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import { getPrize, type Prize } from './Prizes';

/**
 * The prize the player pinned at the counter as what they are playing for: its picture sits by the wallet chip and
 * fills as the tickets come in (`ui/PrizeGoalChip`), no numbers. Taking it unpins it. Persisted.
 */
export class PrizeGoal {
  private id: string | null;
  private readonly listeners = new Set<() => void>();
  private readonly store: PersistedStore<string | null>;

  constructor(storage: Storage | null = safeStorage(), key: string = KEYS.prizeGoal) {
    // Version 1: the prize's id, or null.
    this.store = new PersistedStore<string | null>({
      key, version: 1, storage, defaults: () => null, read: (data) => (typeof data === 'string' && getPrize(data)?.tickets ? data : null),
    });
    this.id = this.store.load();
  }

  /** The pinned prize, or null. */
  get prize(): Prize | null {
    return this.id ? (getPrize(this.id) ?? null) : null;
  }

  /** Pins `id` (null unpins). */
  pin(id: string | null): void {
    if (id === this.id) return;
    this.id = id;
    this.store.save(id);
    for (const cb of this.listeners) cb();
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}
