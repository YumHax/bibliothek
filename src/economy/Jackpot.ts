import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import { JACKPOT } from './pricing';

export const JACKPOT_KEY = KEYS.arcadeJackpot;

/**
 * The ticket wheel's progressive jackpot, persisted: it grows with every spin anyone takes (the
 * regulars' too) and goes back to its start when someone hits it. The wheel's sign shows it.
 */
export class Jackpot {
  private tickets: number;
  private readonly listeners = new Set<() => void>();
  private readonly store: PersistedStore<number>;

  constructor(storage: Storage | null = safeStorage()) {
    // Version 1: the pot, a number.
    this.store = new PersistedStore<number>({
      key: JACKPOT_KEY,
      version: 1,
      storage,
      defaults: () => JACKPOT.start,
      read: (data) => (typeof data === 'number' && Number.isFinite(data) ? Math.max(JACKPOT.start, Math.round(data)) : null),
    });
    this.tickets = this.store.load();
  }

  get value(): number {
    return this.tickets;
  }

  /** A spin was paid for: the pot grows. */
  grow(): void {
    this.set(this.tickets + JACKPOT.perSpin);
  }

  /** Someone hit it: what it paid; it starts again. */
  hit(): number {
    const won = this.tickets;
    this.set(JACKPOT.start);
    return won;
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private set(tickets: number): void {
    this.tickets = tickets;
    this.store.save(tickets);
    for (const cb of this.listeners) cb();
  }
}
