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

/** Who else plays here: the pinball wizard, the kid, the attendant's friends. */
export const REGULARS = ['VIC', 'KID', 'ACE', 'JIN', 'ROX', 'KAT', 'ZED', 'DOT', 'MEG', 'LEO', 'SAL', 'NIK', 'JAY', 'ELI', 'RAY', 'BOB'];

/**
 * Scores of the five rivals per game, best first, from the simulated plays:
 * the fifth an ordinary player's usual play, the fourth their good one, the third a good player's
 * usual, the first beyond a good player's best in ten.
 */
const RIVAL_SCORES: Readonly<Record<string, readonly number[]>> = {
  breakout: [8000, 6000, 4000, 3000, 2400],
  invaders: [3600, 2900, 2200, 2000, 1850],
  stacker: [9500, 7000, 4500, 3600, 3000],
  frog: [9000, 7000, 4000, 2800, 2000],
  snake: [2200, 1700, 800, 500, 300],
  comets: [3300, 2600, 1500, 1300, 1150],
  pinball: [50000, 32000, 20000, 12000, 7000],
  alley: [600, 490, 430, 390, 350],
  duel: [1500, 1200, 650, 500, 420],
  stepbeat: [16000, 13000, 9000, 7500, 6500],
  sheriff: [9500, 7500, 5500, 4000, 3000],
  hoops: [1400, 1150, 950, 800, 680],
  lexipunk: [5000, 4000, 3000, 2000, 1000],
};

/**
 * Which rules each game's scores were made under: bump a game's number when its scoring changes
 * so much that old scores mean something else (a best made under easier rules would wall the table
 * off). `ArcadeScores` then drops that game's saved best and table entries once; medals already
 * paid stay paid. A game missing here is at 1.
 */
export const SCORE_RULES: Readonly<Record<string, number>> = {
  breakout: 2,
  invaders: 2,
  stacker: 2,
  snake: 2,
  comets: 2,
  duel: 2,
  hoops: 2,
  sheriff: 2,
};

/** The rules `gameId`'s scores are made under now. */
export function scoreRules(gameId: string): number {
  return SCORE_RULES[gameId] ?? 1;
}

/** The table a game starts with (a copy): rivals by name, deterministic per game. */
export function rivalTable(gameId: string): ScoreEntry[] {
  const scores = RIVAL_SCORES[gameId] ?? [5000, 4000, 3000, 2000, 1000];
  let h = 0;
  for (let i = 0; i < gameId.length; i++) h = (h * 31 + gameId.charCodeAt(i)) >>> 0;
  return scores.map((score, i) => ({ name: REGULARS[(h + i * 5) % REGULARS.length]!, score }));
}

/** The score a rival holds at `rank` (0-based) on a fresh table: what the daily challenge aims at. */
export function rivalScore(gameId: string, rank: number): number {
  const table = rivalTable(gameId);
  return table[Math.min(table.length - 1, Math.max(0, rank))]!.score;
}
