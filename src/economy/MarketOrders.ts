import type { Game } from '@/catalog/types';
import type { Fame } from './Fame';
import type { MarketLedger } from './MarketLedger';
import { MARKET_ORDER, shopPrice } from './pricing';

/** A quote for a used copy ordered at the counter: its price, the deposit paid now, the game day it waits on its stall from. */
export interface OrderQuote {
  price: number;
  deposit: number;
  day: number;
}

/**
 * Used copies ordered at the flea market's counter (the catalogue): quoted from the game's fame,
 * booked with a deposit, laid on their platform's stall from their day (by `MarketStock`'s draw).
 */
export class MarketOrders {
  constructor(private readonly deps: { today: { readonly gameDay: number }; fame: Fame; ledger: MarketLedger }) {}

  /** What ordering a used copy of `game` costs, once its fame is known. */
  async quote(game: Game): Promise<OrderQuote> {
    const views = await this.deps.fame.lookup(game);
    const price = Math.max(1, Math.round(shopPrice(game, views) * MARKET_ORDER.share));
    return { price, deposit: Math.max(1, Math.round(price * MARKET_ORDER.deposit)), day: this.deps.today.gameDay + MARKET_ORDER.days };
  }

  /** Books a used copy of `game` (deposit already paid): it waits on its stall from `quote.day`. */
  place(game: Game, quote: OrderQuote): void {
    this.deps.ledger.order({ game: { ...game, status: 'owned' }, day: quote.day, deposit: quote.deposit, price: quote.price });
  }

  /** The copies on order, due or not. */
  get list(): readonly { game: Game; day: number; deposit: number; price: number }[] {
    return this.deps.ledger.orders;
  }
}
