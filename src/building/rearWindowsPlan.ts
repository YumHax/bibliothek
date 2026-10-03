import type { STORY } from '@/world/street/windowLife';

/*
 * The building's windows at night, as data (`rearWindows.ts` plays them): which of our building's facades hold the
 * residents' flats (floor by floor, door by door along the face, `STAIRWELL_PLAN`'s landings: floor 5 is ours and Mrs
 * Roux's, floor 1 the first), where the stairwell's own windows are on our back, and the windows across the courtyard
 * whose lives the player can follow from the stairwell's windows (binoculars in photo mode) and from the yard itself.
 * Facade metres: `along` from the face's left end as seen from in front of it (`FacadeSpec.from`).
 */

/** A stretch of one facade whose windows are the flat behind door `i` (of every landing, by floor). */
export interface ResidentStretch {
  facade: string;
  along: readonly [number, number];
  i: number;
  /** Floors it holds (1 the first .. 5 ours): the flats under ours have no door of the plan. */
  floors: readonly number[];
}

export type StoryName = keyof typeof STORY;

/** A window across the courtyard with a life of its own: on `facade`, `floor`, the window nearest `at` (0..1 along the face). */
export interface StoryWindow {
  facade: string;
  floor: number;
  at: number;
  /** Whose: what they do, by the hour and the day (`rearWindows.storyNow`). */
  life: 'trader' | 'couple' | 'painter' | 'sporty' | 'partyFlat' | 'movers' | 'catLady' | 'nightOwl';
}

export const REAR_WINDOWS_PLAN = {
  /** Our building's facades (`streetPlan`'s ids): every window of theirs not claimed below keeps its curfew. */
  ours: ['ours', 'oursBay', 'oursWing', 'oursSide', 'oursBack', 'oursBackW', 'oursWell', 'oursWellE', 'oursWellW'],
  /**
   * The residents' flats. On Front Street (`ours`, x -16 .. 2) the landings' doors open north into them: door 0's
   * (street x -8.9) from our flat's end (along 6.3) to along 9, door 1's (x -5.8) on to the building's end; on the top
   * floor our landing has one door, Mrs Roux's, whose flat runs from ours to the end. On the courtyard (`oursBack`,
   * x 2.3 .. -13.85, along runs west) the east end, past the stairwell, is door 1's (Mrs Roux's on top).
   */
  residents: [
    { facade: 'ours', along: [6.3, 9], i: 0, floors: [1, 2, 3, 4] },
    { facade: 'ours', along: [9, 18], i: 1, floors: [1, 2, 3, 4] },
    { facade: 'ours', along: [6.3, 18], i: 0, floors: [5] },
    { facade: 'oursBack', along: [0, 6.8], i: 1, floors: [1, 2, 3, 4] },
    { facade: 'oursBack', along: [0, 6.8], i: 0, floors: [5] },
  ] as ResidentStretch[],
  /** The stairwell's shaft on our back (`oursBack`, street x -11.7 .. -4.5): its windows light on its timer. */
  stairwell: { facade: 'oursBack', along: [6.8, 14] as const },
  /** When people go up and down the stairs at night, and how long a landing's timer keeps it lit (game hours). */
  stairTimer: { slot: 0.25, chance: 0.22 },
  /** When the residents go to bed (game hours, one each by the door's hash): their window goes dark. */
  bedtime: [22.5, 0.5] as const,
  /** Up again in the morning (game hours): from then until they go out their window may be lit. */
  wakeUp: 6.5,
  /** The windows across the courtyard with their stories. `courtRear` faces our back, `courtEast` the stairwell's side. */
  stories: [
    { facade: 'courtRear', floor: 4, at: 0.42, life: 'trader' },
    { facade: 'courtRear', floor: 3, at: 0.2, life: 'couple' },
    { facade: 'courtRear', floor: 5, at: 0.7, life: 'painter' },
    { facade: 'courtRear', floor: 2, at: 0.6, life: 'sporty' },
    { facade: 'courtRear', floor: 3, at: 0.85, life: 'partyFlat' },
    { facade: 'courtEast', floor: 3, at: 0.4, life: 'movers' },
    { facade: 'courtEast', floor: 2, at: 0.75, life: 'catLady' },
    { facade: 'courtRear', floor: 1, at: 0.33, life: 'nightOwl' },
  ] as StoryWindow[],
  /** The movers' window: a tenancy lasts `cycle` game days, the last `moving` of them in boxes, then `empty` dark. */
  movers: { cycle: 24, moving: 2, empty: 3 },
  /** The painter starts a new canvas every so many game days. */
  painterCanvas: 9,
  /** The party flat's party night: one game day in seven. */
  partyEvery: 7,
  /** The trader's shelves: this full on day 1, filling towards full over about `fillDays`, and this much more per copy he got first. */
  trader: { start: 0.15, fillDays: 80, perTaken: 0.03 },
};
