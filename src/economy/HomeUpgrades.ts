import { KEYS, PersistedStore, safeStorage } from '@/persistence';

export const HOME_UPGRADES_STORAGE_KEY = KEYS.home;

/**
 * What can be bought for the flat itself, rather than for the collection (the market's catalogue is
 * `HOME_GOODS` in `homeGoods.ts`; the potted plants for the balcony come from the florist on Front Street).
 */
export type HomeUpgrade = 'bookcase' | 'rug' | 'lamp' | 'poster' | 'crt' | 'plant';

const UPGRADES: readonly HomeUpgrade[] = ['bookcase', 'rug', 'lamp', 'poster', 'crt', 'plant'];

type UpgradeCounts = Record<HomeUpgrade, number>;

/**
 * Furniture bought for the flat: extra bookcases in the bedroom (for the games the collection
 * room has no room left for), and the one-off pieces of `HOME_GOODS`. Counts persist in localStorage; consumers `subscribe`
 * and re-read `count`.
 */
export class HomeUpgrades {
  private counts: UpgradeCounts;
  private readonly listeners = new Set<() => void>();
  private readonly store: PersistedStore<UpgradeCounts>;

  constructor(
    storage: Storage | null = safeStorage(),
    key: string = HOME_UPGRADES_STORAGE_KEY,
  ) {
    // Version 1: a count per upgrade.
    this.store = new PersistedStore<UpgradeCounts>({ key, version: 1, storage, defaults: noneBought, read: readCounts });
    this.counts = this.store.load();
  }

  count(upgrade: HomeUpgrade): number {
    return this.counts[upgrade];
  }

  add(upgrade: HomeUpgrade): void {
    this.counts = { ...this.counts, [upgrade]: this.counts[upgrade] + 1 };
    this.store.save(this.counts);
    for (const cb of [...this.listeners]) cb();
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}

function noneBought(): UpgradeCounts {
  return Object.fromEntries(UPGRADES.map((u) => [u, 0])) as UpgradeCounts;
}

function readCounts(data: unknown): UpgradeCounts | null {
  if (typeof data !== 'object' || data === null) return null;
  const parsed = data as Partial<UpgradeCounts>;
  const counts = noneBought();
  for (const u of UPGRADES) {
    const n = parsed[u];
    if (typeof n === 'number' && n >= 0) counts[u] = Math.floor(n);
  }
  return counts;
}
