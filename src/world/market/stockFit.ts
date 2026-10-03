import type { PlatformId } from '@/catalog/types';
import { PLATFORM_LIST } from '@/catalog/platforms';
import { widestCaseOf } from '@/catalog/media';
import type { MarketDayTheme } from '@/economy';
import { MARKET_PLAN } from './marketPlan';
import { MarketStall } from './MarketStall';
import { GlassCaseStall } from './GlassCaseStall';
import { BlanketStall } from './BlanketStall';
import { RiserStall } from './RiserStall';
import { BargainBin } from './BargainBin';
import type { StallStyle } from './stallTypes';

/** How many boxes `boxWidth` wide a stall of `style` shows (as `buildStall` builds it: the default widths). */
function stallCapacity(style: StallStyle, boxWidth: number): number {
  switch (style) {
    case 'glass': return GlassCaseStall.capacity(boxWidth);
    case 'blanket': return BlanketStall.capacity(boxWidth);
    case 'risers': return RiserStall.capacity(boxWidth);
    default: return MarketStall.capacity(boxWidth);
  }
}

/**
 * Tells today's stock how much the hall's stalls and bins show, from `MARKET_PLAN` alone (no hall built): what the
 * hall's own `MarketFloor` will tell it, so a draw the street makes first (the collector's case, the garage sale, the
 * barista's tip, the paper) is the very stock the stalls lay out. One stall per platform, in `PLATFORM_LIST` order.
 */
export function fitStockToStalls(market: { fitTo(stall: (platform: PlatformId) => number, bin: (theme: MarketDayTheme) => number): void }): void {
  const styleOf = new Map(PLATFORM_LIST.map((platform, i) => [platform.id, MARKET_PLAN.stalls[i]?.style ?? 'table'] as const));
  // The Grand Flea Fair sets out more bins (as `furnishMarket` does): the day drawn says which.
  const bins = (theme: MarketDayTheme): number => BargainBin.capacity * (1 + (theme.extraBins ? MARKET_PLAN.brocante.bins.length : 0));
  market.fitTo((id) => stallCapacity(styleOf.get(id) ?? 'table', widestCaseOf(id).width), bins);
}
