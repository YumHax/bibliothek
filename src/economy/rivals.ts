/*
 * THE HALL OF FAME'S REGULARS: the made-up scores every table starts with, so a fresh board already
 * has names to beat. Five per game, set against what a decent play scores on it (the fifth is an
 * ordinary play, the first a very good one); the player pushes them down as they climb. Retune
 * alongside `PAYOUT` in `pricing.ts` when a game's scoring changes.
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

/** Scores of the five rivals per game, best first: a very good play down to an ordinary one. */
const RIVAL_SCORES: Readonly<Record<string, readonly number[]>> = {
  breakout: [6200, 4800, 3600, 2600, 1600],
  invaders: [3800, 2900, 2200, 1500, 900],
  stacker: [5200, 3600, 2500, 1700, 900],
  arrows: [3000, 2300, 1700, 1100, 600],
  snake: [3600, 2700, 2000, 1400, 800],
  comets: [2600, 1900, 1400, 1000, 600],
  pinball: [80000, 55000, 38000, 24000, 14000],
  alley: [620, 480, 380, 290, 200],
  duel: [1600, 1200, 900, 650, 400],
  stepbeat: [11000, 8500, 6500, 4500, 2800],
  sheriff: [10000, 7800, 6000, 4300, 2700],
  hoops: [900, 700, 520, 380, 250],
  lexipunk: [5000, 4000, 3000, 2000, 1000],
};

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
