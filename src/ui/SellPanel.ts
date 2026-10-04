import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import type { CollectionStore } from '@/collection/CollectionStore';
import type { Fame } from '@/economy/Fame';
import { isKeepsake, type Transactions } from '@/economy/Transactions';
import type { Wallet } from '@/economy/Wallet';
import { buyBackPrice, describeCondition } from '@/economy/pricing';
import { playCoins } from '@/audio/coins';
import { Arming } from './confirmTwice';
import { SheetPanel } from './panel/SheetPanel';
import { attr, html, paint, type Html } from './panel/html';
import { coverImg, emptyState, gameRow, priceHtml } from './panel/widgets';
import { rememberFocus } from './rememberFocus';
import { formatCoins } from '@/text/money';
import { compareTitles, matchesSearch } from '@/text/strings';
import './SellPanel.css';

interface SellPanelOptions {
  /** Front cover image for a game (a thumbnail per row). */
  coverUrl?: (game: Game) => string | undefined;
  /** How the market knows the player: its reputation adds to the offers (each sale counts towards it: `Transactions.sellToDesk`). */
  standing?: { readonly buyBackBonus: number };
  /**
   * Someone else buying than the market's desk (the neighbours' party): its heading and blurb, the share added to every
   * offer instead of the reputation's, the sale itself, and the line said after one. Default: the WE BUY desk.
   */
  buyer?: {
    heading: string;
    blurb: string;
    bonus: number;
    sell: (game: Game, offer: number) => { ok: boolean };
    soldLine: (game: Game, offer: number) => string;
  };
}

/**
 * The market's WE BUY desk: the player's collection with what the buyer offers for each copy (a
 * share of its shop price, by condition and edition, more with a good reputation; a fake fetches
 * next to nothing: see `buyBackPrice`). Selling takes two clicks (`confirmTwice`: the first arms the
 * row and says the amount), pays the coins, takes the game out of the collection and hands it to
 * the market, which puts it on its platform's stall from the next day. Lent-out games cannot be
 * sold. Offers depend on fame like every price: a row can be sold once its lookup landed. A sheet
 * like the catalogue (the Session opens and closes it).
 */
export class SellPanel extends SheetPanel {
  private readonly arming = new Arming(() => this.render());

  constructor(
    container: HTMLElement,
    private readonly store: CollectionStore,
    wallet: Wallet,
    private readonly fame: Fame,
    private readonly tx: Transactions,
    private readonly options: SellPanelOptions = {},
  ) {
    super(container, {
      title: options.buyer?.heading ?? 'We buy',
      blurb: options.buyer?.blurb ?? 'Cash on the spot for your games, a fraction of what they sell for. Whatever you sell goes out on the stalls tomorrow, if you want it back.',
      className: 'sell',
      wallet,
      search: { placeholder: 'Filter your collection…' },
    });
    store.subscribe(() => {
      if (this.isOpen) this.render();
    });
  }

  protected override onOpened(): void {
    this.arming.reset();
    super.onOpened();
  }

  protected override onSearch(): void {
    this.render();
  }

  protected override onAction(action: string, el: HTMLElement): void {
    if (action === 'sell' && el.dataset.id) this.sell(el.dataset.id);
  }

  /** The games the player has (not the wishlist), filtered and by title; offers still unknown are asked for. */
  protected render(): void {
    const query = this.query;
    const games = this.store.games
      .filter((g) => g.status !== 'wishlist' && matchesSearch(g.title, query))
      .sort((a, b) => compareTitles(a.title, b.title));
    if (!games.length) {
      paint(this.body, emptyState(query ? 'Nothing by that name in your collection.' : 'Nothing to sell: your collection is empty.'));
      return;
    }
    const restoreFocus = rememberFocus(this.body);
    paint(this.body, html`${games.map((game) => this.row(game))}`);
    restoreFocus();
    for (const game of games) {
      if (this.fame.peek(game) !== undefined) continue;
      void this.fame.lookup(game).then(() => {
        if (this.isOpen) this.refreshRow(game.id);
      });
    }
  }

  private row(game: Game): Html {
    return gameRow({
      id: game.id,
      cover: coverImg(this.options.coverUrl?.(game)),
      title: game.title,
      metas: [describeCondition(game.condition), getPlatform(game.platform).shortName, game.acquired && game.acquired.price > 0 ? `paid ${game.acquired.price}` : undefined],
      tail: this.priceAndButton(game),
    });
  }

  private priceAndButton(game: Game): Html {
    const known = this.fame.peek(game) !== undefined;
    const offer = buyBackPrice(game, this.fame.peek(game), this.bonus);
    const armed = this.arming.isArmed(game.id);
    const [label, enabled] = game.status === 'lent' ? ['Lent out', false] : isKeepsake(game) ? ['Not for sale', false] : !known ? ['Pricing…', false] : armed ? [`Sure? +${offer}`, true] : ['Sell', true];
    return html`${priceHtml(offer, { pending: !known })}
      <button type="button" class="ui-btn${armed ? ' sell__armed' : ''}" data-action="sell" data-id="${game.id}"${attr('disabled', !enabled)}>${label}</button>`;
  }

  private refreshRow(id: string): void {
    const game = this.store.find(id);
    const row = [...this.body.querySelectorAll<HTMLElement>('.catalogue__row')].find((el) => el.dataset.id === id);
    if (!game || !row) return;
    const restoreFocus = rememberFocus(this.body);
    row.outerHTML = this.row(game).markup; // convention-ok: one row of the kit's own markup, repainted in place
    restoreFocus();
  }

  /** First click arms the row; the second, while armed, sells. */
  private sell(id: string): void {
    const game = this.store.find(id);
    if (!game || game.status === 'wishlist' || game.status === 'lent') return;
    if (isKeepsake(game)) {
      this.setStatus('“The only one there is? Keep it. Nobody here could put a price on that.”');
      return;
    }
    if (this.fame.peek(game) === undefined) return;
    if (!this.arming.press(id)) return;
    const offer = buyBackPrice(game, this.fame.peek(game), this.bonus);
    const { buyer } = this.options;
    if (!(buyer ? buyer.sell(game, offer) : this.tx.sellToDesk(game, offer)).ok) return;
    playCoins(4);
    const fake = game.repro ? ' “A reproduction, I’m afraid: that’s all it’s worth.”' : '';
    this.setStatus(buyer ? `${buyer.soldLine(game, offer)}${fake}` : `Sold "${game.title}" for ${formatCoins(offer)}.${fake} It goes out on the ${getPlatform(game.platform).shortName} stall tomorrow.`);
  }

  /** The share added to every offer: the buyer's own, or the market's reputation. */
  private get bonus(): number {
    return this.options.buyer?.bonus ?? this.options.standing?.buyBackBonus ?? 0;
  }
}
