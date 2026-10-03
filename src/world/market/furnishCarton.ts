import type { Zone } from '../zone/Zone';
import type { BuildContext, LotServices } from '../buildContext';
import { drawSealedLot } from '@/economy/boxLots';
import { SEALED_LOT } from '@/economy/pricing';
import { CartonCorner } from './CartonCorner';
import { MARKET_PLAN } from './marketPlan';

/** How the receipts of a carton bought here name the place. */
const WHERE = 'the flea market';
/** Ordinary games the day's carton is filled from (the index at large). */
const POOL = 14;

/**
 * The flea market's sealed carton of the day (`economy/boxLots.ts`), by the way in: drawn from the market day (the
 * same carton all day, reloads included), gone once bought (`SealedLots.marketSoldOn`), bought through
 * `Transactions.buySealedLot` (the coins, the carton home, one save). Opened at home, in the hallway.
 */
export function furnishCarton(zone: Zone, ctx: BuildContext, lots: LotServices): void {
  const day = ctx.today.gameDay;
  const lot = ctx.market.stock.randomGames(`carton:${day}`, POOL).then((pool) => {
    if (!pool.length) return null;
    const drawn = drawSealedLot(`market:${day}`, pool);
    return { ...drawn, price: Math.max(1, Math.round(drawn.price * SEALED_LOT.marketShare)) };
  });
  zone.placeAt(new CartonCorner({
    lot,
    sold: () => lots.sealed.marketSoldOn(day),
    buy: (carton, session) => {
      const result = lots.tx.buySealedLot(carton.price, () => lots.sealed.add(carton, WHERE, carton.price, day, true));
      if (!result.ok) {
        session.refuse(result.reason === 'short' ? `The carton is ${carton.price} coins and you have ${result.have ?? 0}.` : 'Not today.');
        return false;
      }
      session.reward({ title: `A sealed carton: ${carton.label}`, detail: 'Carried home: it waits in the hallway, to be opened one thing at a time.', coins: -carton.price });
      return true;
    },
  }), MARKET_PLAN.carton);
}
