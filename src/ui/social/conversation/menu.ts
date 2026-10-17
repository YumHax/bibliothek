import type { Fit } from '@/social/types';
import { HOLD_MS } from './hold';
import { icon, type IconName } from '../icons';
import { attr, html, type Html } from '../../panel/html';

/*
 * What the player can say and do (docs/social.md "The panel"): what is said rises from the bottom of the screen as
 * the player's own balloons (four at most, slightly fanned, each with its key), and what is done sits under them as a
 * row of chips (Give…, Ask…, Promise…, More…, and Goodbye, always last, always on 0). A sub-list swaps the balloons for
 * its own (a gift, a promise as a ticket) and Back takes the place of Goodbye. Nothing moves under the pointer: the
 * keys' badges are always drawn, nothing is inserted before the balloon pointed at.
 */

/** One thing on offer: what it says, what it does, the words beside it. */
export interface Row {
  /** Stable across repaints (`data-id`): the focus comes back to it, and what was offered is kept by it. */
  key: string;
  label: string;
  icon: IconName;
  run: () => void;
  /** A cover instead of the icon (a game to give, a piece of news about a game). */
  cover?: Html;
  /** Words under it: "a favourite", "news", "new". */
  tags?: Html[];
  /** It opens a list or a panel of its own ("›"). */
  more?: boolean;
  /**
   * `place`: the place's own entries; `say`: what the player can say (both balloons); `button`: Give / Ask / Promise;
   * `quiet`: More…; `leave`: Goodbye or Back (all three chips).
   */
  tone: 'place' | 'say' | 'button' | 'quiet' | 'leave';
  /** What they would like to talk about (their thought): it glows until it is said. */
  wished?: boolean;
  /** Done for good: held, never clicked (`HoldPress`), and drawn as a ticket when it is a promise. */
  once?: boolean;
  promise?: boolean;
  /** When a promise is due, in words ("by Thursday evening"). */
  due?: string;
  /** How they would take it: their face shows it while it is pointed at (never shown here). */
  fit?: Fit;
  /** The mean ones are said in the danger tone. */
  danger?: boolean;
}

/** A label phrased as the player's words ("Any news?", "Race you up!") is said; else it is something done. */
export function spoken(label: string): boolean {
  return /[?!…]$/.test(label.trim());
}

/** Whether `row` is a chip (done) rather than a balloon (said, or picked from a list). */
function isChip(row: Row): boolean {
  return row.tone === 'button' || row.tone === 'quiet' || row.tone === 'leave';
}

/** The key of the row at `n` among `rows`: Goodbye and Back are 0, the rest 1-9 in order, past nine none. */
function digitOf(rows: readonly Row[], n: number): number | null {
  if (rows[n]?.tone === 'leave') return 0;
  const before = rows.slice(0, n).filter((r) => r.tone !== 'leave').length;
  return before < 9 ? before + 1 : null;
}

/** The row a digit picks, or null. */
export function rowOfDigit(rows: readonly Row[], digit: number): number | null {
  for (let n = 0; n < rows.length; n++) if (digitOf(rows, n) === digit) return n;
  return null;
}

/** The fan: each balloon a little turned and lifted by its place in the row (the middle ones highest). */
function fanOf(i: number, count: number): string {
  if (count < 2) return '--turn:0deg;--rise:0px';
  const t = i / (count - 1) - 0.5;
  return `--turn:${(t * 6).toFixed(2)}deg;--rise:${Math.round((0.25 - t * t) * 28)}px`;
}

function balloonHtml(rows: readonly Row[], row: Row, n: number, i: number, count: number, first: boolean): Html {
  const digit = digitOf(rows, n);
  const cls = ['social-balloon', `social-balloon--${row.tone}`, row.wished ? 'social-balloon--wished' : '', row.once ? 'social-balloon--once' : '', row.promise ? 'social-balloon--ticket' : '', row.danger ? 'social-balloon--danger' : ''].filter(Boolean).join(' ');
  return html`<button type="button" class="${cls}" style="${fanOf(i, count)}" data-action="choose" data-choice="${n}" data-id="${row.key}"${attr('data-autofocus', first)}>
    <kbd class="social-balloon__key" aria-hidden="true">${digit ?? ''}</kbd>${row.cover ?? html`<span class="social-balloon__icon">${icon(row.icon, 1.15)}</span>`}<span class="social-balloon__words"><span class="social-balloon__label">${row.label}</span>${row.promise && row.due ? html`<small class="social-balloon__due">${row.due}</small>` : ''}${row.tags?.length ? html`<span class="social-balloon__tags">${row.tags}</span>` : ''}</span>${row.more ? html`<span class="social-balloon__more" aria-hidden="true">›</span>` : ''}${row.once ? html`<svg class="social-hold" viewBox="0 0 20 20" aria-hidden="true" style="--hold-ms:${HOLD_MS}ms"><circle cx="10" cy="10" r="8"/></svg><span class="visually-hidden">(hold to confirm)</span>` : ''}
  </button>`;
}

function chipHtml(rows: readonly Row[], row: Row, n: number, first: boolean): Html {
  const digit = digitOf(rows, n);
  return html`<button type="button" class="social-chip social-chip--${row.tone}" data-action="choose" data-choice="${n}" data-id="${row.key}"${attr('data-autofocus', first)}>
    ${icon(row.icon, 1)}<span>${row.label}</span><kbd class="social-chip__key" aria-hidden="true">${digit ?? ''}</kbd>
  </button>`;
}

/** The stage's markup: the balloons (said, picked), then the chips (done), Goodbye or Back last. */
export function stageHtml(rows: readonly Row[], heading: string | null): Html {
  const said = rows.map((row, n) => ({ row, n })).filter(({ row }) => !isChip(row));
  const done = rows.map((row, n) => ({ row, n })).filter(({ row }) => isChip(row));
  const firstSaid = said[0]?.n ?? done[0]?.n ?? -1;
  return html`${heading ? html`<p class="social-stage__heading">${heading}</p>` : ''}
    <div class="social-balloons${said.length > 4 ? ' social-balloons--many' : ''}">${said.map(({ row, n }, i) => balloonHtml(rows, row, n, i, said.length, n === firstSaid))}</div>
    <div class="social-chips">${done.map(({ row, n }) => chipHtml(rows, row, n, n === firstSaid))}</div>`;
}
