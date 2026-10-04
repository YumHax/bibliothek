import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import type { CollectionStore } from '@/collection/CollectionStore';
import type { JobLot, MarketStock } from '@/economy/MarketStock';
import { lotOffer } from '@/economy/JobLot';
import type { Transactions } from '@/economy/Transactions';
import { describeCondition } from '@/economy/pricing';
import { playCoins } from '@/audio/coins';
import { MarketPanel } from './MarketPanel';
import { attr, html, paint } from '../panel/html';
import { coverImg, emptyState, gameRow, priceHtml } from '../panel/widgets';
import { formatCount, plural } from '@/text/count';
import { formatCoins } from '@/text/money';

/**
 * The day's job lot, a crate of a few games from anywhere sold as one: what is in it (and in what
 * state), what it would all cost one by one, the lot's price, one button. A game the player has
 * bought since the crate was drawn is taken out, and its part out of the price. Bought, the
 * rest goes to the parcel and the crate reads SOLD for the day (`onBought`).
 */
export class JobLotPanel extends MarketPanel {
  private lot: JobLot | null = null;
  /** Called once the lot is bought (the crate in the hall empties). */
  onBought?: () => void;

  constructor(
    container: HTMLElement,
    private readonly deps: { wallet: { readonly coins: number; subscribe(cb: () => void): () => void }; collection: CollectionStore; market: MarketStock; tx: Transactions },
    private readonly coverUrl?: (game: Game) => string | undefined,
  ) {
    super(container, deps.wallet, { title: 'Job lot', className: 'joblot', blurb: 'A whole crate from a house clearance, sold as it comes. No picking, no haggling.' });
  }

  protected render(): void {
    const { market } = this.deps;
    if (!this.lot) {
      paint(this.body, emptyState('The stallholder is counting what is in the crate…'));
      void market.lot.today().then((lot) => {
        this.lot = lot;
        if (this.isOpen) this.refresh();
      }, () => {
        paint(this.body, emptyState('No job lot today.'));
      });
      return;
    }
    const lot = this.lot;
    const sold = market.lot.sold;
    const rows = lot.games.map((game) =>
      gameRow({
        cover: coverImg(this.coverUrl?.(game), game),
        title: game.title,
        metas: [this.deps.collection.owns(game.id) && html`<span class="catalogue__stall">already yours</span>`, describeCondition(game.condition), getPlatform(game.platform).shortName],
      }),
    );
    const offer = lotOffer(lot, (id) => this.deps.collection.owns(id));
    const taken = lot.games.length - offer.games.length;
    const affordable = this.deps.wallet.coins >= offer.price;
    const none = offer.games.length === 0;
    paint(
      this.body,
      html`${rows}
      <div class="catalogue__row joblot__total">
        <span class="catalogue__title"><b>${formatCount(offer.games.length, 'game')}</b> <span class="catalogue__meta">${taken ? `${taken} already yours, taken out of the price · ` : ''}worth about ${lot.worth} one by one</span></span>
        ${priceHtml(offer.price)}
        <button type="button" class="ui-btn ui-btn--primary" data-action="buy" data-autofocus${attr('disabled', sold || none || !affordable)}>${sold ? 'Sold' : none ? 'All yours already' : affordable ? 'Buy the lot' : 'Too dear'}</button>
      </div>`,
    );
  }

  /** The lot shown on the crate's card once known. */
  async sign(): Promise<string> {
    if (this.deps.market.lot.sold) return 'SOLD';
    const lot = await this.deps.market.lot.today();
    this.lot ??= lot;
    const offer = lotOffer(lot, (id) => this.deps.collection.owns(id));
    return `${offer.games.length} games · ${formatCoins(offer.price)}`;
  }

  protected override onAction(action: string): void {
    if (action !== 'buy') return;
    const { market, wallet, tx } = this.deps;
    const lot = this.lot;
    if (!lot || market.lot.sold) return;
    const price = lotOffer(lot, (id) => this.deps.collection.owns(id)).price;
    const bought = tx.buyLot(lot);
    if (!bought.ok) {
      if (bought.reason === 'short') this.setStatus(`The lot is ${formatCoins(price)} and you have ${wallet.coins}.`, 'error');
      return;
    }
    const fresh = bought.games.length;
    playCoins(6);
    this.setStatus(`Bought the lot for ${formatCoins(price)}: ${fresh} new ${plural(fresh, 'game')} in a parcel in the hallway.`);
    this.onBought?.();
    this.refresh();
  }

  protected override onClosed(): void {
    // Asked afresh next time (the market keeps the day's lot): a new market day brings a new one.
    this.lot = null;
  }
}
