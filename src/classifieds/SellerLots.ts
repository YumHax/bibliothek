import type { Ad } from './ads';
import type { Classifieds } from './Classifieds';
import { drawLot, type SellerLot, type SellerLotDeps } from './sellerLot';

/**
 * Each ad's lot drawn once a page load (`drawLot`: the same copies whenever it is drawn, priced as fame comes in), so
 * a second visit within the window finds the table as it was left (less what was bought).
 */
export class SellerLots {
  private readonly lots = new Map<string, Promise<SellerLot>>();

  constructor(private readonly deps: SellerLotDeps & { book: Classifieds }) {}

  lotFor(ad: Ad): Promise<SellerLot> {
    let lot = this.lots.get(ad.id);
    if (!lot) {
      lot = drawLot(ad, this.deps, this.deps.book.boughtFrom(ad.id));
      lot.catch(() => this.lots.delete(ad.id));
      this.lots.set(ad.id, lot);
    }
    return lot;
  }
}
