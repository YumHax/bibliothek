import { escapeHtml } from '../html';
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
 * and a body the panel fills (`render`). Keys typed in it stay in it (Esc closes, via the Session).
 * The Session opens and closes it like the catalogue (`ModalLike`); `onOpenChange` is its hook.
 */
export abstract class MarketPanel {
  protected readonly root: HTMLElement;
  protected readonly body: HTMLElement;
  private readonly walletEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly blurbEl: HTMLElement;
  private readonly titleEl: HTMLElement;

  /** Assigned by the Session so closing from the panel's own UI re-enters the room. */
  onOpenChange?: (open: boolean) => void;

  constructor(container: HTMLElement, protected readonly wallet: PanelWallet, options: { title: string; className: string; blurb?: string }) {
    this.root = document.createElement('section');
    this.root.className = `catalogue market-panel ${options.className}`;
    this.root.hidden = true;
    this.root.innerHTML = `
      <header class="catalogue__header">
        <h2></h2>
        <span class="catalogue__wallet"></span>
        <div class="catalogue__actions"><button type="button" data-action="close">Close</button></div>
      </header>
      <p class="catalogue__blurb"></p>
      <div class="catalogue__status"></div>
      <div class="catalogue__scroll market-panel__body"></div>`;
    container.appendChild(this.root);
    this.titleEl = this.root.querySelector('h2')!;
    this.walletEl = this.root.querySelector('.catalogue__wallet')!;
    this.statusEl = this.root.querySelector('.catalogue__status')!;
    this.blurbEl = this.root.querySelector('.catalogue__blurb')!;
    this.body = this.root.querySelector('.market-panel__body')!;
    this.setTitle(options.title, options.blurb ?? '');

    for (const type of ['keydown', 'keyup'] as const) {
      this.root.addEventListener(type, (e) => {
        if (e.code === 'Escape') return;
        e.stopPropagation();
        if (type === 'keydown') this.onKey(e);
      });
    }
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
      if (this.isOpen) this.render();
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
    this.setStatus('');
    this.render();
    this.root.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    this.onOpenChange?.(true);
  }

  close(): void {
    if (!this.isOpen) return;
    this.root.hidden = true;
    this.onClosed();
    this.onOpenChange?.(false);
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  /** Paints the body from the panel's current state. */
  protected abstract render(): void;

  /** A `[data-action]` element (not "close") was clicked. */
  protected onAction(_action: string, _el: HTMLElement): void {}

  /** A key typed while the panel is open (Esc excepted: the Session closes the panel). */
  protected onKey(_e: KeyboardEvent): void {}

  /** The panel just closed. */
  protected onClosed(): void {}

  protected setTitle(title: string, blurb: string): void {
    this.titleEl.textContent = title;
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
}

/** A price with the coin glyph, as the catalogue shows it. */
export function coinsHtml(coins: number): string {
  return `<span class="catalogue__price">${coins} <span class="catalogue__coin"></span></span>`;
}

export { escapeHtml };
