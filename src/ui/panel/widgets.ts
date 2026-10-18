import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { formatCoins } from '@/text/money';
import { coverAttrs } from '../coverPlaceholder';
import { html, raw, type Html, type HtmlValue } from './html';
import { inlinePictogram } from './pictograms';

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
  // No art at all but the game known: its made-up box at once (what a failed image becomes), so rows keep their column.
  if (!src && game) {
    const platform = getPlatform(game.platform);
    const own = className.split(/\s+/).filter((c) => c && c !== 'catalogue__cover').join(' ');
    return html`<span class="catalogue__cover catalogue__cover--placeholder${own ? ` ${own}` : ''}" aria-hidden="true" style="--cover-colour:#${platform.accentColor.toString(16).padStart(6, '0')}"><span class="catalogue__cover-band">${platform.shortName}</span><span class="catalogue__cover-title">${game.title}</span></span>`;
  }
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

interface EmptyOptions {
  /** A pictogram's name (`panel/pictograms`: box, sofa, film, letter, shelf, magnifier…) drawn above the words. */
  pictogram?: string;
  /** A short head in the panel's voice ("Nothing put away"), the text under it says why or what fills it. */
  title?: string;
  /** The next step: a button with this `data-action` (and `data-id`), handled by the panel's `onAction`. */
  action?: { label: string; action: string; id?: string };
  className?: string;
}

/**
 * A list with nothing in it. With a class name only (or nothing) it is the one line saying why; with options it
 * is a small drawn block: the pictogram, a head, the line, and the button to the next step. Inks with
 * `currentColor`, so it sits on the dark kit and on a panel's paper alike.
 */
export function emptyState(text: string, options: string | EmptyOptions = 'catalogue__empty'): Html {
  if (typeof options === 'string') return html`<p class="${options}">${text}</p>`;
  const { pictogram, title, action, className } = options;
  return html`<div class="ui-empty-block${className ? ` ${className}` : ''}">
    ${pictogram ? inlinePictogram(pictogram, 'ui-empty-block__picture') : ''}
    ${title ? html`<p class="ui-empty-block__title">${title}</p>` : ''}
    <p class="ui-empty-block__text">${text}</p>
    ${action ? html`<button type="button" class="ui-btn ui-empty-block__action" data-action="${action.action}"${action.id !== undefined ? html` data-id="${action.id}"` : ''}>${action.label}</button>` : ''}
  </div>`;
}
