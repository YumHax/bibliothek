/*
 * The touch bar's pictograms, one per button, 16 × 16 in strokes of `currentColor` (the paper panels' pictogram
 * style, `ui/panel/pictograms`, drawn here because the input layer knows no HUD). Each button shows its picture over
 * its word: the eye finds the hand, the word says what it does.
 */

const PATHS: Readonly<Record<string, string>> = {
  // A box going back onto a shelf: an arrow down into a slot.
  putBack: '<path d="M2.5 13.5h11"/><path d="M8 2.5v7M5 6.5l3 3 3-3"/>',
  // The box's lid lifting.
  openBox: '<path d="M2.5 7.5h11v6h-11z"/><path d="M2.5 7.5l2-4h7l2 4"/>',
  // Four arrows out of a centre: move.
  moveFurniture: '<path d="M8 2v12M2 8h12"/><path d="M6 4l2-2 2 2M6 12l2 2 2-2M4 6L2 8l2 2M12 6l2 2-2 2"/>',
  // A box into a gap on a shelf.
  putHere: '<path d="M2 13.5h12M2 2.5v11M14 2.5v11"/><path d="M6 6.5h4v7H6z"/>',
  // Setting a piece down: a block onto the floor line.
  setDown: '<path d="M2 14h12"/><path d="M4.5 8.5h7v5h-7z"/><path d="M8 2v4M6.5 4.5L8 6l1.5-1.5"/>',
  // Turning, clockwise and back.
  turnPiece: '<path d="M12.5 8a4.5 4.5 0 1 1-1.4-3.3"/><path d="M11.5 2v3h-3"/>',
  turnPieceBack: '<path d="M3.5 8a4.5 4.5 0 1 0 1.4-3.3"/><path d="M4.5 2v3h3"/>',
  // The grid.
  gridSnap: '<path d="M2.5 2.5h11v11h-11zM6.2 2.5v11M9.8 2.5v11M2.5 6.2h11M2.5 9.8h11"/>',
  // Back where it was: a curved arrow home.
  putBackPiece: '<path d="M5 6.5H10a3.5 3.5 0 0 1 0 7H6"/><path d="M7 4L4.5 6.5 7 9"/>',
  // Into storage: a box with an arrow in.
  storePiece: '<path d="M2.5 8.5h11v5h-11z"/><path d="M8 1.5v5M6 4.5l2 2 2-2"/>',
  // Search.
  search: '<circle cx="6.5" cy="6.5" r="4"/><path d="M9.5 9.5L14 14"/>',
  // Market copy: buy (a coin) and haggle (two speech balloons).
  buy: '<circle cx="8" cy="8" r="5.8"/><circle cx="8" cy="8" r="2.4"/>',
  haggle: '<path d="M1.5 3h8v5h-5l-2 2V8h-1z"/><path d="M11 6h3.5v5h-1v2l-2-2h-4V9"/>',
  // The collection: three boxes on a shelf.
  collection: '<path d="M2 13.5h12"/><path d="M3 4.5h2.5v9H3zM6.8 3.5h2.5v10H6.8zM10.8 5.5l2.3-.8 2 8.8-2.3.6z"/>',
  // The menu.
  close: '<path d="M3 4.5h10M3 8h10M3 11.5h10"/>',
  // Walking away from a machine, standing up from a seat.
  walkAway: '<circle cx="9" cy="2.8" r="1.3"/><path d="M8.5 5l-2 4 2.5 2 1 3.5M6.5 9L4 13.5M8 6l3 1.5 1.5-1.5"/>',
  standUp: '<circle cx="8" cy="2.8" r="1.3"/><path d="M8 4.8v5M5 7l3-1.5 3 1.5M8 9.8l-2 4.2M8 9.8l2 4.2"/>',
};

/** The pictogram for `id` (an action, or `walkAway` / `standUp`), as SVG markup; a dot for one nobody drew. */
export function touchIcon(id: string): string {
  const body = PATHS[id] ?? '<circle cx="8" cy="8" r="1.6" fill="currentColor"/>';
  return `<svg class="touch-bar__icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${body}</svg>`;
}
