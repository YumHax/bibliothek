import { html } from '../panel/html';
import type { BookData, BookPage, SectionId } from './bookTypes';
import { frontPages } from './frontPages';
import { stampPages } from './stampPages';
import { consolePages, setPages } from './sleevePages';
import { worthPages } from './worthPages';

/** The book's pages written afresh from the stores, in binding order. */
export interface BoundBook {
  pages: readonly BookPage[];
  /** Each section's first page (an even index: a section opens on a left page). */
  starts: Readonly<Record<SectionId, number>>;
}

/**
 * Binds the book: the contents, the stamps, the club's sets, the consoles and the worth, each section starting on a
 * left page (an odd one out is followed by a blank leaf). The contents are written last, once the page numbers are known.
 */
export function bindBook(data: BookData): BoundBook {
  const after: [SectionId, BookPage[]][] = [
    ['stamps', stampPages(data)],
    ['sets', setPages(data)],
    ['consoles', consolePages(data)],
    ['worth', worthPages(data)],
  ];
  const starts: Record<SectionId, number> = { contents: 0, stamps: 0, sets: 0, consoles: 0, worth: 0 };
  let at = 2;
  for (const [id, pages] of after) {
    starts[id] = at;
    at += pages.length + (pages.length % 2);
  }
  const folios = Object.fromEntries(Object.entries(starts).map(([id, i]) => [id, i + 1])) as Record<SectionId, number>;
  const pages: BookPage[] = [...frontPages(data, folios)];
  for (const [id, section] of after) {
    pages.push(...section);
    if (section.length % 2) pages.push({ section: id, body: html`<p class="book-blank" aria-label="A blank page"></p>` });
  }
  return { pages, starts };
}
