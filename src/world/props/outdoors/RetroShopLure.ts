import { seededRandom } from '@/covers/generated/canvasUtils';
import type { Outdoors } from './Outdoors';

/** What the lure needs of the flea market: today's market day and its stock once drawn. */
export interface MarketNews {
  readonly day: number;
  peekToday(): readonly { game: { platform: string } }[] | null;
}

export interface RetroShopLureOptions {
  /** The shop's stock colour for a platform (a CSS colour). */
  colorOf: (platform: string) => string;
  /** Where the player is now (a zone id): walking into the market counts as having been. */
  here: () => string;
  /** The zone id of the market. Default 'market'. */
  marketZone?: string;
}

/** Seconds between two looks at the market. */
const EVERY = 3;
/** People queueing outside on a day of fresh stock, before the player has been in. */
const QUEUE: [number, number] = [2, 6];

/**
 * The retro games shop across the street as a window onto the flea market: its display shelves
 * show the day's stock (in platform colours), and on a new market day, until the player has been
 * in, a "NOUVEAUTÉS" banner hangs in the window and a few collectors queue at the door. Seen from
 * the flat, it says when it is worth going out.
 */
export class RetroShopLure {
  private stockDay = -1;
  private visitedDay = -1;
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(
    private readonly outdoors: Outdoors,
    private readonly market: MarketNews,
    private readonly options: RetroShopLureOptions,
  ) {
    this.timer = setInterval(() => this.look(), EVERY * 1000);
  }

  dispose(): void {
    clearInterval(this.timer);
  }

  private look(): void {
    const { day } = this.market;
    if (this.options.here() === (this.options.marketZone ?? 'market')) this.visitedDay = day;
    const items = this.market.peekToday();
    if (items && day !== this.stockDay) {
      this.stockDay = day;
      this.outdoors.showShopStock(items.map((item) => this.options.colorOf(item.game.platform)));
    }
    const fresh = items !== null && items.length > 0 && this.visitedDay !== day;
    this.outdoors.showShopBanner(fresh ? 'NOUVEAUTÉS' : null);
    const random = seededRandom(day * 131 + 7);
    this.outdoors.life.setShopQueue(fresh ? QUEUE[0] + Math.floor(random() * (QUEUE[1] - QUEUE[0] + 1)) : 0);
  }
}
