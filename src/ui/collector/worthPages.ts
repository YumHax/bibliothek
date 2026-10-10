import { getPlatform } from '@/catalog/platforms';
import { formatDay } from '@/text/clock';
import { formatNumber } from '@/text/count';
import { formatCoins } from '@/text/money';
import { coverImg } from '../panel/widgets';
import { html } from '../panel/html';
import { valueChartHtml } from './valueChart';
import type { BookData, BookPage } from './bookTypes';

/** How many of the most valuable copies the right-hand page lists. */
const TOP_COUNT = 10;

/**
 * WORTH: a ledger's two pages. The left one is the sum in the hand (what the stalls would ask for the lot on an
 * average day, how it moved since the first day written, what the WE BUY desk would give), the line of it day by
 * day; the right one the best of it, the ten most valuable copies with their cover pasted in and their worth.
 */
export function worthPages(data: BookData): BookPage[] {
  const { watch, history, collection, coverUrl } = data;
  const value = watch.value();
  const points = history.all;
  const first = points[0];
  const moved = first && points.length > 1 ? value.market - first.value : null;
  const top = watch.showpieces(TOP_COUNT, collection.games);
  return [
    {
      section: 'worth',
      body: html`<h3 class="book-hand-heading">What it’s worth</h3>
        <p class="book-sum">about ${formatCoins(value.market)}</p>
        <p class="book-hand-line">at the stalls’ prices, on an average day${moved !== null && first ? html`, <span class="book-ink--${moved >= 0 ? 'up' : 'down'}">${formatNumber(moved, { sign: true })}</span> since ${formatDay(first.day)}` : ''}.</p>
        <p class="book-hand-line">The WE BUY desk would give ${formatCoins(value.desk)} for the lot.</p>
        ${value.pending ? html`<p class="book-hand-line book-hand-line--faint">${value.pending} still being priced: the sum firms up as they are.</p>` : ''}
        <div class="book-chart-paper">${valueChartHtml(points)}</div>`,
    },
    {
      section: 'worth',
      body: html`<h3 class="book-hand-heading">The best of it</h3>
        ${top.length
          ? html`<ol class="book-best">${top.map(({ game, value }) => html`<li class="book-best__row">
                <span class="book-best__cutting">${coverImg(coverUrl?.(game), game, 'book-best__cover')}</span>
                <span class="book-best__title">${game.title} <small>${getPlatform(game.platform).shortName}${game.status === 'lent' ? ', lent out' : ''}</small></span>
                <span class="book-best__leader" aria-hidden="true"></span>
                <span class="book-best__worth">${formatCoins(value)}</span>
              </li>`)}</ol>`
          : html`<p class="book-hand-line book-hand-line--faint">Nothing on the shelves yet.</p>`}`,
    },
  ];
}
