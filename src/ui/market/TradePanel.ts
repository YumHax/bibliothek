import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import type { GameSource } from '@/collection/GameSource';
import type { Fame } from '@/economy/Fame';
import type { StockItem } from '@/economy/StockItem';
import { describeCondition, swapChange, tradeValue } from '@/economy/pricing';
import type { PersonId } from '@/social/types';
import { shortName } from '@/social/people';
import { MarketPanel, type PanelWallet } from './MarketPanel';
import { Arming } from '../confirmTwice';
import { attr, html, paint } from '../panel/html';
import { Speaker } from '../panel/speaker';
import { coverImg, emptyState, gameRow, priceHtml } from '../panel/widgets';
import { isKeepsake } from '@/economy/Transactions';
import { formatCoins } from '@/text/money';
import { capitalise, compareTitles, matchesSearch } from '@/text/strings';

/**
 * A swap at a stall, on the stall's kraft swap tag (a stall scene, `MarketPanel` `scene`): the stallholder at the top,
 * their copy tied on at the head of the tag (cover, title, state, what they ask for it stamped on), then the player's
 * games (not lent out, not on the wishlist) down the tag, each with what it counts for against it in a rubber stamp
 * (`tradeValue`, more than the WE BUY desk pays) and the coins to add on top; a game worth more brings the rest back in
 * coins at the desk's rate (`swapChange`: the button says how much). The first press ties the game on (the row lifts,
 * the stallholder says what they make of it), the second shakes on it (`confirmTwice`), then the Session does the rest
 * (`onSwap`). Values depend on fame: they are looked up together as the tag opens, and the tag is repainted once
 * when they are all in, the buttons keeping their width meanwhile.
 */
export class TradePanel extends MarketPanel {
  private item: StockItem | null = null;
  private onSwap: ((mine: Game, value: number) => string | null) | null = null;
  private readonly arming = new Arming(() => this.refresh());
  private readonly keeper = new Speaker({ name: 'The stallholder' }, { className: 'trade__keeper' });
  private filter = '';
  /** A batch of value lookups on its way: the tag is repainted once when it lands. */
  private valuing = false;
  /** Games whose lookup came back (even empty, offline): valued at the ordinary price, never asked again. */
  private readonly asked = new Set<string>();

  constructor(container: HTMLElement, wallet: PanelWallet, private readonly collection: GameSource, private readonly fame: Fame, private readonly coverUrl?: (game: Game) => string | undefined) {
    super(container, wallet, { title: 'Swap', className: 'trade', search: { placeholder: 'Find one of your games…' }, scene: true });
    // Under the awning, above the search: the keeper first, then what you look through.
    const search = this.root.querySelector('.catalogue__search');
    if (search) search.before(this.keeper.el);
    else this.keeper.mountAbove(this.body);
  }

  /** Sets up a swap for `item` with the stall's keeper (`seller`, their card); the Session opens the panel next. */
  start(options: { item: StockItem; stall: string; seller?: PersonId; onSwap: (mine: Game, value: number) => string | null }): void {
    this.item = options.item;
    this.onSwap = options.onSwap;
    this.arming.reset();
    this.setTitle(`Swap at ${options.stall}`);
    this.keeper.setWho(options.seller ? { name: shortName(options.seller), person: options.seller } : { name: capitalise(options.stall) });
    this.keeper.say(`A swap for ${options.item.game.title}? Show me what you’ve brought.`);
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
    // Their copy tied on at the head of the tag, whatever the filter shows under it.
    const state = describeCondition(item.game.condition);
    const theirs = html`<div class="trade__theirs">
        ${coverImg(this.coverUrl?.(item.game), item.game)}
        <span class="trade__theirs-text"><small>Theirs</small><b>${item.game.title}</b><span class="trade__theirs-meta">${getPlatform(item.game.platform).shortName}${state ? ` · ${state}` : ''}</span></span>
        <span class="trade__stamp trade__stamp--asking"><small>asking</small>${priceHtml(item.due)}</span>
      </div>`;
    const list = games.length
      ? games.map((game) => this.row(game, item))
      : emptyState(this.filter ? 'Nothing by that name in your collection.' : 'Bring some games of your own: this is a swap.', { pictogram: this.filter ? 'magnifier' : 'box', className: 'trade__empty' });
    paint(this.body, html`${theirs}<div class="trade__list">${list}</div>`);
    this.valueAll(games);
  }

  /** Looks up the values still unknown, together; one repaint when they are all in. */
  private valueAll(games: readonly Game[]): void {
    if (this.valuing) return;
    const unknown = games.filter((g) => !this.known(g));
    if (!unknown.length) return;
    this.valuing = true;
    void Promise.allSettled(unknown.map((g) => this.fame.lookup(g))).then(() => {
      for (const g of unknown) this.asked.add(g.id);
      this.valuing = false;
      if (this.isOpen) this.refresh();
    });
  }

  protected override onAction(action: string, el: HTMLElement): void {
    if (action !== 'swap' || !el.dataset.id) return;
    const game = this.collection.games.find((g) => g.id === el.dataset.id);
    if (!game || !this.item || !this.onSwap) return;
    if (!this.known(game)) return;
    const value = tradeValue(game, this.fame.peek(game));
    // Out of reach but still focusable: the press says why instead of doing nothing.
    const topUp = Math.max(0, this.item.due - value);
    if (topUp > this.wallet.coins) {
      this.keeper.say(`${game.title} doesn’t quite cover it, and you’re ${formatCoins(topUp - this.wallet.coins)} short on top.`, 'frown');
      return;
    }
    if (!this.arming.press(game.id)) {
      const change = swapChange(this.item.due, value);
      this.keeper.say(topUp ? `${game.title}? Go on then, with ${formatCoins(topUp)} on top.` : change ? `${game.title}? I’ll have that, and ${formatCoins(change)} back to you.` : `${game.title}? Straight swap. Shake on it?`, 'smile');
      return;
    }
    const failed = this.onSwap(game, value);
    if (failed) {
      this.setStatus(failed, 'error');
      this.refresh();
      return;
    }
    this.close();
  }

  /** Its value is settled: looked up, or asked and nothing came back (the ordinary price then). */
  private known(game: Game): boolean {
    return this.fame.peek(game) !== undefined || this.asked.has(game.id);
  }

  private row(game: Game, item: StockItem) {
    const known = this.known(game);
    const value = tradeValue(game, this.fame.peek(game));
    const topUp = Math.max(0, item.due - value);
    const armed = this.arming.isArmed(game.id);
    const short = topUp > this.wallet.coins;
    // Worth more than what is due: the change comes back in coins, and the button says so.
    const change = swapChange(item.due, value);
    const terms = topUp ? `add ${formatCoins(topUp)}` : change ? `${formatCoins(change)} back` : 'even';
    const label = !known ? 'Valuing…' : short ? `${formatCoins(topUp - this.wallet.coins)} short` : armed ? `Shake on it: ${terms}?` : `Swap, ${terms}`;
    return gameRow({
      id: game.id,
      cover: coverImg(this.coverUrl?.(game), game),
      title: game.title,
      className: armed ? 'trade__row--tied' : undefined,
      metas: [describeCondition(game.condition), getPlatform(game.platform).shortName],
      tail: html`<span class="trade__stamp${known ? '' : ' trade__stamp--pending'}"><small>counts for</small>${known ? priceHtml(value) : html`<span class="catalogue__price">…</span>`}</span><button type="button" data-action="swap" data-id="${game.id}" class="ui-btn trade__swap${armed ? ' ui-btn--armed' : ''}"${attr('disabled', !known)} aria-disabled="${known && short}">${label}</button>`,
    });
  }
}
