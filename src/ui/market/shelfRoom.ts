/** Roughly how many boxes one bought bookcase takes (NES-sized: the blurb says 40; bigger boxes, fewer). */
const PER_BOOKCASE = 40;

/**
 * What the market panel says about room at home for one more game, from what the collection
 * room's shelves could not take (`overflow`, kept since they were last built) and the bookcases
 * standing in the bedroom (bought ones go to the living room first): null while the living room has space, else where
 * the game will go, or that it will stay boxed until another bookcase is bought (an estimate: box sizes vary). With
 * every bookcase bought (`maxed`), it never suggests another: the game stays in the collection, boxed away.
 */
export function shelfRoomNote(overflow: number, bookcases: number, maxed = false): string | null {
  if (overflow === 0) return null;
  const full = bookcases === 0 || overflow >= bookcases * PER_BOOKCASE;
  if (full && maxed) return 'Every bookcase is full: it stays in the collection (Tab), boxed away until a shelf has room';
  if (bookcases === 0) return 'Shelves full: it stays boxed until you buy a bookcase (household stall)';
  if (full) return 'Bookcases full too: time for another one (household stall)';
  return 'Living-room shelves full: it goes on a bookcase in another room';
}
