import { JACKPOT } from './pricing';

export const JACKPOT_KEY = 'bibliothek.arcadeJackpot.v1';

/**
 * The ticket wheel's progressive jackpot, persisted: it grows with every spin anyone takes (the
 * regulars' too) and goes back to its start when someone hits it. The wheel's sign shows it.
 */
export class Jackpot {
  private tickets: number;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly storage: Storage | null = safeLocalStorage()) {
    const saved = Number(this.read());
    this.tickets = Number.isFinite(saved) && saved >= JACKPOT.start ? Math.round(saved) : JACKPOT.start;
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
    try {
      this.storage?.setItem(JACKPOT_KEY, String(tickets));
    } catch (err) {
      console.warn('[arcade] could not persist the jackpot', err);
    }
    for (const cb of this.listeners) cb();
  }

  private read(): string | null {
    try {
      return this.storage?.getItem(JACKPOT_KEY) ?? null;
    } catch {
      return null;
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
