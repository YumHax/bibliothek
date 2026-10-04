import type { ZoneId } from '@/world/zoneIds';
import type { MarketStock } from './MarketStock';

/** Where the player is and when that changes, as the warm-up follows them. */
interface WarmupTriggers {
  /** The zone the player stands in. */
  here(): ZoneId;
  /** The zone the player has just entered. */
  onZoneChange(cb: (zone: ZoneId) => void): void;
  /** A new market day has begun. */
  onNewGameDay(cb: (day: number) => void): () => void;
  /** Whether a zone is the flat's (a trip out starts at the street). */
  inFlat(zone: ZoneId): boolean;
}

/**
 * The flea market's stock is priced on the way there (a fame lookup per copy, 15-20 s for a fresh day): the pricing
 * starts when the player steps out onto Front Street, and again at once if a new market day begins while they are out.
 */
export function warmMarketOnTheWay(market: Pick<MarketStock, 'warm'>, triggers: WarmupTriggers): void {
  triggers.onZoneChange((zone) => {
    if (zone === 'street') market.warm();
  });
  triggers.onNewGameDay(() => {
    if (!triggers.inFlat(triggers.here())) market.warm();
  });
}
