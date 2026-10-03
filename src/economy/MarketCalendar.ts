import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import { dayKey, fromUtcDayKey } from './calendar';

export const CALENDAR_STORAGE_KEY = KEYS.calendar;

interface CalendarFile {
  day: number;
  /** The real local date (YYYY-MM-DD, `dayKey`) the count was last saved on; version 1 saved the UTC date. */
  date: string;
  /** The game clock's hour when last saved: a reload the same real day picks the day up where it was left. */
  hours?: number;
}

/** The clock's hour is saved when it has moved this much (game hours: about six real seconds). */
const SAVE_HOURS_STEP = 0.25;

/** The in-game clock, as far as the calendar cares. */
export interface ClockLike {
  onChange(listener: (state: { hours: number }) => void): () => void;
}

/**
 * Counts in-game days: the market restocks each morning of the game's clock (a day is ten real
 * minutes), not once a real day. A day passes when the clock runs through midnight (jumping the
 * clock with the night toggle does not count), and when the player comes back on another real
 * date. Persisted, so the stock, the haggles and the consignments stay put across reloads; so is
 * the clock's hour (`savedHours`), so a reload does not bring the morning back.
 */
export class MarketCalendar {
  /**
   * The hour the game clock stood at when last saved, when that was on today's real date (a new real date starts
   * a new day, in the morning); null with nothing saved. Read before the clock is made, to start it there.
   */
  static savedHours(storage: Storage | null = safeStorage(), key: string = CALENDAR_STORAGE_KEY, today: string = dayKey()): number | null {
    const saved = new PersistedStore<CalendarFile | null>({ key, version: 2, storage, defaults: () => null, read: readCalendar }).tryLoad();
    return saved && saved.date === today && saved.hours !== undefined ? saved.hours : null;
  }

  /**
   * The market day the calendar will open on (the saved count, a day on if the real date moved on; 1 with nothing
   * saved): for what is painted before the calendar is made (the window view's roadworks, `syncWorks`).
   */
  static savedDay(storage: Storage | null = safeStorage(), key: string = CALENDAR_STORAGE_KEY, today: string = dayKey()): number {
    const saved = new PersistedStore<CalendarFile | null>({ key, version: 2, storage, defaults: () => null, read: readCalendar }).tryLoad();
    return saved ? saved.day + (saved.date === today ? 0 : 1) : 1;
  }

  private state: CalendarFile;
  private lastHours: number | null = null;
  private readonly listeners = new Set<(day: number) => void>();
  private readonly store: PersistedStore<CalendarFile | null>;

  constructor(
    clock: ClockLike,
    storage: Storage | null = safeStorage(),
    key: string = CALENDAR_STORAGE_KEY,
    private readonly today: () => string = () => dayKey(),
  ) {
    // Version 2: local dates. Version 1 saved the UTC date: today's UTC date reads as today (no extra market day).
    this.store = new PersistedStore<CalendarFile | null>({
      key,
      version: 2,
      storage,
      defaults: () => null,
      read: readCalendar,
      migrate: { 1: (data) => {
        const file = readCalendar(data);
        return file ? { ...file, date: fromUtcDayKey(file.date) } : data;
      } },
    });
    const saved = this.store.load();
    const date = this.today();
    this.state = saved ? { day: saved.day + (saved.date === date ? 0 : 1), date, ...(saved.date === date && saved.hours !== undefined ? { hours: saved.hours } : {}) } : { day: 1, date };
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
    if (last === null || last - hours < 12) {
      const saved = this.state.hours;
      if (saved === undefined || Math.abs(hours - saved) >= SAVE_HOURS_STEP) {
        this.state = { ...this.state, hours };
        this.save();
      }
      return;
    }
    this.state = { day: this.state.day + 1, date: this.today(), hours };
    this.save();
    for (const cb of this.listeners) cb(this.state.day);
  }

  private save(): void {
    this.store.save(this.state);
  }
}

function readCalendar(data: unknown): CalendarFile | null {
  const file = data as Partial<CalendarFile> | null;
  if (typeof file !== 'object' || file === null || typeof file.day !== 'number' || typeof file.date !== 'string') return null;
  const hours = typeof file.hours === 'number' && Number.isFinite(file.hours) ? ((file.hours % 24) + 24) % 24 : undefined;
  return { day: Math.max(1, Math.floor(file.day)), date: file.date, ...(hours !== undefined ? { hours } : {}) };
}
