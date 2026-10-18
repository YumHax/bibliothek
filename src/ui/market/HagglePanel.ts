import type { ArgumentKind, Negotiation, OfferKind, Reply } from '@/economy/haggle';
import { OFFER_KINDS } from '@/economy/haggle';
import type { StockItem } from '@/economy/StockItem';
import { ARM_ABOVE } from '@/economy/pricing';
import type { PersonId } from '@/social/types';
import { shortName } from '@/social/people';
import { playCoins } from '@/audio/coins';
import { playHandshake, playHuff } from '@/audio/dealSounds';
import { FACE_PAPER, portrait } from '../social/portrait';
import type { Expression } from '../social/face';
import { Arming } from '../confirmTwice';
import { MarketPanel, type PanelWallet } from './MarketPanel';
import { attr, html, paint } from '../panel/html';
import { priceHtml } from '../panel/widgets';
import { formatCoins } from '@/text/money';
import { capitalise } from '@/text/strings';
import { haggleVoice } from './haggleVoice';

/** How a haggle ended, as the Session hears it. */
type HaggleOutcome = 'deal' | 'walk' | 'stopped' | 'none';

interface Exchange {
  who: 'you' | 'them';
  text: string;
}

/** What the player says with each offer: their own words, the price in them. */
const OFFER_LINE: Record<OfferKind, string> = {
  cheeky: 'I’ll give you {price}, cash.',
  fair: 'How about {price}?',
  polite: 'Would you take {price}?',
};
/** What the player says with each argument. */
const ARGUMENT_LINE: Record<ArgumentKind, string> = {
  manual: 'There’s no manual in it, though.',
  worn: 'The box has seen better days.',
  later: 'I’ll think about it till Sunday.',
};
/** The seller's face, big at the top and small in the deal's stamp (CSS px), on the balloons' paper (`FACE_PAPER`). */
const FACE_SIZE = 72;
const SMALL_FACE = 34;

/** A seller with no card: a drawn head and shoulders in the stall's ink, so their balloons are never faceless. */
const SILHOUETTE = html`<svg class="haggle__silhouette" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="15" r="7.5"/><path d="M6 40c0-9 6.5-14.5 14-14.5S34 31 34 40z"/></svg>`;

/**
 * Haggling over the copy in hand at the stall, face to face (a stall scene, `MarketPanel` `scene`): their painted face
 * and name at the top (it smiles at a deal, frowns as their patience wears thin), what was said as comic balloons
 * (theirs on the left, the player's on the right), and along the bottom what the player can say: the three offers as
 * their own words (keys 1-3), the copy's flaw and "till Sunday" (keys 4-5, once each), taking their price (Enter with
 * no button focused, from the first line). Every line keeps its place: one said, or one over what they ask now, stays
 * in its slot struck through, so nothing moves under the pointer. Shaken on, the copy is paid on the spot ("Pay N",
 * pressed twice past `ARM_ABOVE`, the Session buys it as the panel closes); walking off (Esc or Close) leaves their
 * last word standing for the day. The seller speaks in their own voice (`haggleVoice`). The negotiation itself
 * (`Negotiation`) is pure; this panel only talks.
 */
export class HagglePanel extends MarketPanel {
  private item: StockItem | null = null;
  private negotiation: Negotiation | null = null;
  private seller: PersonId | undefined;
  private sellerName = 'The stallholder';
  private log: Exchange[] = [];
  private insults = 0;
  private outcome: HaggleOutcome = 'none';
  private face: Expression = 'rest';
  /** "Pay N" pressed (twice past `ARM_ABOVE`): the Session buys the copy as the panel closes. */
  private pay = false;
  private readonly paying = new Arming<'pay'>(() => this.refresh());
  private onDone: ((result: { insults: number; outcome: HaggleOutcome; pay: boolean }) => void) | null = null;

  constructor(container: HTMLElement, wallet: PanelWallet) {
    super(container, wallet, { title: 'Haggle', className: 'haggle', scene: true });
  }

  /** Sets up the haggle over `item` with `seller` (their card, for the name, the face and the voice); the Session opens the panel next. */
  start(options: { item: StockItem; negotiation: Negotiation; stall: string; seller?: PersonId; onClose: (result: { insults: number; outcome: HaggleOutcome; pay: boolean }) => void }): void {
    this.item = options.item;
    this.negotiation = options.negotiation;
    this.seller = options.seller;
    this.sellerName = options.seller ? shortName(options.seller) : 'The stallholder';
    this.onDone = options.onClose;
    this.insults = 0;
    this.outcome = 'none';
    this.face = 'rest';
    this.pay = false;
    this.paying.reset();
    options.negotiation.useVoice(haggleVoice(options.seller));
    this.log = [{ who: 'them', text: options.negotiation.opening }];
    // The awning names the stall; the face and the name are the body's.
    this.setTitle(capitalise(options.stall));
  }

  protected render(): void {
    const n = this.negotiation;
    const item = this.item;
    if (!n || !item) return;
    const log = this.log.map((e, i) => html`<div class="haggle__line haggle__line--${e.who}${i === this.log.length - 1 ? ' haggle__line--new' : ''}">
        ${e.who === 'them' ? html`<span class="haggle__small-face" data-face="small"></span>` : ''}
        <p class="haggle__balloon">${e.text}</p>
      </div>`);
    const asking = n.done ? Math.round(n.factor * n.tag) : n.asking;
    paint(
      this.body,
      html`<div class="haggle__deal">
        <span class="haggle__face" data-face="big"></span>
        <div class="haggle__what">
          <span class="haggle__who">${this.sellerName}</span>
          <span class="haggle__mood">${this.moodWord()}</span>
          <span class="catalogue__title">${item.game.title}</span>
        </div>
        <div class="haggle__asking${n.done && this.outcome === 'deal' ? ' haggle__asking--agreed' : ''}">
          <small>${n.done ? (this.outcome === 'deal' ? 'shaken on' : 'their last word') : asking < n.tag ? 'asking now' : 'on the tag'}</small>
          ${priceHtml(asking, asking < n.tag ? { was: n.tag } : {})}
        </div>
      </div>
      <div class="haggle__log">${log}</div>
      <div class="haggle__offers">${n.done ? this.closingHtml(asking) : this.linesHtml(n)}</div>`,
    );
    this.paintFaces();
    const logEl = this.body.querySelector('.haggle__log');
    if (logEl) logEl.scrollTop = logEl.scrollHeight;
  }

  /** What the player can still say: every line in its slot, the ones said or overtaken struck through in place. */
  private linesHtml(n: Negotiation) {
    const offers = OFFER_KINDS.map((kind, i) => {
      const over = n.offerPrice(kind) >= n.asking;
      return html`<button type="button" class="ui-btn haggle__say${over ? ' haggle__say--spent' : ''}" data-action="offer" data-kind="${kind}" aria-disabled="${over}"${attr('data-autofocus', i === 1 && !over)}>
        <kbd>${i + 1}</kbd> ${OFFER_LINE[kind].replace('{price}', formatCoins(n.offerPrice(kind)))}
      </button>`;
    });
    const left = n.arguments;
    const argues = (['manual', 'worn', 'later'] as const).map((kind, i) => {
      // A flaw this copy does not have is never offered; one already said stays, struck through.
      const said = !left.includes(kind);
      if (said && !this.log.some((e) => e.who === 'you' && e.text === ARGUMENT_LINE[kind])) return '';
      return html`<button type="button" class="ui-btn haggle__say haggle__say--argue${said ? ' haggle__say--spent' : ''}" data-action="argue" data-kind="${kind}" aria-disabled="${said}"><kbd>${i === 2 ? 5 : 4}</kbd> ${ARGUMENT_LINE[kind]}</button>`;
    });
    const take = n.asking < n.tag ? `Go on, ${formatCoins(n.asking)} it is.` : `Fine, ${formatCoins(n.asking)} it is.`;
    return html`${offers}${argues}<button type="button" class="ui-btn ui-btn--primary haggle__say haggle__take" data-action="take"><kbd>Enter</kbd> ${take}</button>`;
  }

  /** Shaken on: pay now (the price in the button) or leave it for later; walked off: back to the stall. */
  private closingHtml(agreed: number) {
    if (this.outcome !== 'deal') return html`<button type="button" data-action="close" class="ui-btn ui-btn--primary haggle__back" data-autofocus>Back to the stall</button>`;
    const price = this.owed(agreed);
    const short = Math.max(0, price - this.wallet.coins);
    const armed = this.paying.isArmed('pay');
    const label = short ? `${formatCoins(short)} short` : armed ? `Pay ${formatCoins(price)}?` : `Pay ${formatCoins(price)}`;
    return html`<button type="button" data-action="pay" class="ui-btn ui-btn--primary haggle__pay${armed ? ' ui-btn--armed' : ''}" aria-disabled="${short > 0}" data-autofocus><kbd>Enter</kbd> ${label}</button>
      <button type="button" data-action="close" class="ui-btn haggle__back">Not now: the price stands today</button>`;
  }

  /** How they are taking it, in a word under their name: no numbers, their face says the rest. */
  private moodWord(): string {
    const n = this.negotiation;
    if (!n) return '';
    if (n.done) return this.outcome === 'deal' ? 'shook on it' : 'done talking';
    return n.patienceLeft <= 1 ? 'losing patience' : this.insults ? 'a bit put out' : 'happy to talk';
  }

  /** Their painted face (or a drawn one) into the header and beside each of their balloons (canvases, so after the markup). */
  private paintFaces(): void {
    const id = this.seller;
    this.body.querySelectorAll<HTMLElement>('[data-face]').forEach((el) => {
      const big = el.dataset.face === 'big';
      if (id) el.append(portrait(id, big ? FACE_SIZE : SMALL_FACE, FACE_PAPER, big ? this.face : 'rest'));
      else paint(el, SILHOUETTE);
    });
  }

  protected override onAction(action: string, el: HTMLElement): void {
    if (action === 'offer' && el.dataset.kind) this.offer(el.dataset.kind as OfferKind);
    else if (action === 'argue' && el.dataset.kind) this.argue(el.dataset.kind as ArgumentKind);
    else if (action === 'take') this.take();
    else if (action === 'pay') this.payNow();
  }

  protected override onKey(e: KeyboardEvent): void {
    const i = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].indexOf(e.code);
    if (i >= 0) this.offer(OFFER_KINDS[i % 3]!);
    else if (e.code === 'Digit4' || e.code === 'Numpad4') {
      const flaw = this.negotiation?.arguments.find((a) => a !== 'later');
      if (flaw) this.argue(flaw);
    } else if (e.code === 'Digit5' || e.code === 'Numpad5') this.argue('later');
  }

  /** Enter with nothing focused: take their price; shaken on, pay; walked off, leave. */
  protected override onEnter(): boolean {
    const n = this.negotiation;
    if (n?.done && this.outcome === 'deal') this.payNow();
    else if (n?.done) this.close();
    else this.take();
    return true;
  }

  protected override onClosed(): void {
    const n = this.negotiation;
    if (n && !n.done && this.outcome !== 'none') {
      n.abandon();
      this.outcome = 'stopped';
    }
    const done = this.onDone;
    this.onDone = null;
    done?.({ insults: this.insults, outcome: this.outcome, pay: this.pay && this.outcome === 'deal' });
  }

  private offer(kind: OfferKind): void {
    const n = this.negotiation;
    if (!n || n.done) return;
    if (n.offerPrice(kind) >= n.asking) {
      this.setStatus(`They’re asking ${formatCoins(n.asking)} now: that would be paying over.`);
      return;
    }
    this.log.push({ who: 'you', text: OFFER_LINE[kind].replace('{price}', formatCoins(n.offerPrice(kind))) });
    this.answer(n.offer(kind));
  }

  private argue(kind: ArgumentKind): void {
    const n = this.negotiation;
    if (!n || n.done) return;
    if (!n.arguments.includes(kind)) {
      this.setStatus('You said that already: they heard you the first time.');
      return;
    }
    this.log.push({ who: 'you', text: ARGUMENT_LINE[kind] });
    this.answer(n.argue(kind));
  }

  private take(): void {
    const n = this.negotiation;
    if (!n || n.done) return;
    this.log.push({ who: 'you', text: n.asking < n.tag ? `Go on, ${formatCoins(n.asking)} it is.` : `Fine, ${formatCoins(n.asking)} it is.` });
    this.answer(n.acceptCounter());
  }

  /** The handshake's price paid on the spot: the second press past `ARM_ABOVE`, then the Session buys as the panel goes. */
  private payNow(): void {
    const n = this.negotiation;
    if (!n?.done || this.outcome !== 'deal') return;
    const price = this.owed(Math.round(n.factor * n.tag));
    const short = price - this.wallet.coins;
    if (short > 0) {
      this.setStatus(`You’re ${formatCoins(short)} short. Their price stands till the market packs up.`, 'error');
      return;
    }
    if (price > ARM_ABOVE && !this.paying.press('pay')) return;
    this.pay = true;
    this.close();
  }

  /** What is left to pay on the price shaken on: a copy held with a deposit owes the rest (as `StockItem.due`). */
  private owed(agreed: number): number {
    return Math.max(0, Math.max(1, agreed) - (this.item?.deposit ?? 0));
  }

  private answer(reply: Reply): void {
    this.log.push({ who: 'them', text: reply.line });
    this.setStatus('');
    if (reply.kind === 'accept') {
      this.outcome = 'deal';
      this.face = 'smile';
      playHandshake();
      playCoins(1, 0.06);
    } else {
      this.outcome = reply.kind === 'walk' ? 'walk' : 'stopped';
      if (reply.insulted) this.insults++;
      const sore = reply.kind === 'walk' || reply.insulted;
      this.face = sore ? 'frown' : (this.negotiation?.patienceLeft ?? 0) <= 1 ? 'frown' : 'rest';
      if (sore) playHuff();
    }
    this.refresh();
  }
}
