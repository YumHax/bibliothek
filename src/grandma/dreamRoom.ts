import type { HomeUpgrade } from '@/economy/HomeUpgrades';

/*
 * HOW NEAR THE DREAM ROOM IS (docs/story.md "The goal"): Félix's living room as the opening shows it, every bookcase
 * full, his armchairs, lamps, prints and plants where they stood. Read for the album's last memory (`MEMORIES` keys),
 * Mémé's news and the night's dream of his room (`household/dreams`).
 */

/** What stood in his living room that the player can buy back, and how many of each (the opening's staged pieces). */
const HIS_ROOM: Partial<Record<HomeUpgrade, number>> = {
  // The four bookcases bought beside the one that never left: the run's five slots.
  bookcase: 4,
  armchair: 2,
  floorLamp: 2,
  sideTable: 1,
  lamp: 1,
  livingRug: 1,
  sideboard: 1,
  framedPrint: 3,
  houseplant: 3,
};

/** The living room's run full: five bookcases of boxes. */
const FULL_SHELVES = 5 * 35;
/** The pieces count for this share of the dream, the shelves' fill for the rest. */
const PIECES_SHARE = 0.6;

/** The pieces of his room, for the dream's words: what each is called in a sentence. */
export const HIS_PIECES: readonly { id: HomeUpgrade; name: string }[] = [
  { id: 'armchair', name: 'his armchair by the window' },
  { id: 'floorLamp', name: 'the brass floor lamp' },
  { id: 'sideboard', name: 'the sideboard with the turntable' },
  { id: 'livingRug', name: 'the big rug' },
  { id: 'framedPrint', name: 'the prints over the shelves' },
  { id: 'sideTable', name: 'the little side table' },
  { id: 'lamp', name: 'the lava lamp' },
  { id: 'houseplant', name: 'his plants' },
  { id: 'bookcase', name: 'the run of bookcases' },
];

/** 0 (bare) to 1 (his room as it was): `count` how many of a piece are bought, `games` the games on the shelves. */
export function dreamRoomShare(count: (piece: HomeUpgrade) => number, games: number): number {
  let have = 0;
  let want = 0;
  for (const [piece, n] of Object.entries(HIS_ROOM) as [HomeUpgrade, number][]) {
    have += Math.min(n, count(piece));
    want += n;
  }
  const pieces = want ? have / want : 1;
  const shelves = Math.min(1, games / FULL_SHELVES);
  return PIECES_SHARE * pieces + (1 - PIECES_SHARE) * shelves;
}
