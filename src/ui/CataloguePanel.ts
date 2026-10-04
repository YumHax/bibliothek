import type { Game, PlatformId } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { gameIdFor } from '@/catalog/nointro';
import type { CollectionStore } from '@/collection/CollectionStore';
import type { IndexMatch, LibretroIndex } from '@/collection/LibretroIndex';
import type { Fame } from '@/economy/Fame';
import type { Wallet } from '@/economy/Wallet';
import type { StockItem } from '@/economy/StockItem';
import type { Transactions } from '@/economy/Transactions';
import type { Views } from '@/economy/Fame';
import { describeCondition, purchaseClinks, shopPrice } from '@/economy/pricing';
import { catalogueSaleOn, mailOrderPrice } from '@/economy/marketEvents';
import { isGrail } from '@/economy/grails';
import { playCoins } from '@/audio/coins';
import { Arming, armedLine } from './confirmTwice';
import { SheetPanel } from './panel/SheetPanel';
import { attr, html, paint, type Html } from './panel/html';
import { coverImg, emptyState, gameRow, priceHtml } from './panel/widgets';
import { rememberFocus } from './rememberFocus';
import { plural } from '@/text/count';
import { formatCoins } from '@/text/money';

interface CataloguePanelOptions {
  /**
   * Today's market stock, if drawn: a row says when a stall has a (cheaper) copy. With the order
   * calls, a row also offers a second-hand copy put by for the player on its stall in a few days.
   */
  market?: {
    peekToday(): readonly StockItem[] | null;
    /** The counter's orders (`MarketOrders`). */
    readonly orders?: {
      quote(game: Game): Promise<{ price: number; deposit: number; day: number }>;
      place(game: Game, quote: { price: number; deposit: number; day: number }): void;
      readonly list: readonly { game: Game }[];
    };
    readonly day?: number;
  };
  /** Front cover image for a game (a thumbnail per row); none when absent. */
  coverUrl?: (game: Game) => string | undefined;
}

/**
 * The market's order counter: search any game in the libretro-thumbnails index and buy a complete
 * copy at the shop price. A sheet like the collection editor; the Session opens it from the
 * counter, releases the mouse while it is up and re-enters the room when it closes. Prices depend
 * on fame (`Fame`), which arrives after the rows: a row shows the ordinary price greyed and cannot
 * be bought until its lookup lands, then settles; a copy is bought at the price its row shows. A
 * row says so when one of today's stalls has a copy, and at what price.
 */
export class CataloguePanel extends SheetPanel {
  private searchSeq = 0;
  private lastResults: IndexMatch[] = [];
  /** Price shown per result row (index into `lastResults`); what `buy` charges. */
  private prices = new Map<number, number>();
  /** Rows whose price is final (fame known, or its lookup done): only those can be bought. */
  private settled = new Set<number>();
  /** A used copy quoted by a first click on "Used", confirmed by a second. */
  private quoted: { row: number; quote: { price: number; deposit: number; day: number } } | null = null;
  /** A new copy's row clicked once ("N coins?"): a second click orders it (no handing a posted copy back). */
  private readonly buying = new Arming(() => this.repaintArmed());

  constructor(
    container: HTMLElement,
    private readonly store: CollectionStore,
    private readonly index: LibretroIndex,
    private readonly wallet: Wallet,
    private readonly fame: Fame,
    private readonly tx: Transactions,
    private readonly options: CataloguePanelOptions = {},
  ) {
    super(container, {
      title: 'Mail order',
      blurb: 'Any game, new and complete, at the catalogue price. Second-hand copies are cheaper on the stalls, and can be ordered: “Used…” puts one by for you on its stall.',
      className: 'mail-order',
      wallet,
      search: { placeholder: 'Search a title…', platforms: true },
    });
    store.subscribe(() => {
      if (this.isOpen && this.lastResults.length) this.render();
    });
  }

  protected override onOpened(): void {
    super.onOpened();
    const sale = catalogueSaleOn(this.day);
    if (sale) this.setStatus(`Sale today: ${Math.round((1 - sale) * 100)}% off every new copy.`);
  }

  /** Today's stalls may have changed since the last look: the results read again. */
  protected render(): void {
    if (this.lastResults.length) this.renderResults(this.lastResults);
  }

  /** Today's market day (the sale's calendar). */
  private get day(): number {
    return this.options.market?.day ?? 0;
  }

  /** A new copy's price today (the sale off it), or null for a grail: out of print, only ever found at the market. */
  private priceOf(game: Game, views: Views): number | null {
    return mailOrderPrice(game, views, this.day);
  }

  /** The row's price: today's, with the usual one struck out on a sale day. */
  private rowPrice(game: Game, price: number | null, views: Views, pending: boolean): Html {
    if (price === null) return html`<span class="catalogue__price">out of print</span>`;
    return priceHtml(price, { was: shopPrice(game, views), pending });
  }

  protected override onAction(action: string, el: HTMLElement): void {
    const row = Number(el.dataset.result);
    if (action === 'buy') this.buy(row);
    else if (action === 'order') void this.orderUsed(row, el as HTMLButtonElement);
  }

  protected override onSearch(query: string, platform: PlatformId | undefined): void {
    void this.runSearch(query, platform);
  }

  private async runSearch(query: string, platform: PlatformId | undefined): Promise<void> {
    const seq = ++this.searchSeq;
    if (query.length < 2) {
      this.lastResults = [];
      paint(this.body, html``);
      return;
    }
    paint(this.body, emptyState('Leafing through the catalogue…'));
    try {
      const results = await this.index.search(query, platform);
      if (seq !== this.searchSeq) return;
      this.lastResults = results;
      this.renderResults(results);
    } catch (err) {
      if (seq !== this.searchSeq) return;
      this.lastResults = [];
      paint(this.body, emptyState(`The catalogue is unavailable: ${String(err)}`));
    }
  }

  private renderResults(results: IndexMatch[]): void {
    this.quoted = null;
    this.buying.reset();
    this.prices.clear();
    this.settled.clear();
    if (results.length === 0) {
      paint(this.body, emptyState('Nothing by that name.'));
      return;
    }
    const seq = this.searchSeq;
    const onStalls = new Map((this.options.market?.peekToday() ?? []).map((item) => [item.game.id, item]));
    const restoreFocus = rememberFocus(this.body);
    paint(
      this.body,
      html`${results.map((r, i) => {
        const game = this.gameOf(r);
        const views = this.fame.peek(game);
        const known = views !== undefined;
        const price = this.priceOf(game, views);
        this.prices.set(i, price ?? Infinity);
        if (known) this.settled.add(i);
        const stall = onStalls.get(game.id);
        return gameRow({
          id: String(i),
          cover: coverImg(this.options.coverUrl?.(game), game),
          title: r.title,
          metas: [stall && html`<span class="catalogue__stall">${stallNote(stall)}</span>`, r.region, getPlatform(r.platform).shortName],
          tail: html`${this.rowPrice(game, price, views, !known)}${this.buttonHtml(i, game.id)}${this.orderButtonHtml(i, game.id)}`,
        });
      })}`,
    );
    restoreFocus();
    results.forEach((r, i) => {
      const game = this.gameOf(r);
      if (this.fame.peek(game) !== undefined || isGrail(game.id)) return;
      void this.fame.lookup(game).then((views) => {
        if (seq !== this.searchSeq || this.lastResults !== results) return;
        this.settlePrice(i, game, views);
      });
    });
  }

  /** The row's button: owned, still being priced, too dear, armed, or buy. */
  private buttonHtml(i: number, id: string): Html {
    const [label, enabled] = this.buttonState(i, id);
    const armed = this.buying.isArmed(String(i));
    return html`<button type="button" class="ui-btn ui-btn--primary${armed ? ' sell__armed' : ''}" data-action="buy" data-result="${i}"${attr('disabled', !enabled)}>${armed ? `${formatCoins(this.prices.get(i) ?? 0)}?` : label}</button>`;
  }

  private buttonState(i: number, id: string): [label: string, enabled: boolean] {
    if (this.store.owns(id)) return ['Owned', false];
    if (isGrail(id)) return ['Market only', false];
    if (!this.settled.has(i)) return ['Pricing…', false];
    if (!this.wallet.canAfford(this.prices.get(i) ?? Infinity)) return ['Too dear', false];
    return ['Buy', true];
  }

  /** A fame lookup landed: the row shows its real price and whether the wallet still stretches to it. */
  private settlePrice(i: number, game: Game, views: Views): void {
    const price = this.priceOf(game, views);
    this.prices.set(i, price ?? Infinity);
    this.settled.add(i);
    const row = this.body.querySelector<HTMLElement>(`.catalogue__row[data-id="${i}"]`);
    const priceEl = row?.querySelector<HTMLElement>('.catalogue__price');
    const button = row?.querySelector<HTMLElement>('button[data-action="buy"]');
    if (!row || !priceEl || !button) return;
    const restoreFocus = rememberFocus(row);
    priceEl.outerHTML = this.rowPrice(game, price, views, false).markup; // convention-ok: the kit's own markup, repainted in place
    button.outerHTML = this.buttonHtml(i, game.id).markup; // convention-ok: same
    restoreFocus();
  }

  /** The buy buttons read armed or not: repainted in place (the one armed and the one just disarmed). */
  private repaintArmed(): void {
    for (const button of this.body.querySelectorAll<HTMLElement>('button[data-action="buy"]')) {
      const i = Number(button.dataset.result);
      const r = this.lastResults[i];
      if (r) button.outerHTML = this.buttonHtml(i, this.gameOf(r).id).markup; // convention-ok: one button of the kit's own markup, repainted in place
    }
  }

  /** "Used": a second-hand copy put by on its stall, for a deposit now and the rest when collected. */
  private orderButtonHtml(i: number, id: string): Html | '' {
    const market = this.options.market;
    if (!market?.orders || isGrail(id)) return '';
    const onOrder = market.orders.list.some((o) => o.game.id === id);
    const disabled = onOrder || this.store.owns(id);
    return html`<button type="button" class="ui-btn" data-action="order" data-result="${i}"${attr('disabled', disabled)}>${onOrder ? 'On order' : 'Used…'}</button>`;
  }

  /** First click quotes a used copy (price, deposit, the day it arrives); a second one orders it. */
  private async orderUsed(i: number, button: HTMLButtonElement): Promise<void> {
    const market = this.options.market;
    const r = this.lastResults[i];
    if (!r || !market?.orders) return;
    const game = this.gameOf(r);
    if (this.quoted?.row !== i) {
      const hadFocus = document.activeElement === button;
      button.disabled = true;
      button.textContent = 'Asking…';
      const quote = await market.orders.quote(game);
      if (this.lastResults[i] !== r) return;
      this.quoted = { row: i, quote };
      const days = quote.day - (market.day ?? quote.day);
      button.disabled = false;
      if (hadFocus) button.focus(); // disabling it dropped the focus
      button.textContent = `${quote.deposit} down?`;
      button.classList.add('sell__armed');
      this.setStatus(`A used, complete copy of "${game.title}": ${formatCoins(quote.price)}, ${quote.deposit} down now. It will wait for you on the ${getPlatform(game.platform).shortName} stall in ${days} market ${plural(days, 'day')}. ${armedLine('order')}`);
      return;
    }
    const { quote } = this.quoted;
    this.quoted = null;
    const ordered = this.tx.orderUsed(game, quote);
    if (!ordered.ok) {
      if (ordered.reason === 'short') this.setStatus(`The deposit is ${formatCoins(quote.deposit)} and you have ${this.wallet.coins}.`, 'error');
      this.renderResults(this.lastResults);
      return;
    }
    playCoins(2);
    this.setStatus(`Ordered: "${game.title}" will be on the ${getPlatform(game.platform).shortName} stall, put by for you. ${formatCoins(quote.price - quote.deposit)} to pay when you collect it.`);
    this.renderResults(this.lastResults);
  }

  /** First click on "Buy" arms the row ("N coins?"), the second orders the new copy: a posted copy cannot be handed back. */
  private buy(i: number): void {
    const r = this.lastResults[i];
    if (!r) return;
    const game = this.gameOf(r);
    if (this.store.owns(game.id)) return;
    const price = this.prices.get(i);
    if (price === undefined || !this.settled.has(i)) {
      this.setStatus('Still working out the price of that one.', 'error');
      return;
    }
    if (!this.buying.press(String(i))) {
      this.setStatus(`A new copy of "${game.title}" by post: ${formatCoins(price)}. ${armedLine('order')}`);
      return;
    }
    const bought = this.tx.buyMailOrder(game, price);
    if (!bought.ok) {
      if (bought.reason === 'short') this.setStatus(`You need ${formatCoins(price)} for "${game.title}".`, 'error');
      return;
    }
    playCoins(purchaseClinks(price));
    this.setStatus(`Bought "${game.title}" for ${formatCoins(price)}. The postman brings it on his next round: it will be in the hallway.`);
  }

  private gameOf(r: IndexMatch): Game {
    return {
      id: gameIdFor(r.platform, r.name),
      title: r.title,
      platform: r.platform,
      region: r.region,
      externalIds: { libretroName: r.name },
    };
  }
}

/** "On the NES stall today: 70 (no manual)", or the bargain bin. */
function stallNote(item: StockItem): string {
  const where = item.source === 'bin' ? 'In the bargain bin today' : `On the ${getPlatform(item.game.platform).shortName} stall today`;
  if (!item.priced) return `${where} (being priced)`;
  const state = describeCondition(item.condition);
  return `${where}: ${item.price}${state ? `, ${state}` : ''}`;
}
