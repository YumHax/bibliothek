import type { Game } from '@/catalog/types';
import { coverImg } from '../panel/widgets';
import { html, type Html } from '../panel/html';

interface SleeveOptions {
  /** The copy in the sleeve, or the game the sleeve waits for (its cover shows as a ghost). */
  game: Game;
  have: boolean;
  /** The name written under the sleeve (the set's card names a piece its own way). */
  name: string;
  coverUrl?: (game: Game) => string | undefined;
}

/**
 * One pocket of a binder's sleeve page: the copy's cover behind the plastic, or, for a game still to find, an empty
 * pocket with the ghost of its cover and its name pencilled underneath. A copy lent out has a note saying so.
 */
export function sleeveHtml({ game, have, name, coverUrl }: SleeveOptions): Html {
  const lent = have && game.status === 'lent';
  return html`<li class="book-sleeve${have ? ' book-sleeve--filled' : ''}">
      <span class="book-sleeve__pocket">${coverImg(coverUrl?.(game), game, 'book-sleeve__cover')}</span>
      <span class="book-sleeve__name">${name}${lent ? html`<em class="book-sleeve__lent">lent out</em>` : ''}</span>
    </li>`;
}
