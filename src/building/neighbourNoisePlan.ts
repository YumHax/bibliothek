import type { PersonId } from '@/social/types';
import type { HourSpan } from '@/time/clock';

/*
 * THE BUILDING'S NOISE, as data: what the flat hears of the neighbours through its floor and
 * ceiling (`throughWalls`), and what the neighbours do about the flat's noise late at night
 * (`noiseComplaints`). Residents by their door's key (`stairwell/building.doorKey`: landing k, door
 * i; the 4th floor, under us, is k 1). Hours are the game clock's; an hour window is a `HourSpan`
 * (`time/clock`: `to` past 24 runs on after midnight, 23 .. 25.5 is 23:00 to 01:30).
 */

/** A sound through the floor or the ceiling, some days of the game. */
export interface ThroughWall {
  /** Which sound: the 4th floor's piano or TV through the floor, the attic's music. */
  voice: 'piano' | 'tv' | 'music';
  /** Whose (their door's key) or the attic's student (`attic`, always in when it plays). */
  who: string;
  hours: HourSpan;
  /** One game day in this many (1: every day). */
  oneIn: number;
  /** Level in the flat (0..1, before the voice's own peak). */
  level: number;
  /** Plays only while this person's effect is in force (`social/perks`): a feud's TV, a hostile neighbour's late scales. */
  needs?: { person: PersonId; effect: string };
  /** Softer by `factor` while this person's effect is in force (a friend's piano). */
  softer?: { person: PersonId; effect: string; factor: number };
}

export const NEIGHBOUR_NOISE = {
  /** What the flat hears of the building, quietly; never while the player is out of it. */
  throughWalls: [
    // Mrs Moreau practising downstairs before dinner (her door's piano, `STAIRWELL_PLAN.doors`); softer for a friend.
    { voice: 'piano', who: '1:0', hours: { from: 18.5, to: 20.5 }, oneIn: 2, level: 0.16, softer: { person: 'moreau', effect: 'quietPiano', factor: 0.55 } },
    // Hostile, she practises her scales late, right under the player.
    { voice: 'piano', who: '1:0', hours: { from: 22, to: 23.5 }, oneIn: 2, level: 0.22, needs: { person: 'moreau', effect: 'loudPiano' } },
    // A. Leclerc at war with the player: his radio turned up through the floor, late, every night.
    { voice: 'tv', who: '1:1', hours: { from: 22.5, to: 24.5 }, oneIn: 1, level: 0.18, needs: { person: 'leclerc', effect: 'feud' } },
    // The Moreaus' evening TV, under the living room.
    { voice: 'tv', who: '1:0', hours: { from: 20.5, to: 23 }, oneIn: 1, level: 0.12 },
    // The student up in the attic, some nights.
    { voice: 'music', who: 'attic', hours: { from: 23, to: 25.5 }, oneIn: 3, level: 0.1 },
    // Cross with the player, Théo turns it up: earlier, louder, every night.
    { voice: 'music', who: 'attic', hours: { from: 22, to: 26 }, oneIn: 1, level: 0.2, needs: { person: 'student', effect: 'loudMusic' } },
  ] as ThroughWall[],
  /** Someone walking about upstairs now and then of an evening: seconds between, at most this often. */
  stepsAbove: { hours: { from: 19, to: 24.5 } as HourSpan, everyS: { min: 50, max: 160 }, level: 0.16 },

  /** The flat's quiet hours: loud then, the neighbours mind. */
  quietHours: { from: 22, to: 31 } as HourSpan,
  /** `flatNoise` at or over this counts as loud. */
  loud: 0.3,
  /** Seconds (real) of loud noise in the quiet hours before downstairs bangs on their ceiling, then before they come up. */
  broomAfterS: 40,
  knockAfterS: 45,
  /** Still loud this long after they came to the door: it goes to the syndic (a notice on the board). */
  escalateAfterS: 90,
  /** Who minds: A. Leclerc, 4th floor, right under the living room (the one who goes to bed early). */
  complainer: { key: '1:1', name: 'A. Leclerc', seed: 131, pitch: 0.3 },
  /** Whose standing suffers too when it goes to the syndic: the whole 4th floor. */
  alsoMinds: ['1:0'],
  /** What the standing loses: turned down at the broom (nothing), answered at the door, not answered, the syndic. */
  cost: { answered: -6, unanswered: -10, escalated: -12, alsoEscalated: -4 },
  /** The broom, as the subtitle names it. */
  broomSpeaker: 'Downstairs',
  broomLines: ['Some of us are trying to sleep!', 'It is past ten!', 'Turn it down up there!'],
  /** Said at the door, by the hour (before or after midnight), in turn. */
  doorLines: [
    'It is gone ten! Some of us work tomorrow. Could you turn it down, please?',
    'I can hear every note through my ceiling. Every single one.',
    'Do you know what time it is? Turn that thing down, please.',
  ],
  /** What a resident cross with the player (`friendship` at `COLD` or under) says in passing on the stairs. */
  coldHellos: ['Hm.', 'Evening.', 'Oh. It’s you.', 'Quieter tonight, I hope.'],
  /** Answered and turned down within this long (s): "Thank you." and nothing more. */
  thanksWithinS: 20,
  thanks: 'Thank you. Good night.',
  /** Nobody came: his note under the door, at once. */
  note: { title: 'TO THE 5TH FLOOR', lines: ['Some of us sleep at night.', 'Your TV was on past ten again.', 'A. Leclerc, 4th floor'], accent: 0x8a8f99 },
  /** The board the day after it went to the syndic (and the day after that). */
  board: {
    id: 'noise',
    title: 'REMINDER · QUIET HOURS',
    lines: ['Residents are reminded that', 'noise is not tolerated', 'between 10 pm and 7 am.', 'Complaints have been received.'],
    signed: 'The syndic',
    paper: 0xf2efe6,
    weight: 2,
    days: 2,
  },
};
