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
import { coverImg, emptyState, gameRow, nextTab, priceHtml, tabs } from './panel/widgets';
import { rememberFocus } from './rememberFocus';
import { formatCount, plural } from '@/text/count';
import { compareTitles } from '@/text/strings';
import { formatCoins } from '@/text/money';

/** A used copy quoted at the counter: its price, the deposit paid now, the game day it waits on its stall from. */
interface UsedQuote {
  price: number;
  deposit: number;
  day: number;
}

interface CataloguePanelOptions {
  /**
   * Today's market stock, if drawn: a row says when a stall has a (cheaper) copy. With the order
   * calls, a row also offers a second-hand copy put by for the player on its stall in a few days.
   */
  market?: {
    peekToday(): readonly StockItem[] | null;
    /** The counter's orders (`MarketOrders`). */
    readonly orders?: {
      quote(game: Game): Promise<UsedQuote>;
      place(game: Game, quote: UsedQuote): void;
      readonly list: readonly { game: Game; day: number }[];
    };
    readonly day?: number;
  };
  /** Front cover image for a game (a thumbnail per row); none when absent. */
  coverUrl?: (game: Game) => string | undefined;
}

/** The two pages of the counter: the catalogue searched by title, and the games the player wishes for. */
type Tab = 'catalogue' | 'wishlist';
const TABS: readonly Tab[] = ['catalogue', 'wishlist'];

/**
 * The market's order counter: search any game in the libretro-thumbnails index and buy a complete
 * copy at the shop price, or keep a list of the games wanted. A sheet like the collection editor;
 * the Session opens it from the counter, releases the mouse while it is up and re-enters the room
 * when it closes. Two tabs: the catalogue (the search's results) and the wishlist (each wished-for
 * game with its cover, its price, a stall that has it today or the copy on order, and the same
 * buttons). Prices depend on fame (`Fame`), which arrives after the rows: a row shows the ordinary
 * price greyed and cannot be bought until its lookup lands, then settles; a copy is bought at the
 * price its row shows. A wish taken off the list stays in its place, faded, until the counter is
 * left ("Want it" puts it back), so nothing jumps under the pointer.
 */
export class CataloguePanel extends SheetPanel {
  private tab: Tab = 'catalogue';
  private readonly tabsEl: HTMLElement;
  private searchSeq = 0;
  /** The search's results, as games; empty before a search. */
  private results: Game[] = [];
  /** What the catalogue's page says while a search has no rows: still looking, nothing found, the index not answering. */
  private searchNote = 'Leafing through the catalogue…';
  /** The wishlist as it read when its tab was shown: a wish dropped stays listed (faded) until the tab is read again. */
  private wishes: Game[] = [];
  /** Bumped at every repaint of the rows: a fame lookup landing for an older set of rows is dropped. */
  private rowsSeq = 0;
  /** Price shown per row (index into `rows`); what `buy` charges. */
  private prices = new Map<number, number>();
  /** Rows whose price is final (fame known, or its lookup done): only those can be bought. */
  private settled = new Set<number>();
  /** The used copy last quoted ("N down?" on its row while `arming` holds `order:<row>`). */
  private quoted: { row: number; quote: UsedQuote } | null = null;
  /** The row whose used copy is being asked about. */
  private asking: number | null = null;
  /** A wish just made: its row lights up once. */
  private justWished: string | null = null;
  /** "Buy" ("N coins?") and "Used…" ("N down?"): a first press arms, a second within the time orders; one armed at a time. */
  private readonly arming = new Arming(() => this.repaintButtons());

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
    this.tabsEl = document.createElement('div');
    this.tabsEl.className = 'mail-order__tabs';
    (this.statusEl ?? this.body).before(this.tabsEl);
    store.subscribe(() => {
      if (this.isOpen) this.render();
    });
  }

  /** The rows on show: the search's results or the wishlist. */
  private get rows(): readonly Game[] {
    return this.tab === 'wishlist' ? this.wishes : this.results;
  }

  protected override onOpened(): void {
    this.tab = this.query.length < 2 && this.wishedFor().length ? 'wishlist' : 'catalogue';
    this.readWishes();
    super.onOpened();
    const sale = catalogueSaleOn(this.day);
    if (sale) this.setStatus(`Sale today: ${Math.round((1 - sale) * 100)}% off every new copy.`);
  }

  protected override onClosed(): void {
    this.arming.reset();
    this.justWished = null;
  }

  /** The tabs and the page shown; today's stalls may have changed since the last look, so the rows read again. */
  protected render(): void {
    this.renderTabs();
    if (this.tab === 'wishlist') this.renderWishlist();
    else if (this.results.length) this.renderRows();
    else if (this.query.length < 2) paint(this.body, emptyState('Type a title to leaf through the catalogue: every game, new and complete, sent by post.'));
    else paint(this.body, emptyState(this.searchNote));
  }

  private renderTabs(): void {
    const hadFocus = this.tabsEl.contains(document.activeElement);
    const count = this.wishedFor().length;
    paint(
      this.tabsEl,
      tabs<Tab>({
        tabs: [
          { id: 'catalogue', label: 'Catalogue' },
          { id: 'wishlist', label: html`Your wishlist${count ? html` <span class="ui-badge--solid">${count}</span>` : ''}` },
        ],
        active: this.tab,
        label: 'Mail order',
        idPrefix: 'mail-order-tab',
      }),
    );
    // The tabs' own `data-autofocus` must not steal the opening focus from the search field.
    for (const el of this.tabsEl.querySelectorAll('[data-autofocus]')) el.removeAttribute('data-autofocus');
    if (hadFocus) this.tabsEl.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  }

  private showTab(tab: Tab, fromTabs = false): void {
    if (tab === this.tab) return;
    this.tab = tab;
    this.arming.reset();
    this.quoted = null;
    this.asking = null;
    if (tab === 'wishlist') this.readWishes();
    this.setStatus('');
    this.render();
    if (fromTabs) this.tabsEl.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  }

  /** Left / right on the tabs (or with nothing in a row focused) turn the page; inside a row they walk its buttons. */
  protected override onSide(direction: 1 | -1): boolean {
    if (document.activeElement?.closest('.catalogue__row')) return false;
    this.showTab(nextTab(TABS, this.tab, direction), this.tabsEl.contains(document.activeElement));
    return true;
  }

  /** The games on the wishlist now. */
  private wishedFor(): Game[] {
    return this.store.games.filter((g) => g.status === 'wishlist');
  }

  /** The wishlist read afresh: what is on a stall today first, then what is on order, then the rest by console and title. */
  private readWishes(): void {
    const onStalls = this.stallsToday();
    const ordered = new Set(this.orders().map((o) => o.game.id));
    const rank = (g: Game): number => (onStalls.has(g.id) ? 0 : ordered.has(g.id) ? 1 : 2);
    const platform = this.platform;
    this.arming.reset();
    this.quoted = null;
    this.wishes = this.wishedFor()
      .filter((g) => !platform || g.platform === platform)
      .sort((a, b) => rank(a) - rank(b) || getPlatform(a.platform).shortName.localeCompare(getPlatform(b.platform).shortName) || compareTitles(a.title, b.title));
  }

  /** Today's market day (the sale's calendar). */
  private get day(): number {
    return this.options.market?.day ?? 0;
  }

  private stallsToday(): Map<string, StockItem> {
    return new Map((this.options.market?.peekToday() ?? []).map((item) => [item.game.id, item]));
  }

  private orders(): readonly { game: Game; day: number }[] {
    return this.options.market?.orders?.list ?? [];
  }

  /** A new copy's price today (the sale off it), or null for a grail: out of print, only ever found at the market. */
  private priceOf(game: Game, views: Views): number | null {
    return mailOrderPrice(game, views, this.day);
  }

  /** The row's price: today's, with the usual one struck out on a sale day. */
  private rowPrice(game: Game, price: number | null, views: Views, pending: boolean): Html {
    if (price === null) return html`<span class="catalogue__price catalogue__price--none">out of print</span>`;
    return priceHtml(price, { was: shopPrice(game, views), pending });
  }

  protected override onAction(action: string, el: HTMLElement): void {
    const row = Number(el.dataset.result);
    if (action === 'tab' && (el.dataset.tab === 'catalogue' || el.dataset.tab === 'wishlist')) this.showTab(el.dataset.tab, true);
    else if (action === 'buy') this.buy(row);
    else if (action === 'order') void this.orderUsed(row);
    else if (action === 'want') this.toggleWant(row);
    else if (action === 'to-catalogue') {
      this.showTab('catalogue');
      this.searchInput?.focus();
    }
  }

  /** "Want it": on the wishlist (its card waits on the shelf, the stalls look out for it), or off it again. */
  private toggleWant(i: number): void {
    const game = this.rows[i];
    if (!game || this.store.owns(game.id)) return;
    if (this.store.isWanted(game.id)) {
      this.justWished = null;
      this.store.dropWish(game.id);
      this.setStatus(`"${game.title}" is off your wishlist.`);
    } else {
      this.justWished = game.id;
      this.store.want(game);
      this.setStatus(`"${game.title}" is on your wishlist. Its card waits in its gap on your shelf, and the stallholders will keep an eye out.`, 'ok');
    }
  }

  protected override onSearch(query: string, platform: PlatformId | undefined): void {
    // The console picked with nothing typed narrows the wishlist; words always search the catalogue.
    if (query.length < 2 && this.tab === 'wishlist') {
      this.results = [];
      this.readWishes();
      this.render();
      return;
    }
    if (query.length >= 2) this.showTab('catalogue');
    void this.runSearch(query, platform);
  }

  private async runSearch(query: string, platform: PlatformId | undefined): Promise<void> {
    const seq = ++this.searchSeq;
    if (query.length < 2) {
      this.results = [];
      this.render();
      return;
    }
    if (!this.results.length) {
      this.searchNote = 'Leafing through the catalogue…';
      if (this.tab === 'catalogue') paint(this.body, emptyState(this.searchNote));
    }
    try {
      const found = await this.index.search(query, platform);
      if (seq !== this.searchSeq) return;
      this.results = found.map(gameOf);
      this.arming.reset();
      this.quoted = null;
      this.searchNote = `Nothing by that name${platform ? ` on the ${getPlatform(platform).shortName}` : ''}. Try fewer words.`;
    } catch (err) {
      if (seq !== this.searchSeq) return;
      this.results = [];
      this.searchNote = 'The catalogue isn’t answering. Try again in a moment.';
      console.warn('[catalogue] the index could not be read', err);
    }
    if (this.tab === 'catalogue') this.render();
  }

  /** The wishlist's page: a line on how it stands today, then a row per wish (or why there is none). */
  private renderWishlist(): void {
    if (!this.wishes.length) {
      const any = this.wishedFor().length > 0;
      paint(
        this.body,
        html`<div class="mail-order__wish-empty">
          <p class="mail-order__wish-empty-title">${any ? 'None of your wishes is for that console.' : 'Nothing on your wishlist yet.'}</p>
          <p class="mail-order__wish-empty-text">${any ? 'Pick “All platforms” to see them all.' : 'Find a game in the catalogue and press “Want it”: its card waits in its gap on your shelf, and the stallholders keep an eye out for it.'}</p>
          ${any ? '' : html`<button type="button" class="ui-btn ui-btn--primary" data-action="to-catalogue">Search the catalogue</button>`}
        </div>`,
      );
      return;
    }
    const onStalls = this.stallsToday();
    const ordered = new Set(this.orders().map((o) => o.game.id));
    const wanted = this.wishes.filter((g) => this.store.isWanted(g.id));
    const today = wanted.filter((g) => onStalls.has(g.id)).length;
    const onOrder = wanted.filter((g) => ordered.has(g.id)).length;
    this.renderRows(html`<div class="mail-order__wish-head">
      <span class="mail-order__wish-count">${formatCount(wanted.length, 'game')} wished for</span>
      ${today ? html`<span class="ui-chip ui-chip--accent">${today} on the stalls today</span>` : ''}
      ${onOrder ? html`<span class="ui-chip">${onOrder} on order</span>` : ''}
      <span class="mail-order__wish-note">Each one has its card on your shelf, and the stallholders know you’re looking.</span>
    </div>`);
  }

  /** The rows on show, each with its price (settled as the fame lookups land) and its buttons. */
  private renderRows(head: Html | '' = ''): void {
    this.prices.clear();
    this.settled.clear();
    const seq = ++this.rowsSeq;
    const rows = this.rows;
    const wishlist = this.tab === 'wishlist';
    const onStalls = this.stallsToday();
    const orders = new Map(this.orders().map((o) => [o.game.id, o]));
    const restoreFocus = rememberFocus(this.body);
    paint(
      this.body,
      html`${head}${rows.map((game, i) => {
        const views = this.fame.peek(game);
        const known = views !== undefined;
        const price = this.priceOf(game, views);
        this.prices.set(i, price ?? Infinity);
        if (known) this.settled.add(i);
        const stall = onStalls.get(game.id);
        const order = orders.get(game.id);
        const dropped = wishlist && !this.store.isWanted(game.id) && !this.store.owns(game.id);
        const classes = ['mail-order__row', wishlist && 'mail-order__row--wish', dropped && 'mail-order__row--dropped', this.justWished === game.id && 'mail-order__row--wished'].filter(Boolean).join(' ');
        return gameRow({
          id: String(i),
          className: classes,
          cover: coverImg(this.options.coverUrl?.(game), game),
          title: game.title,
          metas: [
            stall && html`<span class="catalogue__stall">${stallNote(stall)}</span>`,
            wishlist && !stall && order && html`<span class="ui-chip">${orderNote(order.day, this.day, game)}</span>`,
            wishlist && !stall && !order && isGrail(game.id) && html`<span class="ui-chip">Only ever found at the market</span>`,
            game.region,
            getPlatform(game.platform).shortName,
          ],
          tail: html`<span class="mail-order__tail">${this.rowPrice(game, price, views, !known)}${this.wantButtonHtml(i, game)}${this.buttonHtml(i, game.id)}${this.orderButtonHtml(i, game.id)}</span>`,
        });
      })}`,
    );
    restoreFocus();
    this.justWished = null;
    rows.forEach((game, i) => {
      if (this.fame.peek(game) !== undefined || isGrail(game.id)) return;
      void this.fame.lookup(game).then((views) => {
        if (seq === this.rowsSeq) this.settlePrice(i, game, views);
      });
    });
  }

  /**
   * "Want it" beside a game the player has not got, a toggle: pressed it reads "Wanted", and "Not wanted" under the
   * pointer or the focus (both words always laid out, so the button never changes width).
   */
  private wantButtonHtml(i: number, game: Game): Html | '' {
    if (this.store.owns(game.id)) return '';
    const wanted = this.store.isWanted(game.id);
    return html`<button type="button" class="ui-btn mail-order__want" data-action="want" data-result="${i}" aria-pressed="${wanted}" aria-label="Want ${game.title}">
      <span class="mail-order__want-label" aria-hidden="true">Want it</span>
      <span class="mail-order__want-label" aria-hidden="true">Wanted</span>
      <span class="mail-order__want-label" aria-hidden="true">Not wanted</span>
    </button>`;
  }

  /**
   * The row's button: owned, still being priced, out of reach (still focusable: a press says why), armed, or buy. Out
   * of reach reads "N short" like the other counters.
   */
  private buttonHtml(i: number, id: string): Html {
    const [label, state] = this.buttonState(i, id);
    const armed = this.arming.isArmed(`buy:${i}`);
    return html`<button type="button" class="ui-btn ui-btn--primary${armed ? ' sell__armed' : ''}" data-action="buy" data-result="${i}"${attr('disabled', state === 'off')} aria-disabled="${state === 'why'}">${armed ? `${formatCoins(this.prices.get(i) ?? 0)}?` : label}</button>`;
  }

  private buttonState(i: number, id: string): [label: string, state: 'on' | 'off' | 'why'] {
    if (this.store.owns(id)) return ['Owned', 'off'];
    if (isGrail(id)) return ['Market only', 'why'];
    if (!this.settled.has(i)) return ['Pricing…', 'off'];
    const price = this.prices.get(i) ?? Infinity;
    if (!this.wallet.canAfford(price)) return [`${formatCoins(price - this.wallet.coins)} short`, 'why'];
    return ['Buy new', 'on'];
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

  /** The buy and used buttons read armed or not: repainted in place, the focus kept. */
  private repaintButtons(): void {
    const restoreFocus = rememberFocus(this.body);
    for (const button of this.body.querySelectorAll<HTMLElement>('button[data-action="buy"], button[data-action="order"]')) {
      const i = Number(button.dataset.result);
      const game = this.rows[i];
      if (!game) continue;
      const markup = button.dataset.action === 'buy' ? this.buttonHtml(i, game.id) : this.orderButtonHtml(i, game.id);
      if (markup) button.outerHTML = markup.markup; // convention-ok: one button of the kit's own markup, repainted in place
    }
    restoreFocus();
  }

  /** "Used…": a second-hand copy put by on its stall, for a deposit now and the rest when collected. */
  private orderButtonHtml(i: number, id: string): Html | '' {
    if (!this.options.market?.orders || isGrail(id)) return '';
    const onOrder = this.orders().some((o) => o.game.id === id);
    const armed = this.quoted?.row === i && this.arming.isArmed(`order:${i}`);
    const label = onOrder ? 'On order' : this.asking === i ? 'Asking…' : armed ? `${formatCoins(this.quoted!.quote.deposit)} down?` : 'Used…';
    return html`<button type="button" class="ui-btn${armed ? ' sell__armed' : ''}" data-action="order" data-result="${i}"${attr('disabled', onOrder || this.asking === i || this.store.owns(id))}>${label}</button>`;
  }

  /** First press asks the stall for a used copy (price, deposit, the day it arrives) and arms; a second one orders it. */
  private async orderUsed(i: number): Promise<void> {
    const market = this.options.market;
    const game = this.rows[i];
    if (!game || !market?.orders || this.asking !== null) return;
    const key = `order:${i}`;
    if (this.quoted?.row === i && this.arming.isArmed(key)) {
      const { quote } = this.quoted;
      this.quoted = null;
      this.arming.reset();
      const ordered = this.tx.orderUsed(game, quote);
      if (!ordered.ok) {
        if (ordered.reason === 'short') this.setStatus(`The deposit is ${formatCoins(quote.deposit)} and you have ${formatCoins(this.wallet.coins)}.`, 'error');
        this.repaintButtons();
        return;
      }
      playCoins(2);
      this.setStatus(`Ordered: "${game.title}" will be put by for you on the ${getPlatform(game.platform).shortName} stall. ${formatCoins(quote.price - quote.deposit)} to pay when you collect it.`, 'ok');
      this.render();
      return;
    }
    const rows = this.rows;
    this.asking = i;
    this.repaintButtons();
    const quote = await market.orders.quote(game);
    this.asking = null;
    if (this.rows !== rows || !this.isOpen) return;
    this.quoted = { row: i, quote };
    this.arming.press(key);
    const days = Math.max(0, quote.day - this.day);
    this.setStatus(`A used, complete copy of "${game.title}": ${formatCoins(quote.price)}, ${formatCoins(quote.deposit)} down now. It will wait for you on the ${getPlatform(game.platform).shortName} stall in ${days} market ${plural(days, 'day')}. ${armedLine('order it')}`);
  }

  /** First press on "Buy new" arms the row ("N coins?"), the second orders the new copy: a posted copy cannot be handed back. */
  private buy(i: number): void {
    const game = this.rows[i];
    if (!game || this.store.owns(game.id)) return;
    if (isGrail(game.id)) {
      this.setStatus(`"${game.title}" is out of print: only ever found at the market.${this.store.isWanted(game.id) ? ' The stallholders know you want it.' : ' “Want it” and the stallholders will keep an eye out.'}`);
      return;
    }
    const price = this.prices.get(i);
    if (price === undefined || !this.settled.has(i)) {
      this.setStatus('Still working out the price of that one.', 'error');
      return;
    }
    if (!this.wallet.canAfford(price)) {
      this.setStatus(`You’re ${formatCoins(price - this.wallet.coins)} short for "${game.title}". The arcade pays in tickets, the prize counter swaps them for coins.`);
      return;
    }
    if (!this.arming.press(`buy:${i}`)) {
      this.setStatus(`A new copy of "${game.title}" by post: ${formatCoins(price)}. ${armedLine('order it')}`);
      return;
    }
    const bought = this.tx.buyMailOrder(game, price);
    if (!bought.ok) {
      if (bought.reason === 'short') this.setStatus(`You need ${formatCoins(price)} for "${game.title}".`, 'error');
      return;
    }
    playCoins(purchaseClinks(price));
    this.setStatus(`Bought "${game.title}" for ${formatCoins(price)}. The postman brings it on his next round: it will be in the hallway.`, 'ok');
  }
}

function gameOf(r: IndexMatch): Game {
  return {
    id: gameIdFor(r.platform, r.name),
    title: r.title,
    platform: r.platform,
    region: r.region,
    externalIds: { libretroName: r.name },
  };
}

/** "On the NES stall today: 70 (no manual)", or the bargain bin. */
function stallNote(item: StockItem): string {
  const where = item.source === 'bin' ? 'In the bargain bin today' : `On the ${getPlatform(item.game.platform).shortName} stall today`;
  if (!item.priced) return `${where} (being priced)`;
  const state = describeCondition(item.condition);
  return `${where}: ${formatCoins(item.price)}${state ? `, ${state}` : ''}`;
}

/** A used copy on order: "On order: on the NES stall in 3 days", or waiting there now. */
function orderNote(day: number, today: number, game: Game): string {
  const stall = `the ${getPlatform(game.platform).shortName} stall`;
  const days = day - today;
  return days > 0 ? `On order: on ${stall} in ${days} market ${plural(days, 'day')}` : `On order: waiting on ${stall}`;
}
