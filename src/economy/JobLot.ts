import type { Game, PlatformId } from '@/catalog/types';
import { PLATFORM_LIST } from '@/catalog/platforms';
import type { IndexEntry } from '@/collection/LibretroIndex';
import type { Fame } from './Fame';
import type { MarketLedger } from './MarketLedger';
import type { MarketStanding } from './MarketStanding';
import { JOB_LOT, MARKET_DISCOUNT, marketPrice } from './pricing';
import { seeded } from './seeded';
import { drawCondition, gameFrom } from './stockDraws';

/** The day's job lot: a few games sold together, cheaper than one by one. */
export interface JobLot {
  games: Game[];
  /** What they would cost one by one on the stalls. */
  worth: number;
  price: number;
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
    if (!this.cache || this.cache.day !== day) this.cache = { day, lot: this.draw(day) };
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
      games.push({ ...game, condition: condition === 'complete' ? undefined : condition });
    }
    // Priced once every lookup is back (a failed one leaves its game ordinary).
    const views = await Promise.all(games.map((g) => this.deps.fame.lookup(g)));
    const worth = games.reduce((sum, g, i) => sum + marketPrice(g, views[i], g.condition ?? 'complete', (MARKET_DISCOUNT.min + MARKET_DISCOUNT.max) / 2), 0);
    return { games, worth, price: Math.max(1, Math.round(worth * JOB_LOT.share)) };
  }
}
