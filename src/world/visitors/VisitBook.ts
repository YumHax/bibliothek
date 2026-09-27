import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import { hash01, seeded } from '@/economy/seeded';
import { FRIENDS, VISIT_RULES, type FriendPlan } from './friendsPlan';

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
}

interface BookState {
  /** The in-game day of the last visit (answered or not): one a day at most. */
  lastDay: number;
  /** Visits each friend actually made (the door opened). */
  visits: Record<string, number>;
  loans: Loan[];
  /** A friend asked round on the phone: who, on which in-game day, from what hour (`household/`). */
  invited: { friendId: string; day: number; hour: number } | null;
}

const fresh = (): BookState => ({ lastDay: -99, visits: {}, loans: [], invited: null });

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
    const hour = VISIT_RULES.hours.from + hash01(`visit-hour:${day}`) * (VISIT_RULES.hours.until - VISIT_RULES.hours.from);
    const due = this.state.loans.filter((loan) => loan.dueDay <= day).sort((a, b) => a.dueDay - b.dueDay)[0];
    if (due) {
      const friend = FRIENDS.find((f) => f.id === due.friendId);
      if (friend) return { friend, hour, loan: due };
    }
    if (day - this.state.lastDay < VISIT_RULES.minGap) return null;
    if (hash01(`visit:${day}`) >= VISIT_RULES.chance) return null;
    const free = FRIENDS.filter((f) => !this.state.loans.some((loan) => loan.friendId === f.id));
    if (!free.length) return null;
    return { friend: free[Math.floor(hash01(`visit-who:${day}`) * free.length)]!, hour, loan: null };
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
    const days = min + Math.floor(seeded(`loan:${friendId}:${game.id}:${day}`)() * (max - min + 1));
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
  const loans = (Array.isArray(raw.loans) ? raw.loans : []).filter(
    (l): l is Loan => typeof l === 'object' && l !== null && typeof l.friendId === 'string' && typeof l.gameId === 'string' && typeof l.title === 'string' && typeof l.lentDay === 'number' && typeof l.dueDay === 'number',
  );
  const inv = raw.invited as Partial<NonNullable<BookState['invited']>> | null | undefined;
  const invited = inv && typeof inv.friendId === 'string' && typeof inv.day === 'number' && typeof inv.hour === 'number' ? { friendId: inv.friendId, day: inv.day, hour: inv.hour } : null;
  return { lastDay: typeof raw.lastDay === 'number' ? raw.lastDay : -99, visits, loans, invited };
}
