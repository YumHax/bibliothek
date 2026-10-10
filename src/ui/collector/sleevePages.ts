import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { COLLECTOR_SETS, normaliseTitle, setProgress, type CollectorSet } from '@/economy/collectorSets';
import { consoleChecklists } from '@/economy/Honours';
import { formatCoins } from '@/text/money';
import { html, type Html } from '../panel/html';
import { sleeveHtml } from './sleeve';
import type { BookData, BookPage } from './bookTypes';

/** Pockets a sleeve page holds: the club's sets share pages up to this many pieces, a console's list runs on. */
const SET_POCKETS = 9;
const CONSOLE_POCKETS = 12;
/** The most sets on one page, however few pieces each has. */
const SETS_PER_PAGE = 3;

/**
 * THE CLUB'S SETS: the collectors' club's list as sleeve pages, set after set, a pocket a piece: the copy's cover
 * when it is home, an empty pocket with its name pencilled in when not. A set completed is stamped PAID, with what
 * the club paid for it (shown once paid, never before); one under way has its count pencilled by its name.
 */
export function setPages(data: BookData): BookPage[] {
  const pages: CollectorSet[][] = [];
  for (const set of COLLECTOR_SETS) {
    const last = pages[pages.length - 1];
    const pockets = last ? last.reduce((n, s) => n + s.pieces.length, 0) : Infinity;
    if (last && last.length < SETS_PER_PAGE && pockets + set.pieces.length <= SET_POCKETS) last.push(set);
    else pages.push([set]);
  }
  return pages.map((sets) => ({ section: 'sets', body: html`${sets.map((set) => setHtml(data, set))}` }));
}

function setHtml(data: BookData, set: CollectorSet): Html {
  const progress = setProgress(set, data.collection.games);
  const have = progress.filter((p) => p.have).length;
  const complete = have === progress.length;
  const paid = data.standing?.hasClaimed(set.id) ?? false;
  const state = paid
    ? html`<span class="book-rubber" aria-label="Paid">Paid</span><span class="book-hand-note">the club paid ${formatCoins(set.reward)}</span>`
    : complete
      ? html`<span class="book-hand-note">complete</span>`
      : html`<span class="book-hand-note">${have} of ${progress.length}</span>`;
  return html`<section class="book-set${complete ? ' book-set--complete' : ''}">
      <h3 class="book-hand-heading">${set.name} ${state}</h3>
      <ul class="book-sleeves">${progress.map(({ piece, have, game }, i) =>
        sleeveHtml({ game: game ?? wanted(set, i, piece.name, piece.platform), have, name: `${piece.name} · ${getPlatform(piece.platform).shortName}`, coverUrl: data.coverUrl }))}</ul>
    </section>`;
}

/** The game a set's empty pocket waits for, made from the card's name: its cover's ghost is looked up by title. */
function wanted(set: CollectorSet, index: number, title: string, platform: Game['platform']): Game {
  return { id: `club-${set.id}-${index}`, title, platform };
}

/**
 * THE CONSOLES: each console's own list (`Honours.consoleChecklists`) as sleeve pages, a pocket a game: the copies on
 * the shelves behind the plastic, the rest as ghosts with their title. A long list runs on over the next pages. A
 * whole list has its gold star, and its neon is lit over the bookcases.
 */
export function consolePages(data: BookData): BookPage[] {
  const pages: BookPage[] = [];
  for (const list of consoleChecklists(data.collection.games)) {
    const have = list.entries.filter((e) => e.have).length;
    const done = have === list.entries.length;
    // The copy on the shelf rather than the list's own entry, so a lent one says so.
    const mine = (game: Game) => data.collection.games.find((g) => g.platform === game.platform && g.status !== 'wishlist' && normaliseTitle(g.title) === normaliseTitle(game.title)) ?? game;
    for (let at = 0; at < list.entries.length; at += CONSOLE_POCKETS) {
      const first = at === 0;
      const state = done
        ? html`<span class="book-sticker">Complete</span><span class="book-hand-note">the neon is lit</span>`
        : html`<span class="book-hand-note">${have ? `${have} of ${list.entries.length} home` : 'none home yet'}</span>`;
      pages.push({
        section: 'consoles',
        body: html`<section class="book-console${done ? ' book-console--complete' : ''}">
            <h3 class="book-hand-heading">${list.name}${first ? html` ${state}` : html` <span class="book-hand-note">continued</span>`}</h3>
            <ul class="book-sleeves book-sleeves--wide">${list.entries.slice(at, at + CONSOLE_POCKETS).map(({ game, have }) =>
              sleeveHtml({ game: have ? mine(game) : game, have, name: game.title, coverUrl: data.coverUrl }))}</ul>
          </section>`,
      });
    }
  }
  return pages;
}
