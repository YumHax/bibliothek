/*
 * What the arcade's machines need to know of the scores and the day, as structural shapes (the
 * concrete `ArcadeScores` and `ArcadeDaily` live in `economy/`; the machines never import them).
 */

/** One line of a hall-of-fame table. */
export interface TableEntry {
  readonly name: string;
  readonly score: number;
  readonly you?: boolean;
}

/** The hall of fame as a machine reads and signs it. */
export interface ScoreTable {
  bestOf(gameId: string): number;
  topOf(gameId: string): TableEntry;
  table(gameId: string): TableEntry[];
  qualifies(gameId: string, score: number): boolean;
  submit(gameId: string, score: number, initials?: string): { best: boolean; rank: number | null };
  readonly initials: string;
  subscribe(cb: () => void): () => void;
}

/** Today's challenge as a sign or an attract screen shows it. */
export interface TodaysChallenge {
  readonly gameId: string;
  readonly target: number;
  readonly reward: number;
  readonly done: boolean;
}

/** A machine's medals, earned by passing a score on it once: bronze, silver, gold. */
export type MedalTier = 'bronze' | 'silver' | 'gold';

/** The medals as a machine shows them (the lamps on its marquee) and follows them. */
export interface MedalBook {
  earned(gameId: string): readonly MedalTier[];
  /** The score each tier asks for on `gameId`. */
  thresholds(gameId: string): Readonly<Record<MedalTier, number>>;
  subscribe(cb: () => void): () => void;
}
