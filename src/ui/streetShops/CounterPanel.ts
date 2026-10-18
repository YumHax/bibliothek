import { ARM_ABOVE } from '@/economy/pricing';
import { playCoins } from '@/audio/coins';
import { Arming, armedLine } from '../confirmTwice';
import { CardPanel } from '../panel/CardPanel';
import { html, type Html } from '../panel/html';
import { coverImg, emptyState, priceHtml } from '../panel/widgets';
import { Speaker } from '../panel/speaker';
import type { Game } from '@/catalog/types';
import type { PersonId } from '@/social/types';
import { findPerson } from '@/social/people';
import { formatCoins } from '@/text/money';
import './streetShops.css';

/** The paper a counter prints on (`data-shop` on the panel: its own colours and type in `streetShops.css`). */
type CounterPaper = 'bookshop' | 'comics' | 'kiosk' | 'popup';

/** The face beside the shopkeeper's words (CSS px), on the counter's paper. */
const FACE = 60;
/** Each paper's backdrop behind the keeper's face (the shop's own wall). */
const SHOP_FACE_PAPER: Record<CounterPaper, string> = { bookshop: '#e7d9bb', comics: '#f6e27a', kiosk: '#d9dbd4', popup: '#2b2450' };

/** One thing on a Front Street counter: what, a line about it, its price (none: free), its button's verb. */
export interface CounterRow {
  id: string;
  title: string;
  detail?: string;
  /** Coins; undefined for something that costs nothing (a card handed back, a console collected). */
  price?: number;
  /** The price is still being looked up ("Pricing…"). */
  pending?: boolean;
  /** The button's verb ("Buy", "Order", "Swap"). */
  verb: string;
  /** Why it cannot be had now (the press says it in the status line); absent: it can. */
  unavailable?: string;
  /** A small badge after the title ("for your copy", "first print"). */
  badge?: string;
  /** The game it is, for a cover thumbnail. */
  game?: Game;
}

export interface CounterSection {
  title: string;
  rows: readonly CounterRow[];
  /** Said when there is nothing in it. */
  empty: string;
}

/** What a counter is dealt (by the shop's door on Front Street, `world/street/shops/counters`): who, what they say, what is on it. */
export interface CounterDeal {
  /** The shop's name, the panel's title. */
  title: string;
  /** The shopkeeper's words at the top. */
  says(): string;
  sections(): readonly CounterSection[];
  /** The wallet now. */
  coins(): number;
  /** The row pressed (twice for a dear one): it is had, or why not; the shopkeeper's words after it. */
  take(id: string): { ok: boolean; line: string; coins?: boolean };
  /** A change elsewhere repaints the counter (a price looked up). */
  onChange?(cb: () => void): () => void;
  cover?(game: Game): string | undefined;
  /** The counter's own paper (absent: the kit's card). */
  paper?: CounterPaper;
  /**
   * Who serves: their name under their face, the face a person's card (`id`) or, for a keeper the town keeps no card
   * on, the look seed their walker wears (`seed`, `ui/social/strangerFace`).
   */
  keeper?: { name: string; id?: PersonId; seed?: number };
}

/**
 * A Front Street counter (docs/economy.md "Front Street's shops and finds"): the shopkeeper's words, then what is on it in
 * sections (CORNER BOOKS' box of manuals and its orders, COMICS & MANGA's guides, the kiosk's paper and cards, the
 * pop-up's copies), each row with its price and one button; something dear is pressed twice (`confirmTwice`). What
 * cannot be had says why in the status line, never greyed out silently. A `ModalLike` the shop's door opens.
 */
export class CounterPanel extends CardPanel {
  private deal: CounterDeal | null = null;
  /** The keeper: face and name tag, their words in a balloon (pleased with a sale, put out by a no). */
  private readonly keeper = new Speaker({ name: 'Behind the counter' }, { face: FACE, className: 'street-counter__keeper' });
  private readonly arming = new Arming(() => this.refresh());
  private stop: (() => void) | null = null;

  constructor(container: HTMLElement) {
    super(container, { className: 'street-counter', title: 'The counter', dismiss: 'Leave the counter' });
    this.keeper.mountAbove(this.body);
  }

  /** Lays out `deal` (before the Session opens the panel). */
  show(deal: CounterDeal): void {
    this.stop?.();
    this.deal = deal;
    const who = deal.keeper;
    const backdrop = SHOP_FACE_PAPER[deal.paper ?? 'bookshop'];
    const known = who?.id && findPerson(who.id) ? who.id : undefined;
    this.keeper.setWho({ name: who?.name ?? 'Behind the counter', backdrop, ...(known ? { person: known } : who?.seed !== undefined ? { seed: who.seed } : {}) });
    this.keeper.say(deal.says(), 'smile');
    this.setTitle(deal.title);
    if (deal.paper) this.root.dataset.shop = deal.paper;
    else delete this.root.dataset.shop;
    this.stop = deal.onChange?.(() => {
      if (this.isOpen) this.refresh();
    }) ?? null;
  }

  protected override onOpened(): void {
    this.arming.reset();
    super.onOpened();
  }

  protected override onClosed(): void {
    this.stop?.();
    this.stop = null;
  }

  protected render(): Html {
    const deal = this.deal;
    if (!deal) return html``;
    return html`<p class="street-counter__purse"><span class="ui-coin" aria-hidden="true"></span>${formatCoins(deal.coins())} in your pocket</p>
      ${deal.sections().map((section) => html`<section class="street-counter__section">
        <h3>${section.title}</h3>
        ${section.rows.length ? html`<ul class="street-counter__rows">${section.rows.map((row) => this.rowHtml(deal, row))}</ul>` : emptyState(section.empty, { pictogram: 'shelf', className: 'street-counter__empty' })}
      </section>`)}`;
  }

  private rowHtml(deal: CounterDeal, row: CounterRow): Html {
    const armed = this.arming.isArmed(row.id);
    const priceTag = row.price === undefined ? '' : priceHtml(row.price, { pending: row.pending });
    const label = armed && row.price !== undefined ? `${row.verb} · ${formatCoins(row.price)}?` : row.verb;
    const cover = row.game ? coverImg(deal.cover?.(row.game), row.game, 'street-counter__cover') : '';
    return html`<li class="street-counter__row">
      ${cover}<span class="street-counter__what"><span class="street-counter__title">${row.title}${row.badge ? html` <span class="ui-badge">${row.badge}</span>` : ''}</span>${row.detail ? html`<small>${row.detail}</small>` : ''}</span>
      ${priceTag}<button type="button" class="ui-btn${armed ? ' ui-btn--armed' : ''}" data-action="take" data-id="${row.id}"${row.unavailable !== undefined || row.pending === true ? html` aria-disabled="true"` : ''}>${label}</button>
    </li>`;
  }

  protected override onAction(action: string, el: HTMLElement): void {
    const deal = this.deal;
    const id = el.dataset.id;
    if (action !== 'take' || !deal || !id) return;
    const row = deal.sections().flatMap((s) => s.rows).find((r) => r.id === id);
    if (!row) return;
    if (row.pending) {
      this.setStatus('Still looking the price up…', 'info');
      return;
    }
    if (row.unavailable !== undefined) {
      this.setStatus(row.unavailable, 'error');
      return;
    }
    if ((row.price ?? 0) > ARM_ABOVE && !this.arming.press(row.id)) {
      this.setStatus(armedLine(row.verb.toLowerCase()), 'info');
      return;
    }
    const done = deal.take(row.id);
    this.keeper.say(done.line, done.ok ? 'smile' : 'frown');
    if (done.ok && done.coins) playCoins(2);
    this.setStatus('');
    this.refresh();
  }
}
