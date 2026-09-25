import type { Game } from '@/catalog/types';
import type { Wallet } from '@/economy/Wallet';
import { PRIZES, type Prize, type PrizeStore } from '@/economy/Prizes';
import { TICKETS_PER_COIN } from '@/economy/pricing';
import { escapeHtml } from './html';
import './PrizePanel.css';

/** Where the mystery game comes from and goes: the collection it joins (through the parcel), and the games it is drawn from. */
export interface MysteryGameSource {
  collection: { owns(id: string): boolean; add(game: Game): void };
  games: readonly Game[];
}

/**
 * The arcade's prize counter: every prize with its price in tickets (and how many the player
 * already has at home), and the old deal, tickets for coins. A full-screen DOM modal like the
 * mail-order catalogue; the Session opens it from the counter, releases the mouse while it is up
 * and re-enters the room when it closes. A prize taken goes on the prize shelf at home, or where
 * it does its job (the poster, the lamp, the cat's toy); the mystery game is a random game the
 * collection does not have, which comes home in the parcel like a purchase.
 */
export class PrizePanel {
  private readonly root: HTMLElement;
  private readonly walletEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly listEl: HTMLElement;
  private readonly exchangeButton: HTMLButtonElement;

  /** Assigned by the Session so closing from the panel's own UI re-enters the room. */
  onOpenChange?: (open: boolean) => void;

  constructor(
    container: HTMLElement,
    private readonly wallet: Wallet,
    private readonly prizes: PrizeStore,
    private readonly mystery: MysteryGameSource | null = null,
  ) {
    this.root = document.createElement('section');
    this.root.className = 'prizes';
    this.root.hidden = true;
    this.root.innerHTML = `
      <header class="prizes__header">
        <h2>Prize counter</h2>
        <span class="prizes__wallet"></span>
        <div class="prizes__actions"><button type="button" data-action="close">Close</button></div>
      </header>
      <div class="prizes__exchange">
        <span>${TICKETS_PER_COIN} tickets = 1 coin, as ever.</span>
        <button type="button" data-action="exchange"></button>
      </div>
      <p class="prizes__blurb">Or take something home: it goes on the prize shelf in the bedroom, or wherever it does its job. The claw's bunnies are not for sale.</p>
      <div class="prizes__status"></div>
      <div class="prizes__grid" data-role="list"></div>`;
    container.appendChild(this.root);
    this.walletEl = this.root.querySelector('.prizes__wallet')!;
    this.statusEl = this.root.querySelector('.prizes__status')!;
    this.listEl = this.root.querySelector('[data-role="list"]')!;
    this.exchangeButton = this.root.querySelector('button[data-action="exchange"]')!;
    this.bindEvents();
    wallet.subscribe(() => this.render());
    prizes.subscribe(() => this.render());
    this.render();
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
    this.onOpenChange?.(true);
  }

  close(): void {
    if (!this.isOpen) return;
    this.root.hidden = true;
    this.onOpenChange?.(false);
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  private bindEvents(): void {
    // Keep keys away from the window-level Input (WASD would walk); Escape goes through so the Session can close us.
    for (const type of ['keydown', 'keyup'] as const) {
      this.root.addEventListener(type, (e) => {
        if (e.code !== 'Escape') e.stopPropagation();
      });
    }
    this.root.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
      if (!button) return;
      if (button.dataset.action === 'close') this.close();
      else if (button.dataset.action === 'exchange') this.exchange();
      else if (button.dataset.action === 'take') this.take(button.dataset.prize ?? '');
    });
  }

  private exchange(): void {
    const before = this.wallet.tickets;
    const coins = this.wallet.redeemTickets(TICKETS_PER_COIN);
    if (!coins) {
      this.setStatus(before ? `Only ${before} ticket${before > 1 ? 's' : ''}: ${TICKETS_PER_COIN} make a coin.` : 'No tickets to exchange. Play something!', true);
      return;
    }
    this.setStatus(`${before - this.wallet.tickets} tickets exchanged for ${coins} coin${coins > 1 ? 's' : ''}.`);
  }

  private take(id: string): void {
    const prize = PRIZES.find((p) => p.id === id);
    if (!prize || prize.tickets === null) return;
    const game = prize.game ? this.drawMysteryGame() : null;
    if (prize.game && !game) {
      this.setStatus('The mystery box is empty: you already own every game it could hold.', true);
      return;
    }
    if (!this.wallet.spendTickets(prize.tickets)) {
      this.setStatus(`The ${prize.name} is ${prize.tickets} tickets; you have ${this.wallet.tickets}.`, true);
      return;
    }
    if (game) {
      this.mystery?.collection.add(game);
      this.setStatus(`You unwrap it: ${game.title}! It will be waiting in the parcel at home.`);
      return;
    }
    this.prizes.add(prize.id);
    this.setStatus(`The ${prize.name} is yours. ${whereItGoes(prize)}`);
  }

  /** A random game the collection does not own yet, or null when there is none. */
  private drawMysteryGame(): Game | null {
    if (!this.mystery) return null;
    const left = this.mystery.games.filter((g) => !this.mystery!.collection.owns(g.id));
    return left[Math.floor(Math.random() * left.length)] ?? null;
  }

  private render(): void {
    const { coins, tickets } = this.wallet;
    this.walletEl.textContent = `${tickets} ticket${tickets === 1 ? '' : 's'} · ${coins} coin${coins === 1 ? '' : 's'}`;
    const gain = Math.floor(tickets / TICKETS_PER_COIN);
    this.exchangeButton.textContent = gain ? `Exchange for ${gain} coin${gain > 1 ? 's' : ''}` : 'Exchange';
    this.exchangeButton.disabled = gain === 0;
    this.listEl.innerHTML = PRIZES.filter((p) => p.tickets !== null && (!p.game || this.mystery))
      .map((p) => {
        const owned = this.prizes.count(p.id);
        const affordable = tickets >= (p.tickets ?? Infinity);
        const swatch = `#${p.color.toString(16).padStart(6, '0')}`;
        return `
        <article class="prizes__item">
          <span class="prizes__swatch" style="background:${swatch}"></span>
          <div class="prizes__text">
            <strong>${escapeHtml(p.name)}</strong>
            <span>${escapeHtml(p.blurb)}</span>
            ${owned && !p.home ? `<em>${owned} at home</em>` : owned ? '<em>at home</em>' : ''}
          </div>
          <span class="prizes__price"><span class="prizes__ticket"></span>${p.tickets}</span>
          ${p.home && owned ? '<button type="button" disabled>At home</button>' : `<button type="button" data-action="take" data-prize="${p.id}" ${affordable ? '' : 'disabled'}>Take it</button>`}
        </article>`;
      })
      .join('');
  }

  private setStatus(text: string, error = false): void {
    this.statusEl.textContent = text;
    this.statusEl.classList.toggle('prizes__status--error', error);
  }
}

/** Where a prize ends up, for the counter's status line. */
function whereItGoes(prize: Prize): string {
  switch (prize.home) {
    case 'poster': return 'It will be on the bedroom wall.';
    case 'moodLamp': return 'It will be on the bedroom dresser. Click it to change the colour.';
    case 'catToy': return 'It will be by the armchairs at home. Someone will find it.';
    default: return 'It will be on the prize shelf at home.';
  }
}
