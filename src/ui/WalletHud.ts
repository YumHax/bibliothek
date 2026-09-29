import './WalletHud.css';
import { fadeIn, fadeOut } from './fade';
import { formatCount } from './money';
import { reduceMotion } from '@/settings/motion';
import { hudSlot } from './hudSlot';

/** What the HUD reads: the two balances and a way to hear about changes. */
export interface WalletView {
  readonly coins: number;
  readonly tickets: number;
  subscribe(cb: () => void): () => void;
}

export interface WalletHudOptions {
  /** True where money is the point (the arcade, the market, the shops): the chip stays up there. */
  moneyHere?: () => boolean;
}

/** How long the chip stays after money moved, or after coming into the room, where money is not the point (ms). */
const PEEK_MS = 6000;
/** The count rolls to a new balance over this long (s). */
const COUNT_S = 0.4;
/** A floating "+12" rises and fades over this long (ms, `wallet-float` in the CSS). */
const FLOAT_MS = 1100;
const FADE_MS = 300;

/**
 * Top-left chip with the coins and tickets in the player's pocket. It is up where money is the point
 * (`moneyHere`: the arcade, the market, the shops), under the pause menu, and for a few seconds when
 * money moves anywhere else (or on coming back into the room); then it fades away. A change rolls the
 * count to the new balance, floats the difference ("+12", "−5") and tints the chip red while spending.
 * Ticked by the engine (`update`).
 */
export class WalletHud {
  private readonly root: HTMLDivElement;
  private readonly coinsEl: HTMLSpanElement;
  private readonly ticketsEl: HTMLSpanElement;
  private inRoom = false;
  private paused = false;
  private peekLeft = 0;
  /** The balances as drawn (they roll towards the wallet's). */
  private readonly drawn = { coins: 0, tickets: 0 };
  private readonly from = { coins: 0, tickets: 0 };
  private rollT = 1;
  private last = { coins: 0, tickets: 0 };

  constructor(container: HTMLElement, private readonly wallet: WalletView, private readonly options: WalletHudOptions = {}) {
    this.root = document.createElement('div');
    this.root.className = 'wallet-hud';
    this.root.hidden = true;
    this.root.innerHTML = `
      <span class="wallet-hud__item" data-kind="coins" title="Coins"><span class="wallet-hud__coin"></span><span data-role="coins"></span></span>
      <span class="wallet-hud__item" data-kind="tickets" title="Arcade tickets"><span class="wallet-hud__ticket"></span><span data-role="tickets"></span></span>`;
    this.coinsEl = this.root.querySelector('[data-role="coins"]')!;
    this.ticketsEl = this.root.querySelector('[data-role="tickets"]')!;
    // Top of the top-left column, the tips under it (`hudSlot`): hidden, it leaves no gap above them.
    hudSlot(container, 'top-left').appendChild(this.root);
    this.last = { coins: wallet.coins, tickets: wallet.tickets };
    this.drawn.coins = wallet.coins;
    this.drawn.tickets = wallet.tickets;
    this.draw();
    wallet.subscribe(() => this.onChange());
  }

  /** In the room (shown by the rules above), or on the start card (never). */
  setVisible(inRoom: boolean): void {
    if (inRoom && !this.inRoom) this.peekLeft = PEEK_MS;
    this.inRoom = inRoom;
    this.refresh();
  }

  /** Under the pause menu the chip is up, next to what the menu sums up. */
  setPaused(paused: boolean): void {
    this.paused = paused;
    this.refresh();
  }

  update(dt: number): void {
    if (this.peekLeft > 0) {
      this.peekLeft -= dt * 1000;
      if (this.peekLeft <= 0) this.refresh();
    } else if (this.inRoom) this.refresh(); // the zone may have changed (the arcade's door)
    if (this.rollT < 1) {
      this.rollT = Math.min(1, this.rollT + dt / COUNT_S);
      const k = 1 - (1 - this.rollT) ** 3;
      this.drawn.coins = Math.round(this.from.coins + (this.wallet.coins - this.from.coins) * k);
      this.drawn.tickets = Math.round(this.from.tickets + (this.wallet.tickets - this.from.tickets) * k);
      this.draw();
      if (this.rollT >= 1) this.root.classList.remove('wallet-hud--spending');
    }
  }

  private get wanted(): boolean {
    if (this.paused) return true;
    if (!this.inRoom) return false;
    return this.peekLeft > 0 || (this.options.moneyHere?.() ?? false);
  }

  private refresh(): void {
    if (this.wanted) fadeIn(this.root, 'wallet-hud--closing');
    else fadeOut(this.root, 'wallet-hud--closing', FADE_MS);
  }

  private onChange(): void {
    const coins = this.wallet.coins - this.last.coins;
    const tickets = this.wallet.tickets - this.last.tickets;
    this.last = { coins: this.wallet.coins, tickets: this.wallet.tickets };
    if (!coins && !tickets) return;
    this.peekLeft = PEEK_MS;
    this.refresh();
    if (coins) this.float('coins', coins);
    if (tickets) this.float('tickets', tickets);
    this.root.classList.toggle('wallet-hud--spending', coins < 0 || tickets < 0);
    if (reduceMotion() || this.root.hidden) {
      this.drawn.coins = this.wallet.coins;
      this.drawn.tickets = this.wallet.tickets;
      this.rollT = 1;
      this.draw();
      window.setTimeout(() => this.root.classList.remove('wallet-hud--spending'), 600);
      return;
    }
    this.from.coins = this.drawn.coins;
    this.from.tickets = this.drawn.tickets;
    this.rollT = 0;
    this.root.classList.remove('wallet-hud--pulse');
    void this.root.offsetWidth;
    this.root.classList.add('wallet-hud--pulse');
  }

  /** The difference, floating off the chip's right end (coins on top, tickets below), clear of the tips under it. */
  private float(kind: 'coins' | 'tickets', amount: number): void {
    const el = document.createElement('span');
    el.className = `wallet-hud__delta wallet-hud__delta--${kind}${amount < 0 ? ' wallet-hud__delta--spent' : ''}`;
    el.textContent = formatCount(amount, true);
    this.root.appendChild(el);
    window.setTimeout(() => el.remove(), FLOAT_MS);
  }

  private draw(): void {
    this.coinsEl.textContent = formatCount(this.drawn.coins);
    this.ticketsEl.textContent = formatCount(this.drawn.tickets);
  }
}
