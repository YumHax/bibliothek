import { KEYS, PersistedStore } from '@/persistence';
import { dayKey, fromUtcDayKey } from './calendar';
import { CHALLENGE_BAND, CHALLENGE_KINDS, CHALLENGE_REWARD, CHANGE_MACHINE, OUT_OF_ORDER_ODDS } from './pricing';
import { rivalScore } from './rivals';
import { dayStream } from '@/time/daily';
import { formatNumber } from '@/text/count';

const ARCADE_DAILY_KEY = KEYS.arcadeDaily;

/** What a day's challenge asks: one play reaching the score, two plays each reaching it, or the day's plays adding up to it. */
type ChallengeKind = keyof typeof CHALLENGE_KINDS.weights;
const KINDS = Object.keys(CHALLENGE_KINDS.weights) as ChallengeKind[];

/** Today's challenge: one game, what it asks, what it pays, how far along it is and whether it has been paid. */
interface Challenge {
  gameId: string;
  kind: ChallengeKind;
  target: number;
  /** Bonus tickets on top of the play's own. */
  reward: number;
  done: boolean;
  /** How far along: plays that reached the target (`score`, `twice`), or the points added up so far (`total`). */
  progress: number;
  /** Where `progress` has to get to. */
  need: number;
  /** The ask in a few words, for the boards and the screens ("SCORE 4,000", "SCORE 3,000 TWICE", "12,000 IN ALL"). */
  line: string;
  /** Set on the player's own best (they hold the machine's gold), not on the table's. */
  personal: boolean;
}

/** The day's challenge as drawn (kept: a personal target follows the best of the morning, not of the moment). */
interface Drawn {
  day: string;
  gameId: string;
  kind: ChallengeKind;
  target: number;
  reward: number;
  personal: boolean;
  progress: number;
}

interface DailyFile {
  /** The day each daily thing was last claimed (the game day's key, `g12`; versions 1-2 saved real dates). */
  challenge?: string;
  change?: string;
  /** The current day's challenge once drawn, and how far along it is. */
  drawn?: Drawn;
}

interface ArcadeDailyOptions {
  /** The games a challenge may be set on (the arcade's machines that pay tickets). */
  games: readonly string[];
  /** Today's key: the game day's (`g12`, `Today.gameDay`); default the real local date (YYYY-MM-DD). */
  today?: () => string;
  /** Whether the player holds the machine's gold (a challenge there follows their own best then), and their best. */
  gold?: (gameId: string) => boolean;
  bestOf?: (gameId: string) => number;
  storage?: Storage | null;
}

/**
 * What changes at the arcade from one game day to the next (seeded by the day, like the market's stock): the
 * challenge (a game, what it asks: one score, the same twice, or the day's plays adding up; the target from the
 * table's band, `CHALLENGE_BAND`, or from the player's own best once they hold the machine's gold; a bonus in tickets,
 * paid once), the machine out of order, and whether the dead change machine works today (then it gives a few coins,
 * once). What was claimed and the challenge's progress are persisted by day.
 */
export class ArcadeDaily {
  private readonly games: readonly string[];
  private readonly today: () => string;
  private readonly options: ArcadeDailyOptions;
  private readonly store: PersistedStore<DailyFile>;
  private state: DailyFile;

  constructor(options: ArcadeDailyOptions) {
    this.options = options;
    this.games = options.games;
    this.today = options.today ?? (() => dayKey());
    // Version 2: local dates; version 1 saved UTC dates. Version 3: game days (`g12`): a claim made today (the real
    // date) is a claim made this game day, so nothing is claimed twice; older claims stay as they were (long past).
    const thisDay = (day: string): string => (day === dayKey() ? this.today() : day);
    this.store = new PersistedStore<DailyFile>({
      key: ARCADE_DAILY_KEY,
      version: 3,
      storage: options.storage,
      defaults: () => ({}),
      read: readDaily,
      migrate: {
        1: (data) => mapDays(readDaily(data) ?? {}, (day) => fromUtcDayKey(day)),
        2: (data) => mapDays(readDaily(data) ?? {}, thisDay),
      },
    });
    this.state = this.store.load();
  }

  /** The day's key the challenge, the change machine and the broken machine follow. */
  get day(): string {
    return this.today();
  }

  challenge(): Challenge {
    const day = this.today();
    const drawn = this.state.drawn?.day === day ? this.state.drawn : this.draw(day);
    const need = drawn.kind === 'twice' ? 2 : drawn.kind === 'total' ? drawn.target : 1;
    return {
      gameId: drawn.gameId,
      kind: drawn.kind,
      target: drawn.target,
      reward: drawn.reward,
      done: this.state.challenge === day,
      progress: Math.min(drawn.progress, need),
      need,
      line: challengeLine(drawn.kind, drawn.target),
      personal: drawn.personal,
    };
  }

  /**
   * A play on `gameId` ended with `score`: it counts towards today's challenge when that is the machine's. True when
   * the challenge is met now and not yet paid (the caller claims it, `claimChallenge`).
   */
  advance(gameId: string, score: number): boolean {
    const c = this.challenge();
    if (c.done || c.gameId !== gameId || score <= 0) return false;
    const drawn = this.state.drawn!;
    const progress = c.kind === 'total' ? drawn.progress + score : drawn.progress + (score >= c.target ? 1 : 0);
    if (progress !== drawn.progress) {
      this.state = { ...this.state, drawn: { ...drawn, progress } };
      this.commit();
    }
    return progress >= c.need;
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
    const rng = dayStream(`${this.today()}:outOfOrder`);
    if (rng() >= OUT_OF_ORDER_ODDS) return null;
    const challenge = this.challenge().gameId;
    const pool = candidates.filter((id) => id !== challenge);
    return pool[Math.floor(rng() * pool.length)] ?? null;
  }

  /** Whether the change machine works today (it has been claimed or not). */
  get changeMachineWorks(): boolean {
    return dayStream(`${this.today()}:change`)() < CHANGE_MACHINE.workingOdds;
  }

  /** Whether today's change is still in the machine. */
  get changeWaiting(): boolean {
    return this.changeMachineWorks && this.state.change !== this.today();
  }

  /** Takes today's change: the coins, or 0 when the machine is dead or already emptied. */
  claimChange(): number {
    if (!this.changeWaiting) return 0;
    const day = this.today();
    const rng = dayStream(`${day}:change:coins`);
    const coins = CHANGE_MACHINE.minCoins + Math.floor(rng() * (CHANGE_MACHINE.maxCoins - CHANGE_MACHINE.minCoins + 1));
    this.state = { ...this.state, change: day };
    this.commit();
    return coins;
  }

  /** Draws `day`'s challenge (the same for everyone that day, but a personal target) and keeps it. */
  private draw(day: string): Drawn {
    const rng = dayStream(`${day}:challenge`);
    const gameId = this.games[Math.floor(rng() * this.games.length)] ?? 'stacker';
    const kind = pickKind(rng());
    const best = this.options.bestOf?.(gameId) ?? 0;
    const personal = kind === 'score' && (this.options.gold?.(gameId) ?? false) && best > 0;
    const at = rng();
    let raw: number;
    if (personal) {
      const { low, high } = CHALLENGE_KINDS.personal;
      raw = best * (low + (high - low) * at);
    } else {
      // Somewhere in the game's band of its starting table (most: the fourth to the second score).
      const band = kind === 'twice' ? CHALLENGE_KINDS.twiceBand : (CHALLENGE_BAND[gameId] ?? CHALLENGE_BAND.default);
      const low = rivalScore(gameId, band.low);
      const high = rivalScore(gameId, band.high);
      raw = (low + (high - low) * at) * (kind === 'total' ? CHALLENGE_KINDS.totalOf : 1);
    }
    const target = signRound(raw);
    const reward = Math.round(CHALLENGE_REWARD.min + (CHALLENGE_REWARD.max - CHALLENGE_REWARD.min) * rng());
    const drawn: Drawn = { day, gameId, kind, target, reward, personal, progress: 0 };
    this.state = { ...this.state, drawn };
    this.commit();
    return drawn;
  }

  private commit(): void {
    this.store.save(this.state);
  }
}

/** A kind by the weights, from a draw in 0..1. */
function pickKind(at: number): ChallengeKind {
  const weights = CHALLENGE_KINDS.weights;
  const total = KINDS.reduce((sum, k) => sum + weights[k], 0);
  let left = at * total;
  for (const kind of KINDS) {
    left -= weights[kind];
    if (left < 0) return kind;
  }
  return 'score';
}

/** Rounded like a sign would say it. */
function signRound(raw: number): number {
  const step = raw >= 10000 ? 1000 : raw >= 1000 ? 100 : 10;
  return Math.max(step, Math.round(raw / step) * step);
}

/** The ask in a few words. */
function challengeLine(kind: ChallengeKind, target: number): string {
  const score = formatNumber(target);
  if (kind === 'twice') return `SCORE ${score} TWICE`;
  if (kind === 'total') return `${score} IN ALL TODAY`;
  return `SCORE ${score}`;
}

function readDaily(data: unknown): DailyFile | null {
  if (typeof data !== 'object' || data === null) return null;
  const parsed = data as DailyFile;
  const drawn = readDrawn(parsed.drawn);
  return {
    ...(typeof parsed.challenge === 'string' ? { challenge: parsed.challenge } : {}),
    ...(typeof parsed.change === 'string' ? { change: parsed.change } : {}),
    ...(drawn ? { drawn } : {}),
  };
}

function readDrawn(data: unknown): Drawn | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Partial<Drawn>;
  if (typeof d.day !== 'string' || typeof d.gameId !== 'string' || !KINDS.includes(d.kind as ChallengeKind)) return null;
  if (typeof d.target !== 'number' || typeof d.reward !== 'number') return null;
  return { day: d.day, gameId: d.gameId, kind: d.kind as ChallengeKind, target: d.target, reward: d.reward, personal: d.personal === true, progress: typeof d.progress === 'number' && Number.isFinite(d.progress) ? d.progress : 0 };
}

function mapDays(file: DailyFile, map: (day: string) => string): DailyFile {
  return {
    ...(file.challenge ? { challenge: map(file.challenge) } : {}),
    ...(file.change ? { change: map(file.change) } : {}),
  };
}
