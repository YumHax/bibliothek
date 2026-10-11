import { ARM_ABOVE } from '@/economy/pricing';
import { playCoins } from '@/audio/coins';
import { Arming, armedLine } from '../confirmTwice';
import { CardPanel } from '../panel/CardPanel';
import { attr, html, type Html } from '../panel/html';
import { coverImg, priceHtml, walletLine } from '../panel/widgets';
import type { Game } from '@/catalog/types';
import './streetShops.css';

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
}

/**
 * A Front Street counter (docs/economy.md "Front Street's shops and finds"): the shopkeeper's words, then what is on it in
 * sections (CORNER BOOKS' box of manuals and its orders, COMICS & MANGA's guides, the kiosk's paper and cards, the
 * pop-up's copies), each row with its price and one button; something dear is pressed twice (`confirmTwice`). What
 * cannot be had says why in the status line, never greyed out silently. A `ModalLike` the shop's door opens.
 */
export class CounterPanel extends CardPanel {
  private deal: CounterDeal | null = null;
  private line = '';
  private readonly arming = new Arming(() => this.refresh());
  private stop: (() => void) | null = null;

  constructor(container: HTMLElement) {
    super(container, { className: 'street-counter', title: 'The counter', dismiss: 'Leave the counter' });
  }

  /** Lays out `deal` (before the Session opens the panel). */
  show(deal: CounterDeal): void {
    this.stop?.();
    this.deal = deal;
    this.line = deal.says();
    this.setTitle(deal.title);
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
    return html`<p class="street-counter__says">${this.line}</p>
      <p class="street-counter__wallet">${walletLine(deal.coins())}</p>
      ${deal.sections().map((section) => html`<section class="street-counter__section">
        <h3>${section.title}</h3>
        ${section.rows.length ? html`<ul class="street-counter__rows">${section.rows.map((row) => this.rowHtml(deal, row))}</ul>` : html`<p class="street-counter__empty">${section.empty}</p>`}
      </section>`)}`;
  }

  private rowHtml(deal: CounterDeal, row: CounterRow): Html {
    const armed = this.arming.isArmed(row.id);
    const price = row.price === undefined ? '' : priceHtml(row.price, { pending: row.pending });
    const label = armed ? `${row.verb} · ${row.price}?` : row.verb;
    const cover = row.game ? coverImg(deal.cover?.(row.game), row.game, 'street-counter__cover') : '';
    return html`<li class="street-counter__row">
      ${cover}<span class="street-counter__what"><span class="street-counter__title">${row.title}${row.badge ? html` <span class="ui-badge">${row.badge}</span>` : ''}</span>${row.detail ? html`<small>${row.detail}</small>` : ''}</span>
      ${price}<button type="button" class="ui-btn${armed ? ' ui-btn--armed' : ''}" data-action="take" data-id="${row.id}"${attr('aria-disabled', row.unavailable !== undefined || row.pending === true)}>${label}</button>
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
    this.line = done.line;
    if (done.ok && done.coins) playCoins(2);
    this.setStatus(done.ok ? '' : done.line, done.ok ? 'ok' : 'error');
    this.refresh();
  }
}
