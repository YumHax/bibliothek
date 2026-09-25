import { escapeHtml } from '../html';
import { ModalPanel } from '../ModalPanel';
import '../CataloguePanel.css';
import './market.css';

/** The purse as a market panel shows it. */
export interface PanelWallet {
  readonly coins: number;
  subscribe(cb: () => void): () => void;
}

/**
 * The frame every market panel shares, on the catalogue's look (CataloguePanel.css): a full-screen
 * DOM modal with a title, the coins in the pocket, a close button, a line of blurb, a status line
 * and a body the panel fills (`render`, repainted through `refresh` so the focus stays put). Keys,
 * the controller and the Session's hook are `ModalPanel`'s.
 */
export abstract class MarketPanel extends ModalPanel {
  protected readonly body: HTMLElement;
  private readonly walletEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly blurbEl: HTMLElement;
  private readonly titleEl: HTMLElement;

  constructor(container: HTMLElement, protected readonly wallet: PanelWallet, options: { title: string; className: string; blurb?: string }) {
    super(container, { className: `ui-modal--sheet catalogue market-panel ${options.className}`, label: options.title });
    this.root.innerHTML = `
      <header class="catalogue__header">
        <h2></h2>
        <span class="catalogue__wallet"></span>
        <div class="catalogue__actions"><button type="button" class="ui-btn" data-action="close" aria-label="Close">Close</button></div>
      </header>
      <p class="catalogue__blurb"></p>
      <div class="catalogue__status"></div>
      <div class="catalogue__scroll ui-card market-panel__body"></div>`;
    this.titleEl = this.root.querySelector('h2')!;
    this.walletEl = this.root.querySelector('.catalogue__wallet')!;
    this.statusEl = this.root.querySelector('.catalogue__status')!;
    this.blurbEl = this.root.querySelector('.catalogue__blurb')!;
    this.body = this.root.querySelector('.market-panel__body')!;
    this.setTitle(options.title, options.blurb ?? '');

    this.root.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!button || (button as HTMLButtonElement).disabled) return;
      if (button.dataset.action === 'close') this.close();
      else this.onAction(button.dataset.action!, button);
    });
    this.body.addEventListener('error', (e) => {
      if (e.target instanceof HTMLImageElement) e.target.classList.add('catalogue__cover--missing');
    }, true);
    wallet.subscribe(() => {
      this.renderWallet();
      if (this.isOpen) this.refresh();
    });
    this.renderWallet();
  }

  protected onOpened(): void {
    this.setStatus('');
    this.render();
  }

  /** Paints the body from the panel's current state. */
  protected abstract render(): void;

  /**
   * Repaints the body (`render`) and puts the focus back on the same control: the body's HTML is
   * replaced, which would otherwise drop the focus (and with it the panel's keys) to the page.
   * A control gone or disabled hands the focus to the panel's first one.
   */
  protected refresh(): void {
    const focused = document.activeElement;
    const wasInside = focused instanceof HTMLElement && this.root.contains(focused);
    const key = wasInside ? focusKey(focused) : null;
    this.render();
    if (!wasInside || this.root.contains(document.activeElement)) return;
    const again = key === null ? undefined : [...this.body.querySelectorAll<HTMLElement>('[data-action]')].find((el) => focusKey(el) === key);
    (again && !(again as HTMLButtonElement).disabled ? again : this.focusTarget())?.focus();
  }

  /** A `[data-action]` element (not "close") was clicked. */
  protected onAction(_action: string, _el: HTMLElement): void {}

  protected setTitle(title: string, blurb: string): void {
    this.titleEl.textContent = title;
    this.root.setAttribute('aria-label', title);
    this.blurbEl.textContent = blurb;
    this.blurbEl.hidden = !blurb;
  }

  protected setStatus(message: string, isError = false): void {
    this.statusEl.textContent = message;
    this.statusEl.classList.toggle('catalogue__status--error', isError);
  }

  private renderWallet(): void {
    this.walletEl.textContent = `${this.wallet.coins} coin${this.wallet.coins === 1 ? '' : 's'} in your pocket`;
  }

  /** Where the focus lands: the `[data-autofocus]` control if usable, else the body's first button, else Close. */
  protected focusTarget(): HTMLElement | null {
    return super.focusTarget() ?? this.body.querySelector<HTMLElement>('button:not([disabled])') ?? this.root.querySelector<HTMLElement>('[data-action="close"]');
  }
}

/** What identifies a control across repaints: its action and the id / kind / tab it acts on. */
function focusKey(el: HTMLElement): string | null {
  const { action, id, kind, tab } = el.dataset;
  return action ? `${action}:${id ?? kind ?? tab ?? ''}` : null;
}

/** A price with the coin glyph, as the catalogue shows it. */
export function coinsHtml(coins: number): string {
  return `<span class="catalogue__price">${coins} <span class="catalogue__coin"></span></span>`;
}

export { escapeHtml };
