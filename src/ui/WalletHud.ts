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

type Kind = 'coins' | 'tickets';

/** A gold coin: dark rim, lit face, an engraved ring and star. */
const COIN_SVG = `<svg class="wallet-hud__icon wallet-hud__icon--coin" viewBox="0 0 24 24" aria-hidden="true">
  <defs><radialGradient id="wallet-hud-coin" cx="36%" cy="30%" r="80%">
    <stop offset="0" stop-color="#fff4c8"/><stop offset="0.42" stop-color="#f3c34c"/><stop offset="1" stop-color="#a06b12"/>
  </radialGradient></defs>
  <circle cx="12" cy="12.6" r="10.6" fill="#6e4a0c"/>
  <circle cx="12" cy="11.5" r="10.4" fill="url(#wallet-hud-coin)"/>
  <circle cx="12" cy="11.5" r="7.6" fill="none" stroke="#8f600f" stroke-opacity="0.5" stroke-width="1.2"/>
  <path d="M12.00 7.10L13.12 9.96L16.18 10.14L13.81 12.09L14.59 15.06L12.00 13.40L9.41 15.06L10.19 12.09L7.82 10.14L10.88 9.96Z" fill="#9c6a12" fill-opacity="0.75"/>
</svg>`;

/** An arcade ticket: notched ends, a perforated stub, a star on the body. */
const TICKET_SVG = `<svg class="wallet-hud__icon wallet-hud__icon--ticket" viewBox="0 0 30 20" aria-hidden="true">
  <defs><linearGradient id="wallet-hud-ticket" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ff8a98"/><stop offset="1" stop-color="#d6284a"/>
  </linearGradient></defs>
  <path d="M2 2.5H28V7.5A2.5 2.5 0 0 0 28 12.5V17.5H2V12.5A2.5 2.5 0 0 0 2 7.5Z" fill="url(#wallet-hud-ticket)" stroke="#7d1428" stroke-width="1" stroke-linejoin="round"/>
  <path d="M21.5 4.5V15.5" stroke="#fff" stroke-opacity="0.6" stroke-width="1.1" stroke-dasharray="1.4 1.4"/>
  <path d="M11.50 5.90L12.33 8.02L14.60 8.15L12.84 9.60L13.42 11.80L11.50 10.57L9.58 11.80L10.16 9.60L8.40 8.15L10.67 8.02Z" fill="#fff" fill-opacity="0.85"/>
</svg>`;

/**
 * Top-left chip with the coins and tickets in the player's pocket. It is up where money is the point
 * (`moneyHere`: the arcade, the market, the shops), under the pause menu, and for a few seconds when
 * money moves anywhere else (or on coming back into the room); then it fades away. A change rolls the
 * count to the new balance, floats the difference ("+12", "−5") and tints the count gold or red while it rolls.
 * Ticked by the engine (`update`).
 */
export class WalletHud {
  private readonly root: HTMLDivElement;
  private readonly coinsEl: HTMLSpanElement;
  private readonly ticketsEl: HTMLSpanElement;
  private readonly items: Record<Kind, HTMLSpanElement>;
  /** Where the floating differences go, off the chip's right end. */
  private readonly floats: HTMLSpanElement;
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
      <span class="wallet-hud__item" data-kind="coins" title="Coins">${COIN_SVG}<span class="wallet-hud__count" data-role="coins"></span></span>
      <span class="wallet-hud__sep"></span>
      <span class="wallet-hud__item" data-kind="tickets" title="Arcade tickets">${TICKET_SVG}<span class="wallet-hud__count" data-role="tickets"></span></span>
      <span class="wallet-hud__floats"></span>`;
    this.coinsEl = this.root.querySelector('[data-role="coins"]')!;
    this.ticketsEl = this.root.querySelector('[data-role="tickets"]')!;
    this.items = {
      coins: this.root.querySelector('[data-kind="coins"]')!,
      tickets: this.root.querySelector('[data-kind="tickets"]')!,
    };
    this.floats = this.root.querySelector('.wallet-hud__floats')!;
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
      if (this.rollT >= 1) this.settle();
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
    this.mark('coins', coins);
    this.mark('tickets', tickets);
    if (reduceMotion() || this.root.hidden) {
      this.drawn.coins = this.wallet.coins;
      this.drawn.tickets = this.wallet.tickets;
      this.rollT = 1;
      this.draw();
      window.setTimeout(() => this.settle(), 600);
      return;
    }
    this.from.coins = this.drawn.coins;
    this.from.tickets = this.drawn.tickets;
    this.rollT = 0;
  }

  /**
   * One balance moved: its count glows gold (earned) or red (spent) while it rolls, its icon bumps (the
   * coin flips, the ticket wiggles) and the difference floats off the chip's right end.
   */
  private mark(kind: Kind, amount: number): void {
    if (!amount) return;
    const item = this.items[kind];
    item.classList.remove('wallet-hud__item--bump');
    item.classList.toggle('wallet-hud__item--up', amount > 0);
    item.classList.toggle('wallet-hud__item--down', amount < 0);
    void item.offsetWidth; // restart the bump
    item.classList.add('wallet-hud__item--bump');
    this.float(kind, amount);
  }

  /** The roll is over: the counts go back to plain. */
  private settle(): void {
    for (const item of Object.values(this.items)) item.classList.remove('wallet-hud__item--up', 'wallet-hud__item--down');
  }

  /** The difference, in the column off the chip's right end (coins above tickets, centred when alone), clear of the tips under it. */
  private float(kind: Kind, amount: number): void {
    const el = document.createElement('span');
    el.className = `wallet-hud__delta wallet-hud__delta--${kind}${amount < 0 ? ' wallet-hud__delta--spent' : ''}`;
    el.textContent = formatCount(amount, true);
    this.floats.appendChild(el);
    window.setTimeout(() => el.remove(), FLOAT_MS);
  }

  private draw(): void {
    this.coinsEl.textContent = formatCount(this.drawn.coins);
    this.ticketsEl.textContent = formatCount(this.drawn.tickets);
  }
}
