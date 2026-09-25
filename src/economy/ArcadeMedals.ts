import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import { MEDAL_REWARD } from './pricing';
import { rivalScore } from './rivals';

export const ARCADE_MEDALS_KEY = KEYS.arcadeMedals;

export type MedalTier = 'bronze' | 'silver' | 'gold';

const TIERS: readonly MedalTier[] = ['bronze', 'silver', 'gold'];
/** Which rival on a fresh table (0-based rank) each tier asks the player to match: the fifth, the third, the first. */
const RIVAL_RANK: Record<MedalTier, number> = { bronze: 4, silver: 2, gold: 0 };

/** A medal just earned, and the tickets it pays once. */
export interface MedalAward {
  tier: MedalTier;
  reward: number;
}

/**
 * The medals per machine, persisted: bronze, silver and gold for scoring as well as the fifth,
 * third and first name of the machine's starting table (`rivals.ts`), each earned once and paid
 * once in tickets (`MEDAL_REWARD`). The cabinets light a lamp per medal and name the next one on
 * their attract screen; the Session calls `award` after every play.
 */
export class ArcadeMedals {
  private state: Record<string, MedalTier[]>;
  private readonly listeners = new Set<() => void>();
  private readonly store: PersistedStore<Record<string, MedalTier[]>>;

  constructor(
    storage: Storage | null = safeStorage(),
    key: string = ARCADE_MEDALS_KEY,
  ) {
    // Version 1: the tiers earned per machine id.
    this.store = new PersistedStore<Record<string, MedalTier[]>>({ key, version: 1, storage, defaults: () => ({}), read: readMedals });
    this.state = this.store.load();
  }

  earned(gameId: string): readonly MedalTier[] {
    return this.state[gameId] ?? [];
  }

  thresholds(gameId: string): Readonly<Record<MedalTier, number>> {
    return { bronze: rivalScore(gameId, RIVAL_RANK.bronze), silver: rivalScore(gameId, RIVAL_RANK.silver), gold: rivalScore(gameId, RIVAL_RANK.gold) };
  }

  /** Every medal `score` earns on `gameId` that the player did not have yet (paid by the caller), lowest first. */
  award(gameId: string, score: number): MedalAward[] {
    const have = this.earned(gameId);
    const limits = this.thresholds(gameId);
    const fresh = TIERS.filter((tier) => !have.includes(tier) && score >= limits[tier]);
    if (!fresh.length) return [];
    this.state = { ...this.state, [gameId]: TIERS.filter((tier) => have.includes(tier) || fresh.includes(tier)) };
    this.commit();
    return fresh.map((tier) => ({ tier, reward: MEDAL_REWARD[tier] }));
  }

  /** How many medals the player holds in all (the league board and the attendant mention it). */
  get total(): number {
    return Object.values(this.state).reduce((n, tiers) => n + tiers.length, 0);
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

function readMedals(data: unknown): Record<string, MedalTier[]> | null {
  if (typeof data !== 'object' || data === null) return null;
  const out: Record<string, MedalTier[]> = {};
  for (const [id, tiers] of Object.entries(data)) {
    if (Array.isArray(tiers)) out[id] = TIERS.filter((t) => tiers.includes(t));
  }
  return out;
}
