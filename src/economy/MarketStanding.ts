import type { PlatformId } from '@/catalog/types';
import { LOYALTY, REPUTATION } from './pricing';

export const STANDING_STORAGE_KEY = 'bibliothek.standing.v1';

/** Something the player did that the market remembers (see `REPUTATION.points`). */
export type Deed = keyof typeof REPUTATION.points;

interface StandingFile {
  /** Reputation points, lifetime. */
  points: number;
  /** Copies bought per stall (by platform), lifetime. */
  stallBuys: Partial<Record<PlatformId, number>>;
  /** Collector sets whose reward was claimed. */
  sets: string[];
  /** Tally per deed, for the standing card. */
  deeds: Partial<Record<Deed, number>>;
}

/** A reputation level as the player sees it. */
export interface ReputationLevel {
  level: number;
  name: string;
  points: number;
  /** Points the next level needs, or null at the top. */
  next: number | null;
}

/**
 * How the market knows the player, lifetime and across reloads: reputation (points per deed,
 * levels that open the glass case and raise the WE BUY desk's offers), loyalty per stall (copies
 * bought there: better prices, wishlist finds, a copy kept aside), and the collector sets whose
 * reward was claimed. Persisted to localStorage; consumers `subscribe`.
 */
export class MarketStanding {
  private state: StandingFile;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly storage: Storage | null = safeLocalStorage(),
    private readonly key = STANDING_STORAGE_KEY,
  ) {
    this.state = this.load() ?? { points: 0, stallBuys: {}, sets: [], deeds: {} };
  }

  /** The player did `deed` (a stall purchase also counts towards that stall's loyalty). */
  record(deed: Deed, platform?: PlatformId): void {
    const stallBuys = deed === 'buy' && platform ? { ...this.state.stallBuys, [platform]: (this.state.stallBuys[platform] ?? 0) + 1 } : this.state.stallBuys;
    const deeds = { ...this.state.deeds, [deed]: (this.state.deeds[deed] ?? 0) + 1 };
    this.state = { ...this.state, points: this.state.points + REPUTATION.points[deed], stallBuys, deeds };
    this.commit();
  }

  /** Takes back a deed recorded by mistake (a purchase handed back at once). */
  undo(deed: Deed, platform?: PlatformId): void {
    const stallBuys = deed === 'buy' && platform ? { ...this.state.stallBuys, [platform]: Math.max(0, (this.state.stallBuys[platform] ?? 0) - 1) } : this.state.stallBuys;
    const deeds = { ...this.state.deeds, [deed]: Math.max(0, (this.state.deeds[deed] ?? 0) - 1) };
    this.state = { ...this.state, points: Math.max(0, this.state.points - REPUTATION.points[deed]), stallBuys, deeds };
    this.commit();
  }

  get reputation(): ReputationLevel {
    const { points } = this.state;
    const levels = REPUTATION.levels;
    let level = 0;
    for (let i = 0; i < levels.length; i++) if (points >= levels[i]!.at) level = i;
    return { level, name: levels[level]!.name, points, next: levels[level + 1]?.at ?? null };
  }

  /** The glass case opens for players the market trusts. */
  get mayHandleGlass(): boolean {
    return this.reputation.level >= REPUTATION.glassCaseLevel;
  }

  /** Share added to the WE BUY desk's offers. */
  get buyBackBonus(): number {
    return this.reputation.level * REPUTATION.buyBackBonus;
  }

  /** Copies bought at `platform`'s stall. */
  buysAt(platform: PlatformId): number {
    return this.state.stallBuys[platform] ?? 0;
  }

  /** 0 (a stranger) to 3 (best customer) at `platform`'s stall. */
  loyalty(platform: PlatformId): number {
    const buys = this.buysAt(platform);
    return LOYALTY.tiers.filter((at) => buys >= at).length;
  }

  /** The name of the player's standing at a stall ('' for a stranger). */
  loyaltyName(platform: PlatformId): string {
    const tier = this.loyalty(platform);
    return tier ? LOYALTY.names[tier - 1]! : '';
  }

  deedCount(deed: Deed): number {
    return this.state.deeds[deed] ?? 0;
  }

  hasClaimed(setId: string): boolean {
    return this.state.sets.includes(setId);
  }

  /** Marks a set's reward as taken; false when it was already. */
  claimSet(setId: string): boolean {
    if (this.hasClaimed(setId)) return false;
    this.state = { ...this.state, sets: [...this.state.sets, setId] };
    this.record('set');
    return true;
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private commit(): void {
    try {
      this.storage?.setItem(this.key, JSON.stringify(this.state));
    } catch (err) {
      console.warn('[market] could not persist the standing', err);
    }
    for (const cb of [...this.listeners]) cb();
  }

  private load(): StandingFile | null {
    const text = this.storage?.getItem(this.key);
    if (!text) return null;
    try {
      const file = JSON.parse(text) as Partial<StandingFile>;
      if (typeof file.points !== 'number') return null;
      return { points: file.points, stallBuys: file.stallBuys ?? {}, sets: Array.isArray(file.sets) ? file.sets : [], deeds: file.deeds ?? {} };
    } catch {
      return null;
    }
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
