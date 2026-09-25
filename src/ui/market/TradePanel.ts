import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import type { GameSource } from '@/collection/GameSource';
import type { Fame } from '@/economy/Fame';
import type { StockItem } from '@/economy/StockItem';
import { describeCondition, tradeValue } from '@/economy/pricing';
import { MarketPanel, coinsHtml, escapeHtml, type PanelWallet } from './MarketPanel';

/** A click on "Swap" arms the row for this long; a second click within it swaps. */
const CONFIRM_MS = 4000;

/**
 * A swap at a stall: the player's games (not lent out, not on the wishlist) with what each counts
 * for against the copy in hand (`tradeValue`, more than the WE BUY desk pays) and the coins to add
 * on top; no change is given when a game is worth more. Two clicks swap (the first arms the row),
 * then the Session does the rest (`onSwap`). Values depend on fame: a row can be swapped once its
 * lookup landed.
 */
export class TradePanel extends MarketPanel {
  private item: StockItem | null = null;
  private onSwap: ((mine: Game, value: number) => string | null) | null = null;
  private armed: { id: string; until: number } | null = null;
  private filter = '';

  constructor(container: HTMLElement, wallet: PanelWallet, private readonly collection: GameSource, private readonly fame: Fame, private readonly coverUrl?: (game: Game) => string | undefined) {
    super(container, wallet, { title: 'Swap', className: 'trade' });
    this.body.insertAdjacentHTML('beforebegin', '<div class="catalogue__search"><input type="search" placeholder="Filter your collection…" autocomplete="off" spellcheck="false" data-autofocus /></div>');
    const input = this.root.querySelector<HTMLInputElement>('input[type="search"]')!;
    input.addEventListener('input', () => {
      this.filter = input.value.trim().toLowerCase();
      this.render();
    });
  }

  /** Sets up a swap for `item`; the Session opens the panel next. */
  start(options: { item: StockItem; stall: string; onSwap: (mine: Game, value: number) => string | null }): void {
    this.item = options.item;
    this.onSwap = options.onSwap;
    this.armed = null;
    this.setTitle(`Swap at ${options.stall}`, `${options.item.game.title} for ${options.item.due} coins. Offer one of your games against it: whatever it is worth comes off, no change given.`);
  }

  protected render(): void {
    const item = this.item;
    if (!item) return;
    const games = this.collection.games
      .filter((g) => (g.status ?? 'owned') === 'owned' && g.id !== item.game.id && (!this.filter || g.title.toLowerCase().includes(this.filter)))
      .sort((a, b) => a.title.localeCompare(b.title));
    if (!games.length) {
      this.body.innerHTML = `<p class="catalogue__empty">${this.filter ? 'Nothing by that name in your collection.' : 'Nothing to swap: bring some games of your own.'}</p>`;
      return;
    }
    this.body.innerHTML = games.map((game) => this.rowHtml(game, item)).join('');
    for (const game of games) {
      if (this.fame.peek(game) !== undefined) continue;
      void this.fame.lookup(game).then(() => {
        if (this.isOpen) this.render();
      });
    }
  }

  protected onAction(action: string, el: HTMLElement): void {
    if (action !== 'swap' || !el.dataset.id) return;
    const game = this.collection.games.find((g) => g.id === el.dataset.id);
    if (!game || !this.item || !this.onSwap) return;
    const now = performance.now();
    if (!this.armed || this.armed.id !== game.id || now > this.armed.until) {
      this.armed = { id: game.id, until: now + CONFIRM_MS };
      this.render();
      return;
    }
    this.armed = null;
    const failed = this.onSwap(game, tradeValue(game, this.fame.peek(game)));
    if (failed) {
      this.setStatus(failed, true);
      this.render();
      return;
    }
    this.close();
  }

  private rowHtml(game: Game, item: StockItem): string {
    const cover = this.coverUrl?.(game);
    const known = this.fame.peek(game) !== undefined;
    const value = tradeValue(game, this.fame.peek(game));
    const topUp = Math.max(0, item.due - value);
    const state = describeCondition(game.condition);
    const armed = this.armed?.id === game.id && performance.now() <= this.armed.until;
    const short = topUp > this.wallet.coins;
    const label = !known ? 'Valuing…' : short ? 'Too dear' : armed ? `Swap${topUp ? ` +${topUp}` : ''}?` : topUp ? `Swap +${topUp}` : 'Swap even';
    return `
      <div class="catalogue__row">
        ${cover ? `<img class="catalogue__cover" src="${escapeHtml(cover)}" alt="" loading="lazy" />` : ''}
        <span class="catalogue__title">${escapeHtml(game.title)}</span>
        ${state ? `<span class="catalogue__meta">${escapeHtml(state)}</span>` : ''}
        <span class="catalogue__meta">${escapeHtml(getPlatform(game.platform).shortName)}</span>
        <span class="catalogue__meta">counts for</span>${coinsHtml(value)}
        <button type="button" data-action="swap" data-id="${escapeHtml(game.id)}" class="${armed ? 'sell__armed' : ''}" ${!known || short ? 'disabled' : ''}>${label}</button>
      </div>`;
  }
}
