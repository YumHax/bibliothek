/** Roughly how many boxes one bought bookcase takes (NES-sized: the blurb says 40; bigger boxes, fewer). */
const PER_BOOKCASE = 40;

/**
 * What the market panel says about room at home for one more game, from what the collection
 * room's shelves could not take (`overflow`, kept since they were last built) and the bookcases
 * bought for the bedroom: null while the living room has space, else where the game will go, or
 * that it will stay boxed until another bookcase is bought (an estimate: box sizes vary).
 */
export function shelfRoomNote(overflow: number, bookcases: number): string | null {
  if (overflow === 0) return null;
  if (bookcases === 0) return 'Shelves full: it stays boxed until you buy a bookcase (household stall)';
  if (overflow >= bookcases * PER_BOOKCASE) return 'Bookcases full too: time for another one (household stall)';
  return 'Living-room shelves full: it goes on a bedroom bookcase';
}
