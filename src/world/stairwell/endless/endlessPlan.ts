import { STOREY, landingY } from '@/world/measures/building';

/*
 * THE ENDLESS STAIRS: some nights the flight down from the 3rd floor leads back onto the 4th's (zone-local, as
 * `STAIRWELL_PLAN`). The player is moved up a storey on the same tread (the building repeats itself storey for
 * storey), and the longer it goes on the stranger the two landings get. Walking back up past the 4th floor, or
 * taking the lift, ends it for the night.
 */

export const ENDLESS_PLAN = {
  /** The night it may happen in (game hours, across midnight) and the chance a night is one (a draw per night). */
  hours: { from: 23, to: 4 },
  odds: 0.3,
  /** The two landings it loops between (`k`): from the 4th's flight down to the 3rd's, round again. */
  upper: 1,
  lower: 2,
  /** How far up it moves the player each time (one storey: the same tread of the flight above). */
  shift: STOREY,
  /** Below the lower landing by this much on its flight down (m, feet), the player is wrapped. */
  wrapBelow: 0.6,
  /** Above the upper landing by this much (m, feet: on the flight up towards ours), the loop is over. */
  exitAbove: 0.6,
  /** Standing on our landing in the night's hours arms it: within this much of its floor (m). */
  armWithin: 0.25,
  /** What the floor plates read as it goes on (from the first wrap: upper landing's, lower landing's); '' is a blank plate. */
  names: [
    ['4th', '4th'],
    ['5th', '5th'],
    ['', ''],
  ] as [string, string][],
  /** From this wrap on, a door with no name and no colour stands on the lower landing (local x on its north wall). */
  doorFrom: 3,
  doorX: 0.75,
  /** What the player thinks, at the wrap of that number. */
  thoughts: {
    2: 'Wasn’t that the 4th floor already?',
    3: 'The same landing. Again. Maybe… go back up?',
    5: 'Up. Go back up.',
  } as Record<number, string>,
  /** Said once it is over (walked back up, or the lift taken). */
  over: 'Your own floor’s light clicks on somewhere above. Just a building again.',
  /** The nameless door: its caption, and what a knock gets. */
  door: {
    label: 'A door · knock',
    knock: 'You knock. Nothing. Then, from the other side, three knocks back.',
    /** From this wrap on, a second knock is answered once for good: a voice almost known, and a card slid under the door. */
    answerFrom: 5,
    answer: 'Three knocks back. Then, very close to the wood, a voice you almost know: “Not yet, kiddo. Put the place back first.” Something slides under the door.',
    card: {
      title: 'Slid under the door',
      text: 'A square photo, the colours gone orange: this landing, but the wallpaper is the old one, and a man in a cardigan sits on the top step with a Game Boy, grinning at whoever holds the camera.\n\nOn the back, in pencil: “The stairs go on as long as you let them. Go home.”',
      from: 'F.',
    },
    after: 'You knock. The wood is just wood now. Somewhere above, your own floor’s light clicks.',
  },
  /** The lower and the upper landing's floor heights (local). */
  get lowerY(): number {
    return landingY(this.lower);
  },
  get upperY(): number {
    return landingY(this.upper);
  },
};
