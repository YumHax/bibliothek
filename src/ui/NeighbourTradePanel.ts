import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import type { NeighbourTrades, TradeOffer } from '@/economy/NeighbourTrades';
import type { Transactions } from '@/economy/Transactions';
import { MarketPanel, escapeHtml, type PanelWallet } from './market/MarketPanel';

/**
 * A neighbour's swap at their door on the stairs: what they give, what they want of the player's,
 * Swap or No thanks. `prepare(offer)` before the Session opens it (`SessionActions.openPanel`).
 * The swap goes through `Transactions.swapWithNeighbour` (the game given leaves the collection,
 * theirs goes into the parcel) and closes the offer in the same save.
 */
export class NeighbourTradePanel extends MarketPanel {
  private offer: TradeOffer | null = null;
  private outcome: string | null = null;

  constructor(
    container: HTMLElement,
    wallet: PanelWallet,
    private readonly deps: { trades: NeighbourTrades; tx: Transactions; collection: { find(id: string): Game | undefined } },
    private readonly coverUrl?: (game: Game) => string | undefined,
  ) {
    super(container, wallet, { title: 'A swap on the landing', className: 'neighbour-trade' });
  }

  /** The offer the panel shows next time it opens. */
  prepare(offer: TradeOffer): void {
    this.offer = offer;
    this.outcome = null;
    this.setTitle(`${offer.who}, ${offer.floor}`, 'A neighbour with a game to swap. No coins change hands.');
  }

  protected render(): void {
    const offer = this.offer;
    if (!offer) {
      this.body.innerHTML = '<p class="catalogue__empty">Nobody answers.</p>';
      return;
    }
    if (this.outcome) {
      this.body.innerHTML = `<p class="catalogue__empty">${escapeHtml(this.outcome)}</p>`;
      return;
    }
    const mine = this.deps.collection.find(offer.wants.id);
    const can = this.deps.trades.canSwap(offer);
    this.body.innerHTML = `
      ${this.row(offer.gives, 'theirs')}
      ${mine ? this.row(mine, 'yours') : `<div class="catalogue__row"><span class="catalogue__title">${escapeHtml(offer.wants.title)}</span><span class="catalogue__stall">not yours any more</span></div>`}
      <div class="catalogue__row">
        <span class="catalogue__title">${can ? `Your ${escapeHtml(offer.wants.title)} for their ${escapeHtml(offer.gives.title)}?` : escapeHtml(why(offer, !!mine))}</span>
        <button type="button" class="ui-btn ui-btn--primary" data-action="swap" data-autofocus ${can ? '' : 'disabled'}>Swap</button>
        <button type="button" class="ui-btn" data-action="decline">No thanks</button>
      </div>`;
  }

  protected onAction(action: string): void {
    const offer = this.offer;
    if (!offer || this.outcome) return;
    const { trades, tx, collection } = this.deps;
    if (action === 'decline') {
      trades.decline(offer);
      this.outcome = `"No worries, I'll ask around." ${offer.who} closes the door.`;
      this.refresh();
      return;
    }
    if (action !== 'swap') return;
    const mine = collection.find(offer.wants.id);
    if (!mine) return;
    const done = tx.swapWithNeighbour(mine, offer.gives, `${offer.who}, ${offer.floor}`, () => trades.complete(offer));
    if (!done.ok) {
      this.setStatus(done.reason === 'owned' ? `You have ${offer.gives.title} already.` : `You no longer have ${offer.wants.title} to give.`, true);
      return;
    }
    this.outcome = `Deal. ${offer.gives.title} is yours: it waits in the parcel under the hall console with anything else new.`;
    this.refresh();
  }

  private row(game: Game, whose: string): string {
    const cover = this.coverUrl?.(game);
    return `
      <div class="catalogue__row">
        ${cover ? `<img class="catalogue__cover" src="${escapeHtml(cover)}" alt="" loading="lazy" />` : ''}
        <span class="catalogue__title">${escapeHtml(game.title)}</span>
        <span class="catalogue__stall">${whose}</span>
        <span class="catalogue__meta">${escapeHtml(getPlatform(game.platform).shortName)}</span>
      </div>`;
  }
}

function why(offer: TradeOffer, owned: boolean): string {
  if (!owned) return `You no longer have ${offer.wants.title}.`;
  return `${offer.wants.title} is lent out, or you have ${offer.gives.title} already.`;
}
