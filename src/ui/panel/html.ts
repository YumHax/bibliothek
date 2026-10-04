import { escapeHtml } from '../html';

/**
 * Markup already safe to put in the page: what the `html` tag returns and what `raw` wraps. Interpolated into
 * another `html` template it goes in as it is; a plain string goes in escaped. So a panel's template never calls
 * `escapeHtml` by hand, and a value that must not be escaped (a widget's markup, an attribute string from
 * `coverAttrs`) says so with `raw`.
 */
export class Html {
  constructor(readonly markup: string) {}

  toString(): string {
    return this.markup;
  }
}

/** Markup that is already escaped (a helper's output). The caller vouches for it. */
export function raw(markup: string): Html {
  return new Html(markup);
}

/** What `html` accepts between its strings: text (escaped), numbers, markup (as is), lists of these, or nothing. */
export type HtmlValue = Html | string | number | boolean | null | undefined | readonly HtmlValue[];

/**
 * The panels' template tag: `html\`<b>${title}</b>\`` escapes `title`; an `Html` (another template, a widget) is
 * inserted whole; an array is joined (so `${games.map((g) => html\`...\`)}` lists them); `null`, `undefined`
 * and booleans print nothing (so `${cond && html\`...\`}` reads as a conditional).
 */
export function html(strings: TemplateStringsArray, ...values: HtmlValue[]): Html {
  let out = '';
  strings.forEach((part, i) => {
    out += part;
    if (i < values.length) out += render(values[i]);
  });
  return new Html(out);
}

function render(value: HtmlValue): string {
  if (value === null || value === undefined || typeof value === 'boolean') return '';
  if (value instanceof Html) return value.markup;
  if (Array.isArray(value)) return (value as readonly HtmlValue[]).map(render).join('');
  return escapeHtml(String(value));
}

/**
 * Puts `markup` into `el`: the one place the panels write markup into the page (check-conventions "innerHTML").
 * A plain string is text, escaped.
 */
export function paint(el: Element, markup: Html | string): void {
  el.innerHTML = markup instanceof Html ? markup.markup : escapeHtml(markup); // convention-ok: the kit's own write
}

/** An attribute's presence: `html\`<button ${attr('disabled', !ok)}>\`` prints the name or nothing. */
export function attr(name: string, on: boolean): Html {
  return new Html(on ? ` ${name}` : '');
}
