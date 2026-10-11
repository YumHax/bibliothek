import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import { JACKPOT } from './pricing';

const JACKPOT_KEY = KEYS.arcadeJackpot;

interface JackpotFile {
  /** The pot. */
  tickets: number;
  /** Times the player hit it (the collector's book counts them). */
  hits: number;
}

/**
 * The ticket wheel's progressive jackpot, persisted: it grows with every spin anyone takes (the
 * regulars' too) and goes back to its start when someone hits it. The wheel's sign shows it; past
 * `JACKPOT.news` the attendant and the street's bills talk about it.
 */
export class Jackpot {
  private state: JackpotFile;
  private readonly listeners = new Set<() => void>();
  private readonly store: PersistedStore<JackpotFile>;

  constructor(storage: Storage | null = safeStorage()) {
    // Version 1: the pot, a number. Version 2: `{ tickets, hits }`.
    this.store = new PersistedStore<JackpotFile>({
      key: JACKPOT_KEY,
      version: 2,
      storage,
      defaults: () => ({ tickets: JACKPOT.start, hits: 0 }),
      read: readJackpot,
      migrate: { 1: (data) => ({ tickets: data, hits: 0 }) },
    });
    this.state = this.store.load();
  }

  get value(): number {
    return this.state.tickets;
  }

  /** Times the player hit it. */
  get hits(): number {
    return this.state.hits;
  }

  /** Whether the pot is big enough to be talked about. */
  get newsworthy(): boolean {
    return this.state.tickets >= JACKPOT.news;
  }

  /** A spin was paid for: the pot grows. */
  grow(): void {
    this.set({ ...this.state, tickets: this.state.tickets + JACKPOT.perSpin });
  }

  /** Someone hit it: what it paid; it starts again. `byPlayer` counts it in the player's book. */
  hit(byPlayer = true): number {
    const won = this.state.tickets;
    this.set({ tickets: JACKPOT.start, hits: this.state.hits + (byPlayer ? 1 : 0) });
    return won;
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private set(state: JackpotFile): void {
    this.state = state;
    this.store.save(state);
    for (const cb of this.listeners) cb();
  }
}

function readJackpot(data: unknown): JackpotFile | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Partial<JackpotFile>;
  const tickets = typeof d.tickets === 'number' && Number.isFinite(d.tickets) ? Math.max(JACKPOT.start, Math.round(d.tickets)) : JACKPOT.start;
  const hits = typeof d.hits === 'number' && Number.isFinite(d.hits) ? Math.max(0, Math.floor(d.hits)) : 0;
  return { tickets, hits };
}
