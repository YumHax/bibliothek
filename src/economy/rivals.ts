import { fnv1a } from '@/random';
/*
 * THE HALL OF FAME'S REGULARS: the made-up scores every table starts with, so a fresh board already
 * has names to beat. Five per game, set against the simulated plays of `npm run balance` (the fifth
 * is an ordinary player's usual play, the first a very good one); the player pushes them down as
 * they climb. Retune alongside `PAYOUT` in `pricing.ts` when a game's scoring changes (and bump its
 * `SCORE_RULES`).
 */

export interface ScoreEntry {
  /** Three letters, arcade style. */
  name: string;
  score: number;
  /** Set on entries the player made. */
  you?: boolean;
}

/** Top-five table size. */
export const TABLE_SIZE = 5;

/**
 * Who else plays here: the hall's four regulars (`hallRegulars`), Nico the kid (NIC), Gus himself, and those who come
 * now and then.
 */
export const REGULARS = ['VIC', 'NIC', 'ACE', 'JIN', 'ROX', 'KAT', 'ZED', 'DOT', 'MEG', 'LEO', 'SAL', 'GUS', 'JAY', 'ELI', 'RAY', 'BOB'];

/** On the tables but never in the league or a tournament: Nico (a kid) and Gus (behind the counter). */
export const NOT_COMPETING: readonly string[] = ['NIC', 'GUS'];

/**
 * The old tables' holder: Hana, who wrote MOONPOST's music, signs HAB (`story/prototype` `COMPOSER`) and has topped the
 * hall's oldest machines "since before Gus worked here", as the story sends the player to find.
 */
const OLD_RECORDS: Readonly<Record<string, string>> = { invaders: 'HAB', breakout: 'HAB', pinball: 'HAB' };

/**
 * Scores of the five rivals per game, best first, from the simulated plays (`npm run balance`, its
 * last column): the fifth an ordinary player's usual play (bronze, within an ordinary player's
 * reach), the fourth between them and a good player's usual, the third a good player's usual (silver),
 * the first a good player's best in twenty (gold: a mastery goal, never out of reach).
 */
const RIVAL_SCORES: Readonly<Record<string, readonly number[]>> = {
  breakout: [15000, 12000, 6500, 5500, 4500],
  invaders: [2400, 2000, 1400, 1300, 1200],
  stacker: [14000, 9000, 5000, 4200, 3400],
  frog: [5500, 4400, 2100, 1800, 1400],
  snake: [1750, 1400, 800, 500, 300],
  comets: [4000, 3200, 2100, 1900, 1650],
  pinball: [210000, 150000, 65000, 45000, 28000],
  alley: [730, 710, 690, 630, 560],
  duel: [4500, 3600, 2100, 1700, 1300],
  stepbeat: [19500, 16000, 11800, 10000, 8500],
  sheriff: [8600, 7500, 6000, 4800, 3600],
  hoops: [1200, 1100, 950, 800, 680],
  lexipunk: [5000, 4000, 3000, 2000, 1000],
};

/**
 * Which rules each game's scores were made under: bump a game's number when its scoring changes
 * so much that old scores mean something else (a best made under easier rules would wall the table
 * off). `ArcadeScores` then drops that game's saved best and table entries once; medals already
 * paid stay paid. A game missing here is at 1.
 */
const SCORE_RULES: Readonly<Record<string, number>> = {
  breakout: 3,
  invaders: 3,
  stacker: 3,
  frog: 2,
  snake: 3,
  comets: 2,
  duel: 2,
  hoops: 2,
  sheriff: 2,
  pinball: 2,
  alley: 2,
};

/** The rules `gameId`'s scores are made under now. */
export function scoreRules(gameId: string): number {
  return SCORE_RULES[gameId] ?? 1;
}

/** The table a game starts with (a copy): rivals by name, deterministic per game; an old machine's top is HAB's. */
export function rivalTable(gameId: string): ScoreEntry[] {
  const scores = RIVAL_SCORES[gameId] ?? [5000, 4000, 3000, 2000, 1000];
  const h = fnv1a(gameId);
  const holder = OLD_RECORDS[gameId];
  return scores.map((score, i) => ({ name: i === 0 && holder ? holder : REGULARS[(h + i * 5) % REGULARS.length]!, score }));
}

/** The score a rival holds at `rank` (0-based) on a fresh table: what the daily challenge aims at. */
export function rivalScore(gameId: string, rank: number): number {
  const table = rivalTable(gameId);
  return table[Math.min(table.length - 1, Math.max(0, rank))]!.score;
}
