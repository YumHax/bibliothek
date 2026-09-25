export const HOME_UPGRADES_STORAGE_KEY = 'bibliothek.home.v1';

/** What can be bought for the flat itself, rather than for the collection (the catalogue is `HOME_GOODS` in `homeGoods.ts`). */
export type HomeUpgrade = 'bookcase' | 'rug' | 'lamp' | 'poster' | 'crt';

const UPGRADES: readonly HomeUpgrade[] = ['bookcase', 'rug', 'lamp', 'poster', 'crt'];

type UpgradeCounts = Record<HomeUpgrade, number>;

/**
 * Furniture bought for the flat: extra bookcases in the bedroom (for the games the collection
 * room has no room left for), and the one-off pieces of `HOME_GOODS`. Counts persist in localStorage; consumers `subscribe`
 * and re-read `count`.
 */
export class HomeUpgrades {
  private counts: UpgradeCounts;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly storage: Storage | null = safeLocalStorage(),
    private readonly key = HOME_UPGRADES_STORAGE_KEY,
  ) {
    this.counts = this.load();
  }

  count(upgrade: HomeUpgrade): number {
    return this.counts[upgrade];
  }

  add(upgrade: HomeUpgrade): void {
    this.counts = { ...this.counts, [upgrade]: this.counts[upgrade] + 1 };
    try {
      this.storage?.setItem(this.key, JSON.stringify(this.counts));
    } catch {
      // storage blocked: the purchase lasts until the page reloads
    }
    for (const cb of [...this.listeners]) cb();
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private load(): UpgradeCounts {
    const counts = Object.fromEntries(UPGRADES.map((u) => [u, 0])) as UpgradeCounts;
    try {
      const raw = this.storage?.getItem(this.key);
      const parsed = raw ? (JSON.parse(raw) as Partial<UpgradeCounts>) : {};
      for (const u of UPGRADES) {
        const n = parsed[u];
        if (typeof n === 'number' && n >= 0) counts[u] = Math.floor(n);
      }
    } catch {
      // unreadable: start with nothing bought
    }
    return counts;
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
