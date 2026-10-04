import { dayKey } from '@/economy/calendar';
import type { GameClock } from './clock';
import type { Moment, Weather } from './schedule';
import { weekdayOf, type Weekday } from './wakefulness';

/** The market's day count as `Today` reads it (see `economy/MarketCalendar`). */
interface GameCalendar {
  readonly day: number;
  subscribe(cb: (day: number) => void): () => void;
}

/** How often the real date is looked at for `onNewRealDay` (the calendar is wall-clock by definition). */
const REAL_DAY_POLL_MS = 30_000;

/**
 * The one "today" of the game, read by everything that changes from one day to the next. Two
 * clocks, and each feature says which it follows (see `time/daily` for the seeded draws, `time/schedule`
 * for what is on when):
 * - `gameDay`: the game's day count, from 1 (the market calendar: a day passes at the game clock's
 *   midnight, or on a new real date). The market's stock and themes, the mail, visits, loans,
 *   neighbours' swaps, the trader's pick, the strays round the flat. `clock` adds the hour of the game
 *   day (`clock.hours`, from the sky's clock): the one `GameClock` a feature reads instead of a closure.
 * - `realDay` / `realDate`: the player's local date. Street events, finds and tallies, the
 *   arcade's daily challenge, the wall calendar. `onNewRealDay` tells a feature the date turned while
 *   the game ran (a real-day draw taken at a zone's build follows it).
 * Made once in `bootstrap/services` (which hands it the sky's hours: `setHoursSource`) and given to the
 * builders in `BuildContext`.
 */
export class Today {
  private hoursSource: (() => number) | null = null;
  private realDayWatch: { seen: string; timer: ReturnType<typeof setInterval>; listeners: Set<(day: string) => void> } | null = null;

  /** The game clock: the day and the hour of it. */
  readonly clock: GameClock;

  constructor(private readonly calendar: GameCalendar) {
    const today = this;
    this.clock = {
      get day() {
        return today.gameDay;
      },
      get hours() {
        return today.hours;
      },
    };
  }

  /** The game's day, from 1. */
  get gameDay(): number {
    return this.calendar.day;
  }

  /** The hour of the game day (0 ≤ hours < 24), from the sky's clock; 12 until `setHoursSource` is called. */
  get hours(): number {
    return this.hoursSource?.() ?? 12;
  }

  /** Where the game's hours come from (the sky's `DayNight`): wired once at start-up. */
  setHoursSource(hours: () => number): void {
    this.hoursSource = hours;
  }

  /** The real local date as a `dayKey` (YYYY-MM-DD). */
  get realDay(): string {
    return dayKey();
  }

  /** The real local date and time now. */
  realDate(): Date {
    return new Date();
  }

  /** The day of the week, Monday 0 .. Sunday 6, of the real date or of the game day (the sale's day its Sunday). */
  weekday(kind: 'real' | 'game'): Weekday {
    return kind === 'game' ? weekdayOf(this.gameDay) : (((new Date().getDay() + 6) % 7) as Weekday);
  }

  /** The moment a schedule is judged at (`time/schedule`), with the weather as given. */
  moment(weather: Weather): Moment {
    return { date: this.realDate(), gameDay: this.gameDay, hours: this.hours, weather };
  }

  /** Calls `cb` with the new game day each time one starts; returns the unsubscribe. */
  onNewGameDay(cb: (day: number) => void): () => void {
    return this.calendar.subscribe(cb);
  }

  /**
   * Calls `cb` with the new real date (a `dayKey`) when it turns while the game runs (the player playing past
   * midnight, or a tab left open); returns the unsubscribe. The date is looked at every half minute.
   */
  onNewRealDay(cb: (day: string) => void): () => void {
    if (!this.realDayWatch) {
      const listeners = new Set<(day: string) => void>();
      const watch = {
        seen: this.realDay,
        listeners,
        // The real calendar is the wall clock's: no game clock to tick this from. // convention-ok: the real date itself
        timer: setInterval(() => {
          const now = this.realDay;
          if (now === watch.seen) return;
          watch.seen = now;
          for (const listener of [...listeners]) listener(now);
        }, REAL_DAY_POLL_MS),
      };
      this.realDayWatch = watch;
    }
    const { listeners } = this.realDayWatch;
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }
}
