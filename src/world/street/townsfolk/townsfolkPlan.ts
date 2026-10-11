import type { Vec2 } from '../streetPlan';

/*
 * Where and when the street's known people go about their day (`townsfolk/TownRounds`), street-local metres: Victor's
 * espresso at nine at the SUNNY SIDE CAFE and his walk on to the flea market through RETRO GAMES (Lou's word: "nine
 * sharp, then the market"), and Lou's five minutes outside the café in the afternoon. Data only.
 */

/** One walk at its hours: the path (the first point is where they come into view, the last a door they go through). */
export interface Round {
  /** Game hours the walk takes, from .. to (joined late, they are put that far along it). */
  hours: readonly [number, number];
  path: readonly Vec2[];
}

export const TOWNSFOLK_PLAN = {
  /** Victor: up the far pavement from the side street's way to the café's door; out again and along to RETRO GAMES'. */
  victor: {
    toCafe: { hours: [8.75, 8.98], path: [[31, 10.45], [13.1, 10.45], [13.1, 11.85]] } as Round,
    toMarket: { hours: [9.15, 9.32], path: [[13.1, 11.85], [13.1, 10.6], [3, 10.6], [3, 11.85]] } as Round,
  },
  /** Lou on her break: where she stands by the café's door (facing the street), and when. */
  lou: {
    at: [14.35, 11.45] as Vec2,
    yaw: Math.PI,
    breaks: [[11, 11.2], [15.2, 15.5]] as readonly (readonly [number, number])[],
  },
} as const;
