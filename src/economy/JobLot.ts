import type { Game, PlatformId } from '@/catalog/types';
import { PLATFORM_LIST } from '@/catalog/platforms';
import type { IndexEntry } from '@/collection/LibretroIndex';
import type { Fame } from './Fame';
import type { MarketLedger } from './MarketLedger';
import type { MarketStanding } from './MarketStanding';
import { JOB_LOT, MARKET_DISCOUNT, marketPrice } from './pricing';
import { seeded } from './seeded';
import { drawCondition, gameFrom } from './stockDraws';
import { dressCopy } from './copyTraits';

/** The day's job lot: a few games sold together, cheaper than one by one. */
export interface JobLot {
  games: Game[];
  /** What they would cost one by one on the stalls. */
  worth: number;
  price: number;
  /** Each game's part of `price` (by what it would fetch alone), in the order of `games`. */
  shares?: number[];
  /** Some game's fame was unknown when it was priced (priced as a legend): drawn again next time. */
  provisional?: boolean;
}

/** Monthly views priced as the top of the fame curve (`pricing.ts` FAME_CURVE), for a game whose fame is unknown. */
const LEGEND_VIEWS = 200_000;

/**
 * What the lot costs the player now: the games they do not own yet at their part of the price (a
 * game bought elsewhere since the crate was drawn is taken out of it, and out of the price).
 */
export function lotOffer(lot: JobLot, owns: (id: string) => boolean): { games: Game[]; prices: number[]; price: number } {
  const even = lot.price / Math.max(1, lot.games.length);
  const games: Game[] = [];
  const prices: number[] = [];
  lot.games.forEach((game, i) => {
    if (owns(game.id)) return;
    games.push(game);
    prices.push(lot.shares?.[i] ?? even);
  });
  const price = games.length === lot.games.length ? lot.price : games.length ? Math.max(1, Math.round(prices.reduce((a, b) => a + b, 0))) : 0;
  return { games, prices: prices.map((p) => Math.max(0, Math.round(p))), price };
}

export interface JobLotDeps {
  /** The game day the lot is drawn for (`time/Today`). */
  today: { readonly gameDay: number };
  collection: { owns(id: string): boolean };
  fame: Fame;
  ledger: MarketLedger;
  standing: MarketStanding;
  /** The plausible releases of a platform in the index (`MarketStock.releases`). */
  releases: (platform: PlatformId) => Promise<readonly IndexEntry[]>;
}

/**
 * The flea market's job lot: a crate of a few games from anywhere at a share of what they would
 * fetch one by one, the same all game day (seeded by it), gone for the day once bought.
 */
export class JobLotDraw {
  private cache: { day: number; lot: Promise<JobLot> } | null = null;

  constructor(private readonly deps: JobLotDeps) {}

  /** Today's lot (the same all day). */
  today(): Promise<JobLot> {
    const day = this.deps.today.gameDay;
    if (!this.cache || this.cache.day !== day) {
      const lot = this.draw(day);
      const entry = { day, lot };
      this.cache = entry;
      // A lot priced while a fame lookup failed is priced high for safety (see `draw`): asked afresh next time.
      void lot.then((l) => { if (l.provisional && this.cache === entry) this.cache = null; }, () => { if (this.cache === entry) this.cache = null; });
    }
    return this.cache.lot;
  }

  get sold(): boolean {
    return this.deps.ledger.lotBought(this.deps.today.gameDay);
  }

  /** The lot was bought: the crate is empty for the day. */
  sell(): void {
    this.deps.ledger.recordLot(this.deps.today.gameDay);
    this.deps.standing.record('lot');
  }

  /** A crate of a few games from anywhere, at a share of what they would fetch one by one. Each pick has a seed of its own. */
  private async draw(day: number): Promise<JobLot> {
    const rng = seeded(`${day}:lot`);
    const size = JOB_LOT.min + Math.floor(rng() * (JOB_LOT.max - JOB_LOT.min + 1));
    const games: Game[] = [];
    for (let i = 0; i < size * 3 && games.length < size; i++) {
      const r = seeded(`${day}:lot:${i}`);
      const [platformRoll, entryRoll, conditionRoll] = [r(), r(), r()];
      const platform = PLATFORM_LIST[Math.floor(platformRoll * PLATFORM_LIST.length)]!.id;
      const pool = await this.deps.releases(platform).catch(() => [] as readonly IndexEntry[]);
      const entry = pool[Math.floor(entryRoll * pool.length)];
      if (!entry) continue;
      const game = gameFrom(entry, platform);
      const condition = drawCondition(conditionRoll);
      if (games.some((g) => g.id === game.id) || this.deps.collection.owns(game.id)) continue;
      // Each copy dressed from a stream of its own (`copyTraits`): its variant priced in, its past found at home.
      games.push(dressCopy(seeded(`${day}:lot:dress:${i}`), { ...game, condition: condition === 'complete' ? undefined : condition }, { condition }));
    }
    // Priced once every lookup is back. A failed one (offline, Wikipedia down) is priced as a legend, never as an
    // ordinary title: the desk pays with the real fame later, so a lot priced low would be a way to print coins.
    const views = await Promise.all(games.map((g) => this.deps.fame.lookup(g)));
    const provisional = views.some((v) => v === undefined);
    const each = games.map((g, i) => marketPrice(g, views[i] === undefined ? LEGEND_VIEWS : views[i], g.condition ?? 'complete', (MARKET_DISCOUNT.min + MARKET_DISCOUNT.max) / 2));
    const worth = each.reduce((sum, p) => sum + p, 0);
    return { games, worth, price: Math.max(1, Math.round(worth * JOB_LOT.share)), shares: each.map((p) => p * JOB_LOT.share), provisional };
  }
}
