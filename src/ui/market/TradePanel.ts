import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import type { GameSource } from '@/collection/GameSource';
import type { Fame } from '@/economy/Fame';
import type { StockItem } from '@/economy/StockItem';
import { describeCondition, tradeValue } from '@/economy/pricing';
import { MarketPanel, type PanelWallet } from './MarketPanel';
import { Arming } from '../confirmTwice';
import { attr, html, paint } from '../panel/html';
import { coverImg, emptyState, gameRow, priceHtml } from '../panel/widgets';
import { isKeepsake } from '@/economy/Transactions';
import { formatCoins } from '@/text/money';
import { compareTitles, matchesSearch } from '@/text/strings';

/**
 * A swap at a stall: the player's games (not lent out, not on the wishlist) with what each counts
 * for against the copy in hand (`tradeValue`, more than the WE BUY desk pays) and the coins to add
 * on top; no change is given when a game is worth more (the button says how much value is lost). Two
 * clicks swap (the first arms the row, `confirmTwice`), then the Session does the rest (`onSwap`).
 * Values depend on fame: a row can be swapped once its lookup landed.
 */
export class TradePanel extends MarketPanel {
  private item: StockItem | null = null;
  private onSwap: ((mine: Game, value: number) => string | null) | null = null;
  private readonly arming = new Arming(() => this.refresh());
  private filter = '';

  constructor(container: HTMLElement, wallet: PanelWallet, private readonly collection: GameSource, private readonly fame: Fame, private readonly coverUrl?: (game: Game) => string | undefined) {
    super(container, wallet, { title: 'Swap', className: 'trade', search: { placeholder: 'Filter your collection…' } });
  }

  /** Sets up a swap for `item`; the Session opens the panel next. */
  start(options: { item: StockItem; stall: string; onSwap: (mine: Game, value: number) => string | null }): void {
    this.item = options.item;
    this.onSwap = options.onSwap;
    this.arming.reset();
    this.setTitle(`Swap at ${options.stall}`, `${options.item.game.title} for ${formatCoins(options.item.due)}. Offer one of your games against it: whatever it is worth comes off, no change given.`);
  }

  protected override onSearch(query: string): void {
    this.filter = query;
    this.refresh();
  }

  protected render(): void {
    const item = this.item;
    if (!item) return;
    const games = this.collection.games
      .filter((g) => (g.status ?? 'owned') === 'owned' && !isKeepsake(g) && g.id !== item.game.id && matchesSearch(g.title, this.filter))
      .sort((a, b) => compareTitles(a.title, b.title));
    if (!games.length) {
      paint(this.body, emptyState(this.filter ? 'Nothing by that name in your collection.' : 'Nothing to swap: bring some games of your own.'));
      return;
    }
    paint(this.body, html`${games.map((game) => this.row(game, item))}`);
    for (const game of games) {
      if (this.fame.peek(game) !== undefined) continue;
      void this.fame.lookup(game).then(() => {
        if (this.isOpen) this.refresh();
      });
    }
  }

  protected override onAction(action: string, el: HTMLElement): void {
    if (action !== 'swap' || !el.dataset.id) return;
    const game = this.collection.games.find((g) => g.id === el.dataset.id);
    if (!game || !this.item || !this.onSwap) return;
    if (!this.arming.press(game.id)) return;
    const failed = this.onSwap(game, tradeValue(game, this.fame.peek(game)));
    if (failed) {
      this.setStatus(failed, 'error');
      this.refresh();
      return;
    }
    this.close();
  }

  private row(game: Game, item: StockItem) {
    const known = this.fame.peek(game) !== undefined;
    const value = tradeValue(game, this.fame.peek(game));
    const topUp = Math.max(0, item.due - value);
    const armed = this.arming.isArmed(game.id);
    const short = topUp > this.wallet.coins;
    // Worth more than what is due: no change is given, so the button says what the swap throws away.
    const lost = Math.max(0, value - item.due);
    const terms = topUp ? ` +${topUp}` : lost ? ` (−${lost} value)` : ' even';
    const label = !known ? 'Valuing…' : short ? 'Too dear' : armed ? `Swap${terms}?` : `Swap${terms}`;
    return gameRow({
      cover: coverImg(this.coverUrl?.(game)),
      title: game.title,
      metas: [describeCondition(game.condition), getPlatform(game.platform).shortName, 'counts for'],
      tail: html`${priceHtml(value)}<button type="button" data-action="swap" data-id="${game.id}" class="ui-btn${armed ? ' sell__armed' : ''}"${attr('disabled', !known || short)}>${label}</button>`,
    });
  }
}
