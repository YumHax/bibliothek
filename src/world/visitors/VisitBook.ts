import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import { canonicalGameId } from '@/catalog';
import { FRIENDS, VISIT_RULES, type FriendPlan } from './friendsPlan';
import { unit01 } from '@/random';
import { dayStream } from '@/time/daily';
import { has } from '@/social/perks';
import { lastDropBy } from '@/social/friendsLife';

/** A close friend dropping by unannounced (`dropsBy`, docs/social.md "Friends"): this likely on a free day, this many game days apart at least. */
const DROP_BY = { odds: 0.25, gap: 5 } as const;

/** A game out on loan: to whom, since which in-game day, due back when. */
export interface Loan {
  friendId: string;
  gameId: string;
  title: string;
  lentDay: number;
  dueDay: number;
}

/** Today's visit, if any: who, from what hour of the in-game day, and whether they bring a loan back. */
export interface PlannedVisit {
  friend: FriendPlan;
  hour: number;
  loan: Loan | null;
  /** Unannounced, with a game they found for the player (a close friend's `dropsBy`). */
  dropBy?: boolean;
}

interface BookState {
  /** The in-game day of the last visit (answered or not): one a day at most. */
  lastDay: number;
  /** Visits each friend actually made (the door opened). */
  visits: Record<string, number>;
  loans: Loan[];
  /** A friend asked round on the phone: who, on which in-game day, from what hour (`household/`). */
  invited: { friendId: string; day: number; hour: number } | null;
  /** The last line said from each bucket of lines (`friendLines.LinePicker`): never twice in a row, across visits. */
  said: Record<string, string>;
  /** Each bucket's shuffle bag: the lines not said yet this round (every line once before any comes back). */
  bags: Record<string, string[]>;
}

const fresh = (): BookState => ({ lastDay: -99, visits: {}, loans: [], invited: null, said: {}, bags: {} });

/**
 * The flat's visitors' book: which in-game day brings which friend (deterministic, so a reload
 * brings the same one), who has which game on loan and when it is due, how often each has come.
 * Persisted under `KEYS.visitors`; New game wipes it with the rest of the save.
 */
export class VisitBook {
  private state: BookState;
  private readonly store: PersistedStore<BookState>;

  constructor(storage: Storage | null = safeStorage()) {
    this.store = new PersistedStore<BookState>({ key: KEYS.visitors, version: 1, storage, defaults: fresh, read: readBook });
    this.state = this.store.load();
  }

  get loans(): readonly Loan[] {
    return this.state.loans;
  }

  visitsOf(friendId: string): number {
    return this.state.visits[friendId] ?? 0;
  }

  lentTo(gameId: string): Loan | undefined {
    return this.state.loans.find((loan) => loan.gameId === gameId);
  }

  /**
   * Who comes on `day`, or null: a friend with a loan due back comes first; otherwise, once
   * `minGap` days have passed since the last visit, a day's draw may bring one of those without a
   * game of the player's.
   */
  plan(day: number): PlannedVisit | null {
    if (this.state.lastDay === day) return null;
    // Asked round on the phone: they come today whatever the draw (with a loan due back, they bring it).
    const invited = this.state.invited;
    const guest = invited && invited.day === day ? FRIENDS.find((f) => f.id === invited.friendId) : undefined;
    if (guest) return { friend: guest, hour: invited!.hour, loan: this.state.loans.find((loan) => loan.friendId === guest.id && loan.dueDay <= day) ?? null };
    const hour = VISIT_RULES.hours.from + unit01(`visit-hour:${day}`) * (VISIT_RULES.hours.until - VISIT_RULES.hours.from);
    const due = this.state.loans.filter((loan) => loan.dueDay <= day).sort((a, b) => a.dueDay - b.dueDay)[0];
    if (due) {
      const friend = FRIENDS.find((f) => f.id === due.friendId);
      if (friend) return { friend, hour, loan: due };
    }
    // A friend gone cold stops coming round (`stopsVisiting`); one with a loan still brings it back, above.
    const free = FRIENDS.filter((f) => !this.state.loans.some((loan) => loan.friendId === f.id) && !has(f.id, 'stopsVisiting'));
    // A close friend drops by now and then, outside the usual round, with something they found (`dropsBy`).
    const close = free.filter((f) => has(f.id, 'dropsBy'));
    if (close.length && day - this.state.lastDay >= 2 && day - lastDropBy() >= DROP_BY.gap && unit01(`drop-by:${day}`) < DROP_BY.odds) {
      return { friend: close[Math.floor(unit01(`drop-by-who:${day}`) * close.length)]!, hour, loan: null, dropBy: true };
    }
    if (day - this.state.lastDay < VISIT_RULES.minGap) return null;
    if (unit01(`visit:${day}`) >= VISIT_RULES.chance) return null;
    if (!free.length) return null;
    return { friend: free[Math.floor(unit01(`visit-who:${day}`) * free.length)]!, hour, loan: null };
  }

  /** The bell rang on `day` (whether or not the door opened): no other visit that day. */
  rang(day: number): void {
    this.state.lastDay = day;
    this.save();
  }

  /** The door opened to `friendId`. */
  cameIn(friendId: string): void {
    this.state.visits[friendId] = this.visitsOf(friendId) + 1;
    this.save();
  }

  /** `game` goes home with `friendId` on `day`; returns the loan (its length is the day's draw). */
  lend(friendId: string, game: { id: string; title: string }, day: number): Loan {
    const [min, max] = VISIT_RULES.loanDays;
    const days = min + Math.floor(dayStream(`loan:${friendId}:${game.id}:${day}`)() * (max - min + 1));
    const loan: Loan = { friendId, gameId: game.id, title: game.title, lentDay: day, dueDay: day + days };
    this.state.loans = [...this.state.loans.filter((l) => l.gameId !== game.id), loan];
    this.save();
    return loan;
  }

  /** The loan is over (handed back, posted back, or the game left the collection). */
  close(loan: Loan): void {
    this.state.loans = this.state.loans.filter((l) => l.gameId !== loan.gameId);
    this.save();
  }

  /** A friend asked round for `day`, from `hour`: false when a visit is already had or asked for that day. */
  invite(friendId: string, day: number, hour: number): boolean {
    if (this.state.lastDay === day || this.state.invited?.day === day) return false;
    this.state.invited = { friendId, day, hour };
    this.save();
    return true;
  }

  /** Whether the bell already rang on `day` (one visit a day). */
  rangOn(day: number): boolean {
    return this.state.lastDay === day;
  }

  /** Who was asked round for `day`, if anyone. */
  invitedOn(day: number): string | null {
    const invited = this.state.invited;
    return invited && invited.day === day ? invited.friendId : null;
  }

  /** The last line said from `bucket`, if any. */
  lastSaid(bucket: string): string | null {
    return this.state.said[bucket] ?? null;
  }

  /** `line` was just said from `bucket`. */
  said(bucket: string, line: string): void {
    if (this.state.said[bucket] === line) return;
    this.state.said = { ...this.state.said, [bucket]: line };
    this.save();
  }

  /**
   * A line of `bucket` from its shuffle bag: every line of `lines` comes once, in a random order, before
   * any comes again (a new round never opens with the one just said), across visits.
   */
  draw(bucket: string, lines: readonly string[], random: () => number): string {
    if (!lines.length) return '';
    const last = this.lastSaid(bucket);
    let bag = (this.state.bags[bucket] ?? []).filter((line) => lines.includes(line));
    if (!bag.length) bag = lines.length > 1 ? lines.filter((line) => line !== last) : [...lines];
    const line = bag[Math.floor(random() * bag.length)] ?? lines[0]!;
    this.state.bags = { ...this.state.bags, [bucket]: bag.filter((l) => l !== line) };
    this.state.said = { ...this.state.said, [bucket]: line };
    this.save();
    return line;
  }

  /** Loans kept `postAfter` days past their due day: they come back by post. */
  overdue(day: number): Loan[] {
    return this.state.loans.filter((loan) => day >= loan.dueDay + VISIT_RULES.postAfter);
  }

  private save(): void {
    this.store.save(this.state);
  }
}

function readBook(data: unknown): BookState | null {
  const raw = data as Partial<BookState> | null;
  if (typeof raw !== 'object' || raw === null) return null;
  const visits: Record<string, number> = {};
  for (const [id, n] of Object.entries(raw.visits ?? {})) if (typeof n === 'number') visits[id] = n;
  // Game ids as every store keeps them: an old hand-made id of the built-in lists becomes its canonical one.
  const loans = (Array.isArray(raw.loans) ? raw.loans : [])
    .filter(
      (l): l is Loan => typeof l === 'object' && l !== null && typeof l.friendId === 'string' && typeof l.gameId === 'string' && typeof l.title === 'string' && typeof l.lentDay === 'number' && typeof l.dueDay === 'number',
    )
    .map((l) => ({ ...l, gameId: canonicalGameId(l.gameId) }));
  const inv = raw.invited as Partial<NonNullable<BookState['invited']>> | null | undefined;
  const invited = inv && typeof inv.friendId === 'string' && typeof inv.day === 'number' && typeof inv.hour === 'number' ? { friendId: inv.friendId, day: inv.day, hour: inv.hour } : null;
  const said: Record<string, string> = {};
  for (const [bucket, line] of Object.entries(raw.said ?? {})) if (typeof line === 'string') said[bucket] = line;
  const bags: Record<string, string[]> = {};
  for (const [bucket, bag] of Object.entries(raw.bags ?? {})) if (Array.isArray(bag)) bags[bucket] = bag.filter((l): l is string => typeof l === 'string');
  return { lastDay: typeof raw.lastDay === 'number' ? raw.lastDay : -99, visits, loans, invited, said, bags };
}
