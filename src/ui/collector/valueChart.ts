import type { ValuePoint } from '@/economy/ValueHistory';
import { formatDay } from '@/text/clock';
import { html, type Html } from '../panel/html';

/** The chart's box in its own units (the SVG scales to the page's width). */
const W = 320;
const H = 150;
const LEFT = 34;
const RIGHT = W - 8;
const TOP = 10;
const BOTTOM = H - 22;

/**
 * The collection's value, one point per day played, drawn in ink on the ledger's squared paper (an inline SVG the
 * page's CSS colours: `.book-chart__*`): four pencilled bands labelled on the left, the line with a dot on each day
 * and a bigger one on the last, the first and last days written under it. Days not played are skipped, not
 * interpolated as flat. Fewer than two days: a line in the hand instead.
 */
export function valueChartHtml(points: readonly ValuePoint[]): Html {
  if (points.length < 2) {
    return html`<p class="book-hand-note book-chart__empty">${points.length ? 'Come back tomorrow: the line starts with a second day.' : 'Nothing to draw yet.'}</p>`;
  }
  const max = niceCeiling(Math.max(...points.map((p) => p.value)));
  const x = (i: number) => LEFT + (i / (points.length - 1)) * (RIGHT - LEFT);
  const y = (v: number) => BOTTOM - (v / max) * (BOTTOM - TOP);
  const bands = [0, 1, 2, 3, 4].map((i) => (max * i) / 4);
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const last = points[points.length - 1]!;
  return html`<svg class="book-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="The collection’s value, day by day, from ${formatDay(points[0]!.day)} to ${formatDay(last.day)}">
      ${bands.map((v) => html`<line class="book-chart__band" x1="${LEFT}" x2="${RIGHT}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" />
        <text class="book-chart__label" x="${LEFT - 5}" y="${y(v).toFixed(1)}" text-anchor="end" dominant-baseline="middle">${short(v)}</text>`)}
      <polyline class="book-chart__line" points="${line}" />
      ${points.length <= 40 ? points.map((p, i) => html`<circle class="book-chart__dot" cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="1.6" />`) : ''}
      <circle class="book-chart__today" cx="${x(points.length - 1).toFixed(1)}" cy="${y(last.value).toFixed(1)}" r="3.2" />
      <text class="book-chart__label" x="${LEFT}" y="${H - 6}">${formatDay(points[0]!.day)}</text>
      <text class="book-chart__label" x="${RIGHT}" y="${H - 6}" text-anchor="end">${formatDay(last.day)}</text>
    </svg>`;
}

/** A round number at or above `v` for the chart's top (1, 2 or 5 times a power of ten). */
function niceCeiling(v: number): number {
  if (v <= 0) return 10;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** 1200 -> "1.2k". */
function short(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : String(Math.round(v));
}
