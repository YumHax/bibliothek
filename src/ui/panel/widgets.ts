import type { Game } from '@/catalog/types';
import { formatCoins } from '@/text/money';
import { coverAttrs } from '../coverPlaceholder';
import { html, raw, type Html, type HtmlValue } from './html';

/*
 * The pieces the panels share: a price with the coin glyph, the wallet's line, a cover thumbnail with its made-up
 * fallback, a game row, a tab bar, the empty state. Markup only (`Html`); the kit's CSS classes (`catalogue__*`
 * today, `ui-*` as the tokens land) style them.
 */

/** A price with the coin glyph; `pending` greys it (its fame not known yet), `was` strikes the usual price out beside it. */
export function priceHtml(coins: number, options: { pending?: boolean; was?: number } = {}): Html {
  const was = options.was !== undefined && options.was !== coins ? html`<s class="catalogue__was">${options.was}</s> ` : '';
  return html`<span class="catalogue__price${options.pending ? ' catalogue__price--pending' : ''}">${was}${coins} <span class="catalogue__coin"></span></span>`;
}

/** "120 coins in your pocket": the header's line. */
export function walletLine(coins: number): string {
  return `${formatCoins(coins)} in your pocket`;
}

/**
 * A cover thumbnail: nothing without a `src`; with `game`, the attributes the shared placeholder (`coverPlaceholder`)
 * paints a made-up box from when the image fails to load.
 */
export function coverImg(src: string | undefined, game?: Game, className = 'catalogue__cover'): Html {
  if (!src) return html``;
  return html`<img class="${className}" src="${src}" alt=""${game ? raw(coverAttrs(game)) : ''} loading="lazy" />`;
}

interface GameRowParts {
  /** `data-id` on the row (what `refreshRow` and the focus restore find it by). */
  id?: string;
  cover?: Html;
  title: string;
  /** The row's small notes (platform, condition, "paid 40"); empty ones are skipped. */
  metas?: readonly (string | Html | undefined | false)[];
  /** What follows the notes: the price and the button. */
  tail?: HtmlValue;
  className?: string;
}

/** One game in a list: cover, title, notes, then the price and the button. */
export function gameRow(parts: GameRowParts): Html {
  const metas = (parts.metas ?? []).filter((m): m is string | Html => !!m).map((m) => (typeof m === 'string' ? html`<span class="catalogue__meta">${m}</span>` : m));
  return html`<div class="catalogue__row${parts.className ? ` ${parts.className}` : ''}"${parts.id !== undefined ? html` data-id="${parts.id}"` : ''}>
    ${parts.cover ?? ''}<span class="catalogue__title">${parts.title}</span>${metas}${parts.tail ?? ''}
  </div>`;
}

interface TabsOptions<Id extends string> {
  /** A label is text, or markup when it carries a badge. */
  tabs: readonly { id: Id; label: string | Html }[];
  active: Id;
  /** The buttons' `data-action` (default `tab`); the tab's id is `data-tab`. */
  action?: string;
  className?: string;
  /** Names the list and its tabs for a reader (`aria-label`, `id="<prefix>-<tab>"`) and the panel they control (`aria-controls`). */
  label?: string;
  idPrefix?: string;
  controls?: string;
}

/**
 * A row of tabs (`role="tablist"`): the panel's `onAction('tab', el)` reads `el.dataset.tab`; `onSide` steps through
 * them with `nextTab`. One tab stop (the shown tab, `data-autofocus`; the others `tabindex="-1"`): the arrows move
 * between tabs, Tab leaves them.
 */
export function tabs<Id extends string>(options: TabsOptions<Id>): Html {
  const action = options.action ?? 'tab';
  return html`<div class="ui-tabs${options.className ? ` ${options.className}` : ''}" role="tablist"${options.label ? html` aria-label="${options.label}"` : ''}>${options.tabs.map((t) => {
    const selected = t.id === options.active;
    return html`<button type="button" class="ui-btn" role="tab"${options.idPrefix ? html` id="${options.idPrefix}-${t.id}"` : ''}${options.controls ? html` aria-controls="${options.controls}"` : ''} aria-selected="${selected ? 'true' : 'false'}" data-action="${action}" data-tab="${t.id}"${selected ? raw(' data-autofocus') : raw(' tabindex="-1"')}>${t.label}</button>`;
  })}</div>`;
}

/** The tab beside `active` in `direction`, wrapping round (for `onSide`). */
export function nextTab<Id extends string>(ids: readonly Id[], active: Id, direction: 1 | -1): Id {
  const at = Math.max(0, ids.indexOf(active));
  return ids[(at + direction + ids.length) % ids.length]!;
}

/** A list with nothing in it: one line saying why. */
export function emptyState(text: string, className = 'catalogue__empty'): Html {
  return html`<p class="${className}">${text}</p>`;
}
