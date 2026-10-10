import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import { dayKey } from '@/economy/calendar';
import { formatClock } from '@/text/clock';

/**
 * What an entry is about. The watchers (`journalWatch`) write the economy's (a game a friend gave is a
 * `gift`); the visitors write `visit` (who came round, loans out and back), the household `home` (a box
 * cleaned, a cake baked, what the cat turned up); any feature may add its own kind: the panel shows
 * unknown kinds with the plain bullet.
 */
export type JournalKind = 'bought' | 'gift' | 'sold' | 'wished' | 'unpacked' | 'prize' | 'medal' | 'arcade' | 'market' | 'visit' | 'home' | 'event' | 'note' | (string & {});

/**
 * How much a line weighs on the page: a `headline` (a game come home, a milestone, a story stage) is set large; a
 * `line` (bought, a visit, a tier crossed) is the page's ordinary hand; a `note` (a chore done, a favour in progress,
 * the day's first arcade play) folds under "and the small things". Default `line`.
 */
export type JournalWeight = 'headline' | 'line' | 'note';

/** A line of the day: what happened, at what time (the game clock's HH:MM), its weight, and anything a feature wants to keep with it. */
export interface JournalEntry {
  kind: JournalKind;
  text: string;
  at: string;
  weight?: JournalWeight;
  data?: Readonly<Record<string, string | number | boolean>>;
}

/** What `note` may keep with a line besides its text. */
interface NoteOptions {
  weight?: JournalWeight;
  data?: JournalEntry['data'];
}

/** Where the reading stopped: the page (its day key) and how many of its lines were read. */
export interface ReadMark {
  day: string;
  count: number;
}

/** The day's running sums: coins in and out, tickets won and spent, games in and out of the collection. */
export interface JournalTotals {
  coinsIn: number;
  coinsOut: number;
  ticketsIn: number;
  ticketsOut: number;
  gamesIn: number;
  gamesOut: number;
}

type JournalTotal = keyof JournalTotals;

/**
 * One day of the journal, keyed by the game's day (`day-00012`, see `gameDayKey`) once the game clock
 * is wired (`setClock`); pages written before that were keyed by the local date (`2026-09-25`).
 */
export interface JournalDay {
  day: string;
  entries: JournalEntry[];
  totals: JournalTotals;
}

/** Days kept (the oldest go first), and lines per day (the first ones stay: a busy day ends on one line counting the rest, "…and 3 more"). */
const MAX_DAYS = 60;
const MAX_ENTRIES = 80;

/** The key of game day `day`: zero-padded so the keys sort in day order. */
const gameDayKey = (day: number): string => `day-${String(Math.max(1, Math.floor(day))).padStart(5, '0')}`;

/** The game day a key names, or null for a page keyed by a real date (older saves). */
export function gameDayOf(key: string): number | null {
  const match = /^day-(\d+)$/.exec(key);
  return match ? Number(match[1]) : null;
}

/** The game's clock as the journal reads it: the day count (a night's sleep starts the next) and the hour. */
interface JournalClock {
  day(): number;
  /** Hours since midnight on the game clock, fractional. */
  hours(): number;
}

const emptyTotals = (): JournalTotals => ({ coinsIn: 0, coinsOut: 0, ticketsIn: 0, ticketsOut: 0, gamesIn: 0, gamesOut: 0 });

/**
 * THE DAILY JOURNAL: what the player did, day by day of the game's calendar (a night's sleep turns
 * the page), stamped with the game clock's time, persisted with a capped history. `note` adds a line to today, `tally` adds
 * to today's sums; nothing else writes. The stores are watched by `watchForJournal`; any other
 * feature (the visitors, the market's events) calls `note` itself. Read by the `JournalPanel`.
 */
export class Journal {
  private days: JournalDay[];
  private readonly listeners = new Set<() => void>();
  private readonly store: PersistedStore<JournalDay[]>;
  private readonly readStore: PersistedStore<ReadMark | null>;
  private mark: ReadMark | null;
  private clock: JournalClock | null = null;

  constructor(
    storage: Storage | null = safeStorage(),
    key: string = KEYS.journal,
    private readonly now: () => Date = () => new Date(),
  ) {
    // Version 1: the days, oldest first.
    this.store = new PersistedStore<JournalDay[]>({ key, version: 1, storage, defaults: () => [], read: readDays });
    this.days = this.store.load();
    this.readStore = new PersistedStore<ReadMark | null>({ key: key === KEYS.journal ? KEYS.journalRead : `${key}:read`, version: 1, storage, defaults: () => null, read: readMark });
    this.mark = this.readStore.load();
  }

  /** Where the reading stopped (`markRead`), or null when the journal was never opened. */
  get readMark(): ReadMark | null {
    return this.mark;
  }

  /** Lines written since the journal was last read: the notebook's caption and the menu say so. */
  get unread(): number {
    const mark = this.mark;
    let count = 0;
    for (const day of this.days) {
      if (mark && day.day < mark.day) continue;
      count += mark && day.day === mark.day ? Math.max(0, day.entries.length - mark.count) : day.entries.length;
    }
    return count;
  }

  /** The journal was opened: everything written so far is read. */
  markRead(): void {
    const last = this.days[this.days.length - 1];
    const mark: ReadMark = last ? { day: last.day, count: last.entries.length } : { day: this.todayKey(), count: 0 };
    if (this.mark && this.mark.day === mark.day && this.mark.count === mark.count) return;
    this.mark = mark;
    this.readStore.save(mark);
    for (const cb of [...this.listeners]) cb();
  }

  /** Follows the game's clock from now on (the day and the time of each line): `bootstrap/ui` wires the sky. */
  setClock(clock: JournalClock): void {
    this.clock = clock;
  }

  /** Today's key: the game day once the clock is wired, else the local date. */
  private todayKey(): string {
    return this.clock ? gameDayKey(this.clock.day()) : dayKey(this.now());
  }

  /** The time on the game clock (else the real one), as HH:MM. */
  private stamp(): string {
    if (this.clock) return formatClock(this.clock.hours());
    const at = this.now();
    return formatClock(at.getHours() + at.getMinutes() / 60);
  }

  /** Today's page (an empty one when nothing happened yet: not saved until something does). */
  get today(): JournalDay {
    const key = this.todayKey();
    return this.days.find((d) => d.day === key) ?? { day: key, entries: [], totals: emptyTotals() };
  }

  /** Every day kept, newest first. */
  get history(): readonly JournalDay[] {
    return [...this.days].reverse();
  }

  /** Adds a line to today, an ordinary `line` unless `weight` says otherwise. */
  note(kind: JournalKind, text: string, options: NoteOptions = {}): void {
    const page = this.page();
    if (page.entries.length >= MAX_ENTRIES) {
      // The page is full: one closing line counts what came after, so a busy day says so rather than losing it in silence.
      const over = page.entries[MAX_ENTRIES];
      const more = (typeof over?.data?.more === 'number' ? over.data.more : 0) + 1;
      page.entries[MAX_ENTRIES] = { kind: 'note', text: `…and ${more} more`, at: over?.at ?? this.stamp(), weight: 'note', data: { more } };
      this.commit();
      return;
    }
    const { weight, data } = options;
    page.entries.push({ kind, text, at: this.stamp(), ...(weight && weight !== 'line' ? { weight } : {}), ...(data ? { data } : {}) });
    this.commit();
  }

  /** Adds `amount` (> 0) to one of today's sums. */
  tally(total: JournalTotal, amount: number): void {
    if (!(amount > 0)) return;
    this.page().totals[total] += Math.round(amount);
    this.commit();
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Today's page, created (and the oldest dropped) when it is the day's first write. */
  private page(): JournalDay {
    const key = this.todayKey();
    let page = this.days.find((d) => d.day === key);
    if (!page) {
      page = { day: key, entries: [], totals: emptyTotals() };
      this.days.push(page);
      this.days.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
      while (this.days.length > MAX_DAYS) this.days.shift();
    }
    return page;
  }

  private commit(): void {
    this.store.save(this.days);
    for (const cb of [...this.listeners]) cb();
  }
}

function readMark(data: unknown): ReadMark | null {
  const d = data as Partial<ReadMark> | null;
  return d && typeof d.day === 'string' && typeof d.count === 'number' && d.count >= 0 ? { day: d.day, count: Math.floor(d.count) } : null;
}

const WEIGHTS: readonly JournalWeight[] = ['headline', 'line', 'note'];

function readDays(data: unknown): JournalDay[] | null {
  if (!Array.isArray(data)) return null;
  const days: JournalDay[] = [];
  for (const raw of data) {
    if (!raw || typeof raw !== 'object') continue;
    const d = raw as Partial<JournalDay>;
    if (typeof d.day !== 'string' || !/^(\d{4}-\d{2}-\d{2}|day-\d+)$/.test(d.day)) continue;
    const entries = Array.isArray(d.entries)
      ? d.entries
          .filter((e): e is JournalEntry => !!e && typeof e.kind === 'string' && typeof e.text === 'string' && typeof e.at === 'string')
          .map((e) => (e.weight && !WEIGHTS.includes(e.weight) ? { ...e, weight: undefined } : e))
          .slice(0, MAX_ENTRIES + 1)
      : [];
    const totals = emptyTotals();
    if (d.totals && typeof d.totals === 'object') for (const k of Object.keys(totals) as JournalTotal[]) {
      const v = (d.totals as Partial<JournalTotals>)[k];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) totals[k] = v;
    }
    days.push({ day: d.day, entries, totals });
  }
  return days.slice(-MAX_DAYS);
}
