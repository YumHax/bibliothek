import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import type { CollectionStore } from '@/collection/CollectionStore';
import type { Fame } from '@/economy/Fame';
import type { Wallet } from '@/economy/Wallet';
import { buyBackPrice, describeCondition } from '@/economy/pricing';
import { playCoins } from '@/audio/coins';
import { escapeHtml } from './html';
import './CataloguePanel.css';
import './SellPanel.css';

/** A click on "Sell" arms the row for this long; a second click within it sells. */
const CONFIRM_MS = 4000;

export interface SellPanelOptions {
  /** Front cover image for a game (a thumbnail per row). */
  coverUrl?: (game: Game) => string | undefined;
  /** How the market knows the player: its reputation adds to the offers, and each sale counts towards it. */
  standing?: { readonly buyBackBonus: number; record(deed: 'sell'): void };
}

/**
 * The market's WE BUY desk: the player's collection with what the buyer offers for each copy (a
 * share of its shop price, by condition and edition, more with a good reputation; a fake fetches
 * next to nothing: see `buyBackPrice`). Selling takes two clicks (the first
 * arms the row and says the amount), pays the coins, takes the game out of the collection and
 * hands it to the market, which puts it on its platform's stall from the next day. Lent-out games
 * cannot be sold. Offers depend on fame like every price: a row can be sold once its lookup landed.
 * A full-screen DOM modal like the catalogue (the Session opens and closes it).
 */
export class SellPanel {
  private readonly root: HTMLElement;
  private readonly walletEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly listEl: HTMLElement;
  private readonly filterInput: HTMLInputElement;
  /** The row armed by a first click, and until when. */
  private armed: { id: string; until: number } | null = null;

  /** Assigned by the Session so closing from the panel's own UI re-enters the room. */
  onOpenChange?: (open: boolean) => void;

  constructor(
    container: HTMLElement,
    private readonly store: CollectionStore,
    private readonly wallet: Wallet,
    private readonly fame: Fame,
    private readonly market: { consign(game: Game): void },
    private readonly options: SellPanelOptions = {},
  ) {
    this.root = document.createElement('section');
    this.root.className = 'catalogue sell';
    this.root.hidden = true;
    this.root.innerHTML = `
      <header class="catalogue__header">
        <h2>We buy</h2>
        <span class="catalogue__wallet"></span>
        <div class="catalogue__actions"><button type="button" data-action="close">Close</button></div>
      </header>
      <p class="catalogue__blurb">Cash on the spot for your games, a fraction of what they sell for. Whatever you sell goes out on the stalls tomorrow, if you want it back.</p>
      <div class="catalogue__search"><input type="search" placeholder="Filter your collection…" autocomplete="off" spellcheck="false" /></div>
      <div class="catalogue__status"></div>
      <div class="catalogue__scroll" data-role="list"></div>`;
    container.appendChild(this.root);
    this.walletEl = this.root.querySelector('.catalogue__wallet')!;
    this.statusEl = this.root.querySelector('.catalogue__status')!;
    this.listEl = this.root.querySelector('[data-role="list"]')!;
    this.filterInput = this.root.querySelector('input[type="search"]')!;

    for (const type of ['keydown', 'keyup'] as const) {
      this.root.addEventListener(type, (e) => {
        if (e.code !== 'Escape') e.stopPropagation();
      });
    }
    this.root.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
      if (!button) return;
      if (button.dataset.action === 'close') this.close();
      else if (button.dataset.action === 'sell' && button.dataset.id) this.sell(button.dataset.id);
    });
    this.filterInput.addEventListener('input', () => this.render());
    this.listEl.addEventListener('error', (e) => {
      if (e.target instanceof HTMLImageElement) e.target.classList.add('catalogue__cover--missing');
    }, true);
    wallet.subscribe(() => this.renderWallet());
    store.subscribe(() => {
      if (this.isOpen) this.render();
    });
    this.renderWallet();
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(): void {
    if (this.isOpen) return;
    if (document.pointerLockElement) document.exitPointerLock();
    this.root.hidden = false;
    this.armed = null;
    this.render();
    this.filterInput.focus();
    this.onOpenChange?.(true);
  }

  close(): void {
    if (!this.isOpen) return;
    this.root.hidden = true;
    this.setStatus('');
    this.onOpenChange?.(false);
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  private renderWallet(): void {
    this.walletEl.textContent = `${this.wallet.coins} coin${this.wallet.coins === 1 ? '' : 's'} in your pocket`;
  }

  /** The games the player has (not the wishlist), filtered and by title; offers still unknown are asked for. */
  private render(): void {
    const query = this.filterInput.value.trim().toLowerCase();
    const games = this.store.games
      .filter((g) => g.status !== 'wishlist' && (!query || g.title.toLowerCase().includes(query)))
      .sort((a, b) => a.title.localeCompare(b.title));
    if (!games.length) {
      this.listEl.innerHTML = `<p class="catalogue__empty">${query ? 'Nothing by that name in your collection.' : 'Nothing to sell: your collection is empty.'}</p>`;
      return;
    }
    this.listEl.innerHTML = games.map((game) => this.rowHtml(game)).join('');
    for (const game of games) {
      if (this.fame.peek(game) !== undefined) continue;
      void this.fame.lookup(game).then(() => {
        if (this.isOpen) this.refreshRow(game.id);
      });
    }
  }

  private rowHtml(game: Game): string {
    const cover = this.options.coverUrl?.(game);
    const state = describeCondition(game.condition);
    return `
      <div class="catalogue__row" data-id="${escapeHtml(game.id)}">
        ${cover ? `<img class="catalogue__cover" src="${escapeHtml(cover)}" alt="" loading="lazy" />` : ''}
        <span class="catalogue__title">${escapeHtml(game.title)}</span>
        ${state ? `<span class="catalogue__meta">${escapeHtml(state)}</span>` : ''}
        <span class="catalogue__meta">${escapeHtml(getPlatform(game.platform).shortName)}</span>
        ${this.priceAndButton(game)}
      </div>`;
  }

  private priceAndButton(game: Game): string {
    const known = this.fame.peek(game) !== undefined;
    const offer = buyBackPrice(game, this.fame.peek(game), this.options.standing?.buyBackBonus ?? 0);
    const armed = this.isArmed(game.id);
    const [label, enabled] = game.status === 'lent' ? ['Lent out', false] : !known ? ['Pricing…', false] : armed ? [`Sure? +${offer}`, true] : ['Sell', true];
    return `
      <span class="catalogue__price${known ? '' : ' catalogue__price--pending'}">${offer} <span class="catalogue__coin"></span></span>
      <button type="button" class="${armed ? 'sell__armed' : ''}" data-action="sell" data-id="${escapeHtml(game.id)}" ${enabled ? '' : 'disabled'}>${escapeHtml(label)}</button>`;
  }

  private refreshRow(id: string): void {
    const game = this.store.find(id);
    const row = [...this.listEl.querySelectorAll<HTMLElement>('.catalogue__row')].find((el) => el.dataset.id === id);
    if (!game || !row) return;
    row.outerHTML = this.rowHtml(game);
  }

  private isArmed(id: string): boolean {
    return this.armed?.id === id && performance.now() < this.armed.until;
  }

  /** First click arms the row; the second, within `CONFIRM_MS`, sells. */
  private sell(id: string): void {
    const game = this.store.find(id);
    if (!game || game.status === 'wishlist' || game.status === 'lent') return;
    if (this.fame.peek(game) === undefined) return;
    if (!this.isArmed(id)) {
      const previous = this.armed?.id;
      this.armed = { id, until: performance.now() + CONFIRM_MS };
      if (previous && previous !== id) this.refreshRow(previous);
      this.refreshRow(id);
      window.setTimeout(() => {
        if (this.armed?.id === id && !this.isArmed(id)) {
          this.armed = null;
          this.refreshRow(id);
        }
      }, CONFIRM_MS + 50);
      return;
    }
    this.armed = null;
    const offer = buyBackPrice(game, this.fame.peek(game), this.options.standing?.buyBackBonus ?? 0);
    this.market.consign({ ...game, status: 'owned', addedAt: undefined });
    this.wallet.earnCoins(offer);
    this.store.remove(id);
    this.options.standing?.record('sell');
    playCoins(4);
    const fake = game.repro ? ' “A reproduction, I’m afraid: that’s all it’s worth.”' : '';
    this.setStatus(`Sold "${game.title}" for ${offer} coins.${fake} It goes out on the ${getPlatform(game.platform).shortName} stall tomorrow.`);
  }

  private setStatus(message: string, isError = false): void {
    this.statusEl.textContent = message;
    this.statusEl.classList.toggle('catalogue__status--error', isError);
  }
}
