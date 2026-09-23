import type { BoxCondition, Game, PlatformId } from '@/catalog/types';
import { PLATFORM_LIST } from '@/catalog/platforms';
import { gameIdFor } from '@/catalog/nointro';
import type { IndexEntry, LibretroIndex } from '@/collection/LibretroIndex';
import type { Fame } from './Fame';
import { MARKET_DISCOUNT, marketPrice } from './pricing';

/** One copy on a market stall. */
export interface StockItem {
  game: Game;
  /** Today's asking price. Provisional (the game priced as ordinary) until `settled` resolves; read it again then. */
  price: number;
  condition: BoxCondition;
  /** Resolves once the fame lookup landed and `price` is final (at once when fame was already known). */
  settled: Promise<void>;
}

export interface MarketStockOptions {
  /** Copies offered per platform each day, drawn in this range (a stall may be sparse or heaped). Default 2 to 8. */
  perPlatform?: { min: number; max: number };
  /** Today's date as YYYY-MM-DD; injectable for a fixed day. */
  today?: () => string;
}

/** Entries that are not a box on a shelf: hacks and translations (square brackets), prototypes, demos, pirates... */
const NOT_A_RELEASE = /\[|\((Beta|Proto|Demo|Sample|Unl|Pirate|Aftermarket|Kiosk|Virtual Console|Program|Promo|Alt[^)]*|Rev [^)]*|v\d[^)]*|Disc [2-9])\)/i;
const WESTERN_REGION = /\((USA|World|Europe)[,)]/;

/**
 * What the flea market has today: a few copies per platform drawn from the libretro-thumbnails
 * index, the same for everyone all day (seeded by the date), priced below the shop by fame and a
 * random condition. Fame comes from Wikipedia one game at a time, so the stock is handed out at
 * once with provisional prices and each item's `settled` tells when its tag is final. Copies already
 * in the collection are left out, so buying one takes it off the stall.
 */
export class MarketStock {
  private readonly perPlatform: { min: number; max: number };
  private readonly today: () => string;
  private cache: { day: string; items: Promise<StockItem[]> } | null = null;

  constructor(
    private readonly index: LibretroIndex,
    private readonly owned: { has(id: string): boolean },
    private readonly fame: Fame,
    options: MarketStockOptions = {},
  ) {
    this.perPlatform = options.perPlatform ?? { min: 2, max: 8 };
    this.today = options.today ?? (() => new Date().toISOString().slice(0, 10));
  }

  /** Today's stock minus what the player already owns. */
  async todays(): Promise<StockItem[]> {
    const day = this.today();
    if (!this.cache || this.cache.day !== day) this.cache = { day, items: this.draw(day) };
    const items = await this.cache.items;
    return items.filter((item) => !this.owned.has(item.game.id));
  }

  private async draw(day: string): Promise<StockItem[]> {
    const rng = seeded(`${day}:market`);
    const discount = MARKET_DISCOUNT.min + rng() * (MARKET_DISCOUNT.max - MARKET_DISCOUNT.min);
    const items: StockItem[] = [];
    for (const platform of PLATFORM_LIST) {
      let entries: readonly IndexEntry[];
      try {
        entries = await this.index.load(platform.id);
      } catch (err) {
        console.warn(`[market] no index for ${platform.shortName}`, err);
        continue;
      }
      const releases = entries.filter((e) => !NOT_A_RELEASE.test(e.name) && WESTERN_REGION.test(e.name));
      const pool = releases.length ? releases : entries;
      const { min, max } = this.perPlatform;
      const count = min + Math.floor(rng() * (max - min + 1));
      for (const entry of pickDistinct(pool, count, rng)) {
        items.push(this.priced(gameFrom(entry, platform.id), drawCondition(rng()), discount));
      }
    }
    return items;
  }

  /** The item at the price its known fame gives, re-priced when the lookup lands (a failed lookup leaves it ordinary). */
  private priced(game: Game, condition: BoxCondition, discount: number): StockItem {
    const item: StockItem = {
      game: { ...game, condition },
      condition,
      price: marketPrice(game, this.fame.peek(game), condition, discount),
      settled: Promise.resolve(),
    };
    item.settled = this.fame.lookup(game).then((views) => {
      item.price = marketPrice(game, views, condition, discount);
    });
    return item;
  }
}

function gameFrom(entry: IndexEntry, platform: PlatformId): Game {
  return {
    id: gameIdFor(platform, entry.name),
    title: entry.title,
    platform,
    region: entry.region,
    status: 'owned',
    externalIds: { libretroName: entry.name },
  };
}

/** Most copies are complete; a fifth lack the manual; one in ten has seen better days. */
function drawCondition(u: number): BoxCondition {
  return u < 0.1 ? 'worn' : u < 0.3 ? 'noManual' : 'complete';
}

function pickDistinct<T>(pool: readonly T[], count: number, rng: () => number): T[] {
  const picked: T[] = [];
  const taken = new Set<number>();
  const n = Math.min(count, pool.length);
  while (picked.length < n) {
    const i = Math.floor(rng() * pool.length);
    if (taken.has(i)) continue;
    taken.add(i);
    picked.push(pool[i]!);
  }
  return picked;
}

/** mulberry32 seeded from a string: same day, same stock. */
function seeded(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
