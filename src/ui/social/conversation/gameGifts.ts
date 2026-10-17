import type { Game } from '@/catalog/types';
import { giftWrap } from '@/holidays/giftWrap';
import { tasteOf, type GameGift } from '@/social/gifts';
import type { GiftKind, PersonId } from '@/social/types';
import { html, type Html } from '../../panel/html';

/*
 * What the Give list knows of a gift: a game of the collection as a gift is weighed (its platform, genres, year,
 * whether it was wrapped at the Christmas stall), and how they take a kind of gift once a gift of it told the player.
 */

/** A word beside a row ("a favourite", "news"): words, never a symbol. */
export function tag(text: string, kind = ''): Html {
  return html`<span class="social-word${kind ? ` social-word--${kind}` : ''}">${text}</span>`;
}

/** How they take a gift of `kind`, once a gift of it told the player: a favourite, or not for them. */
export function tasteTags(id: PersonId, kind: GiftKind): Html[] {
  const taste = tasteOf(id, kind);
  if (taste === 'loves') return [tag('a favourite', 'trait')];
  if (taste === 'dislikes') return [tag('not for them', 'no')];
  return [];
}

/** A game of the collection as a gift is weighed. */
export function gameGift(game: Game): GameGift {
  return { id: game.id, title: game.title, platform: game.platform, genres: game.genre ? [game.genre.toLowerCase()] : [], year: yearOf(game), wrapped: giftWrap.isWrapped(game.id) };
}

function yearOf(game: Game): number | undefined {
  const y = Number(game.releaseDate?.slice(0, 4));
  return Number.isFinite(y) && y > 0 ? y : undefined;
}
