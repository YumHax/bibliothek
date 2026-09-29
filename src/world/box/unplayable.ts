import type { GameBox } from '../GameBox';

/** Why a box in hand has no cartridge a screen could play: lent to a friend, or only on the wishlist. */
export function unplayableWhy(box: GameBox): string {
  return box.statusStyle === 'lent' ? 'lent out' : 'on your wishlist';
}
