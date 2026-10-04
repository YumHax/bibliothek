import type { Game } from '@/catalog/types';
import type { Wallet } from '@/economy/Wallet';
import { PRIZES, type Prize, type PrizeStore } from '@/economy/Prizes';
import type { Transactions } from '@/economy/Transactions';
import { CONFIRM_MS, MYSTERY_GAME_MAX_PRICE, TICKETS_PER_COIN } from '@/economy/pricing';
import type { NoticeActions } from '@/notices';
import { isGrail } from '@/economy/grails';
import { playCoins } from '@/audio/coins';
import { playUiSound } from '@/audio/uiSounds';
import { prizePhoto } from '@/thumbnails/prizePhotos';
import { escapeHtml } from './html';
import { useVerbCap } from './verb';
import { ModalPanel } from './ModalPanel';
import { rememberFocus } from './rememberFocus';
import './PrizePanel.css';

/** Where the mystery game comes from: the collection it must be new to (it joins it through the parcel: `Transactions.takePrize`), and the games it is drawn from. */
interface MysteryGameSource {
  collection: { owns(id: string): boolean };
  games: readonly Game[];
  /** A game's shop price: the box holds nothing dearer than `MYSTERY_GAME_MAX_PRICE` (unpriced: anything but a grail). */
  worth?: (game: Game) => number;
}

/** What is at home, for where a prize will go: the dresser the mood lamp stands on, the cat the wand is for. Absent: everything. */
interface PrizeHomeSource {
  has(what: 'dresser' | 'cat'): boolean;
}

/** How many coins' worth of tickets each of the muncher's buttons feeds (the last: all of them). */
const FEEDS: readonly number[] = [1, 10, Infinity];

/** What the attendant says handing a prize over, by the prize's shelf (cheap to dear). */
const HANDOVER: readonly (readonly string[])[] = [
  ['There you go. Do not lose it on the way home.', 'Classic choice. The kids fight over those.'],
  ['Good pick. I would have taken that one too.', 'Mind how you carry it, it is fragile. Probably.'],
  ['That is a proper prize. Wear it with pride.', 'I will put it down in the book: taken by a champion.'],
  ['Now that is a lot of tickets. Enjoy it, you earned it.', 'Big spender! I will miss seeing it in the case.'],
];

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
  /** "Feed all" clicked once while the pocket covers a prize, until when a second click feeds it. */
  private armedAll = 0;

  constructor(
    container: HTMLElement,
    private readonly wallet: Wallet,
    private readonly prizes: PrizeStore,
    private readonly tx: Transactions,
    private readonly mystery: MysteryGameSource | null = null,
    private readonly home: PrizeHomeSource | null = null,
    /** The attendant's word (a subtitle) and the prize's reward banner; without them both go on the counter's slip. */
    private readonly notices: Pick<NoticeActions, 'say' | 'reward'> | null = null,
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

  protected override onOpened(): void {
    this.status = { text: '', error: false, prize: null };
    this.armedAll = 0;
    this.shownTickets = this.wallet.tickets;
    this.render();
    this.loadPhotos();
  }

  protected override onClosed(): void {
    cancelAnimationFrame(this.rollFrame);
  }

  /** Lands on the prize shown, so the arrows start from the case. */
  protected override focusTarget(): HTMLElement | null {
    return this.listEl.querySelector<HTMLElement>(`[data-prize="${CSS.escape(this.selected)}"]`) ?? super.focusTarget();
  }

  private bindEvents(): void {
    this.root.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
      if (!button || button.disabled) return;
      const { action, prize } = button.dataset;
      if (action === 'close') this.close();
      else if (action === 'exchange') this.exchange(Number(button.dataset.coins ?? Infinity));
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

  /** The dearest prize the pocket covers now (not one already at home for good), or null. */
  private affordablePrize(): Prize | null {
    const have = this.wallet.tickets;
    const covered = this.forSale().filter((p) => p.tickets! <= have && !(p.home && this.prizes.count(p.id) > 0));
    return covered[covered.length - 1] ?? null;
  }

  /**
   * The muncher eats `maxCoins` coins' worth of tickets (all of them: `Infinity`). Feeding it all while the pocket
   * covers a prize takes a second click (within `CONFIRM_MS`): the tickets do not come back.
   */
  private exchange(maxCoins: number): void {
    const before = this.wallet.tickets;
    const prize = !Number.isFinite(maxCoins) ? this.affordablePrize() : null;
    if (prize && performance.now() > this.armedAll) {
      this.armedAll = performance.now() + CONFIRM_MS;
      const left = before % TICKETS_PER_COIN;
      this.setStatus(`That is enough for the ${prize.name}. Feed all ${before - left} tickets all the same (${left} left)? ${useVerbCap()} again to feed.`, true);
      return;
    }
    this.armedAll = 0;
    const coins = this.wallet.redeemTickets(TICKETS_PER_COIN, Number.isFinite(maxCoins) ? maxCoins : Infinity);
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
      this.setStatus('The mystery box is empty today: every game it could hold is yours already.', true, id);
      return;
    }
    const taken = this.tx.takePrize(prize, game);
    if (!taken.ok) {
      if (taken.reason === 'short') this.setStatus(`The ${prize.name} is ${prize.tickets} tickets; you have ${this.wallet.tickets}.`, true, id);
      return;
    }
    playUiSound('pick');
    // The attendant hands it over across the counter, with a word.
    const shelf = Math.max(0, SHELVES.findIndex((s) => prize.tickets! <= s.upTo));
    const lines = HANDOVER[shelf] ?? HANDOVER[0]!;
    const line = lines[Math.floor(Math.random() * lines.length)]!;
    const where = game ? 'It will be waiting in the parcel at home.' : this.whereItGoes(prize);
    const notices = this.notices;
    if (!notices) {
      this.setStatus(`Attendant: “${line}” ${game ? `You unwrap it: ${game.title}!` : `The ${prize.name} is yours.`} ${where}`, false, id);
      return;
    }
    // Who speaks is a voice, what was won a reward, where it goes the counter's slip (docs/notices.md).
    notices.say(line, 'Attendant');
    notices.reward({ title: game ? `Mystery game: ${game.title}` : `${prize.name}: yours`, tickets: -prize.tickets! });
    this.setStatus(where, false, id);
  }

  /**
   * A random game the collection does not own yet (never a grail, nothing over `MYSTERY_GAME_MAX_PRICE`), or null when
   * there is none: the cap always holds (a game whose fame is not known yet is priced as ordinary, well under it).
   */
  private drawMysteryGame(): Game | null {
    const mystery = this.mystery;
    if (!mystery) return null;
    const unowned = mystery.games.filter((g) => !mystery.collection.owns(g.id) && !isGrail(g.id));
    const worth = mystery.worth;
    const left = worth ? unowned.filter((g) => worth(g) <= MYSTERY_GAME_MAX_PRICE) : unowned;
    return left[Math.floor(Math.random() * left.length)] ?? null;
  }

  /** Where a prize ends up, for the counter's status line: a prize that needs something at home says so. */
  private whereItGoes(prize: Prize): string {
    const home = this.home;
    if (prize.home === 'moodLamp' && home && !home.has('dresser')) return 'It needs the dresser at home: it will stand on it once you have one (the furniture shop sells it).';
    if (prize.home === 'catToy' && home && !home.has('cat')) return 'For when you adopt a cat (the pet shop): it will wait by the armchairs until then.';
    return whereItGoes(prize);
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
      <p class="prizes__where">${escapeHtml(p.game ? 'Comes home in the parcel.' : this.whereItGoes(p))}${owned && !p.home ? ` <b>${owned} at home already.</b>` : ''}</p>
      <div class="prizes__price"><span class="prizes__stub prizes__stub--big">${p.tickets}</span>${short > 0 && !done ? `<span class="prizes__need">you have ${have}</span>` : ''}</div>
      <button type="button" class="prizes__take" data-action="take" data-prize="${p.id}" ${done || short > 0 ? 'disabled' : ''}>${label}</button>
      ${status?.text ? `<p class="prizes__slip${status.error ? ' prizes__slip--error' : ''}">${escapeHtml(status.text)}</p>` : ''}`;
    restoreFocus();
  }

  private renderMuncher(): void {
    const restoreFocus = rememberFocus(this.munchEl);
    const gain = Math.floor(this.wallet.tickets / TICKETS_PER_COIN);
    const status = this.status.prize === null ? this.status : null;
    // Fed a step at a time (a coin, ten, or the lot), so a pocket saved for a prize is not munched by one click.
    const feeds = FEEDS.filter((coins, i) => i === FEEDS.length - 1 || coins < gain).map((coins) => {
      const n = Math.min(coins, gain);
      const armed = coins === Infinity && performance.now() < this.armedAll;
      const label = !gain ? `Needs ${TICKETS_PER_COIN} tickets` : `${armed ? 'Sure? Feed all' : coins === Infinity ? 'Feed all' : 'Feed'} ${(n * TICKETS_PER_COIN).toLocaleString('en-US')} → ${n} coin${n > 1 ? 's' : ''}`;
      return `<button type="button" class="prizes__feed" data-action="exchange" data-coins="${coins === Infinity ? 'Infinity' : coins}" ${gain ? '' : 'disabled'}>${label}</button>`;
    }).join('');
    this.munchEl.innerHTML = `
      <span class="prizes__slot" aria-hidden="true"></span>
      <p class="prizes__muncher-text"><b>Ticket muncher</b> ${TICKETS_PER_COIN} tickets make a coin, as ever. <span>The claw's bunnies are not for sale.</span></p>
      ${status?.text ? `<p class="prizes__slip prizes__slip--inline${status.error ? ' prizes__slip--error' : ''}">${escapeHtml(status.text)}</p>` : ''}
      ${feeds}`;
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
