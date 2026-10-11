import { inHours } from '@/time/clock';
/*
 * THE HALL'S REGULARS: the four people who come and play at the arcade, by name (docs/economy.md "People"). The
 * crowd walks their bodies in at their hours and sends them to their favourite machine first; their hands are the
 * games' autopilots at their own skill (better at the games they are strong at); what they sign on the hall of fame,
 * in the weekly league and in the Saturday tournament's bracket is their initials. One roster for all three, so the
 * people seen playing are the people beaten on the boards.
 */

export interface HallRegular {
  /** Three letters: the hall of fame, the league, the tournament's bracket. */
  initials: string;
  /** What Gus calls them. */
  name: string;
  /** Their body's seed. */
  seed: number;
  /** The machine they go to first when it is free (a game id). */
  favourite: string;
  /** How well their hands play (an autopilot's skill, 0..1); better on `strong` games, worse on `weak` ones. */
  skill: number;
  strong: readonly string[];
  weak: readonly string[];
  /** When they come in, game hours (`to` past 24 runs on into the night). */
  hours: readonly [from: number, to: number];
  /** Seconds between two words at a machine: the quiet one in headphones talks least. */
  chatterEvery: readonly [number, number];
  /** The odds they try another machine after one (else home), and that they stop to watch the Saturday cup. */
  stays: number;
  watches: number;
  /** How often they bump the pinball with a hip, against an ordinary player's. */
  nudges?: number;
  /** Walks off after a game that did not make the table. */
  soreLoser?: boolean;
  /** What they say clicked, at a machine now and then, when their score lands on the board. */
  lines: readonly string[];
  chatter: readonly string[];
  boardLines: readonly string[];
}

export const HALL_REGULARS: readonly HallRegular[] = [
  {
    initials: 'VIC',
    name: 'Vicky',
    seed: 7,
    favourite: 'pinball',
    skill: 0.66,
    strong: ['pinball', 'alley'],
    weak: ['stepbeat'],
    hours: [17, 24],
    chatterEvery: [10, 22],
    stays: 0.5,
    watches: 0.6,
    nudges: 2.5,
    lines: ['Shh. The multiplier is lit.', 'Pinball is a conversation. You have to listen.', 'The left flipper is soft. Everyone knows.', 'I am on three boards. Four by tonight.'],
    chatter: ['Come on, come on...', 'Talk to me.', 'Ha! Bumper!', 'Not the outlane...', 'Yes!'],
    boardLines: ['VIC, top five. Write it down.', 'Still got it.', 'The table loves me.'],
  },
  {
    initials: 'JIN',
    name: 'Jin',
    seed: 12,
    favourite: 'stepbeat',
    skill: 0.68,
    strong: ['stepbeat', 'sheriff'],
    weak: ['pinball'],
    hours: [12, 21],
    chatterEvery: [30, 60],
    stays: 0.6,
    watches: 0.4,
    lines: ['(one headphone off) Sorry?', 'Step Beat is all about the off-beat.', 'I practise in my kitchen. The neighbours hate it.', 'Headphones on, world off.'],
    chatter: ['Mm.', 'Clean.', '...nice.'],
    boardLines: ['Mm. On the board.', 'Clean run.'],
  },
  {
    initials: 'ROX',
    name: 'Roxane',
    seed: 19,
    favourite: 'invaders',
    skill: 0.64,
    strong: ['invaders', 'breakout'],
    weak: ['hoops'],
    hours: [8, 15],
    chatterEvery: [8, 16],
    stays: 0.55,
    watches: 0.8,
    lines: ['Night shift at the hospital. This is my wind-down.', 'Watch the fourth wave. It speeds up.', 'I had the top of STAR RAID once. For a day.', 'Coffee, then invaders. Then sleep.'],
    chatter: ['Come ON!', 'Got you!', 'Argh!', 'Did you see that?', 'Next wave, next wave...'],
    boardLines: ['Top five, baby!', 'Tell Gus. Tell everyone.', 'Night shift, day records.'],
  },
  {
    initials: 'ZED',
    name: 'Zédé',
    seed: 31,
    favourite: 'comets',
    skill: 0.62,
    strong: ['comets', 'frog'],
    weak: ['stepbeat'],
    hours: [19, 26],
    chatterEvery: [14, 30],
    stays: 0.25,
    watches: 0.5,
    soreLoser: true,
    lines: ['Been coming here since the machines took francs.', 'Comets. The only honest game in here.', 'Kids today. Everything is a combo.', 'The hoop moves after ten. Nobody tells you that.'],
    chatter: ['Hmph.', 'There we go.', 'Bah!', 'Again.'],
    boardLines: ['Old dog. Old tricks.', 'Write that down, kid.'],
  },
];

/** The regulars' initials, in roster order: who the league and the tournament set against the player. */
export const HALL_REGULAR_INITIALS: readonly string[] = HALL_REGULARS.map((r) => r.initials);

/** How well `regular`'s hands play `gameId`. */
export function regularSkill(regular: HallRegular, gameId: string): number {
  const skill = regular.skill + (regular.strong.includes(gameId) ? 0.12 : 0) - (regular.weak.includes(gameId) ? 0.12 : 0);
  return Math.min(0.9, Math.max(0.3, skill));
}

/** Whether `hour` (game hours) is in `regular`'s hours. */
export function regularIn(regular: HallRegular, hour: number): boolean {
  return inHours(hour, regular.hours);
}

/** The regular who would take `gameId` off the player: the one it is the favourite of, else one strong at it, else by the game's name. */
export function regularFor(gameId: string): HallRegular {
  return (
    HALL_REGULARS.find((r) => r.favourite === gameId) ??
    HALL_REGULARS.find((r) => r.strong.includes(gameId)) ??
    HALL_REGULARS[[...gameId].reduce((n, c) => n + c.charCodeAt(0), 0) % HALL_REGULARS.length]!
  );
}

/** A regular by their initials. */
export function regularNamed(initials: string): HallRegular | undefined {
  return HALL_REGULARS.find((r) => r.initials === initials);
}
