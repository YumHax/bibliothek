import type { Game } from '@/catalog/types';
import type { Wallet } from '@/economy/Wallet';
import { PRIZES, type Prize, type PrizeStore } from '@/economy/Prizes';
import type { Transactions } from '@/economy/Transactions';
import { TICKETS_PER_COIN } from '@/economy/pricing';
import { playCoins } from '@/audio/coins';
import { playUiSound } from '@/audio/uiSounds';
import { prizePhoto } from '@/thumbnails/prizePhotos';
import { escapeHtml } from './html';
import { ModalPanel } from './ModalPanel';
import { rememberFocus } from './rememberFocus';
import './PrizePanel.css';

/** Where the mystery game comes from: the collection it must be new to (it joins it through the parcel: `Transactions.takePrize`), and the games it is drawn from. */
export interface MysteryGameSource {
  collection: { owns(id: string): boolean };
  games: readonly Game[];
}

/** The case's shelves, top to bottom: what a prize costs puts it on one (up to `upTo` tickets). */
const SHELVES: readonly { upTo: number; card: string }[] = [
  { upTo: 60, card: 'lemon' },
  { upTo: 150, card: 'pink' },
  { upTo: 400, card: 'green' },
  { upTo: Infinity, card: 'orange' },
];

/** How long the ticket counter takes to roll to a new number, ms. */
const ROLL_MS = 450;

/**
 * The arcade's prize counter, drawn as the counter itself: a lit glass case of shelves, one per price band with its
 * hand-written card, each prize a studio photo of its own model (`thumbnails/prizePhotos`) with its ticket stub, the
 * ticket counter's LED readout at the top and the ticket muncher (tickets for coins) along the bottom. Picking a prize
 * (click, or the focus reaching it) shows it large beside the case with what it costs and where it goes at home; its
 * button takes it. A full-screen DOM modal; the Session opens it from the counter, releases the mouse while it is up
 * and re-enters the room when it closes. A prize taken goes on the prize shelf at home, or where it does its job (the
 * poster, the lamp, the cat's toy); the mystery game is a random game the collection does not have, which comes home
 * in the parcel like a purchase.
 */
export class PrizePanel extends ModalPanel {
  private readonly ticketsEl: HTMLElement;
  private readonly coinsEl: HTMLElement;
  private readonly listEl: HTMLElement;
  private readonly detailEl: HTMLElement;
  private readonly munchEl: HTMLElement;
  private readonly photos = new Map<string, string>();
  private selected: string;
  private status: { text: string; error: boolean; prize: string | null } = { text: '', error: false, prize: null };
  private shownTickets: number;
  private rollFrame = 0;

  constructor(
    container: HTMLElement,
    private readonly wallet: Wallet,
    private readonly prizes: PrizeStore,
    private readonly tx: Transactions,
    private readonly mystery: MysteryGameSource | null = null,
  ) {
    super(container, { className: 'ui-modal--centre prizes', label: 'Prize counter' });
    this.root.innerHTML = `
      <div class="prizes__counter">
        <header class="prizes__top">
          <h2 class="prizes__marquee"><span>Prizes</span></h2>
          <div class="prizes__meter" role="status" aria-label="Your tickets">
            <span class="prizes__led" data-role="tickets"></span>
            <span class="prizes__meter-label">tickets</span>
          </div>
          <div class="prizes__purse" aria-label="Your coins"><span class="prizes__coin" aria-hidden="true"></span><b data-role="coins"></b></div>
          <button type="button" class="prizes__close" data-action="close" aria-label="Close">Close <kbd>Esc</kbd></button>
        </header>
        <div class="prizes__body">
          <div class="prizes__case" data-role="list"></div>
          <aside class="prizes__detail" data-role="detail" aria-live="polite"></aside>
        </div>
        <footer class="prizes__muncher" data-role="muncher"></footer>
      </div>`;
    this.ticketsEl = this.root.querySelector('[data-role="tickets"]')!;
    this.coinsEl = this.root.querySelector('[data-role="coins"]')!;
    this.listEl = this.root.querySelector('[data-role="list"]')!;
    this.detailEl = this.root.querySelector('[data-role="detail"]')!;
    this.munchEl = this.root.querySelector('[data-role="muncher"]')!;
    this.selected = this.forSale()[0]?.id ?? '';
    this.shownTickets = wallet.tickets;
    this.bindEvents();
    wallet.subscribe(() => this.render());
    prizes.subscribe(() => this.render());
    this.render();
  }

  protected onOpened(): void {
    this.status = { text: '', error: false, prize: null };
    this.shownTickets = this.wallet.tickets;
    this.render();
    this.loadPhotos();
  }

  protected onClosed(): void {
    cancelAnimationFrame(this.rollFrame);
  }

  /** Lands on the prize shown, so the arrows start from the case. */
  protected focusTarget(): HTMLElement | null {
    return this.listEl.querySelector<HTMLElement>(`[data-prize="${CSS.escape(this.selected)}"]`) ?? super.focusTarget();
  }

  private bindEvents(): void {
    this.root.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
      if (!button || button.disabled) return;
      const { action, prize } = button.dataset;
      if (action === 'close') this.close();
      else if (action === 'exchange') this.exchange();
      else if (action === 'pick') this.pick(prize ?? '', true);
      else if (action === 'take') this.take(prize ?? '');
    });
    // Walking the case with the arrows or the D-pad shows each prize as the focus reaches it.
    this.listEl.addEventListener('focusin', (e) => {
      const tile = (e.target as HTMLElement).closest<HTMLElement>('[data-action="pick"]');
      if (tile?.dataset.prize) this.pick(tile.dataset.prize, false);
    });
  }

  /** Shows `id` beside the case; `toButton` (a click or A) moves on to its Take button. */
  private pick(id: string, toButton: boolean): void {
    if (id !== this.selected) {
      this.selected = id;
      if (this.status.prize !== id) this.status = { text: '', error: false, prize: null };
      this.markSelected();
      this.renderDetail();
    }
    if (toButton) this.detailEl.querySelector<HTMLButtonElement>('button[data-action="take"]:not([disabled])')?.focus();
  }

  private exchange(): void {
    const before = this.wallet.tickets;
    const coins = this.wallet.redeemTickets(TICKETS_PER_COIN);
    if (!coins) {
      this.setStatus(before ? `Only ${before} ticket${before > 1 ? 's' : ''}: ${TICKETS_PER_COIN} make a coin.` : 'No tickets to exchange. Play something!', true);
      return;
    }
    playCoins(Math.min(8, Math.max(2, coins)));
    this.setStatus(`The muncher eats ${before - this.wallet.tickets} tickets and drops ${coins} coin${coins > 1 ? 's' : ''}.`);
  }

  private take(id: string): void {
    const prize = PRIZES.find((p) => p.id === id);
    if (!prize || prize.tickets === null) return;
    const game = prize.game ? this.drawMysteryGame() : null;
    if (prize.game && !game) {
      this.setStatus('The mystery box is empty: you already own every game it could hold.', true, id);
      return;
    }
    const taken = this.tx.takePrize(prize, game);
    if (!taken.ok) {
      if (taken.reason === 'short') this.setStatus(`The ${prize.name} is ${prize.tickets} tickets; you have ${this.wallet.tickets}.`, true, id);
      return;
    }
    playUiSound('pick');
    if (game) this.setStatus(`You unwrap it: ${game.title}! It will be waiting in the parcel at home.`, false, id);
    else this.setStatus(`The ${prize.name} is yours. ${whereItGoes(prize)}`, false, id);
  }

  /** A random game the collection does not own yet, or null when there is none. */
  private drawMysteryGame(): Game | null {
    if (!this.mystery) return null;
    const left = this.mystery.games.filter((g) => !this.mystery!.collection.owns(g.id));
    return left[Math.floor(Math.random() * left.length)] ?? null;
  }

  /** What the counter sells: the mystery game only with a collection to draw it for. */
  private forSale(): Prize[] {
    return PRIZES.filter((p) => p.tickets !== null && (!p.game || this.mystery)).sort((a, b) => a.tickets! - b.tickets!);
  }

  /** Asks the studio for every prize's photo; each drops into its tile (and the detail) as it comes. */
  private loadPhotos(): void {
    for (const prize of this.forSale()) {
      if (this.photos.has(prize.id)) continue;
      prizePhoto(prize).then((url) => {
        this.photos.set(prize.id, url);
        for (const img of this.root.querySelectorAll<HTMLImageElement>(`img[data-photo="${CSS.escape(prize.id)}"]`)) {
          img.src = url;
          img.closest('.prizes__photo')?.classList.add('prizes__photo--ready');
        }
      }, () => {});
    }
  }

  private render(): void {
    this.renderMeter();
    this.coinsEl.textContent = String(this.wallet.coins);
    const restoreFocus = rememberFocus(this.listEl);
    const sale = this.forSale();
    let from = 0;
    this.listEl.innerHTML = SHELVES.map(({ upTo, card }) => {
      const on = sale.filter((p) => p.tickets! > from && p.tickets! <= upTo);
      from = upTo;
      if (!on.length) return '';
      const lo = on[0]!.tickets!;
      const hi = on[on.length - 1]!.tickets!;
      const range = lo === hi ? `${lo}` : upTo === Infinity ? `${lo}+` : `${lo}–${hi}`;
      return `
        <section class="prizes__shelf">
          <p class="prizes__card prizes__card--${card}"><span>${range}</span><small>tickets</small></p>
          <div class="prizes__row">${on.map((p) => this.tileHtml(p)).join('')}</div>
        </section>`;
    }).join('');
    restoreFocus();
    this.renderDetail();
    this.renderMuncher();
  }

  private tileHtml(p: Prize): string {
    const owned = this.prizes.count(p.id);
    const short = p.tickets! > this.wallet.tickets;
    const sticker = p.home && owned ? 'At home' : owned ? `×${owned}` : '';
    return `
      <button type="button" class="prizes__item${short ? ' prizes__item--short' : ''}" data-action="pick" data-prize="${p.id}"
        aria-pressed="${p.id === this.selected}" aria-label="${escapeHtml(`${p.name}, ${p.tickets} tickets`)}">
        ${this.photoHtml(p)}
        <span class="prizes__name">${escapeHtml(p.name)}</span>
        <span class="prizes__stub">${p.tickets}</span>
        ${sticker ? `<span class="prizes__sticker">${sticker}</span>` : ''}
      </button>`;
  }

  /** The photo if the studio has it, else the prize's colour as a soft blob while it is taken. */
  private photoHtml(p: Prize): string {
    const url = this.photos.get(p.id);
    return `<span class="prizes__photo${url ? ' prizes__photo--ready' : ''}" style="--prize:${hex(p.color)}"><img data-photo="${p.id}" alt="" ${url ? `src="${url}"` : ''} /></span>`;
  }

  private markSelected(): void {
    for (const tile of this.listEl.querySelectorAll<HTMLElement>('[data-action="pick"]')) tile.setAttribute('aria-pressed', String(tile.dataset.prize === this.selected));
  }

  private renderDetail(): void {
    const p = this.forSale().find((x) => x.id === this.selected);
    if (!p) {
      this.detailEl.innerHTML = '';
      return;
    }
    const restoreFocus = rememberFocus(this.detailEl);
    const have = this.wallet.tickets;
    const owned = this.prizes.count(p.id);
    const done = !!p.home && owned > 0;
    const short = p.tickets! - have;
    const label = done ? 'Already at home' : short > 0 ? `${short} tickets short` : 'Take it';
    const status = this.status.prize === p.id ? this.status : null;
    this.detailEl.innerHTML = `
      <div class="prizes__stage">${this.photoHtml(p)}</div>
      <h3>${escapeHtml(p.name)}</h3>
      <p class="prizes__blurb">${escapeHtml(p.blurb)}</p>
      <p class="prizes__where">${escapeHtml(p.game ? 'Comes home in the parcel.' : whereItGoes(p))}${owned && !p.home ? ` <b>${owned} at home already.</b>` : ''}</p>
      <div class="prizes__price"><span class="prizes__stub prizes__stub--big">${p.tickets}</span>${short > 0 && !done ? `<span class="prizes__need">you have ${have}</span>` : ''}</div>
      <button type="button" class="prizes__take" data-action="take" data-prize="${p.id}" ${done || short > 0 ? 'disabled' : ''}>${label}</button>
      ${status?.text ? `<p class="prizes__slip${status.error ? ' prizes__slip--error' : ''}">${escapeHtml(status.text)}</p>` : ''}`;
    restoreFocus();
  }

  private renderMuncher(): void {
    const restoreFocus = rememberFocus(this.munchEl);
    const gain = Math.floor(this.wallet.tickets / TICKETS_PER_COIN);
    const status = this.status.prize === null ? this.status : null;
    this.munchEl.innerHTML = `
      <span class="prizes__slot" aria-hidden="true"></span>
      <p class="prizes__muncher-text"><b>Ticket muncher</b> ${TICKETS_PER_COIN} tickets make a coin, as ever. <span>The claw's bunnies are not for sale.</span></p>
      ${status?.text ? `<p class="prizes__slip prizes__slip--inline${status.error ? ' prizes__slip--error' : ''}">${escapeHtml(status.text)}</p>` : ''}
      <button type="button" class="prizes__feed" data-action="exchange" ${gain ? '' : 'disabled'}>${gain ? `Feed ${(gain * TICKETS_PER_COIN).toLocaleString('en-US')} → ${gain} coin${gain > 1 ? 's' : ''}` : `Needs ${TICKETS_PER_COIN} tickets`}</button>`;
    restoreFocus();
  }

  /** The LED readout rolls from the number it showed to the wallet's. */
  private renderMeter(): void {
    const target = this.wallet.tickets;
    cancelAnimationFrame(this.rollFrame);
    const from = this.shownTickets;
    if (!this.isOpen || from === target) {
      this.shownTickets = target;
      this.ticketsEl.textContent = led(target);
      return;
    }
    const start = performance.now();
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / ROLL_MS);
      this.shownTickets = Math.round(from + (target - from) * (1 - (1 - t) ** 3));
      this.ticketsEl.textContent = led(this.shownTickets);
      if (t < 1) this.rollFrame = requestAnimationFrame(step);
    };
    this.rollFrame = requestAnimationFrame(step);
  }

  /** A line from the counter: about a prize (`prize`: shown under it) or about the muncher. */
  private setStatus(text: string, error = false, prize: string | null = null): void {
    this.status = { text, error, prize };
    this.renderDetail();
    this.renderMuncher();
  }
}

/** The readout's digits: five, zero-padded, like the real counters. */
function led(n: number): string {
  return String(Math.max(0, n)).padStart(5, '0');
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
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
