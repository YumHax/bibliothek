import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import { MASTERY, MEDAL_REWARD, PLATINUM } from './pricing';
import { rivalScore } from './rivals';

const ARCADE_MEDALS_KEY = KEYS.arcadeMedals;

type MedalTier = 'bronze' | 'silver' | 'gold';
/** What a play may earn: a table medal, or platinum (the player's own gold score beaten by `PLATINUM.over`). */
type AwardTier = MedalTier | 'platinum';

const TIERS: readonly MedalTier[] = ['bronze', 'silver', 'gold'];
/** Which rival on a fresh table (0-based rank) each tier asks the player to match: the fifth, the third, the first. */
const RIVAL_RANK: Record<MedalTier, number> = { bronze: 4, silver: 2, gold: 0 };

/** A medal just earned, and the tickets it pays once. */
interface MedalAward {
  tier: AwardTier;
  reward: number;
}

/** One machine's medals: the table tiers, the platinum score once gold is won, and whether platinum is had. */
interface MachineMedals {
  tiers: MedalTier[];
  platinumAt?: number;
  platinum?: boolean;
}

interface MedalsFile {
  machines: Record<string, MachineMedals>;
  /** The hall's tour's trophy was handed over (`takeTour`). */
  tourTaken: boolean;
}

interface ArcadeMedalsOptions {
  /** The machines of the hall's tour (every one that keeps a table). */
  games?: readonly string[];
  /** The player's best on a machine: an older save's gold gets its platinum score from it. */
  bestOf?: (gameId: string) => number;
}

/**
 * The medals per machine, persisted: bronze, silver and gold for scoring as well as the fifth,
 * third and first name of the machine's starting table (`rivals.ts`), each earned once and paid
 * once in tickets (`MEDAL_REWARD`); then **platinum**, the score that won the gold beaten by a fifth
 * (`PLATINUM`, frozen when the gold is won). Gold on every machine of the hall is **the hall's tour**:
 * its trophy goes home once (`takeTour`). A machine whose gold is held is **mastered**: it pays more for its score
 * (`mastery`, `MASTERY`). The cabinets light a lamp per medal and name the next one on their attract screen; the
 * Session calls `award` after every play.
 */
export class ArcadeMedals {
  private state: MedalsFile;
  private readonly listeners = new Set<() => void>();
  private readonly store: PersistedStore<MedalsFile>;
  private readonly games: readonly string[];

  constructor(
    storage: Storage | null = safeStorage(),
    key: string = ARCADE_MEDALS_KEY,
    options: ArcadeMedalsOptions = {},
  ) {
    this.games = options.games ?? [];
    // Version 1: the tiers earned per machine id. Version 2: per machine `{ tiers, platinumAt, platinum }`, the tour;
    // a gold already won takes its platinum score from the player's best.
    this.store = new PersistedStore<MedalsFile>({
      key,
      version: 2,
      storage,
      defaults: () => ({ machines: {}, tourTaken: false }),
      read: readMedals,
      migrate: { 1: (data) => fromTierLists(data, options.bestOf) },
    });
    this.state = this.store.load();
  }

  /** The table medals held on `gameId` (bronze, silver, gold: the lamps). */
  earned(gameId: string): readonly MedalTier[] {
    return this.state.machines[gameId]?.tiers ?? [];
  }

  /** Whether `gameId`'s platinum is had. */
  platinum(gameId: string): boolean {
    return this.state.machines[gameId]?.platinum === true;
  }

  /** The score that earns `gameId`'s platinum: null until its gold is won. */
  platinumTarget(gameId: string): number | null {
    return this.state.machines[gameId]?.platinumAt ?? null;
  }

  thresholds(gameId: string): Readonly<Record<MedalTier, number>> {
    return { bronze: rivalScore(gameId, RIVAL_RANK.bronze), silver: rivalScore(gameId, RIVAL_RANK.silver), gold: rivalScore(gameId, RIVAL_RANK.gold) };
  }

  /** Every medal `score` earns on `gameId` that the player did not have yet (paid by the caller), lowest first. */
  award(gameId: string, score: number): MedalAward[] {
    const machine = this.state.machines[gameId] ?? { tiers: [] };
    const limits = this.thresholds(gameId);
    const fresh = TIERS.filter((tier) => !machine.tiers.includes(tier) && score >= limits[tier]);
    const out: MedalAward[] = fresh.map((tier) => ({ tier, reward: MEDAL_REWARD[tier] }));
    let next: MachineMedals = { ...machine, tiers: TIERS.filter((tier) => machine.tiers.includes(tier) || fresh.includes(tier)) };
    // The gold's own score sets the platinum to beat (a play that wins the gold cannot win platinum too).
    if (fresh.includes('gold')) next = { ...next, platinumAt: platinumOf(Math.max(score, limits.gold)) };
    else if (next.platinumAt !== undefined && !next.platinum && score >= next.platinumAt) {
      next = { ...next, platinum: true };
      out.push({ tier: 'platinum', reward: MEDAL_REWARD.platinum });
    }
    if (!out.length) return [];
    this.state = { ...this.state, machines: { ...this.state.machines, [gameId]: next } };
    this.commit();
    return out;
  }

  /** The hall's tour, once: true the first time it is asked after gold is had everywhere (its trophy goes home then). */
  takeTour(): boolean {
    if (!this.tourDone || this.state.tourTaken) return false;
    this.state = { ...this.state, tourTaken: true };
    this.commit();
    return true;
  }

  /** Whether the hall's tour is done (gold on every machine). */
  get tourDone(): boolean {
    return this.games.length > 0 && this.games.every((id) => this.earned(id).includes('gold'));
  }

  /** The share more `gameId` pays for its score once mastered: its gold, more with its platinum (`MASTERY`). */
  mastery(gameId: string): number {
    if (this.platinum(gameId)) return MASTERY.platinum;
    return this.earned(gameId).includes('gold') ? MASTERY.gold : 0;
  }

  /** `?debug`'s dial: `gameId`'s medals set to the first `count` tiers outright (0 none, 3 gold), paid nothing. */
  debugSetMedals(gameId: string, count: number): void {
    const tiers = TIERS.slice(0, Math.max(0, Math.min(TIERS.length, count)));
    const machine: MachineMedals = tiers.includes('gold') ? { tiers, platinumAt: platinumOf(this.thresholds(gameId).gold) } : { tiers };
    this.state = { ...this.state, machines: { ...this.state.machines, [gameId]: machine } };
    this.commit();
  }

  /** How many medals the player holds in all, platinum included (the league board and the attendant mention it). */
  get total(): number {
    return Object.values(this.state.machines).reduce((n, m) => n + m.tiers.length + (m.platinum ? 1 : 0), 0);
  }

  /** How many machines the player holds the gold of. */
  get golds(): number {
    return Object.values(this.state.machines).filter((m) => m.tiers.includes('gold')).length;
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private commit(): void {
    this.store.save(this.state);
    for (const cb of this.listeners) cb();
  }
}

/** The platinum score for a gold won with `score`: a fifth more, rounded like a table would print it. */
function platinumOf(score: number): number {
  const raw = score * PLATINUM.over;
  const step = raw >= 10000 ? 100 : 10;
  return Math.ceil(raw / step) * step;
}

/** A version 1 save (the tiers per machine) as version 2: a gold held takes its platinum score from the player's best. */
function fromTierLists(data: unknown, bestOf?: (gameId: string) => number): MedalsFile {
  const machines: Record<string, MachineMedals> = {};
  if (typeof data === 'object' && data !== null) {
    for (const [id, tiers] of Object.entries(data)) {
      if (!Array.isArray(tiers)) continue;
      const held = TIERS.filter((t) => tiers.includes(t));
      const best = held.includes('gold') ? (bestOf?.(id) ?? 0) : 0;
      machines[id] = { tiers: held, ...(held.includes('gold') ? { platinumAt: platinumOf(Math.max(best, rivalScore(id, RIVAL_RANK.gold))) } : {}) };
    }
  }
  return { machines, tourTaken: false };
}

function readMedals(data: unknown): MedalsFile | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as { machines?: unknown; tourTaken?: unknown };
  const machines: Record<string, MachineMedals> = {};
  if (typeof d.machines === 'object' && d.machines !== null) {
    for (const [id, raw] of Object.entries(d.machines)) {
      const m = raw as { tiers?: unknown; platinumAt?: unknown; platinum?: unknown } | null;
      if (!m || typeof m !== 'object' || !Array.isArray(m.tiers)) continue;
      const tiers = m.tiers as unknown[];
      machines[id] = {
        tiers: TIERS.filter((t) => tiers.includes(t)),
        ...(typeof m.platinumAt === 'number' && Number.isFinite(m.platinumAt) ? { platinumAt: m.platinumAt } : {}),
        ...(m.platinum === true ? { platinum: true } : {}),
      };
    }
  }
  return { machines, tourTaken: d.tourTaken === true };
}
