import { dayKey } from '@/economy/calendar';

/** The market's day count as `Today` reads it (see `economy/MarketCalendar`). */
export interface GameCalendar {
  readonly day: number;
  subscribe(cb: (day: number) => void): () => void;
}

/**
 * The one "today" of the game, read by everything that changes from one day to the next. Two
 * clocks, and each feature says which it follows (see `time/daily` for the seeded draws):
 * - `gameDay`: the game's day count, from 1 (the market calendar: a day passes at the game clock's
 *   midnight, or on a new real date). The market's stock and themes, the mail, visits, loans,
 *   neighbours' swaps, the trader's pick, the strays round the flat.
 * - `realDay` / `realDate`: the player's local date. Street events, finds and tallies, the
 *   arcade's daily challenge, the wall calendar.
 * Made once in `bootstrap/services` and handed to the builders in `BuildContext`.
 */
export class Today {
  constructor(private readonly calendar: GameCalendar) {}

  /** The game's day, from 1. */
  get gameDay(): number {
    return this.calendar.day;
  }

  /** The real local date as a `dayKey` (YYYY-MM-DD). */
  get realDay(): string {
    return dayKey();
  }

  /** The real local date and time now. */
  realDate(): Date {
    return new Date();
  }

  /** Calls `cb` with the new game day each time one starts; returns the unsubscribe. */
  onNewGameDay(cb: (day: number) => void): () => void {
    return this.calendar.subscribe(cb);
  }
}
