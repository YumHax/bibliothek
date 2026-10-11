import { KEYS, PersistedStore } from '@/persistence';
import { addDays, dayKey, isoWeek } from './calendar';
import { ARCADE_CARD, LEAGUE } from './pricing';
import { NOT_COMPETING, REGULARS } from './rivals';
import { dayStream } from '@/time/daily';
import { weekdayOf } from '@/time/wakefulness';

const ARCADE_LEAGUE_KEY = KEYS.arcadeLeague;

/** A league division: 0 bronze, 1 silver, 2 gold. */
type Division = 0 | 1 | 2;
const TOP_DIVISION: Division = 2;

/** One line of the league table. */
interface LeagueEntry {
  name: string;
  tickets: number;
  you?: boolean;
}

/** How a finished week went for the player, handed over once (`takeWeekResult`). */
interface WeekResult {
  week: string;
  tickets: number;
  /** 0-based place on the final table. */
  rank: number;
  won: boolean;
  /** The division it was played in (a win brings that division's pennant home). */
  division: Division;
}

/**
 * What one ticket play did to the player's regular's card: the game days in a row (for the word on it), the punch it
 * made (the day's first play), the gold tokens it dropped and the card's new colour, if it went up one.
 */
interface CardNews {
  days: number;
  punched: boolean;
  tokens: number;
  tier: string | null;
}

interface LeagueFile {
  /** The game week (`g<its Monday's game day>`) the tickets count for. */
  week: string;
  tickets: number;
  /** The game day (`g12`) of the last ticket play, and how many game days in a row it has been. */
  lastPlayDay?: string;
  streak: number;
  /** Last week's result, until the Session has announced it. */
  pending?: WeekResult;
  /** Weeks won in all, and per division (bronze, silver, gold). */
  pennants: number;
  won: [number, number, number];
  division: Division;
  /** Game days with a ticket play (the regular's card's punches: never goes back), and the gold tokens in the pocket. */
  punches: number;
  tokens: number;
}

interface ArcadeLeagueOptions {
  storage?: Storage | null;
  /** The game's day and hour (`Today.clock`); the league's week is the game's. */
  clock: { readonly day: number; readonly hours: number };
  /** The hall's own regulars (their initials), always on the table; the rest come from the hall of fame's. */
  names?: readonly string[];
}

/**
 * Two reasons to come back: the **weekly league** (the tickets won at the arcade over the game's week, Monday to
 * Sunday, on a table with five regulars whose totals grow through the week from a base drawn per week, the same for
 * everyone; first place on Sunday night wins the division's pennant and moves the player up a division, never down)
 * and the **regular's card** (every game day with a ticket play punches it; a missed day costs nothing; punches drop
 * gold tokens, free plays, and colour the card, see `ARCADE_CARD`). Persisted; the Session calls `record` after every
 * ticket play, `takeWeekResult` to announce a finished week and `useToken` before charging a coin; the league board
 * reads `standings`.
 */
export class ArcadeLeague {
  private state: LeagueFile;
  private readonly store: PersistedStore<LeagueFile>;
  private readonly clock: ArcadeLeagueOptions['clock'];
  private readonly names: readonly string[];
  private readonly listeners = new Set<() => void>();

  constructor(options: ArcadeLeagueOptions) {
    this.clock = options.clock;
    this.names = options.names ?? [];
    // Version 1: the real calendar's ISO week and local dates. Version 2: the game's week and days, divisions, the
    // regular's card. This week's tickets, a streak still alive and the pennants are kept across the change.
    this.store = new PersistedStore<LeagueFile>({
      key: ARCADE_LEAGUE_KEY,
      version: 2,
      storage: options.storage,
      defaults: () => ({ week: this.weekKey(), tickets: 0, streak: 0, pennants: 0, won: [0, 0, 0], division: 0, punches: 0, tokens: 0 }),
      read: readLeague,
      migrate: { 1: (data) => this.fromRealCalendar(data) },
    });
    this.state = this.store.load();
    this.rollOver();
  }

  /** The player's tickets this week. */
  get tickets(): number {
    this.rollOver();
    return this.state.tickets;
  }

  /** Game days in a row with a ticket play, today included if played; 0 once a day has gone by without one. */
  get streakDays(): number {
    const day = this.clock.day;
    return this.state.lastPlayDay === dayId(day) || this.state.lastPlayDay === dayId(day - 1) ? this.state.streak : 0;
  }

  /** Whether today's first play (and its punch) is behind the player. */
  get playedToday(): boolean {
    return this.state.lastPlayDay === dayId(this.clock.day);
  }

  get pennants(): number {
    return this.state.pennants;
  }

  /** Pennants won per division (bronze, silver, gold): the trophy wall at home hangs one each (`LEAGUE.pennants`). */
  get pennantsWon(): readonly [number, number, number] {
    return this.state.won;
  }

  /** The division the player plays in this week (0 bronze .. 2 gold), and its name. */
  get division(): { level: Division; name: string } {
    return { level: this.state.division, name: LEAGUE.divisionNames[this.state.division] };
  }

  /** The regular's card: its punches, its colour (null before the first one) and the punches to the next. */
  get card(): { punches: number; tier: string | null; toNext: number | null } {
    const punches = this.state.punches;
    const tier = cardTier(punches);
    const next = ARCADE_CARD.tiers[tier + 1];
    return { punches, tier: tier >= 0 ? ARCADE_CARD.tiers[tier]!.name : null, toNext: next ? next.punches - punches : null };
  }

  /** Gold tokens in the pocket: each a play on the house. */
  get tokens(): number {
    return this.state.tokens;
  }

  /** Spends a gold token on a play; false when there is none. */
  useToken(): boolean {
    if (this.state.tokens <= 0) return false;
    this.state = { ...this.state, tokens: this.state.tokens - 1 };
    this.commit();
    return true;
  }

  /** The week's number and how many days are left in it, for the board. */
  get week(): { label: string; daysLeft: number } {
    const day = this.clock.day;
    return { label: String(Math.floor((day - weekdayOf(day)) / 7) + 1), daysLeft: 6 - weekdayOf(day) };
  }

  /** This week's table, best first: the regulars as far as they have got, and the player. */
  standings(): LeagueEntry[] {
    this.rollOver();
    const entries = this.rivals(this.state.week, this.state.division, this.progress());
    entries.push({ name: 'YOU', tickets: this.state.tickets, you: true });
    return entries.sort((a, b) => b.tickets - a.tickets || (a.you ? -1 : 1));
  }

  /** A ticket play paid `tickets` (the play's, the challenge's, the medals'): count them, and punch the card on the day's first. */
  record(tickets: number): CardNews {
    this.rollOver();
    const today = dayId(this.clock.day);
    let news: CardNews = { days: this.state.streak, punched: false, tokens: 0, tier: null };
    if (this.state.lastPlayDay !== today) {
      const streak = this.state.lastPlayDay === dayId(this.clock.day - 1) ? this.state.streak + 1 : 1;
      const punches = this.state.punches + 1;
      const before = cardTier(this.state.punches);
      const after = cardTier(punches);
      const tier = after > before ? ARCADE_CARD.tiers[after]!.name : null;
      const tokens = (punches % ARCADE_CARD.tokenEvery === 0 ? 1 : 0) + (after > before ? ARCADE_CARD.tierTokens[after]! : 0);
      this.state = { ...this.state, lastPlayDay: today, streak, punches, tokens: this.state.tokens + tokens };
      news = { days: streak, punched: true, tokens, tier };
    }
    this.state = { ...this.state, tickets: this.state.tickets + tickets };
    this.commit();
    return news;
  }

  /**
   * Tickets won at the arcade outside a play's own settling (the arcade tee's, a tournament round's): they count in
   * the week like every other ticket, with no punch of their own.
   */
  count(tickets: number): void {
    if (tickets <= 0) return;
    this.rollOver();
    this.state = { ...this.state, tickets: this.state.tickets + tickets };
    this.commit();
  }

  /** Last week's result still to announce (the board shows it, the next ticket play settles it), without taking it. */
  get lastWeek(): WeekResult | null {
    this.rollOver();
    return this.state.pending ?? null;
  }

  /** Last week's result, once (then forgotten); null when there is none to announce. A win adds a pennant and a division. */
  takeWeekResult(): WeekResult | null {
    this.rollOver();
    const result = this.state.pending ?? null;
    if (!result) return null;
    const { pending: _announced, ...rest } = this.state;
    const won: [number, number, number] = [...this.state.won];
    if (result.won) won[result.division]++;
    const division = (result.won ? Math.min(TOP_DIVISION, this.state.division + 1) : this.state.division) as Division;
    this.state = { ...rest, pennants: this.state.pennants + (result.won ? 1 : 0), won, division };
    this.commit();
    return result;
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** How far through the game's week it is (0 Monday morning, 1 Sunday night). */
  private progress(): number {
    return Math.min(1, (weekdayOf(this.clock.day) + this.clock.hours / 24) / 7);
  }

  /** The key of the game week now: its Monday's game day. */
  private weekKey(): string {
    const day = this.clock.day;
    return `g${day - weekdayOf(day)}`;
  }

  /** The regulars' totals for `week` in `division` at `progress`: the hall's own regulars first, then others from the hall of fame's. */
  private rivals(week: string, division: Division, progress: number): LeagueEntry[] {
    const rng = dayStream(`${week}:league`);
    const others = REGULARS.filter((n) => !NOT_COMPETING.includes(n) && !this.names.includes(n));
    const start = Math.floor(rng() * Math.max(1, others.length));
    const names = [...this.names, ...others.map((_, i) => others[(start + i * 3) % others.length]!)].filter((n, i, all) => all.indexOf(n) === i);
    const scale = LEAGUE.divisions[division];
    const out: LeagueEntry[] = [];
    for (let i = 0; i < LEAGUE.rivals; i++) {
      const base = (LEAGUE.rivalWeek.min + (LEAGUE.rivalWeek.max - LEAGUE.rivalWeek.min) * rng() ** 1.6) * scale;
      // Some play early in the week, some late: each follows its own curve to its total.
      const bend = 0.6 + rng() * 1.2;
      out.push({ name: names[i % Math.max(1, names.length)] ?? 'ACE', tickets: Math.round(base * progress ** bend) });
    }
    return out;
  }

  /** A new week: settle the one that ended (the player's place on its final table) and start counting again. */
  private rollOver(): void {
    const week = this.weekKey();
    if (this.state.week === week) return;
    let pending = this.state.pending;
    if (this.state.tickets > 0) {
      const final = this.rivals(this.state.week, this.state.division, 1);
      const rank = final.filter((r) => r.tickets >= this.state.tickets).length;
      pending = { week: this.state.week, tickets: this.state.tickets, rank, won: rank === 0, division: this.state.division };
    }
    this.state = { ...this.state, week, tickets: 0, ...(pending ? { pending } : {}) };
    this.commit();
  }

  /**
   * A version 1 save (the real calendar): this real week's tickets carry over to this game week, a streak played today
   * or yesterday (real dates) goes on from this game day or the one before, the pennants stay won (in the bronze
   * division, the only one then: a player with one moves up as a win would have taken them) and every day of the
   * streak is a punch on the new card. An older week is settled as it was (its own seed).
   */
  private fromRealCalendar(data: unknown): unknown {
    const old = data as { week?: unknown; tickets?: unknown; lastPlayDay?: unknown; streak?: unknown; pennants?: unknown; pending?: unknown } | null;
    if (!old || typeof old !== 'object') return data;
    const now = new Date(); // convention-ok: an old save's real dates are read against the real date, once
    const day = this.clock.day;
    const week = old.week === isoWeek(now) ? this.weekKey() : old.week;
    const lastPlayDay = old.lastPlayDay === dayKey(now) ? dayId(day) : old.lastPlayDay === dayKey(addDays(now, -1)) ? dayId(day - 1) : undefined;
    const streak = typeof old.streak === 'number' ? old.streak : 0;
    const pennants = typeof old.pennants === 'number' ? old.pennants : 0;
    return {
      ...old,
      week,
      ...(lastPlayDay ? { lastPlayDay } : { lastPlayDay: undefined }),
      won: [pennants, 0, 0],
      division: Math.min(TOP_DIVISION, pennants),
      punches: streak,
      tokens: 0,
    };
  }

  private commit(): void {
    this.store.save(this.state);
    for (const cb of this.listeners) cb();
  }
}

/** A game day's key, as the league saves it. */
function dayId(day: number): string {
  return `g${day}`;
}

/** The card's colour for `punches`: the index in `ARCADE_CARD.tiers`, -1 before the first. */
function cardTier(punches: number): number {
  let tier = -1;
  ARCADE_CARD.tiers.forEach((t, i) => {
    if (punches >= t.punches) tier = i;
  });
  return tier;
}

function asDivision(value: unknown): Division {
  return value === 1 || value === 2 ? value : 0;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function readLeague(data: unknown): LeagueFile | null {
  const parsed = data as (Partial<Omit<LeagueFile, 'won'>> & { won?: unknown }) | null;
  if (!parsed || typeof parsed !== 'object' || typeof parsed.week !== 'string') return null;
  const pending = parsed.pending;
  const won = Array.isArray(parsed.won) ? parsed.won : [];
  return {
    week: parsed.week,
    tickets: typeof parsed.tickets === 'number' ? parsed.tickets : 0,
    streak: count(parsed.streak),
    pennants: count(parsed.pennants),
    won: [count(won[0]), count(won[1]), count(won[2])],
    division: asDivision(parsed.division),
    punches: count(parsed.punches),
    tokens: count(parsed.tokens),
    ...(typeof parsed.lastPlayDay === 'string' ? { lastPlayDay: parsed.lastPlayDay } : {}),
    ...(pending && typeof pending.week === 'string' && typeof pending.rank === 'number'
      ? { pending: { week: pending.week, rank: pending.rank, tickets: typeof pending.tickets === 'number' ? pending.tickets : 0, won: pending.won === true, division: asDivision(pending.division) } }
      : {}),
  };
}
