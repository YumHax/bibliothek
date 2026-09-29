import type { PlatformId } from '@/catalog/types';
import type { SessionActions } from '@/game/SessionActions';
import type { GameBox } from '../GameBox';

/**
 * A console as the TV sees it: the platform it plays, the game seated in it, and the move that
 * takes the box in hand's cartridge (or disc), puts it in and plays it on the TV.
 */
export interface MediaDeck {
  readonly platformId: PlatformId | null;
  /** Short name for labels: "NES", "Mega Drive". */
  readonly deckName: string;
  /** The box whose media is seated in it (not while it is going in or out). */
  readonly loaded: GameBox | null;
  /** When the seated media went in (performance.now()), for the TV to switch on the last one. */
  readonly loadedAt: number;
  /** Something is going in or coming out. */
  readonly busy: boolean;
  insert(session: SessionActions, box: GameBox): void;
}

/** The consoles under a TV, as it asks for them. */
export interface MediaDecks {
  forPlatform(platform: PlatformId): MediaDeck | null;
  /** The console whose game went in last and is still in it. */
  lastLoaded(): MediaDeck | null;
}
