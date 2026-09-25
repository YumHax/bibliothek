import { KEYS, PersistedStore, batch, safeStorage } from '@/persistence';
import { dayKey } from './calendar';
import { MILESTONES, isReached, milestoneReward, type CollectorFacts, type HomeReward, type Milestone } from './milestoneList';

interface MilestonesFile {
  /** Milestone id -> the `dayKey` it was reached on. Once reached, always reached (a game sold does not take it back). */
  reached: Record<string, string>;
  /** Milestones whose coins or tickets were claimed in the book. */
  claimed: string[];
}

/** The purse a claimed reward is paid into. */
export interface MilestonePurse {
  earnCoins(coins: number): void;
  addTickets(tickets: number): void;
}

/**
 * The collector's book's milestones as the player reached them, persisted: when each one was first
 * reached (it stays reached), and which rewards were claimed. `update(facts)` marks what the facts
 * reach now and returns the milestones reached just then; `claim` pays a reached one's reward once.
 * Consumers `subscribe` (the plaque, the display cabinet, the book).
 */
export class Milestones {
  private state: MilestonesFile;
  private readonly store: PersistedStore<MilestonesFile>;
  private readonly listeners = new Set<() => void>();

  constructor(storage: Storage | null = safeStorage(), key: string = KEYS.milestones) {
    // Version 1: reached (id -> day), claimed.
    this.store = new PersistedStore<MilestonesFile>({ key, version: 1, storage, defaults: () => ({ reached: {}, claimed: [] }), read: readFile });
    this.state = this.store.load();
  }

  has(id: string): boolean {
    return id in this.state.reached;
  }

  /** The day (`dayKey`) `id` was reached, if it was. */
  reachedOn(id: string): string | undefined {
    return this.state.reached[id];
  }

  isClaimed(id: string): boolean {
    return this.state.claimed.includes(id);
  }

  /** Whether a milestone that brings `reward` home has been reached. */
  hasHome(reward: HomeReward): boolean {
    return MILESTONES.some((m) => m.home === reward && this.has(m.id));
  }

  /** The number of reached milestones whose reward still waits to be claimed. */
  get unclaimed(): number {
    return MILESTONES.filter((m) => this.has(m.id) && !this.isClaimed(m.id) && hasPayment(m)).length;
  }

  /** Marks every milestone `facts` reach that was not reached yet; returns those, in the book's order. */
  update(facts: CollectorFacts, now: Date = new Date()): Milestone[] {
    const fresh = MILESTONES.filter((m) => !this.has(m.id) && isReached(m, facts));
    if (!fresh.length) return [];
    const day = dayKey(now);
    this.state = { ...this.state, reached: { ...this.state.reached, ...Object.fromEntries(fresh.map((m) => [m.id, day])) } };
    this.commit();
    return fresh;
  }

  /** Pays a reached milestone's reward into `purse`, once; false when not reached, already claimed or paying nothing. */
  claim(id: string, purse: MilestonePurse): boolean {
    const milestone = MILESTONES.find((m) => m.id === id);
    if (!milestone || !this.has(id) || this.isClaimed(id) || !hasPayment(milestone)) return false;
    const { coins, tickets } = milestoneReward(id);
    batch(() => {
      this.state = { ...this.state, claimed: [...this.state.claimed, id] };
      this.commit();
      if (coins) purse.earnCoins(coins);
      if (tickets) purse.addTickets(tickets);
    });
    return true;
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private commit(): void {
    this.store.save(this.state);
    for (const cb of [...this.listeners]) cb();
  }
}

function hasPayment(milestone: Milestone): boolean {
  const { coins, tickets } = milestoneReward(milestone.id);
  return !!coins || !!tickets;
}

function readFile(data: unknown): MilestonesFile | null {
  if (typeof data !== 'object' || data === null) return null;
  const raw = data as Partial<MilestonesFile>;
  const reached: Record<string, string> = {};
  if (typeof raw.reached === 'object' && raw.reached !== null) {
    for (const [id, day] of Object.entries(raw.reached)) if (typeof day === 'string') reached[id] = day;
  }
  const claimed = Array.isArray(raw.claimed) ? raw.claimed.filter((id): id is string => typeof id === 'string') : [];
  return { reached, claimed };
}
