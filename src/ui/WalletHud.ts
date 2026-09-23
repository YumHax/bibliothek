import './WalletHud.css';

/** What the HUD reads: the two balances and a way to hear about changes. */
export interface WalletView {
  readonly coins: number;
  readonly tickets: number;
  subscribe(cb: () => void): () => void;
}

/** Top-left chip with the coins and tickets in the player's pocket; hidden with the start card. */
export class WalletHud {
  private readonly root: HTMLDivElement;
  private readonly coinsEl: HTMLSpanElement;
  private readonly ticketsEl: HTMLSpanElement;
  private shown = false;

  constructor(container: HTMLElement, private readonly wallet: WalletView) {
    this.root = document.createElement('div');
    this.root.className = 'wallet-hud';
    this.root.hidden = true;
    this.root.innerHTML = `
      <span class="wallet-hud__item" title="Coins"><span class="wallet-hud__coin"></span><span data-role="coins"></span></span>
      <span class="wallet-hud__item" title="Arcade tickets"><span class="wallet-hud__ticket"></span><span data-role="tickets"></span></span>`;
    this.coinsEl = this.root.querySelector('[data-role="coins"]')!;
    this.ticketsEl = this.root.querySelector('[data-role="tickets"]')!;
    container.appendChild(this.root);
    wallet.subscribe(() => this.render(true));
    this.render(false);
  }

  /** Shown while the player is in the room, hidden on the start card and behind modals. */
  setVisible(visible: boolean): void {
    this.shown = visible;
    this.root.hidden = !visible;
  }

  private render(pulse: boolean): void {
    this.coinsEl.textContent = String(this.wallet.coins);
    this.ticketsEl.textContent = String(this.wallet.tickets);
    if (pulse && this.shown) {
      this.root.classList.remove('wallet-hud--pulse');
      void this.root.offsetWidth;
      this.root.classList.add('wallet-hud--pulse');
    }
  }
}
