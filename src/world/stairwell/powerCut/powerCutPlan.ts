import { landingY, STOREYS } from '@/world/measures/building';

/*
 * The stairwell in a power cut (`building/blackout`), zone-local like `STAIRWELL_PLAN`: the candles the residents
 * light on the landings, who comes out with them and what they say, the card game by candlelight in the hall, the
 * lift stuck between the 4th and the 3rd with Mrs Moreau inside, the meters cupboard whose main fuse brings the power
 * back. Walker yaws: 0 faces +z (towards the doors of a landing's north wall).
 */

/** A resident out on the stairs in the dark: their look's seed, where they stand (or sit), what they say in turn. */
export interface CandleNeighbour {
  who: string;
  /** Their person in the social layer (`social/people/building`). */
  person: string;
  seed: number;
  at: readonly [x: number, y: number, z: number];
  yaw: number;
  /** Sitting at the card table on a stool this high (m); standing when absent. */
  seat?: number;
  pose: 'crossed' | 'hips' | 'think' | 'pockets' | 'lap' | 'play';
  lines: readonly string[];
  /** What they call out when the power comes back. */
  cheer: string;
}

const hall = landingY(STOREYS);
const second = landingY(3);
const third = landingY(2);
const ours = landingY(0);

export const POWER_CUT_PLAN = {
  /** Candles on saucers (floor or table top, the wax's foot), each a real light's place when it is among the two nearest. */
  candles: [
    [-0.2, second, -0.72],
    [1.7, second, -0.68],
    [1.62, third, -0.7],
    [2.25, hall + 0.72, 2.35],
    [2.05, ours, -0.72],
  ] as [number, number, number][],
  /**
   * The card table in the middle of the hall (its walls are the board's, the lodge's, the estate sale's): its middle
   * on the floor, its top's size and height, two stools either side. It collides only while it is there.
   */
  table: { at: [2.25, 2.35] as [number, number], width: 0.62, depth: 0.62, height: 0.72, stools: [[1.8, 2.35], [2.7, 2.35]] as [number, number][], stoolHeight: 0.45 },
  neighbours: [
    {
      who: 'R. Haddad', person: 'haddad', seed: 41, at: [0.25, second, -1.0], yaw: 0.6, pose: 'crossed',
      lines: ['The whole street is dark. Even the arcade sign is off.', 'I have candles for a month. You learn, in this building.', 'Somebody should look at the fuse. The meters cupboard, in the hall.'],
      cheer: 'Ha! There we are!',
    },
    {
      who: 'Mrs Dubois', person: 'dubois', seed: 63, at: [1.05, second, -1.1], yaw: -0.8, pose: 'hips',
      lines: ['My freezer! Everything will be ruined.', 'It was like this in seventy-six, a whole night. We sang.', 'Mr Haddad always has candles. Thank heaven.'],
      cheer: 'Oh, thank goodness. My freezer!',
    },
    {
      who: 'P. Girard', person: 'girard', seed: 37, at: [1.8, hall, 2.35], yaw: Math.PI / 2, seat: 0.45, pose: 'play',
      lines: ['Belote? We need a fourth, but two will do.', 'No TV, no internet. Cards it is, like when I was a kid.', 'Your turn. Ah, you are not playing. Pity.'],
      cheer: 'And just when I had a good hand!',
    },
    {
      who: 'J.-P. Martin', person: 'martin', seed: 71, at: [2.7, hall, 2.35], yaw: -Math.PI / 2, seat: 0.45, pose: 'play',
      lines: ['He cheats, you know. Even in the dark.', 'The fuse will hold once the storm has moved off. Not before.', 'Mrs Moreau is in the lift, poor thing. Somebody talk to her.'],
      cheer: 'Light! I can see your cards now, Girard.',
    },
  ] as CandleNeighbour[],
  /** The lift is caught between our 4th floor (`k` 1) and the 3rd, with Mrs Moreau in it (only when the cut falls while the player is away). */
  stuck: {
    /** Her door (landing `k`, door `i`: `STAIRWELL_PLAN.residents`'), so she is not "at home" while in the car. */
    k: 1,
    i: 0,
    who: 'Mrs Moreau',
    person: 'moreau',
    seed: 23,
    /** Where she stands in the car (x, z), facing its gate (+z). */
    at: [0.75, -2.4] as [number, number],
    /** Called out the first time the player comes near (m from the car). */
    callRange: 3.2,
    call: 'Hello? Is somebody there? The lift has stopped, I am stuck in it!',
    lines: [
      'Oh, thank goodness, a voice. It just stopped dead, between two floors.',
      'I only took it for my knee. Never again, I said that last time too.',
      'The fuse box is in the hall, by the cellars. My husband always saw to it.',
      'Talk to me a little, would you? It is very dark in here.',
    ],
    freed: 'It moves! Oh, bless you. I am taking the stairs from now on.',
  },
  /** The meters cupboard on the hall's west wall by the stairs, under the fibre box, before the board (its back's middle; it faces +x). */
  fuseBox: { at: [0.605, 1.4, -0.1] as [number, number, number] },
  /** What the fuse says, and what the hall says when the power comes back. */
  fuse: {
    idle: 'The building’s meters and the main fuse. All humming along.',
    trips: 'Clack. It trips again at once: the storm is still right overhead. Give it a minute.',
    restored: 'Clack. A hum through the walls, the lights flicker on: the whole building cheers.',
  },
};
