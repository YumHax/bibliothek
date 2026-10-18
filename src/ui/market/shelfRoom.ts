/** Roughly how many boxes one bought bookcase takes (NES-sized: the blurb says 40; bigger boxes, fewer). */
const PER_BOOKCASE = 40;

/**
 * What the copy's card says, on its "At home" row, about room for one more game, from what the collection room's
 * shelves could not take (`overflow`, kept since they were last built) and the bookcases standing in the bedroom
 * (bought ones go to the living room first): null while the living room has space, else where the game will go, or
 * that it will wait in its box until a bookcase comes home (an estimate: box sizes vary). Said as what happens to the
 * game, never as a rule; with every bookcase bought (`maxed`), it never suggests another.
 */
export function shelfRoomNote(overflow: number, bookcases: number, maxed = false): string | null {
  if (overflow === 0) return null;
  const full = bookcases === 0 || overflow >= bookcases * PER_BOOKCASE;
  if (full && maxed) return 'Every shelf in the flat is full: it will wait in its box, safe in your collection, until one frees up';
  if (bookcases === 0) return 'No shelf free: it will wait in its box until a bookcase from the household stall comes home';
  if (full) return 'The bookcases are full too: it will wait in its box until another one comes home';
  return 'The living room’s shelves are full: it goes on a bookcase in another room';
}
