import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import type { CollectionStore } from '@/collection/CollectionStore';
import type { JobLot, MarketStock } from '@/economy/MarketStock';
import type { Transactions } from '@/economy/Transactions';
import { describeCondition } from '@/economy/pricing';
import { playCoins } from '@/audio/coins';
import { MarketPanel, coinsHtml, escapeHtml } from './MarketPanel';

/**
 * The day's job lot, a crate of a few games from anywhere sold as one: what is in it (and in what
 * state), what it would all cost one by one, the lot's price, one button. Games already in the
 * collection stay in the crate (the price does not change: that is a lot for you). Bought, the
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
      void market.jobLot().then((lot) => {
        this.lot = lot;
        if (this.isOpen) this.refresh();
      }, () => {
        this.body.innerHTML = '<p class="catalogue__empty">No job lot today.</p>';
      });
      return;
    }
    const lot = this.lot;
    const sold = market.lotSold;
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
    const affordable = this.deps.wallet.coins >= lot.price;
    this.body.innerHTML = `
      ${rows}
      <div class="catalogue__row joblot__total">
        <span class="catalogue__title"><b>${lot.games.length} games</b> <span class="catalogue__meta">worth about ${lot.worth} one by one</span></span>
        ${coinsHtml(lot.price)}
        <button type="button" class="ui-btn ui-btn--primary" data-action="buy" data-autofocus ${sold || !affordable ? 'disabled' : ''}>${sold ? 'Sold' : affordable ? 'Buy the lot' : 'Too dear'}</button>
      </div>`;
  }

  /** The lot shown on the crate's card once known. */
  async sign(): Promise<string> {
    if (this.deps.market.lotSold) return 'SOLD';
    const lot = await this.deps.market.jobLot();
    this.lot ??= lot;
    return `${lot.games.length} games · ${lot.price} coins`;
  }

  protected onAction(action: string): void {
    if (action !== 'buy') return;
    const { market, wallet, tx } = this.deps;
    const lot = this.lot;
    if (!lot || market.lotSold) return;
    const bought = tx.buyLot(lot);
    if (!bought.ok) {
      if (bought.reason === 'short') this.setStatus(`The lot is ${lot.price} coins and you have ${wallet.coins}.`, true);
      return;
    }
    const fresh = bought.games.length;
    playCoins(6);
    this.setStatus(`Bought the lot for ${lot.price} coins: ${fresh} new game${fresh === 1 ? '' : 's'} in a parcel in the hallway.`);
    this.onBought?.();
    this.refresh();
  }

  protected onClosed(): void {
    // Asked afresh next time (the market keeps the day's lot): a new market day brings a new one.
    this.lot = null;
  }
}
