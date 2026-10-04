import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import { HOME_GOODS, HOME_UPGRADES, homeGood, type HomeGoodStatus, type HomeUpgrade } from './homeGoods';

export type { HomeUpgrade } from './homeGoods';

const HOME_UPGRADES_STORAGE_KEY = KEYS.home;

/** Roughly how many boxes one bookcase takes (NES-sized; bigger boxes, fewer): what a save from before the bare flat is given shelves for. */
const BOXES_PER_BOOKCASE = 35;

type UpgradeCounts = Record<HomeUpgrade, number>;

interface Saved {
  counts: UpgradeCounts;
  /**
   * Saved before the flat started bare (data v1): the collection room's shelving then grew with the collection. Such a
   * save is given the bookcases its games need once (`shelveCollection`), so no game is left without a shelf.
   */
  shelvesOwed: boolean;
}

interface HomeUpgradesOptions {
  /** Everything bought already, at its most (`?debug`: the furnished flat of before). */
  furnished?: boolean;
}

/**
 * What has been bought for the flat (`HOME_GOODS` in `homeGoods.ts`: the furniture, the screens, the plants, the cat):
 * a count per piece. The flat starts bare; the plans' entries marked `upgrade` show once their piece is owned. Counts
 * persist in localStorage; consumers `subscribe` and re-read `count`.
 */
export class HomeUpgrades {
  private state: Saved;
  private readonly listeners = new Set<() => void>();
  private readonly store: PersistedStore<Saved>;

  constructor(
    storage: Storage | null = safeStorage(),
    key: string = HOME_UPGRADES_STORAGE_KEY,
    options: HomeUpgradesOptions = {},
  ) {
    const defaults = (): Saved => ({ counts: options.furnished ? everything() : noneBought(), shelvesOwed: false });
    // Version 1: a count per upgrade, from before the flat started bare. Version 2: `{ counts, shelvesOwed }`.
    this.store = new PersistedStore<Saved>({
      key,
      version: 2,
      storage,
      defaults,
      read: readSaved,
      migrate: { 1: (data) => ({ counts: data, shelvesOwed: true }) },
    });
    this.state = this.store.load();
  }

  count(upgrade: HomeUpgrade): number {
    return this.state.counts[upgrade];
  }

  /** Whether `upgrade` is owned: at least one, or more than `nth` of it (the nth armchair, print, plant...). */
  has(upgrade: HomeUpgrade, nth = 0): boolean {
    return this.state.counts[upgrade] > nth;
  }

  /** Whether one more of `upgrade` can be bought: under its `max`, and what it needs is owned. */
  canBuy(upgrade: HomeUpgrade): boolean {
    const good = homeGood(upgrade);
    return this.count(upgrade) < this.limit(upgrade) && (!good.requires || this.has(good.requires));
  }

  /** How many of `upgrade` the flat has room for now: its `max`, or its `until.max` while what lifts it is not owned. */
  limit(upgrade: HomeUpgrade): number {
    const { max, until } = homeGood(upgrade);
    return until && !this.has(until.upgrade) ? until.max : max;
  }

  /** `buy`, `full` (as many at home as it has spots) or `needs` (what it goes with is not bought yet): the one rule every counter shows. */
  status(upgrade: HomeUpgrade): HomeGoodStatus {
    if (this.count(upgrade) >= this.limit(upgrade)) return 'full';
    return this.canBuy(upgrade) ? 'buy' : 'needs';
  }

  add(upgrade: HomeUpgrade): void {
    this.set({ ...this.state, counts: { ...this.state.counts, [upgrade]: this.state.counts[upgrade] + 1 } });
  }

  /**
   * Once, for a save from before the flat started bare (called with a persisted collection): bookcases enough for `games`
   * boxes (beyond the one that stands from the start), so a collection that grew on self-sizing shelves still stands on
   * shelves. Nothing else is given back.
   */
  shelveCollection(games: number): void {
    // Nothing saved yet with games already owned: a save from before that never bought anything for the flat.
    if (!this.state.shelvesOwed && this.store.exists) return;
    const needed = Math.max(0, Math.ceil(games / BOXES_PER_BOOKCASE) - 1);
    const bookcases = Math.min(this.limit('bookcase'), this.state.counts.bookcase + needed);
    this.set({ counts: { ...this.state.counts, bookcase: bookcases }, shelvesOwed: false });
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private set(state: Saved): void {
    this.state = state;
    this.store.save(state);
    for (const cb of [...this.listeners]) cb();
  }
}

function noneBought(): UpgradeCounts {
  return Object.fromEntries(HOME_UPGRADES.map((u) => [u, 0])) as UpgradeCounts;
}

function everything(): UpgradeCounts {
  return Object.fromEntries(HOME_GOODS.map((g) => [g.id, g.max])) as UpgradeCounts;
}

function readSaved(data: unknown): Saved | null {
  if (typeof data !== 'object' || data === null) return null;
  const { counts: raw, shelvesOwed } = data as { counts?: unknown; shelvesOwed?: unknown };
  if (typeof raw !== 'object' || raw === null) return null;
  const parsed = raw as Partial<Record<string, unknown>>;
  const counts = noneBought();
  for (const u of HOME_UPGRADES) {
    const n = parsed[u];
    if (typeof n === 'number' && n >= 0) counts[u] = Math.min(Math.floor(n), homeGood(u).max);
  }
  return { counts, shelvesOwed: shelvesOwed === true };
}
