import type { GameBox } from '@/world/GameBox';
import type { Seat } from '@/world/Seat';
import type { VideoScreen } from '@/world/screen';

/** What the player is doing right now; interactables read it to phrase labels and choose actions. */
export interface PlayerState {
  readonly held: GameBox | null;
  readonly seated: boolean;
}

/** The moves an interactable may ask the session to make on the player's behalf. */
export interface SessionActions extends PlayerState {
  pickUp(box: GameBox): void;
  putBack(): void;
  sit(seat: Seat): void;
  stand(): void;
  /** Shows the game's longplay on `screen` (TV, projector…); any other screen that was on is switched off. */
  playOn(screen: VideoScreen, box: GameBox): Promise<void>;
  stopScreen(screen: VideoScreen): void;
  hint(message: string): void;
}
