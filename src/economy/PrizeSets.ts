import { KEYS, PersistedStore, batch, safeStorage } from '@/persistence';
import { PRIZE_SETS, type PrizeSet } from './Prizes';

/**
 * The prize sets already paid for (`Prizes.PRIZE_SETS`: every claw bunny, the whole glass case, every limited edition):
 * a set all at home pays its tickets once, the moment it is complete. Persisted.
 */
export class PrizeSets {
  private paid: readonly string[];
  private readonly store: PersistedStore<readonly string[]>;

  constructor(storage: Storage | null = safeStorage(), key: string = KEYS.prizeSets) {
    // Version 1: the ids of the sets paid.
    this.store = new PersistedStore<readonly string[]>({
      key, version: 1, storage, defaults: () => [], read: (data) => (Array.isArray(data) ? data.filter((id): id is string => typeof id === 'string') : null),
    });
    this.paid = this.store.load();
  }

  /**
   * Pays every set now complete and not yet paid into `wallet` (its tickets), and returns them; with none, an empty list.
   * The tickets and the record land in one save.
   */
  claim(prizes: { owns(id: string): boolean }, wallet: { addTickets(tickets: number): void }): PrizeSet[] {
    const done = PRIZE_SETS.filter((set) => !this.paid.includes(set.id) && set.ids.every((id) => prizes.owns(id)));
    if (!done.length) return [];
    batch(() => {
      this.paid = [...this.paid, ...done.map((set) => set.id)];
      this.store.save(this.paid);
      for (const set of done) wallet.addTickets(set.tickets);
    });
    return done;
  }
}
