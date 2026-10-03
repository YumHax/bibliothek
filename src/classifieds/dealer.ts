import type { StockItem } from '@/economy/StockItem';
import { Negotiation } from '@/economy/haggle';
import type { SaleDealer } from '@/game/SessionActions';
import type { Ad } from './ads';
import type { Classifieds } from './Classifieds';
import { SELLERS, type SellerKind } from './rules';

/** What each kind of seller says when asked to hold a copy or take a game in part exchange. */
const REFUSALS: Readonly<Record<SellerKind, { hold: string; swap: string; again: string }>> = {
  clearOut: { hold: 'I can’t keep anything back, love: it all goes today.', swap: 'Oh no, no more games in this house, thank you.', again: 'We agreed already, love.' },
  mover: { hold: 'I’m gone by the weekend. Now or never, sorry.', swap: 'I can’t take anything with me. Coins only.', again: 'We said a price already.' },
  collector: { hold: 'No holds. First come, first served.', swap: 'I’m thinning out, not trading. Coins.', again: 'I gave you my price.' },
  loft: { hold: 'I’d rather it all went today, dear.', swap: 'Goodness, I’m trying to get rid of them.', again: 'We shook on it, didn’t we?' },
};

/**
 * A private seller's rules at the counter (`MarketCounter`, through `ForSaleLike.dealer`): their haggle is the
 * market's `Negotiation` with their kind's temper (`SELLERS[kind].haggle`: a parent clearing out goes low and listens
 * long, a collector barely moves), once per copy, remembered in `Classifieds` with the insults; no holds, no swaps; a
 * sale is noted against their lot (`recordBought`), a copy handed back at once is theirs again.
 */
export class SellerDealer implements SaleDealer {
  constructor(private readonly ad: Ad, private readonly book: Classifieds, private readonly today: () => number) {}

  get day(): number {
    return this.today();
  }

  get noHold(): string {
    return REFUSALS[this.ad.kind].hold;
  }

  get noSwap(): string {
    return REFUSALS[this.ad.kind].swap;
  }

  canNegotiate(item: StockItem): boolean {
    if (!item.priced || this.book.haggleOf(this.ad.id, item.game.id) !== undefined) return false;
    return Negotiation.patienceFor(this.book.souredBy(this.ad.id), false) + SELLERS[this.ad.kind].haggle.patience > 0;
  }

  negotiate(item: StockItem): Negotiation | { line: string } {
    if (!item.priced) return { line: 'Hang on, let me think what it’s worth…' };
    const agreed = this.book.haggleOf(this.ad.id, item.game.id);
    if (agreed !== undefined) return { line: `${REFUSALS[this.ad.kind].again} ${item.price} coins.` };
    const soured = this.book.souredBy(this.ad.id);
    if (Negotiation.patienceFor(soured, false) + SELLERS[this.ad.kind].haggle.patience <= 0) return { line: `I think we’re done haggling. ${item.price} coins.` };
    const negotiation = new Negotiation(item, { day: this.day, soured, loyalty: 0, coffee: false, rain: false });
    negotiation.ease(SELLERS[this.ad.kind].haggle);
    return negotiation;
  }

  settle(item: StockItem, negotiation: Negotiation, insults: number): void {
    this.book.recordHaggle(this.ad.id, item.game.id, negotiation.factor);
    for (let i = 0; i < insults; i++) this.book.sour(this.ad.id);
    item.setHaggle(negotiation.factor);
  }

  sold(item: StockItem): void {
    this.book.recordBought(this.ad.id, item.game.id);
  }

  unsold(item: StockItem): void {
    this.book.unrecordBought(this.ad.id, item.game.id);
  }
}
