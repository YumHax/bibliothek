export const CALENDAR_STORAGE_KEY = 'bibliothek.calendar.v1';

interface CalendarFile {
  day: number;
  /** The real date (YYYY-MM-DD) the count was last saved on. */
  date: string;
}

/** The in-game clock, as far as the calendar cares. */
export interface ClockLike {
  onChange(listener: (state: { hours: number }) => void): () => void;
}

/**
 * Counts in-game days: the market restocks each morning of the game's clock (a day is ten real
 * minutes), not once a real day. A day passes when the clock runs through midnight (jumping the
 * clock with the night toggle does not count), and when the player comes back on another real
 * date. Persisted, so the stock, the haggles and the consignments stay put across reloads.
 */
export class MarketCalendar {
  private state: CalendarFile;
  private lastHours: number | null = null;
  private readonly listeners = new Set<(day: number) => void>();

  constructor(
    clock: ClockLike,
    private readonly storage: Storage | null = safeLocalStorage(),
    private readonly key = CALENDAR_STORAGE_KEY,
    private readonly today: () => string = () => new Date().toISOString().slice(0, 10),
  ) {
    const saved = this.load();
    const date = this.today();
    this.state = saved ? { day: saved.day + (saved.date === date ? 0 : 1), date } : { day: 1, date };
    this.save();
    clock.onChange(({ hours }) => this.tick(hours));
  }

  /** Today's market day, from 1. */
  get day(): number {
    return this.state.day;
  }

  /** Called with the new day each time one starts. Returns the unsubscribe. */
  subscribe(cb: (day: number) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private tick(hours: number): void {
    const last = this.lastHours;
    this.lastHours = hours;
    // Midnight crossed going forward: late evening to early morning in one step (a jump back to the afternoon is not a day).
    if (last === null || last - hours < 12) return;
    this.state = { day: this.state.day + 1, date: this.today() };
    this.save();
    for (const cb of this.listeners) cb(this.state.day);
  }

  private save(): void {
    try {
      this.storage?.setItem(this.key, JSON.stringify(this.state));
    } catch (err) {
      console.warn('[calendar] could not persist', err);
    }
  }

  private load(): CalendarFile | null {
    const text = this.storage?.getItem(this.key);
    if (!text) return null;
    try {
      const file = JSON.parse(text) as Partial<CalendarFile>;
      if (typeof file.day !== 'number' || typeof file.date !== 'string') return null;
      return { day: Math.max(1, Math.floor(file.day)), date: file.date };
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
