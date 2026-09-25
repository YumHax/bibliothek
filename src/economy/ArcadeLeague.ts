import { KEYS, PersistedStore } from '@/persistence';
import { addDays, dayKey, isoWeek, weekProgress } from './calendar';
import { LEAGUE, STREAK } from './pricing';
import { REGULARS } from './rivals';
import { seeded } from './seeded';

export const ARCADE_LEAGUE_KEY = KEYS.arcadeLeague;

/** One line of the league table. */
export interface LeagueEntry {
  name: string;
  tickets: number;
  you?: boolean;
}

/** How a finished week went for the player, handed over once (`takeWeekResult`). */
export interface WeekResult {
  week: string;
  tickets: number;
  /** 0-based place on the final table. */
  rank: number;
  won: boolean;
}

/** What one ticket play did to the streak: the day's streak and the bonus it paid (0 after the first play of the day). */
export interface StreakNews {
  days: number;
  bonus: number;
}

interface LeagueFile {
  /** ISO week (YYYY-Www) the tickets count for. */
  week: string;
  tickets: number;
  /** Local date (YYYY-MM-DD) of the last ticket play, and how many days in a row it has been. */
  lastPlayDay?: string;
  streak: number;
  /** Last week's result, until the Session has announced it. */
  pending?: WeekResult;
  /** Weeks won in all. */
  pennants: number;
}

export interface ArcadeLeagueOptions {
  storage?: Storage | null;
  /** Now; injectable for a fixed time. */
  now?: () => Date;
}

/**
 * Two reasons to come back: the **weekly league** (the tickets won at the arcade from Monday to
 * Sunday, on a table with five regulars whose totals grow through the week from a base drawn per
 * week, the same for everyone; first place on Sunday night wins the league pennant) and the
 * **streak** (days in a row with at least one ticket play; the first play of each day pays a
 * bonus per day of it, see `STREAK`). Persisted; the Session calls `record` after every ticket
 * play and `takeWeekResult` to announce a finished week; the league board reads `standings`.
 */
export class ArcadeLeague {
  private state: LeagueFile;
  private readonly store: PersistedStore<LeagueFile>;
  private readonly now: () => Date;
  private readonly listeners = new Set<() => void>();

  constructor(options: ArcadeLeagueOptions = {}) {
    this.now = options.now ?? (() => new Date());
    // Version 1: the week's count, the streak (local dates), the pennants.
    this.store = new PersistedStore<LeagueFile>({
      key: ARCADE_LEAGUE_KEY,
      version: 1,
      storage: options.storage,
      defaults: () => ({ week: isoWeek(this.now()), tickets: 0, streak: 0, pennants: 0 }),
      read: readLeague,
    });
    this.state = this.store.load();
    this.rollOver();
  }

  /** The player's tickets this week. */
  get tickets(): number {
    this.rollOver();
    return this.state.tickets;
  }

  /** Days in a row with a ticket play, today included if played; 0 once a day has been missed. */
  get streakDays(): number {
    const today = dayKey(this.now());
    const yesterday = dayKey(addDays(this.now(), -1));
    return this.state.lastPlayDay === today || this.state.lastPlayDay === yesterday ? this.state.streak : 0;
  }

  /** Whether today's first play (and its streak bonus) is still to come. */
  get playedToday(): boolean {
    return this.state.lastPlayDay === dayKey(this.now());
  }

  /** What the first ticket play of the next day that continues the streak pays. */
  get nextStreakBonus(): number {
    const days = this.playedToday ? this.state.streak + 1 : this.streakDays + 1;
    return streakBonus(days);
  }

  get pennants(): number {
    return this.state.pennants;
  }

  /** The week's number (ISO) and how many days are left in it, for the board. */
  get week(): { label: string; daysLeft: number } {
    const now = this.now();
    const day = (now.getDay() + 6) % 7; // Monday 0
    return { label: isoWeek(now).slice(5), daysLeft: 6 - day };
  }

  /** This week's table, best first: the regulars as far as they have got, and the player. */
  standings(): LeagueEntry[] {
    this.rollOver();
    const entries = this.rivals(this.state.week, weekProgress(this.now()));
    entries.push({ name: 'YOU', tickets: this.state.tickets, you: true });
    return entries.sort((a, b) => b.tickets - a.tickets || (a.you ? -1 : 1));
  }

  /** A ticket play paid `tickets` (the play's, the challenge's, the medals'): count them, and move the streak on. */
  record(tickets: number): StreakNews {
    this.rollOver();
    const today = dayKey(this.now());
    let bonus = 0;
    if (this.state.lastPlayDay !== today) {
      const yesterday = dayKey(addDays(this.now(), -1));
      const streak = this.state.lastPlayDay === yesterday ? this.state.streak + 1 : 1;
      bonus = streakBonus(streak);
      this.state = { ...this.state, lastPlayDay: today, streak };
    }
    this.state = { ...this.state, tickets: this.state.tickets + tickets + bonus };
    this.commit();
    return { days: this.state.streak, bonus };
  }

  /** Last week's result, once (then forgotten); null when there is none to announce. A win adds a pennant. */
  takeWeekResult(): WeekResult | null {
    this.rollOver();
    const result = this.state.pending ?? null;
    if (!result) return null;
    const { pending: _announced, ...rest } = this.state;
    this.state = { ...rest, pennants: this.state.pennants + (result.won ? 1 : 0) };
    this.commit();
    return result;
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** The regulars' totals for `week` at `progress` (0 Monday morning, 1 Sunday night). */
  private rivals(week: string, progress: number): LeagueEntry[] {
    const rng = seeded(`${week}:league`);
    const start = Math.floor(rng() * REGULARS.length);
    const out: LeagueEntry[] = [];
    for (let i = 0; i < LEAGUE.rivals; i++) {
      const base = LEAGUE.rivalWeek.min + (LEAGUE.rivalWeek.max - LEAGUE.rivalWeek.min) * rng() ** 1.6;
      // Some play early in the week, some late: each follows its own curve to its total.
      const bend = 0.6 + rng() * 1.2;
      out.push({ name: REGULARS[(start + i * 3) % REGULARS.length]!, tickets: Math.round(base * progress ** bend) });
    }
    return out;
  }

  /** A new week: settle the one that ended (the player's place on its final table) and start counting again. */
  private rollOver(): void {
    const week = isoWeek(this.now());
    if (this.state.week === week) return;
    let pending = this.state.pending;
    if (this.state.tickets > 0) {
      const final = this.rivals(this.state.week, 1);
      const rank = final.filter((r) => r.tickets >= this.state.tickets).length;
      pending = { week: this.state.week, tickets: this.state.tickets, rank, won: rank === 0 };
    }
    this.state = { ...this.state, week, tickets: 0, ...(pending ? { pending } : {}) };
    this.commit();
  }

  private commit(): void {
    this.store.save(this.state);
    for (const cb of this.listeners) cb();
  }
}

function readLeague(data: unknown): LeagueFile | null {
  const parsed = data as Partial<LeagueFile> | null;
  if (!parsed || typeof parsed !== 'object' || typeof parsed.week !== 'string') return null;
  const pending = parsed.pending;
  return {
    week: parsed.week,
    tickets: typeof parsed.tickets === 'number' ? parsed.tickets : 0,
    streak: typeof parsed.streak === 'number' ? parsed.streak : 0,
    pennants: typeof parsed.pennants === 'number' ? parsed.pennants : 0,
    ...(typeof parsed.lastPlayDay === 'string' ? { lastPlayDay: parsed.lastPlayDay } : {}),
    ...(pending && typeof pending.week === 'string' && typeof pending.rank === 'number'
      ? { pending: { week: pending.week, rank: pending.rank, tickets: typeof pending.tickets === 'number' ? pending.tickets : 0, won: pending.won === true } }
      : {}),
  };
}

/** The bonus the first play of the `days`-th day in a row pays (nothing on the first day). */
export function streakBonus(days: number): number {
  return days >= 2 ? Math.min(days, STREAK.maxDays) * STREAK.perDay : 0;
}
