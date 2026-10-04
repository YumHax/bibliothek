import type { PlatformId } from '@/catalog/types';
import { PLATFORM_LIST } from '@/catalog/platforms';
import { ModalPanel } from '../ModalPanel';
import { buttonHtml, type PanelAction } from './CardPanel';
import { attr, html, paint } from './html';
import { walletLine } from './widgets';
import '../CataloguePanel.css';

/** The purse as a sheet shows it. */
export interface PanelWallet {
  readonly coins: number;
  subscribe(cb: () => void): () => void;
}

export interface SheetPanelOptions {
  title: string;
  /** The root's own classes after the layer's and `catalogue` (the sheets' look): the panel's CSS hangs on them. */
  className: string;
  blurb?: string;
  /** Shown in the header as "N coins in your pocket" and repainting the sheet when it changes. */
  wallet?: PanelWallet;
  /** A search field under the blurb (`onSearch` hears it, debounced); `platforms` adds the platform select. */
  search?: { placeholder: string; platforms?: boolean };
  /** Header buttons besides the dismiss (export, import...). */
  headerActions?: PanelAction[];
  dismiss?: string;
}

/** How long a search field waits for the typing to pause before it searches. */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * A full-screen sheet over the blurred room (`ui-modal--sheet`, the catalogue's look): a header with the title,
 * the coins in the pocket and the actions, a line of blurb, an optional search field, a `role="status"` line and
 * a scrolling body the panel paints (`render`, through `paint`), repainted by `refresh()` with the focus kept.
 * The desks, the catalogue, the collection and the market's panels are sheets.
 */
export abstract class SheetPanel<OpenArgs extends unknown[] = []> extends ModalPanel<OpenArgs> {
  protected readonly body: HTMLElement;
  protected readonly searchInput: HTMLInputElement | null;
  protected readonly platformSelect: HTMLSelectElement | null;
  private readonly walletEl: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly blurbEl: HTMLElement;
  private readonly purse: PanelWallet | undefined;
  private searchTimer: number | undefined;

  constructor(container: HTMLElement, options: SheetPanelOptions) {
    super(container, { className: `ui-modal--sheet catalogue ui-panel ui-panel--sheet ${options.className}`, label: options.title });
    this.statusErrorClass = 'catalogue__status--error';
    this.purse = options.wallet;
    const search = options.search;
    paint(
      this.root,
      html`<header class="catalogue__header">
        <h2>${options.title}</h2>
        <span class="catalogue__wallet"${attr('hidden', !options.wallet)}></span>
        <div class="catalogue__actions">${(options.headerActions ?? []).map((a) => buttonHtml(a))}${buttonHtml({ action: 'close', label: options.dismiss ?? 'Close' })}</div>
      </header>
      <p class="catalogue__blurb"${attr('hidden', !options.blurb)}>${options.blurb ?? ''}</p>
      ${search
        ? html`<div class="catalogue__search">
            <input type="search" placeholder="${search.placeholder}" autocomplete="off" spellcheck="false" data-autofocus />
            ${search.platforms ? html`<select data-role="platform"><option value="">All platforms</option>${PLATFORM_LIST.map((p) => html`<option value="${p.id}">${p.shortName}</option>`)}</select>` : ''}
          </div>`
        : ''}
      <div class="catalogue__status" role="status" aria-live="polite"></div>
      <div class="catalogue__scroll ui-card ui-panel__body"></div>`,
    );
    this.titleEl = this.root.querySelector('h2')!;
    this.walletEl = this.root.querySelector('.catalogue__wallet')!;
    this.blurbEl = this.root.querySelector('.catalogue__blurb')!;
    this.statusEl = this.root.querySelector('.catalogue__status')!;
    this.body = this.root.querySelector('.ui-panel__body')!;
    this.searchInput = this.root.querySelector('input[type="search"]');
    this.platformSelect = this.root.querySelector('[data-role="platform"]');
    if (this.searchInput) {
      this.listen(this.searchInput, 'input', () => this.scheduleSearch(SEARCH_DEBOUNCE_MS));
      this.listen(this.searchInput, 'keydown', (e) => {
        if (e.code === 'Enter') this.scheduleSearch(0);
      });
    }
    if (this.platformSelect) this.listen(this.platformSelect, 'change', () => this.scheduleSearch(0));
    // A cover that does not exist: a made-up box (`coverPlaceholder`, installed on the container); this is the fallback's fallback.
    this.listen(this.body, 'error', (e) => {
      if (e.target instanceof HTMLImageElement) e.target.classList.add('catalogue__cover--missing');
    }, { capture: true });
    if (this.purse) {
      const unsubscribe = this.purse.subscribe(() => {
        this.renderWallet();
        if (this.isOpen) this.refresh();
      });
      this.signal.addEventListener('abort', unsubscribe);
      this.renderWallet();
    }
  }

  protected override onOpened(..._args: OpenArgs): void {
    this.setStatus('');
    this.render();
  }

  /** Paints the body from the panel's state (`paint(this.body, html\`...\`)`). */
  protected abstract render(): void;

  protected override repaint(): void {
    this.render();
  }

  /** The search field's words (or the select) changed, the typing paused: search. */
  protected onSearch(_query: string, _platform: PlatformId | undefined): void {}

  /** The search field's words, trimmed ('' without a field). */
  protected get query(): string {
    return this.searchInput?.value.trim() ?? '';
  }

  /** The platform picked in the select, if any. */
  protected get platform(): PlatformId | undefined {
    return (this.platformSelect?.value || undefined) as PlatformId | undefined;
  }

  protected setTitle(title: string, blurb = ''): void {
    this.titleEl.textContent = title;
    this.root.setAttribute('aria-label', title);
    this.blurbEl.textContent = blurb;
    this.blurbEl.hidden = !blurb;
  }

  /** Where the focus lands: the `[data-autofocus]` control if usable, else the body's first button, else Close. */
  protected override focusTarget(): HTMLElement | null {
    const auto = this.root.querySelector<HTMLElement>('[data-autofocus]');
    if (auto && !auto.matches(':disabled') && auto.offsetParent !== null) return auto;
    return this.body.querySelector<HTMLElement>('button:not([disabled])') ?? this.root.querySelector<HTMLElement>('[data-action="close"]');
  }

  private scheduleSearch(delayMs: number): void {
    window.clearTimeout(this.searchTimer);
    this.searchTimer = window.setTimeout(() => this.onSearch(this.query, this.platform), delayMs);
  }

  private renderWallet(): void {
    if (this.purse) this.walletEl.textContent = walletLine(this.purse.coins);
  }
}
