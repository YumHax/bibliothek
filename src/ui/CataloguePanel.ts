import type { Game, PlatformId } from '@/catalog/types';
import { PLATFORM_LIST, getPlatform } from '@/catalog/platforms';
import { gameIdFor } from '@/catalog/nointro';
import type { CollectionStore } from '@/collection/CollectionStore';
import type { IndexMatch, LibretroIndex } from '@/collection/LibretroIndex';
import type { Fame } from '@/economy/Fame';
import type { Wallet } from '@/economy/Wallet';
import type { StockItem } from '@/economy/StockItem';
import type { Transactions } from '@/economy/Transactions';
import type { Views } from '@/economy/Fame';
import { describeCondition, shopPrice } from '@/economy/pricing';
import { catalogueSaleOn, mailOrderPrice } from '@/economy/marketEvents';
import { isGrail } from '@/economy/grails';
import { escapeHtml } from './html';
import { ModalPanel } from './ModalPanel';
import { rememberFocus } from './rememberFocus';
import './CataloguePanel.css';

const SEARCH_DEBOUNCE_MS = 250;

export interface CataloguePanelOptions {
  /**
   * Today's market stock, if drawn: a row says when a stall has a (cheaper) copy. With the order
   * calls, a row also offers a second-hand copy put by for the player on its stall in a few days.
   */
  market?: {
    peekToday(): readonly StockItem[] | null;
    orderQuote?(game: Game): Promise<{ price: number; deposit: number; day: number }>;
    order?(game: Game, quote: { price: number; deposit: number; day: number }): void;
    readonly orders?: readonly { game: Game }[];
    readonly day?: number;
  };
  /** Front cover image for a game (a thumbnail per row); none when absent. */
  coverUrl?: (game: Game) => string | undefined;
}

/**
 * The market's order counter: search any game in the libretro-thumbnails index and buy a complete
 * copy at the shop price. A full-screen DOM modal like the collection editor; the Session opens it
 * from the counter, releases the mouse while it is up and re-enters the room when it closes.
 * Prices depend on fame (`Fame`), which arrives after the rows: a row shows the ordinary price
 * greyed and cannot be bought until its lookup lands, then settles; a copy is bought at the price
 * its row shows. A row says so when one of today's stalls has a copy, and at what price.
 */
export class CataloguePanel extends ModalPanel {
  private readonly walletEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly resultsEl: HTMLElement;
  private readonly searchInput: HTMLInputElement;
  private readonly platformSelect: HTMLSelectElement;
  private searchTimer: number | undefined;
  private searchSeq = 0;
  private lastResults: IndexMatch[] = [];
  /** Price shown per result row (index into `lastResults`); what `buy` charges. */
  private prices = new Map<number, number>();
  /** Rows whose price is final (fame known, or its lookup done): only those can be bought. */
  private settled = new Set<number>();
  /** A used copy quoted by a first click on "Used", confirmed by a second. */
  private quoted: { row: number; quote: { price: number; deposit: number; day: number } } | null = null;

  constructor(
    container: HTMLElement,
    private readonly store: CollectionStore,
    private readonly index: LibretroIndex,
    private readonly wallet: Wallet,
    private readonly fame: Fame,
    private readonly tx: Transactions,
    private readonly options: CataloguePanelOptions = {},
  ) {
    super(container, { className: 'ui-modal--sheet catalogue', label: 'Mail order' });
    this.root.innerHTML = `
      <header class="catalogue__header">
        <h2>Mail order</h2>
        <span class="catalogue__wallet"></span>
        <div class="catalogue__actions"><button type="button" class="ui-btn" data-action="close" aria-label="Close">Close</button></div>
      </header>
      <p class="catalogue__blurb">Any game, new and complete, at the catalogue price. Second-hand copies are cheaper on the stalls, and can be ordered: “Used…” puts one by for you on its stall.</p>
      <div class="catalogue__search">
        <input type="search" placeholder="Search a title…" autocomplete="off" spellcheck="false" data-autofocus />
        <select data-role="platform">
          <option value="">All platforms</option>
          ${PLATFORM_LIST.map((p) => `<option value="${p.id}">${escapeHtml(p.shortName)}</option>`).join('')}
        </select>
      </div>
      <div class="catalogue__status"></div>
      <div class="catalogue__scroll ui-card" data-role="results"></div>`;

    this.walletEl = this.root.querySelector('.catalogue__wallet')!;
    this.statusEl = this.root.querySelector('.catalogue__status')!;
    this.resultsEl = this.root.querySelector('[data-role="results"]')!;
    this.searchInput = this.root.querySelector('input[type="search"]')!;
    this.platformSelect = this.root.querySelector('[data-role="platform"]')!;

    this.bindEvents();
    wallet.subscribe(() => {
      this.renderWallet();
      if (this.isOpen && this.lastResults.length) this.renderResults(this.lastResults);
    });
    store.subscribe(() => {
      if (this.isOpen && this.lastResults.length) this.renderResults(this.lastResults);
    });
    this.renderWallet();
  }

  protected onOpened(): void {
    if (this.lastResults.length) this.renderResults(this.lastResults); // today's stalls may have changed
    const sale = catalogueSaleOn(this.day);
    if (sale) this.setStatus(`Sale today: ${Math.round((1 - sale) * 100)}% off every new copy.`);
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
  private priceHtml(game: Game, price: number | null, views: Views): string {
    if (price === null) return 'out of print';
    const usual = shopPrice(game, views);
    return `${usual !== price ? `<s class="catalogue__was">${usual}</s> ` : ''}${price} <span class="catalogue__coin"></span>`;
  }

  protected onClosed(): void {
    this.setStatus('');
  }

  private bindEvents(): void {
    this.root.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
      if (!button) return;
      if (button.dataset.action === 'close') this.close();
      else if (button.dataset.action === 'buy') this.buy(Number(button.dataset.result));
      else if (button.dataset.action === 'order') void this.orderUsed(Number(button.dataset.result), button);
    });
    this.root.addEventListener('change', (e) => {
      if (e.target === this.platformSelect) this.scheduleSearch(0);
    });
    this.searchInput.addEventListener('input', () => this.scheduleSearch(SEARCH_DEBOUNCE_MS));
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.code === 'Enter') this.scheduleSearch(0);
    });
    // A cover that does not exist leaves an empty frame rather than a broken-image icon.
    this.resultsEl.addEventListener('error', (e) => {
      const img = e.target as HTMLElement;
      if (img instanceof HTMLImageElement) img.classList.add('catalogue__cover--missing');
    }, true);
  }

  private renderWallet(): void {
    this.walletEl.textContent = `${this.wallet.coins} coin${this.wallet.coins === 1 ? '' : 's'} in your pocket`;
  }

  private scheduleSearch(delayMs: number): void {
    window.clearTimeout(this.searchTimer);
    this.searchTimer = window.setTimeout(() => void this.runSearch(), delayMs);
  }

  private async runSearch(): Promise<void> {
    const query = this.searchInput.value.trim();
    const platform = (this.platformSelect.value || undefined) as PlatformId | undefined;
    const seq = ++this.searchSeq;
    if (query.length < 2) {
      this.lastResults = [];
      this.resultsEl.innerHTML = '';
      return;
    }
    this.resultsEl.innerHTML = '<p class="catalogue__empty">Leafing through the catalogue…</p>';
    try {
      const results = await this.index.search(query, platform);
      if (seq !== this.searchSeq) return;
      this.lastResults = results;
      this.renderResults(results);
    } catch (err) {
      if (seq !== this.searchSeq) return;
      this.lastResults = [];
      this.resultsEl.innerHTML = `<p class="catalogue__empty">The catalogue is unavailable: ${escapeHtml(String(err))}</p>`;
    }
  }

  private renderResults(results: IndexMatch[]): void {
    this.quoted = null;
    this.prices.clear();
    this.settled.clear();
    if (results.length === 0) {
      this.resultsEl.innerHTML = '<p class="catalogue__empty">Nothing by that name.</p>';
      return;
    }
    const seq = this.searchSeq;
    const onStalls = new Map((this.options.market?.peekToday() ?? []).map((item) => [item.game.id, item]));
    const restoreFocus = rememberFocus(this.resultsEl);
    this.resultsEl.innerHTML = results
      .map((r, i) => {
        const game = this.gameOf(r);
        const views = this.fame.peek(game);
        const known = views !== undefined;
        const price = this.priceOf(game, views);
        this.prices.set(i, price ?? Infinity);
        if (known) this.settled.add(i);
        const cover = this.options.coverUrl?.(game);
        const stall = onStalls.get(game.id);
        return `
          <div class="catalogue__row" data-result="${i}">
            ${cover ? `<img class="catalogue__cover" src="${escapeHtml(cover)}" alt="" loading="lazy" />` : ''}
            <span class="catalogue__title" title="${escapeHtml(r.name)}">${escapeHtml(r.title)}</span>
            ${stall ? `<span class="catalogue__stall">${escapeHtml(stallNote(stall))}</span>` : ''}
            ${r.region ? `<span class="catalogue__meta">${escapeHtml(r.region)}</span>` : ''}
            <span class="catalogue__meta">${escapeHtml(getPlatform(r.platform).shortName)}</span>
            <span class="catalogue__price${known ? '' : ' catalogue__price--pending'}">${this.priceHtml(game, price, views)}</span>
            ${this.buttonHtml(i, game.id)}
            ${this.orderButtonHtml(i, game.id)}
          </div>`;
      })
      .join('');
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

  /** The row's button: owned, still being priced, too dear, or buy. */
  private buttonHtml(i: number, id: string): string {
    const [label, enabled] = this.buttonState(i, id);
    return `<button type="button" class="ui-btn ui-btn--primary" data-action="buy" data-result="${i}" ${enabled ? '' : 'disabled'}>${label}</button>`;
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
    const row = this.resultsEl.querySelector<HTMLElement>(`.catalogue__row[data-result="${i}"]`);
    if (!row) return;
    const priceEl = row.querySelector<HTMLElement>('.catalogue__price');
    const button = row.querySelector<HTMLButtonElement>('button[data-action="buy"]');
    if (priceEl) {
      priceEl.innerHTML = this.priceHtml(game, price, views);
      priceEl.classList.remove('catalogue__price--pending');
    }
    if (button) {
      const [label, enabled] = this.buttonState(i, game.id);
      button.textContent = label;
      button.disabled = !enabled;
    }
  }

  /** "Used": a second-hand copy put by on its stall, for a deposit now and the rest when collected. */
  private orderButtonHtml(i: number, id: string): string {
    const market = this.options.market;
    if (!market?.order || !market.orderQuote || isGrail(id)) return '';
    const onOrder = market.orders?.some((o) => o.game.id === id);
    const disabled = onOrder || this.store.owns(id);
    return `<button type="button" class="ui-btn" data-action="order" data-result="${i}" title="Order a second-hand copy: a deposit now, the rest when you collect it from its stall" ${disabled ? 'disabled' : ''}>${onOrder ? 'On order' : 'Used…'}</button>`;
  }

  /** First click quotes a used copy (price, deposit, the day it arrives); a second one orders it. */
  private async orderUsed(i: number, button: HTMLButtonElement): Promise<void> {
    const market = this.options.market;
    const r = this.lastResults[i];
    if (!r || !market?.orderQuote || !market.order) return;
    const game = this.gameOf(r);
    if (this.quoted?.row !== i) {
      const hadFocus = document.activeElement === button;
      button.disabled = true;
      button.textContent = 'Asking…';
      const quote = await market.orderQuote(game);
      if (this.lastResults[i] !== r) return;
      this.quoted = { row: i, quote };
      const days = quote.day - (market.day ?? quote.day);
      button.disabled = false;
      if (hadFocus) button.focus(); // disabling it dropped the focus
      button.textContent = `${quote.deposit} down?`;
      button.classList.add('sell__armed');
      this.setStatus(`A used, complete copy of "${game.title}": ${quote.price} coins, ${quote.deposit} down now. It will wait for you on the ${getPlatform(game.platform).shortName} stall in ${days} market day${days === 1 ? '' : 's'}. Click again to order.`);
      return;
    }
    const { quote } = this.quoted;
    this.quoted = null;
    const ordered = this.tx.orderUsed(game, quote);
    if (!ordered.ok) {
      if (ordered.reason === 'short') this.setStatus(`The deposit is ${quote.deposit} coins and you have ${this.wallet.coins}.`, true);
      this.renderResults(this.lastResults);
      return;
    }
    this.setStatus(`Ordered: "${game.title}" will be on the ${getPlatform(game.platform).shortName} stall, put by for you. ${quote.price - quote.deposit} coins to pay when you collect it.`);
    this.renderResults(this.lastResults);
  }

  private buy(i: number): void {
    const r = this.lastResults[i];
    if (!r) return;
    const game = this.gameOf(r);
    if (this.store.owns(game.id)) return;
    const price = this.prices.get(i);
    if (price === undefined || !this.settled.has(i)) {
      this.setStatus('Still working out the price of that one.', true);
      return;
    }
    const bought = this.tx.buyMailOrder(game, price);
    if (!bought.ok) {
      if (bought.reason === 'short') this.setStatus(`You need ${price} coins for "${game.title}".`, true);
      return;
    }
    this.setStatus(`Bought "${game.title}" for ${price} coins. It will wait for you in a parcel in the hallway.`);
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

  private setStatus(message: string, isError = false): void {
    this.statusEl.textContent = message;
    this.statusEl.classList.toggle('catalogue__status--error', isError);
  }
}

/** "On the NES stall today: 70 (no manual)", or the bargain bin. */
function stallNote(item: StockItem): string {
  const where = item.source === 'bin' ? 'In the bargain bin today' : `On the ${getPlatform(item.game.platform).shortName} stall today`;
  if (!item.priced) return `${where} (being priced)`;
  const state = describeCondition(item.condition);
  return `${where}: ${item.price}${state ? `, ${state}` : ''}`;
}
