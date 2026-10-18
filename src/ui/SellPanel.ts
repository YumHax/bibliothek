import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import type { CollectionStore } from '@/collection/CollectionStore';
import type { Fame, Views } from '@/economy/Fame';
import { isKeepsake, type Transactions } from '@/economy/Transactions';
import type { Wallet } from '@/economy/Wallet';
import { buyBackPrice, describeCondition } from '@/economy/pricing';
import { DESK_BUYER, buyerSays } from '@/economy/deskTalk';
import { loanOf } from '@/collection/loans';
import { playCoins } from '@/audio/coins';
import { Arming } from './confirmTwice';
import { SheetPanel } from './panel/SheetPanel';
import { attr, html, paint, type Html } from './panel/html';
import { Speaker } from './panel/speaker';
import { coverImg, emptyState, gameRow, priceHtml } from './panel/widgets';
import { rememberFocus } from './rememberFocus';
import { formatCoins } from '@/text/money';
import { normaliseTitle } from '@/economy/collectorSets';
import type { PersonId } from '@/social/types';
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
    /** What the row shows and the press says, from the copy and its fame (default: the desk's `buyBackPrice` with `bonus`). */
    offer?: (game: Game, views: Views | undefined) => number;
    /** Why this buyer will not take a copy (said on the press, the row still pressable); null: it will. */
    refuse?: (game: Game, views: Views | undefined) => string | null;
    /** The button's verb ("Sell", "Enter") and the armed line ("Sell for N?"). */
    verb?: string;
    armed?: (offer: number) => string;
    /** The coins come later (a consigned copy's hammer): no coins sound on the press. */
    paysLater?: true;
    /** Who stands behind this table (their face and balloon at the top), and what they say as it opens. */
    who?: { name: string; person?: PersonId };
    greeting?: string;
  };
}

/** The rows' order (`SellPanel.sort`). */
type SortKey = 'title' | 'offer' | 'doubles';

/**
 * The market's WE BUY desk: the player's collection with what the buyer offers for each copy (a
 * share of its shop price, by condition and edition, more with a good reputation; a fake fetches
 * next to nothing: see `buyBackPrice`). Selling takes two clicks (`confirmTwice`: the first arms the
 * row and says the amount), pays the coins, takes the game out of the collection and hands it to
 * the market, which puts it on its platform's stall from the next day; Raymond, the buyer, says a word over each copy
 * (`economy/deskTalk`). Lent-out games cannot be sold (the row says who has it), nor keepsakes: both stay pressable
 * and say why. Offers depend on fame like every price: a row can be sold once its lookup landed. A sheet on the desk's
 * receipt pad (SellPanel.css; the Session opens and closes it).
 */
export class SellPanel extends SheetPanel {
  private readonly arming = new Arming(() => this.render());
  /** Whoever buys, at the top of the pad: Raymond at the desk, the buyer's own person (or a silhouette) elsewhere. */
  private readonly buyerFace: Speaker;
  /** How the rows are ordered: by title, best offers first, or the copies the player has twice first. */
  private sort: SortKey = 'title';

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
      blurb: options.buyer?.blurb ?? `${DESK_BUYER} pays cash on the spot for your games. Whatever you sell goes out on the stalls tomorrow, if you want it back.`,
      className: 'sell',
      wallet,
      search: { placeholder: 'Filter your collection…' },
    });
    store.subscribe(() => {
      if (this.isOpen) this.render();
    });
    this.buyerFace = new Speaker(options.buyer ? (options.buyer.who ?? { name: options.buyer.heading }) : { name: DESK_BUYER });
    this.buyerFace.mountAbove(this.body);
  }

  protected override onOpened(): void {
    this.arming.reset();
    super.onOpened();
    this.buyerFace.say(this.options.buyer ? (this.options.buyer.greeting ?? null) : '“Right, what have you brought me? Cash on the spot, as always.”');
  }

  protected override onSearch(): void {
    this.render();
  }

  protected override onAction(action: string, el: HTMLElement): void {
    if (action === 'sell' && el.dataset.id) this.sell(el.dataset.id);
    else if (action === 'sort' && el.dataset.sort) {
      this.sort = el.dataset.sort as SortKey;
      this.render();
    }
  }

  /** The games the player has (not the wishlist), filtered and by title; offers still unknown are asked for. */
  protected render(): void {
    const query = this.query;
    const games = this.sorted(this.store.games.filter((g) => g.status !== 'wishlist' && matchesSearch(g.title, query)));
    if (!games.length) {
      paint(
        this.body,
        query
          ? emptyState('Nothing by that name in your collection.', { pictogram: 'magnifier', title: 'Not on your shelves' })
          : emptyState('Bring a few games home first: the stalls and the flea market have plenty.', { pictogram: 'box', title: 'Nothing to sell' }),
      );
      return;
    }
    const restoreFocus = rememberFocus(this.body);
    const order = (key: SortKey, label: string) => html`<button type="button" class="sell__sort-btn" data-action="sort" data-sort="${key}" aria-pressed="${this.sort === key ? 'true' : 'false'}">${label}</button>`;
    paint(this.body, html`<div class="sell__sort" role="group" aria-label="Order"><span class="sell__sort-label">Show</span>${order('title', 'A to Z')}${order('offer', 'Best offers first')}${order('doubles', 'Doubles first')}</div>${games.map((game) => this.row(game))}`);
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
      cover: coverImg(this.options.coverUrl?.(game), game),
      title: game.title,
      metas: [this.lentLine(game), describeCondition(game.condition), getPlatform(game.platform).shortName, game.acquired && game.acquired.price > 0 ? `paid ${formatCoins(game.acquired.price)}` : undefined],
      tail: this.priceAndButton(game),
    });
  }

  private priceAndButton(game: Game): Html {
    const views = this.fame.peek(game);
    const known = views !== undefined;
    const offer = this.offerFor(game, views);
    const armed = this.arming.isArmed(game.id);
    const { buyer } = this.options;
    const refused = known ? buyer?.refuse?.(game, views) ?? null : null;
    // Lent out, a keepsake or one this buyer will not take: out of reach, still pressable (it says why); unpriced: a state that passes by itself.
    const out = game.status === 'lent' || isKeepsake(game) || refused !== null;
    const verb = buyer?.verb ?? 'Sell';
    const label = game.status === 'lent' ? 'Lent out' : isKeepsake(game) ? 'Not for sale' : !known ? 'Pricing…' : refused !== null ? 'Not taken' : armed ? (buyer?.armed?.(offer) ?? `${verb} for ${formatCoins(offer)}?`) : verb;
    return html`${priceHtml(offer, { pending: !known })}
      <button type="button" class="ui-btn${armed ? ' ui-btn--armed' : ''}" data-action="sell" data-id="${game.id}"${attr('disabled', !out && !known)} aria-disabled="${out}">${label}</button>`;
  }

  /** The rows in the order picked; unpriced copies go after the priced ones when sorting by offer. */
  private sorted(games: Game[]): Game[] {
    const byTitle = (a: Game, b: Game) => compareTitles(a.title, b.title);
    if (this.sort === 'offer') {
      const offer = (g: Game) => {
        const views = this.fame.peek(g);
        return views === undefined ? -1 : this.offerFor(g, views);
      };
      return games.sort((a, b) => offer(b) - offer(a) || byTitle(a, b));
    }
    if (this.sort === 'doubles') {
      const count = new Map<string, number>();
      const key = (g: Game) => `${g.platform}:${normaliseTitle(g.title)}`;
      for (const g of games) count.set(key(g), (count.get(key(g)) ?? 0) + 1);
      return games.sort((a, b) => (count.get(key(b))! > 1 ? 1 : 0) - (count.get(key(a))! > 1 ? 1 : 0) || byTitle(a, b));
    }
    return games.sort(byTitle);
  }

  /** Who has a lent game and till when, for its row. */
  private lentLine(game: Game): Html | undefined {
    if (game.status !== 'lent') return undefined;
    const loan = loanOf(game.id);
    return html`<span class="catalogue__stall">${loan ? `${loan.who} has it till ${loan.back}` : 'lent out'}</span>`;
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
    if (!game || game.status === 'wishlist') return;
    if (game.status === 'lent') {
      const loan = loanOf(game.id);
      this.setStatus(loan ? `${loan.who} has it till ${loan.back}: it isn’t here to sell.` : 'It’s lent out: it isn’t here to sell.');
      return;
    }
    if (isKeepsake(game)) {
      this.say('“The only one there is? Keep it. Nobody here could put a price on that.”');
      return;
    }
    const views = this.fame.peek(game);
    if (views === undefined) return;
    const { buyer } = this.options;
    const refused = buyer?.refuse?.(game, views) ?? null;
    if (refused !== null) {
      if (refused.startsWith('“')) this.say(refused);
      else this.setStatus(refused);
      return;
    }
    if (!this.arming.press(id)) return;
    const offer = this.offerFor(game, views);
    if (!(buyer ? buyer.sell(game, offer) : this.tx.sellToDesk(game, offer)).ok) return;
    if (!buyer?.paysLater) playCoins(4);
    if (buyer) {
      const line = buyer.soldLine(game, offer);
      if (game.repro) this.buyerFace.say('“A reproduction, I’m afraid: that’s all it’s worth.”', 'frown');
      else if (line.startsWith('“')) this.buyerFace.say(line, 'smile');
      this.setStatus(line.startsWith('“') ? '' : line);
    } else {
      this.buyerFace.say(`“${buyerSays(game, offer)}”`, 'smile');
      this.setStatus(`${game.title} goes out on the ${getPlatform(game.platform).shortName} stall tomorrow.`);
    }
  }

  /** A word from whoever buys, in their balloon. */
  private say(line: string): void {
    this.buyerFace.say(line);
    this.setStatus('');
  }

  private offerFor(game: Game, views: Views | undefined): number {
    return this.options.buyer?.offer?.(game, views) ?? buyBackPrice(game, views, this.bonus);
  }

  /** The share added to every offer: the buyer's own, or the market's reputation. */
  private get bonus(): number {
    return this.options.buyer?.bonus ?? this.options.standing?.buyBackBonus ?? 0;
  }
}
