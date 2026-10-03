import type { GameBox } from '../GameBox';

/** Why a box in hand has no cartridge a screen could play: lent to a friend, only on the wishlist, or still sealed. */
export function unplayableWhy(box: GameBox): string {
  if (box.isSealed) return 'still in its shrink-wrap (open it first)';
  return box.statusStyle === 'lent' ? 'lent out' : 'on your wishlist';
}
