import { MILESTONES } from '@/economy/milestoneList';
import { formatCoins } from '@/text/money';
import { formatNumber, plural } from '@/text/count';
import { coverImg } from '../panel/widgets';
import { html } from '../panel/html';
import type { BookData, BookPage, SectionId } from './bookTypes';

/** How many of the newest arrivals the first page pins up. */
const LATEST_COUNT = 4;

/** What the contents and the dividers call each section. */
export const SECTION_NAMES: Record<SectionId, string> = {
  contents: 'Contents',
  stamps: 'Stamps',
  sets: 'Club sets',
  consoles: 'Consoles',
  worth: 'Worth',
};

/** The contents' longer names, as written in the hand. */
const CONTENTS_LINES: readonly [SectionId, string][] = [
  ['stamps', 'The stamps'],
  ['sets', 'The club’s sets'],
  ['consoles', 'Console by console'],
  ['worth', 'What it’s worth'],
];

/**
 * The first spread. Left: the bookplate (Félix's name printed, the heir's line in the hand under it), the collection
 * summed up in a few written lines, and the newest arrivals as snapshots. Right: the contents, a line a section with
 * its first page's number, each a link that opens the book there.
 */
export function frontPages(data: BookData, firstPage: Readonly<Record<SectionId, number>>): BookPage[] {
  const { collection, milestones, watch, coverUrl } = data;
  const home = collection.games.filter((g) => g.status !== 'wishlist');
  const lent = home.filter((g) => g.status === 'lent').length;
  const consoles = new Set(home.map((g) => g.platform)).size;
  const stamps = MILESTONES.filter((m) => milestones.has(m.id)).length;
  const latest = [...home].filter((g) => g.addedAt).sort((a, b) => (b.addedAt ?? '').localeCompare(a.addedAt ?? '')).slice(0, LATEST_COUNT);
  return [
    {
      section: 'contents',
      body: html`<div class="book-plate">
          <span class="book-plate__ex">Ex libris</span>
          <span class="book-plate__name">Félix Aubry</span>
          <span class="book-plate__heir">and now mine</span>
        </div>
        <ul class="book-summary">
          <li>${home.length ? `${formatNumber(home.length)} ${plural(home.length, 'game')} on the shelves, on ${consoles} ${plural(consoles, 'console')}` : 'Not a game on the shelves yet'}</li>
          ${lent ? html`<li>${lent} lent out</li>` : ''}
          <li>${stamps ? `${stamps} ${plural(stamps, 'stamp')} in the album` : 'Not a stamp in the album yet'}</li>
          ${home.length ? html`<li>worth about ${formatCoins(watch.value().market)}</li>` : ''}
        </ul>
        ${latest.length
          ? html`<h3 class="book-hand-heading">Lately come home</h3>
            <ul class="book-snaps">${latest.map((g, i) => html`<li class="book-snap" style="--tilt:${(i % 2 ? 1 : -1) * (1.5 + i)}deg">${coverImg(coverUrl?.(g), g, 'book-snap__cover')}<span>${g.title}</span></li>`)}</ul>`
          : ''}`,
    },
    {
      section: 'contents',
      body: html`<h2 class="book-contents__title">Contents</h2>
        <ol class="book-contents">${CONTENTS_LINES.map(([id, line]) => html`<li>
            <button type="button" class="book-contents__line" data-action="section" data-section="${id}">
              <span>${line}</span><span class="book-contents__dots" aria-hidden="true"></span><span class="book-contents__folio">${firstPage[id]}</span>
            </button>
          </li>`)}</ol>`,
    },
  ];
}
