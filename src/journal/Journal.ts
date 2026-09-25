import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import { dayKey } from '@/economy/calendar';

/**
 * What an entry is about. The watchers (`journalWatch`) write the economy's; any feature may add
 * its own kind (a visitor, a market event): the panel shows unknown kinds with the plain bullet.
 */
export type JournalKind = 'bought' | 'sold' | 'wished' | 'unpacked' | 'prize' | 'medal' | 'arcade' | 'market' | 'visit' | 'event' | 'note' | (string & {});

/** A line of the day: what happened, at what time (local HH:MM), and anything a feature wants to keep with it. */
export interface JournalEntry {
  kind: JournalKind;
  text: string;
  at: string;
  data?: Readonly<Record<string, string | number | boolean>>;
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

export type JournalTotal = keyof JournalTotals;

/** One day of the journal, keyed by the local date (`calendar.dayKey`). */
export interface JournalDay {
  day: string;
  entries: JournalEntry[];
  totals: JournalTotals;
}

/** Days kept (the oldest go first), and lines per day (the first ones stay: a busy day ends "…and more"). */
const MAX_DAYS = 60;
const MAX_ENTRIES = 80;

const emptyTotals = (): JournalTotals => ({ coinsIn: 0, coinsOut: 0, ticketsIn: 0, ticketsOut: 0, gamesIn: 0, gamesOut: 0 });

/**
 * THE DAILY JOURNAL: what the player did, day by day (the real, local calendar, like the arcade's
 * challenge and streak), persisted with a capped history. `note` adds a line to today, `tally` adds
 * to today's sums; nothing else writes. The stores are watched by `watchForJournal`; any other
 * feature (the visitors, the market's events) calls `note` itself. Read by the `JournalPanel`.
 */
export class Journal {
  private days: JournalDay[];
  private readonly listeners = new Set<() => void>();
  private readonly store: PersistedStore<JournalDay[]>;

  constructor(
    storage: Storage | null = safeStorage(),
    key: string = KEYS.journal,
    private readonly now: () => Date = () => new Date(),
  ) {
    // Version 1: the days, oldest first.
    this.store = new PersistedStore<JournalDay[]>({ key, version: 1, storage, defaults: () => [], read: readDays });
    this.days = this.store.load();
  }

  /** Today's page (an empty one when nothing happened yet: not saved until something does). */
  get today(): JournalDay {
    const key = dayKey(this.now());
    return this.days.find((d) => d.day === key) ?? { day: key, entries: [], totals: emptyTotals() };
  }

  /** Every day kept, newest first. */
  get history(): readonly JournalDay[] {
    return [...this.days].reverse();
  }

  /** Adds a line to today. */
  note(kind: JournalKind, text: string, data?: JournalEntry['data']): void {
    const page = this.page();
    if (page.entries.length >= MAX_ENTRIES) return;
    const at = this.now();
    page.entries.push({ kind, text, at: `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`, ...(data ? { data } : {}) });
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
    const key = dayKey(this.now());
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

function readDays(data: unknown): JournalDay[] | null {
  if (!Array.isArray(data)) return null;
  const days: JournalDay[] = [];
  for (const raw of data) {
    if (!raw || typeof raw !== 'object') continue;
    const d = raw as Partial<JournalDay>;
    if (typeof d.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.day)) continue;
    const entries = Array.isArray(d.entries)
      ? d.entries.filter((e): e is JournalEntry => !!e && typeof e.kind === 'string' && typeof e.text === 'string' && typeof e.at === 'string').slice(0, MAX_ENTRIES)
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
