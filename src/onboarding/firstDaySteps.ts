/*
 * THE FIRST DAY'S STEPS, in order: the to-do list on the hall console (`ToDoNote`), with the tip a
 * zone shows for the first step not done yet. Each (step, zone) tip shows once; a step is done by
 * what the stores and the zones say (`FirstDay`), never by a timer.
 */

export type FirstDayStepId = 'note' | 'out' | 'arcade' | 'play' | 'redeem' | 'market' | 'buy' | 'unpack' | 'shelf';

export interface FirstDayStep {
  id: FirstDayStepId;
  /** The line on the to-do list, in the player's own hand. */
  todo: string;
  /** What the HUD says in a zone (by id) while this is the first step not done. */
  tips: Partial<Record<string, string>>;
}

/** The flat's rooms, where the first tip may show. */
const FLAT_ROOMS = ['living', 'hallway', 'bathroom', 'bedroom', 'kitchen', 'balcony'];
const everywhereAtHome = (text: string): Partial<Record<string, string>> => Object.fromEntries(FLAT_ROOMS.map((id) => [id, text]));

export const FIRST_DAY_STEPS: readonly FirstDayStep[] = [
  {
    id: 'note',
    todo: 'Read this list (done!)',
    tips: everywhereAtHome('New flat, empty shelves. Your to-do list is on the hall console, by the keys.'),
  },
  {
    id: 'out',
    todo: 'Keys from the bowl, out the front door',
    tips: {
      hallway: 'Take the keys from the bowl on the console, then the front door at the end of the corridor.',
      living: 'The hallway is through the green door: keys in the bowl, then out.',
    },
  },
  {
    id: 'arcade',
    todo: 'Find the arcade on Front Street',
    tips: {
      stairwell: 'Down the stairs (or the lift): the street door is in the entrance hall.',
      street: 'The arcade is on this street, look for the neon. It never closes.',
    },
  },
  {
    id: 'play',
    todo: 'Play something: good scores pay tickets',
    tips: { arcade: 'Click a machine to put a coin in. Good scores pay tickets; E walks away.' },
  },
  {
    id: 'redeem',
    todo: 'Tickets -> coins at the prize counter',
    tips: { arcade: 'Tickets in your pocket: the prize counter swaps them for coins, or for prizes to take home.' },
  },
  {
    id: 'market',
    todo: 'Flea market, at the back of RÉTRO JEUX',
    tips: {
      arcade: 'Coins in hand: the flea market is at the back of RÉTRO JEUX, across the street.',
      street: 'RÉTRO JEUX: the flea market is at its back, open 8:00 to 23:00.',
    },
  },
  {
    id: 'buy',
    todo: 'Buy a first game!',
    tips: { market: 'Click a game to look closer: B buys it, H haggles. What you buy is sent home.' },
  },
  {
    id: 'unpack',
    todo: 'Unpack the parcel in the hall',
    tips: {
      market: 'Your game is on its way home: the parcel will wait in the hall.',
      hallway: 'Your parcel is under the console: click it to unpack.',
    },
  },
  {
    id: 'shelf',
    todo: 'Find it on the shelf, watch it on the TV',
    tips: { living: 'It is on the shelf now. Pick it up, bring it to the TV and click the TV to watch it played.' },
  },
];

/** Said once the list is done (or skipped from the note). */
export const FIRST_DAY_DONE = 'That is the round: arcade, market, shelves. The journal on the console keeps your days.';
