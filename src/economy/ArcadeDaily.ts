import { KEYS, PersistedStore } from '@/persistence';
import { dayKey, fromUtcDayKey } from './calendar';
import { CHALLENGE_REWARD, CHANGE_MACHINE, OUT_OF_ORDER_ODDS } from './pricing';
import { rivalScore } from './rivals';
import { seeded } from './seeded';

export const ARCADE_DAILY_KEY = KEYS.arcadeDaily;

/** Today's challenge: one game, a score to reach, what it pays, and whether it has been paid. */
export interface Challenge {
  gameId: string;
  target: number;
  /** Bonus tickets on top of the play's own. */
  reward: number;
  done: boolean;
}

interface DailyFile {
  /** The day each daily thing was last claimed (local YYYY-MM-DD, see `calendar.ts`; version 1 saved UTC dates). */
  challenge?: string;
  change?: string;
}

export interface ArcadeDailyOptions {
  /** The games a challenge may be set on (the arcade's machines that pay tickets). */
  games: readonly string[];
  /** Today's local date as YYYY-MM-DD (`dayKey`); injectable for a fixed day. */
  today?: () => string;
  storage?: Storage | null;
}

/**
 * What changes at the arcade from one day to the next, the same for everyone all day (seeded by the
 * date, like the market's stock): the challenge (a game, a target around the table's third score,
 * a bonus in tickets, paid once) and whether the dead change machine works today (then it gives a
 * few coins, once). What was claimed is persisted by date.
 */
export class ArcadeDaily {
  private readonly games: readonly string[];
  private readonly today: () => string;
  private readonly store: PersistedStore<DailyFile>;
  private state: DailyFile;

  constructor(options: ArcadeDailyOptions) {
    this.games = options.games;
    this.today = options.today ?? (() => dayKey());
    // Version 2: local dates. Version 1 saved UTC dates: today's UTC date becomes today's local one (no second claim).
    this.store = new PersistedStore<DailyFile>({
      key: ARCADE_DAILY_KEY,
      version: 2,
      storage: options.storage,
      defaults: () => ({}),
      read: readDaily,
      migrate: { 1: (data) => mapDays(readDaily(data) ?? {}, (day) => fromUtcDayKey(day)) },
    });
    this.state = this.store.load();
  }

  challenge(): Challenge {
    const day = this.today();
    const rng = seeded(`${day}:challenge`);
    const gameId = this.games[Math.floor(rng() * this.games.length)] ?? 'stacker';
    // Somewhere between the table's fourth and second score, rounded like a sign would say it.
    const low = rivalScore(gameId, 3);
    const high = rivalScore(gameId, 1);
    const raw = low + (high - low) * rng();
    const step = raw >= 10000 ? 1000 : raw >= 1000 ? 100 : 10;
    const target = Math.round(raw / step) * step;
    const reward = Math.round(CHALLENGE_REWARD.min + (CHALLENGE_REWARD.max - CHALLENGE_REWARD.min) * rng());
    return { gameId, target, reward, done: this.state.challenge === day };
  }

  /** Marks today's challenge paid; false when it already was. */
  claimChallenge(): boolean {
    const day = this.today();
    if (this.state.challenge === day) return false;
    this.state = { ...this.state, challenge: day };
    this.commit();
    return true;
  }

  /**
   * The machine out of order today, or null (most days): one of `candidates` about one day in
   * three, never the one today's challenge is set on.
   */
  outOfOrder(candidates: readonly string[]): string | null {
    const rng = seeded(`${this.today()}:outOfOrder`);
    if (rng() >= OUT_OF_ORDER_ODDS) return null;
    const challenge = this.challenge().gameId;
    const pool = candidates.filter((id) => id !== challenge);
    return pool[Math.floor(rng() * pool.length)] ?? null;
  }

  /** Whether the change machine works today (it has been claimed or not). */
  get changeMachineWorks(): boolean {
    return seeded(`${this.today()}:change`)() < CHANGE_MACHINE.workingOdds;
  }

  /** Whether today's change is still in the machine. */
  get changeWaiting(): boolean {
    return this.changeMachineWorks && this.state.change !== this.today();
  }

  /** Takes today's change: the coins, or 0 when the machine is dead or already emptied. */
  claimChange(): number {
    if (!this.changeWaiting) return 0;
    const day = this.today();
    const rng = seeded(`${day}:change:coins`);
    const coins = CHANGE_MACHINE.minCoins + Math.floor(rng() * (CHANGE_MACHINE.maxCoins - CHANGE_MACHINE.minCoins + 1));
    this.state = { ...this.state, change: day };
    this.commit();
    return coins;
  }

  private commit(): void {
    this.store.save(this.state);
  }
}

function readDaily(data: unknown): DailyFile | null {
  if (typeof data !== 'object' || data === null) return null;
  const parsed = data as DailyFile;
  return {
    ...(typeof parsed.challenge === 'string' ? { challenge: parsed.challenge } : {}),
    ...(typeof parsed.change === 'string' ? { change: parsed.change } : {}),
  };
}

function mapDays(file: DailyFile, map: (day: string) => string): DailyFile {
  return {
    ...(file.challenge ? { challenge: map(file.challenge) } : {}),
    ...(file.change ? { change: map(file.change) } : {}),
  };
}
