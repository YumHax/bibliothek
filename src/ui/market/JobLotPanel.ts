import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import type { CollectionStore } from '@/collection/CollectionStore';
import type { JobLot, MarketStock } from '@/economy/MarketStock';
import { lotOffer } from '@/economy/JobLot';
import type { Transactions } from '@/economy/Transactions';
import { describeCondition } from '@/economy/pricing';
import { playCoins } from '@/audio/coins';
import { MarketPanel, coinsHtml, escapeHtml } from './MarketPanel';

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
      this.body.innerHTML = '<p class="catalogue__empty">The stallholder is counting what is in the crate…</p>';
      void market.lot.today().then((lot) => {
        this.lot = lot;
        if (this.isOpen) this.refresh();
      }, () => {
        this.body.innerHTML = '<p class="catalogue__empty">No job lot today.</p>';
      });
      return;
    }
    const lot = this.lot;
    const sold = market.lot.sold;
    const rows = lot.games.map((game) => {
      const cover = this.coverUrl?.(game);
      const state = describeCondition(game.condition);
      const owned = this.deps.collection.owns(game.id);
      return `
        <div class="catalogue__row">
          ${cover ? `<img class="catalogue__cover" src="${escapeHtml(cover)}" alt="" loading="lazy" />` : ''}
          <span class="catalogue__title">${escapeHtml(game.title)}</span>
          ${owned ? '<span class="catalogue__stall">already yours</span>' : ''}
          ${state ? `<span class="catalogue__meta">${escapeHtml(state)}</span>` : ''}
          <span class="catalogue__meta">${escapeHtml(getPlatform(game.platform).shortName)}</span>
        </div>`;
    }).join('');
    const offer = lotOffer(lot, (id) => this.deps.collection.owns(id));
    const taken = lot.games.length - offer.games.length;
    const affordable = this.deps.wallet.coins >= offer.price;
    const none = offer.games.length === 0;
    this.body.innerHTML = `
      ${rows}
      <div class="catalogue__row joblot__total">
        <span class="catalogue__title"><b>${offer.games.length} game${offer.games.length === 1 ? '' : 's'}</b> <span class="catalogue__meta">${taken ? `${taken} already yours, taken out of the price · ` : ''}worth about ${lot.worth} one by one</span></span>
        ${coinsHtml(offer.price)}
        <button type="button" class="ui-btn ui-btn--primary" data-action="buy" data-autofocus ${sold || none || !affordable ? 'disabled' : ''}>${sold ? 'Sold' : none ? 'All yours already' : affordable ? 'Buy the lot' : 'Too dear'}</button>
      </div>`;
  }

  /** The lot shown on the crate's card once known. */
  async sign(): Promise<string> {
    if (this.deps.market.lot.sold) return 'SOLD';
    const lot = await this.deps.market.lot.today();
    this.lot ??= lot;
    const offer = lotOffer(lot, (id) => this.deps.collection.owns(id));
    return `${offer.games.length} games · ${offer.price} coins`;
  }

  protected override onAction(action: string): void {
    if (action !== 'buy') return;
    const { market, wallet, tx } = this.deps;
    const lot = this.lot;
    if (!lot || market.lot.sold) return;
    const price = lotOffer(lot, (id) => this.deps.collection.owns(id)).price;
    const bought = tx.buyLot(lot);
    if (!bought.ok) {
      if (bought.reason === 'short') this.setStatus(`The lot is ${price} coins and you have ${wallet.coins}.`, true);
      return;
    }
    const fresh = bought.games.length;
    playCoins(6);
    this.setStatus(`Bought the lot for ${price} coins: ${fresh} new game${fresh === 1 ? '' : 's'} in a parcel in the hallway.`);
    this.onBought?.();
    this.refresh();
  }

  protected override onClosed(): void {
    // Asked afresh next time (the market keeps the day's lot): a new market day brings a new one.
    this.lot = null;
  }
}
