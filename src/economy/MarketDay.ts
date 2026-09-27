import type { Today } from '@/time/Today';
import { themeOf, type MarketDayTheme } from './marketDays';
import { eventsOn, marketNews, type MarketEvents, type MarketNews } from './marketEvents';

/**
 * What kind of market day it is, read from the game day: its theme (`marketDays`), what is on
 * (`marketEvents`: the grail, the Grand Flea Fair, the sales) and the talk of the days ahead. For
 * the stalls, the papers, the flyers, the notice board and the journal; the stock itself is
 * `MarketStock`'s.
 */
export class MarketDay {
  constructor(
    private readonly today: Today,
    /** Whether the player owns a game (a grail they have is no news). */
    private readonly owns: (id: string) => boolean,
  ) {}

  /** Today's game day. */
  get day(): number {
    return this.today.gameDay;
  }

  /** What kind of day it is. */
  get theme(): MarketDayTheme {
    return themeOf(this.day);
  }

  /** The theme `ahead` days from now (tomorrow: 1). */
  themeIn(ahead: number): MarketDayTheme {
    return themeOf(this.day + ahead);
  }

  /** What is on today: the grail, the Grand Flea Fair, the sales. */
  get events(): MarketEvents {
    return eventsOn(this.day);
  }

  /** What people are saying about the days ahead (grail rumours, the next Flea Fair, sales). */
  news(): MarketNews[] {
    return marketNews(this.day, this.owns);
  }
}
