import type { Game } from '@/catalog/types';
import type { JournalDay, ReadMark } from '@/journal/Journal';
import type { Upcoming } from '@/journal';

/** What the panel reads: the journal's pages and where the reading stopped. `Journal` fits. */
export interface JournalLike {
  readonly today: JournalDay;
  readonly history: readonly JournalDay[];
  readonly readMark: ReadMark | null;
  markRead(): void;
}

/** A trail the player follows: its clues so far, how many there are in all, the next lead, and whether it is over. */
export interface TrailFile {
  title: string;
  clues: readonly string[];
  total: number;
  next?: string;
  done?: boolean;
}

export interface JournalPanelOptions {
  /** Today's arcade challenge, if the arcade is wired: which machine, the score, the bonus, whether it is beaten. */
  challenge?: () => { gameId: string; target: number; reward: number; done: boolean };
  /** A machine's name for the challenge line (default: its id in capitals). */
  titleOf?: (gameId: string) => string;
  /** What is coming (tomorrow's market day, an event this week, a favour owed): the market, the calendar and the people say. */
  upcoming?: () => readonly Upcoming[];
  /** A trail the player follows (the lost prototype, `story/`): null before it starts. */
  file?: () => TrailFile | null;
  /** More trails, each its own block after `file`'s (the building's sixth floor, `building/hunt`; uncle Félix's notebook). */
  files?: readonly (() => TrailFile | null)[];
  /** Opens the People book (docs/social.md): a button by the book's Close. */
  people?: () => void;
  /** What is in hand now (today's counters write it large): the purse and the shelves. */
  balance?: () => { coins: number; tickets: number; games: number };
  /** The collection, for the covers of the day's games (one parted with since has none). */
  games?: () => readonly Game[];
  coverUrl?: (game: Game) => string | undefined;
}

/** What a page is written with: the options, the folds opened by hand, and the game behind a line's id. */
export interface PageContext {
  options: JournalPanelOptions;
  folds: ReadonlySet<string>;
  gameOf(id: string): Game | undefined;
}
