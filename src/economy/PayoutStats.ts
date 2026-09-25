import { KEYS, PersistedStore, safeStorage } from '@/persistence';

export const PAYOUT_STATS_KEY = KEYS.payoutStats;

/** What the player's plays on one machine added up to. */
export interface MachineStats {
  plays: number;
  score: number;
  tickets: number;
  /** Seconds at the controls, from the coin to the end card. */
  seconds: number;
}

/** A machine's line in the balance table: the totals and the rates that matter. */
export interface PayoutRow extends MachineStats {
  gameId: string;
  avgScore: number;
  avgTickets: number;
  ticketsPerMinute: number;
}

/**
 * The player's real plays per machine, for tuning `PAYOUT`: how many, what they scored, what they
 * paid and how long they took, persisted. `?payout` shows the table (`PayoutOverlay`); the
 * machine that pays far more tickets a minute than the others is the one to retune.
 */
export class PayoutStats {
  private state: Record<string, MachineStats>;
  private readonly listeners = new Set<() => void>();
  private readonly store: PersistedStore<Record<string, MachineStats>>;

  constructor(storage: Storage | null = safeStorage()) {
    // Version 1: totals per machine id.
    this.store = new PersistedStore<Record<string, MachineStats>>({ key: PAYOUT_STATS_KEY, version: 1, storage, defaults: () => ({}), read: readStats });
    this.state = this.store.load();
  }

  record(gameId: string, score: number, tickets: number, seconds: number): void {
    const s = this.state[gameId] ?? { plays: 0, score: 0, tickets: 0, seconds: 0 };
    this.state = { ...this.state, [gameId]: { plays: s.plays + 1, score: s.score + score, tickets: s.tickets + tickets, seconds: s.seconds + Math.max(0, seconds) } };
    this.store.save(this.state);
    for (const cb of this.listeners) cb();
  }

  /** Every machine played, the best earner first. */
  rows(): PayoutRow[] {
    return Object.entries(this.state)
      .map(([gameId, s]) => ({
        gameId,
        ...s,
        avgScore: s.plays ? s.score / s.plays : 0,
        avgTickets: s.plays ? s.tickets / s.plays : 0,
        ticketsPerMinute: s.seconds > 0 ? (s.tickets / s.seconds) * 60 : 0,
      }))
      .sort((a, b) => b.ticketsPerMinute - a.ticketsPerMinute);
  }

  clear(): void {
    this.state = {};
    this.store.remove();
    for (const cb of this.listeners) cb();
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}

function readStats(data: unknown): Record<string, MachineStats> | null {
  if (typeof data !== 'object' || data === null) return null;
  const out: Record<string, MachineStats> = {};
  for (const [id, s] of Object.entries(data as Record<string, Partial<MachineStats> | null>)) {
    if (typeof s?.plays === 'number') out[id] = { plays: s.plays, score: num(s.score), tickets: num(s.tickets), seconds: num(s.seconds) };
  }
  return out;
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
