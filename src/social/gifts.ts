import { findPerson } from './people';
import { isBirthday } from './mood';
import { BIRTHDAY_GIFT, GAME_GIFT, GIFT_LIKE, GIFTS } from './socialPlan';
import type { GiftKind, PersonId } from './types';

/*
 * What a gift is worth to someone (docs/social.md "Gifts"): its base, doubled for what they love, a loss for what
 * they do not want; a game by how well it fits their tastes; everything three times on their birthday.
 */

/** A game as a gift is weighed: its platform, its genres, its year. */
export interface GameGift {
  title: string;
  platform: string;
  genres?: readonly string[];
  year?: number;
}

/** How well `game` fits `id`'s tastes, 0 (not at all) .. 1 (right up their street). */
export function gameFit(id: PersonId, game: GameGift): number {
  const tastes = findPerson(id)?.tastes;
  if (!tastes) return 0.4;
  let fit = 0;
  if (tastes.platforms?.includes(game.platform)) fit += 0.5;
  if (tastes.genres && game.genres?.some((g) => tastes.genres!.includes(g))) fit += 0.3;
  if (tastes.era && game.year && game.year >= tastes.era[0] && game.year <= tastes.era[1]) fit += 0.2;
  if (!tastes.platforms && !tastes.genres && !tastes.era) fit = 0.4;
  return Math.min(1, fit);
}

/** The warmth a gift of `kind` (or `game`) brings with `id` on `day`; negative for one they do not want. */
export function giftWarmth(id: PersonId, kind: GiftKind, day: number, game?: GameGift): number {
  const card = findPerson(id);
  let warmth = GIFTS[kind].warmth;
  if (kind === 'game' && game) warmth = Math.round(warmth * (GAME_GIFT.base + gameFit(id, game) * GAME_GIFT.fit));
  if (card?.dislikes?.includes(kind)) return GIFT_LIKE.disliked;
  if (card?.likes?.includes(kind)) warmth *= GIFT_LIKE.liked;
  if (isBirthday(id, day)) warmth *= BIRTHDAY_GIFT;
  return Math.round(warmth);
}

/** The gift's name in a sentence: "flowers", "a croissant". */
export function giftName(kind: GiftKind): string {
  return GIFTS[kind].name;
}
