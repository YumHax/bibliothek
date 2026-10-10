import type { Game } from '@/catalog/types';
import type { GameSource } from '@/collection/GameSource';
import type { Milestones } from '@/economy/Milestones';
import type { ValueHistory } from '@/economy/ValueHistory';
import type { CollectorWatch } from '@/economy/CollectorWatch';
import type { Html } from '../panel/html';

/** What the book's pages are written from: the stores it reads, never writes (the panel claims). */
export interface BookData {
  collection: GameSource;
  /** Which of the collectors' club's sets had their bounty paid (on completion, `bootstrap/uiPanels`). */
  standing?: { hasClaimed(setId: string): boolean; subscribe(cb: () => void): () => void };
  milestones: Milestones;
  history: ValueHistory;
  watch: CollectorWatch;
  coverUrl?: (game: Game) => string | undefined;
}

/** The binder's dividers, in the order they stand: each section starts on a left page. */
export type SectionId = 'contents' | 'stamps' | 'sets' | 'consoles' | 'worth';

/** One page of the binder: the section it belongs to and what is on it. */
export interface BookPage {
  section: SectionId;
  body: Html;
}
