import type { Game, PlatformId } from '@/catalog/types';
import { PLATFORM_LIST, getPlatform } from '@/catalog/platforms';
import { gameIdFor } from '@/catalog/nointro';
import type { CollectionStore } from '@/collection/CollectionStore';
import type { IndexMatch, LibretroIndex } from '@/collection/LibretroIndex';
import type { Fame } from '@/economy/Fame';
import type { Wallet } from '@/economy/Wallet';
import { shopPrice } from '@/economy/pricing';
import { escapeHtml } from './html';
import './CataloguePanel.css';

const SEARCH_DEBOUNCE_MS = 250;

/**
 * The market's order counter: search any game in the libretro-thumbnails index and buy a complete
 * copy at the shop price. A full-screen DOM modal like the collection editor; the Session opens it
 * from the counter, releases the mouse while it is up and re-enters the room when it closes.
 * Prices depend on fame (`Fame`), which arrives after the rows: a row shows the ordinary price
 * until its lookup lands, then settles; a copy is bought at the price its row shows.
 */
export class CataloguePanel {
  private readonly root: HTMLElement;
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

  /** Assigned by the Session so closing from the panel's own UI re-enters the room. */
  onOpenChange?: (open: boolean) => void;

  constructor(
    container: HTMLElement,
    private readonly store: CollectionStore,
    private readonly index: LibretroIndex,
    private readonly wallet: Wallet,
    private readonly fame: Fame,
  ) {
    this.root = document.createElement('section');
    this.root.className = 'catalogue';
    this.root.hidden = true;
    this.root.innerHTML = `
      <header class="catalogue__header">
        <h2>Mail order</h2>
        <span class="catalogue__wallet"></span>
        <div class="catalogue__actions"><button type="button" data-action="close">Close</button></div>
      </header>
      <p class="catalogue__blurb">Any game, new and complete, at the catalogue price. Second-hand copies are cheaper on the stalls.</p>
      <div class="catalogue__search">
        <input type="search" placeholder="Search a title…" autocomplete="off" spellcheck="false" />
        <select data-role="platform">
          <option value="">All platforms</option>
          ${PLATFORM_LIST.map((p) => `<option value="${p.id}">${escapeHtml(p.shortName)}</option>`).join('')}
        </select>
      </div>
      <div class="catalogue__status"></div>
      <div class="catalogue__scroll" data-role="results"></div>`;
    container.appendChild(this.root);

    this.walletEl = this.root.querySelector('.catalogue__wallet')!;
    this.statusEl = this.root.querySelector('.catalogue__status')!;
    this.resultsEl = this.root.querySelector('[data-role="results"]')!;
    this.searchInput = this.root.querySelector('input[type="search"]')!;
    this.platformSelect = this.root.querySelector('[data-role="platform"]')!;

    this.bindEvents();
    wallet.subscribe(() => this.renderWallet());
    store.subscribe(() => {
      if (this.isOpen && this.lastResults.length) this.renderResults(this.lastResults);
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
    this.searchInput.focus();
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

  private bindEvents(): void {
    // Keep typing away from the window-level Input (WASD would walk); Escape goes through so the Session can close us.
    for (const type of ['keydown', 'keyup'] as const) {
      this.root.addEventListener(type, (e) => {
        if (e.code !== 'Escape') e.stopPropagation();
      });
    }
    this.root.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
      if (!button) return;
      if (button.dataset.action === 'close') this.close();
      else if (button.dataset.action === 'buy') this.buy(Number(button.dataset.result));
    });
    this.root.addEventListener('change', (e) => {
      if (e.target === this.platformSelect) this.scheduleSearch(0);
    });
    this.searchInput.addEventListener('input', () => this.scheduleSearch(SEARCH_DEBOUNCE_MS));
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.code === 'Enter') this.scheduleSearch(0);
    });
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
    this.prices.clear();
    if (results.length === 0) {
      this.resultsEl.innerHTML = '<p class="catalogue__empty">Nothing by that name.</p>';
      return;
    }
    const seq = this.searchSeq;
    this.resultsEl.innerHTML = results
      .map((r, i) => {
        const id = gameIdFor(r.platform, r.name);
        const game = { id, platform: r.platform };
        const known = this.fame.peek(game) !== undefined;
        const price = shopPrice(game, this.fame.peek(game));
        this.prices.set(i, price);
        const owned = this.store.has(id);
        const poor = !owned && !this.wallet.canAfford(price);
        const label = owned ? 'Owned' : poor ? 'Too dear' : 'Buy';
        return `
          <div class="catalogue__row" data-result="${i}">
            <span class="catalogue__title" title="${escapeHtml(r.name)}">${escapeHtml(r.title)}</span>
            ${r.region ? `<span class="catalogue__meta">${escapeHtml(r.region)}</span>` : ''}
            <span class="catalogue__meta">${escapeHtml(getPlatform(r.platform).shortName)}</span>
            <span class="catalogue__price${known ? '' : ' catalogue__price--pending'}">${price} <span class="catalogue__coin"></span></span>
            <button type="button" data-action="buy" data-result="${i}" ${owned || poor ? 'disabled' : ''}>${label}</button>
          </div>`;
      })
      .join('');
    results.forEach((r, i) => {
      const game = { id: gameIdFor(r.platform, r.name), title: r.title, platform: r.platform };
      if (this.fame.peek(game) !== undefined) return;
      void this.fame.lookup(game).then((views) => {
        if (seq !== this.searchSeq || this.lastResults !== results) return;
        this.settlePrice(i, shopPrice(game, views));
      });
    });
  }

  /** A fame lookup landed: the row shows its real price and whether the wallet still stretches to it. */
  private settlePrice(i: number, price: number): void {
    this.prices.set(i, price);
    const row = this.resultsEl.querySelector<HTMLElement>(`.catalogue__row[data-result="${i}"]`);
    if (!row) return;
    const priceEl = row.querySelector<HTMLElement>('.catalogue__price');
    const button = row.querySelector<HTMLButtonElement>('button[data-action="buy"]');
    if (priceEl) {
      priceEl.innerHTML = `${price} <span class="catalogue__coin"></span>`;
      priceEl.classList.remove('catalogue__price--pending');
    }
    if (button && button.textContent !== 'Owned') {
      const poor = !this.wallet.canAfford(price);
      button.disabled = poor;
      button.textContent = poor ? 'Too dear' : 'Buy';
    }
  }

  private buy(i: number): void {
    const r = this.lastResults[i];
    if (!r) return;
    const game: Game = {
      id: gameIdFor(r.platform, r.name),
      title: r.title,
      platform: r.platform,
      region: r.region,
      status: 'owned',
      addedAt: new Date().toISOString(),
      externalIds: { libretroName: r.name },
    };
    if (this.store.has(game.id)) return;
    const price = this.prices.get(i) ?? shopPrice(game, this.fame.peek(game));
    if (!this.wallet.spend(price)) {
      this.setStatus(`You need ${price} coins for "${game.title}".`, true);
      return;
    }
    this.store.add(game);
    this.setStatus(`Bought "${game.title}" for ${price} coins. It is on your shelves.`);
  }

  private setStatus(message: string, isError = false): void {
    this.statusEl.textContent = message;
    this.statusEl.classList.toggle('catalogue__status--error', isError);
  }
}
