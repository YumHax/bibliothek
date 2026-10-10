import type { Game } from '@/catalog/types';
import type { Wallet } from '@/economy/Wallet';
import { PRIZES, type Prize, type PrizeStore } from '@/economy/Prizes';
import type { Transactions } from '@/economy/Transactions';
import { MYSTERY_GAME_MAX_PRICE, TICKETS_PER_COIN } from '@/economy/pricing';
import type { NoticeActions } from '@/notices';
import { isGrail } from '@/economy/grails';
import { playCoins } from '@/audio/coins';
import { prizePhoto } from '@/thumbnails/prizePhotos';
import { Arming, armedLine } from './confirmTwice';
import { rollNumber } from './countUp';
import { ModalPanel } from './ModalPanel';
import { attr, html, paint, type Html } from './panel/html';
import { rememberFocus } from './rememberFocus';
import './PrizePanel.css';
import { random } from '@/random';
import { formatCoins, formatTickets } from '@/text/money';

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

/** A line from the counter: about a prize (`prize`: shown under it) or about the muncher (null). */
interface Slip {
  text: string;
  error: boolean;
  prize: string | null;
}

/**
 * The arcade's prize counter, drawn as the counter itself: a lit glass case of shelves, one per price band with its
 * hand-written card, each prize a studio photo of its own model (`thumbnails/prizePhotos`) with its ticket stub, the
 * ticket counter's LED readout at the top and, right under it, the cash-in band (tickets for coins). Picking a prize
 * (click, or the focus reaching it) shows it large beside the case with what it costs and where it goes at home; its
 * button takes it. A full-screen DOM modal on the kit's base (its own layout, not a card: it does not close on a
 * click beside it); the Session opens it from the counter, releases the mouse while it is up and re-enters the room
 * when it closes. A prize taken goes on the prize shelf at home, or where it does its job (the poster, the lamp, the
 * cat's toy); the mystery game is a random game the collection does not have, which comes home in the parcel like a
 * purchase.
 */
export class PrizePanel extends ModalPanel {
  private readonly ticketsEl: HTMLElement;
  private readonly coinsEl: HTMLElement;
  private readonly listEl: HTMLElement;
  private readonly detailEl: HTMLElement;
  private readonly munchEl: HTMLElement;
  private readonly photos = new Map<string, string>();
  private selected: string;
  private status: Slip = { text: '', error: false, prize: null };
  private shownTickets: number;
  private shownCoins: number;
  private cancelRoll: () => void = () => {};
  /** "Cash in" clicked once while the pocket covers a prize: a second click cashes it all. */
  private readonly feedAll = new Arming<'all'>(() => this.renderMuncher());

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
    super(container, { className: 'ui-modal--centre ui-panel prizes', label: 'Prize counter' });
    paint(
      this.root,
      html`<div class="prizes__counter">
        <header class="prizes__top">
          <h2 class="prizes__marquee"><span>Prizes</span></h2>
          <div class="prizes__meter" role="status" aria-label="Your tickets">
            <span class="prizes__led" data-role="tickets"></span>
            <span class="prizes__meter-label">tickets</span>
          </div>
          <div class="prizes__purse" aria-label="Your coins"><span class="prizes__coin" aria-hidden="true"></span><b data-role="coins"></b></div>
          <button type="button" class="prizes__close" data-action="close" aria-label="Close">Close <kbd>Esc</kbd></button>
        </header>
        <section class="prizes__muncher" data-role="muncher" aria-label="Cash in tickets for coins"></section>
        <div class="prizes__body">
          <div class="prizes__case" data-role="list"></div>
          <aside class="prizes__detail" data-role="detail" aria-live="polite"></aside>
        </div>
      </div>`,
    );
    this.ticketsEl = this.root.querySelector('[data-role="tickets"]')!;
    this.coinsEl = this.root.querySelector('[data-role="coins"]')!;
    this.listEl = this.root.querySelector('[data-role="list"]')!;
    this.detailEl = this.root.querySelector('[data-role="detail"]')!;
    this.munchEl = this.root.querySelector('[data-role="muncher"]')!;
    this.selected = this.forSale()[0]?.id ?? '';
    this.shownTickets = wallet.tickets;
    this.shownCoins = wallet.coins;
    // Walking the case with the arrows or the D-pad shows each prize as the focus reaches it.
    this.listen(this.listEl, 'focusin', (e) => {
      const tile = (e.target as HTMLElement).closest<HTMLElement>('[data-action="pick"]');
      if (tile?.dataset.prize) this.pick(tile.dataset.prize, false);
    });
    // Repainted while closed too: the wallet and the case are what the player sees first on opening.
    wallet.subscribe(() => this.render());
    prizes.subscribe(() => this.render());
    this.render();
  }

  protected override onOpened(): void {
    this.status = { text: '', error: false, prize: null };
    this.feedAll.reset();
    this.shownTickets = this.wallet.tickets;
    this.shownCoins = this.wallet.coins;
    this.render();
    this.loadPhotos();
  }

  protected override onClosed(): void {
    this.cancelRoll();
  }

  protected override repaint(): void {
    this.render();
  }

  /** Lands on the prize shown, so the arrows start from the case. */
  protected override focusTarget(): HTMLElement | null {
    return this.listEl.querySelector<HTMLElement>(`[data-prize="${CSS.escape(this.selected)}"]`) ?? super.focusTarget();
  }

  protected override onAction(action: string, el: HTMLElement): void {
    const { prize } = el.dataset;
    if (action === 'exchange') this.exchange(Number(el.dataset.coins ?? Infinity));
    else if (action === 'pick') this.pick(prize ?? '', true);
    else if (action === 'take') this.take(prize ?? '');
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
   * covers a prize takes a second click (`confirmTwice`): the tickets do not come back.
   */
  private exchange(maxCoins: number): void {
    const before = this.wallet.tickets;
    const prize = !Number.isFinite(maxCoins) ? this.affordablePrize() : null;
    if (prize && !this.feedAll.press('all')) {
      const left = before % TICKETS_PER_COIN;
      this.slip(`That is enough for the ${prize.name}. Cash in all ${formatTickets(before - left)} all the same (${left} left)? ${armedLine('cash them in')}`, true);
      return;
    }
    this.feedAll.reset();
    const coins = this.wallet.redeemTickets(TICKETS_PER_COIN, Number.isFinite(maxCoins) ? maxCoins : Infinity);
    if (!coins) {
      this.slip(before ? `Only ${formatTickets(before)}: ${TICKETS_PER_COIN} make a coin.` : 'No tickets to exchange. Play something!', true);
      return;
    }
    playCoins(Math.min(8, Math.max(2, coins)));
    this.slip(`The muncher eats ${formatTickets(before - this.wallet.tickets)} and drops ${formatCoins(coins)}.`);
  }

  private take(id: string): void {
    const prize = PRIZES.find((p) => p.id === id);
    if (!prize || prize.tickets === null) return;
    const game = prize.game ? this.drawMysteryGame() : null;
    if (prize.game && !game) {
      this.slip('The mystery box is empty today: every game it could hold is yours already.', true, id);
      return;
    }
    const taken = this.tx.takePrize(prize, game);
    if (!taken.ok) {
      if (taken.reason === 'short') this.slip(`The ${prize.name} is ${formatTickets(prize.tickets)}; you have ${this.wallet.tickets}.`, true, id);
      return;
    }
    // The attendant hands it over across the counter, with a word.
    const shelf = Math.max(0, SHELVES.findIndex((s) => prize.tickets! <= s.upTo));
    const lines = HANDOVER[shelf] ?? HANDOVER[0]!;
    const line = lines[Math.floor(random() * lines.length)]!;
    const where = game ? 'It will be waiting in the parcel at home.' : this.whereItGoes(prize);
    const notices = this.notices;
    if (!notices) {
      this.slip(`Attendant: “${line}” ${game ? `You unwrap it: ${game.title}!` : `The ${prize.name} is yours.`} ${where}`, false, id);
      return;
    }
    // Who speaks is a voice, what was won a reward, where it goes the counter's slip (docs/notices.md).
    notices.say(line, 'Attendant');
    notices.reward({ title: game ? `Mystery game: ${game.title}` : `${prize.name}: yours`, tickets: -prize.tickets!, big: Boolean(game) });
    this.slip(where, false, id);
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
    return left[Math.floor(random() * left.length)] ?? null;
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
    this.renderPurse();
    const restoreFocus = rememberFocus(this.listEl);
    const sale = this.forSale();
    let from = 0;
    paint(
      this.listEl,
      html`${SHELVES.map(({ upTo, card }) => {
        const on = sale.filter((p) => p.tickets! > from && p.tickets! <= upTo);
        from = upTo;
        if (!on.length) return '';
        const lo = on[0]!.tickets!;
        const hi = on[on.length - 1]!.tickets!;
        const range = lo === hi ? `${lo}` : upTo === Infinity ? `${lo}+` : `${lo}–${hi}`;
        return html`<section class="prizes__shelf">
          <p class="prizes__card prizes__card--${card}"><span>${range}</span><small>tickets</small></p>
          <div class="prizes__row">${on.map((p) => this.tileHtml(p))}</div>
        </section>`;
      })}`,
    );
    restoreFocus();
    this.renderDetail();
    this.renderMuncher();
  }

  private tileHtml(p: Prize): Html {
    const owned = this.prizes.count(p.id);
    const short = p.tickets! > this.wallet.tickets;
    const sticker = p.home && owned ? 'At home' : owned ? `×${owned}` : '';
    return html`<button type="button" class="prizes__item${short ? ' prizes__item--short' : ''}" data-action="pick" data-prize="${p.id}"
        aria-pressed="${p.id === this.selected ? 'true' : 'false'}" aria-label="${`${p.name}, ${formatTickets(p.tickets ?? 0)}`}">
        ${this.photoHtml(p)}
        <span class="prizes__name">${p.name}</span>
        <span class="prizes__stub">${p.tickets}</span>
        ${sticker ? html`<span class="prizes__sticker">${sticker}</span>` : ''}
      </button>`;
  }

  /** The photo if the studio has it, else the prize's colour as a soft blob while it is taken. */
  private photoHtml(p: Prize): Html {
    const url = this.photos.get(p.id);
    return html`<span class="prizes__photo${url ? ' prizes__photo--ready' : ''}" style="--prize:${hex(p.color)}"><img data-photo="${p.id}" alt=""${url ? html` src="${url}"` : ''} /></span>`;
  }

  private markSelected(): void {
    for (const tile of this.listEl.querySelectorAll<HTMLElement>('[data-action="pick"]')) tile.setAttribute('aria-pressed', String(tile.dataset.prize === this.selected));
  }

  private renderDetail(): void {
    const p = this.forSale().find((x) => x.id === this.selected);
    if (!p) {
      paint(this.detailEl, html``);
      return;
    }
    const restoreFocus = rememberFocus(this.detailEl);
    const have = this.wallet.tickets;
    const owned = this.prizes.count(p.id);
    const done = !!p.home && owned > 0;
    const short = p.tickets! - have;
    const label = done ? 'Already at home' : short > 0 ? `${formatTickets(short)} short` : 'Take it';
    const status = this.status.prize === p.id ? this.status : null;
    paint(
      this.detailEl,
      html`<div class="prizes__stage">${this.photoHtml(p)}</div>
      <h3>${p.name}</h3>
      <p class="prizes__blurb">${p.blurb}</p>
      <p class="prizes__where">${p.game ? 'Comes home in the parcel.' : this.whereItGoes(p)}${owned && !p.home ? html` <b>${owned} at home already.</b>` : ''}</p>
      <div class="prizes__price"><span class="prizes__stub prizes__stub--big">${p.tickets}</span>${short > 0 && !done ? html`<span class="prizes__need">you have ${have}</span>` : ''}</div>
      <button type="button" class="prizes__take" data-action="take" data-prize="${p.id}"${attr('disabled', done || short > 0)}>${label}</button>
      ${status?.text ? html`<p class="prizes__slip${status.error ? ' prizes__slip--error' : ''}">${status.text}</p>` : ''}`,
    );
    restoreFocus();
  }

  /**
   * The cash-in band under the counter's top, as loud as the case: what the pocket's tickets come to in coins, the big
   * gold button that cashes them all, and a coin or ten at a time beside it. The same buttons whatever the pocket
   * holds (greyed when it cannot cover them), and the muncher's word in place of the worth line, so nothing moves as
   * tickets come and go.
   */
  private renderMuncher(): void {
    const restoreFocus = rememberFocus(this.munchEl);
    const gain = Math.floor(this.wallet.tickets / TICKETS_PER_COIN);
    const status = this.status.prize === null ? this.status : null;
    this.munchEl.classList.toggle('prizes__muncher--ready', gain > 0);
    // Fed a step at a time (a coin, ten, or the lot), so a pocket saved for a prize is not munched by one click.
    const steps = FEEDS.filter((coins) => Number.isFinite(coins)).map(
      (coins) => html`<button type="button" class="prizes__feed" data-action="exchange" data-coins="${coins}"
          aria-label="${`Cash in ${formatTickets(coins * TICKETS_PER_COIN)} for ${formatCoins(coins)}`}"${attr('disabled', gain < coins)}>${formatCoins(coins)}</button>`,
    );
    const armed = this.feedAll.isArmed('all');
    const all = gain ? `${armed ? 'Sure? Cash in' : 'Cash in'} ${formatCoins(gain)}` : 'Cash in';
    paint(
      this.munchEl,
      html`<span class="prizes__slot" aria-hidden="true"></span>
      <p class="prizes__muncher-text">
        <b>Tickets for coins</b>
        ${status?.text
          ? html`<span class="prizes__worth prizes__worth--said${status.error ? ' prizes__worth--error' : ''}" role="status">${status.text}</span>`
          : html`<span class="prizes__worth">${gain ? html`Your tickets are worth <em>${formatCoins(gain)}</em>` : `${formatTickets(TICKETS_PER_COIN)} make a coin`}</span>`}
      </p>
      <div class="prizes__feeds">${steps}</div>
      <button type="button" class="prizes__cash-all" data-action="exchange" data-coins="Infinity"${attr('disabled', !gain)}><span class="prizes__coin" aria-hidden="true"></span>${all}</button>`,
    );
    restoreFocus();
  }

  /** The coins beside the counter; coins coming in (the muncher's) make the purse jump, so the eye follows them up. */
  private renderPurse(): void {
    const coins = this.wallet.coins;
    const gained = this.isOpen && coins > this.shownCoins;
    this.shownCoins = coins;
    this.coinsEl.textContent = String(coins);
    if (!gained) return;
    const purse = this.coinsEl.parentElement;
    purse?.classList.remove('prizes__purse--jump');
    void purse?.offsetWidth; // restarts the animation on a second cash-in in a row
    purse?.classList.add('prizes__purse--jump');
  }

  /** The LED readout rolls from the number it showed to the wallet's (`ui/countUp`). */
  private renderMeter(): void {
    const target = this.wallet.tickets;
    this.cancelRoll();
    const from = this.shownTickets;
    if (!this.isOpen || from === target) {
      this.shownTickets = target;
      this.ticketsEl.textContent = led(target);
      return;
    }
    this.cancelRoll = rollNumber(from, target, ROLL_MS, (value) => {
      this.shownTickets = value;
      this.ticketsEl.textContent = led(value);
    });
  }

  /** A line from the counter: about a prize (`prize`: shown under it) or about the muncher. */
  private slip(text: string, error = false, prize: string | null = null): void {
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
