import { gameDayOf, type JournalDay } from '@/journal/Journal';
import { formatNumber } from '@/text/count';
import { html, type Html } from '../panel/html';

/** The chart's box in its own units (the page's CSS gives it a height; the width follows). */
const W = 360;
const H = 92;
const BASE = 38;
const REACH = 24;
const LABEL_Y = 86;
/** Days drawn at most. */
const SPAN = 7;

/**
 * The coins of the last days as bars on the page: what came in above the line, in the green ink, what went out below
 * it, in the red, each with its figure, the day's number under them and the open day's underlined. Only days played
 * are drawn (the journal has no page for the others). `pages` are the book's days oldest first, `open` the one the
 * book is open at; the window ends at it when it can. Nothing until two days have moved coins (one bar says nothing).
 */
export function weekBarsHtml(pages: readonly JournalDay[], open: number): Html | '' {
  const from = Math.max(0, Math.min(open - (SPAN - 1), pages.length - SPAN));
  const days = pages.slice(from, from + SPAN);
  const moved = days.filter((d) => d.totals.coinsIn || d.totals.coinsOut).length;
  if (days.length < 2 || moved < 2) return '';
  const max = Math.max(1, ...days.map((d) => Math.max(d.totals.coinsIn, d.totals.coinsOut)));
  const slot = W / days.length;
  const bar = Math.min(26, slot * 0.4);
  const x = (i: number) => slot * i + (slot - bar) / 2;
  const mid = (i: number) => (slot * i + slot / 2).toFixed(1);
  const h = (v: number) => (v / max) * REACH;
  return html`<figure class="journal-week">
      <figcaption class="journal-week__caption">Coins, day by day</figcaption>
      <svg class="journal-week__chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Coins in and out over the last ${days.length} days">
        <line class="journal-week__base" x1="0" x2="${W}" y1="${BASE}" y2="${BASE}" />
        ${days.map((d, i) => {
          const up = h(d.totals.coinsIn);
          const down = h(d.totals.coinsOut);
          const here = from + i === open;
          return html`${up > 0 ? html`<rect class="journal-week__in" x="${x(i).toFixed(1)}" y="${(BASE - up).toFixed(1)}" width="${bar.toFixed(1)}" height="${up.toFixed(1)}" rx="1.5" />
                <text class="journal-week__figure journal-week__figure--in" x="${mid(i)}" y="${(BASE - up - 3).toFixed(1)}" text-anchor="middle">+${formatNumber(d.totals.coinsIn)}</text>` : ''}
            ${down > 0 ? html`<rect class="journal-week__out" x="${x(i).toFixed(1)}" y="${BASE}" width="${bar.toFixed(1)}" height="${down.toFixed(1)}" rx="1.5" />
                <text class="journal-week__figure journal-week__figure--out" x="${mid(i)}" y="${(BASE + down + 9).toFixed(1)}" text-anchor="middle">−${formatNumber(d.totals.coinsOut)}</text>` : ''}
            <text class="journal-week__label${here ? ' journal-week__label--open' : ''}" x="${mid(i)}" y="${LABEL_Y}" text-anchor="middle">${label(d.day)}</text>`;
        })}
      </svg>
    </figure>`;
}

/** The day's number under its bars; a page kept by date (an older save) gets a dot. */
function label(key: string): string {
  const day = gameDayOf(key);
  return day === null ? '·' : String(day);
}
