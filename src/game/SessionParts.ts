import type { FirstPersonController } from '@/player/FirstPersonController';
import type { Inspector } from '@/interaction/Inspector';
import type { Interactor } from '@/interaction/Interactor';
import type { Overlay } from '@/ui/Overlay';
import type { GamePanel } from '@/ui/GamePanel';
import type { Toast } from '@/ui/Toast';
import type { SearchBar } from '@/ui/SearchBar';
import type { VideoProvider } from '@/video/VideoProvider';
import type { GameSource } from '@/collection/GameSource';
import type { GameBox } from '@/world/GameBox';
import type { Seat } from '@/world/Seat';
import type { SortMode } from '@/world/shelving/sort';
import type { Highlighter } from './Highlighter';

/*
 * Minimal shapes of the optional features the session routes keys to. They are defined here (not
 * imported from the feature modules) so the session compiles and runs whether or not a feature is
 * wired in; `main.ts` passes the concrete objects, which only need to be structurally compatible.
 */

/** The shelves: which boxes exist, where a game's box is, and (optionally) how they are sorted. */
export interface ShelvingLike {
  readonly boxes: readonly GameBox[];
  findBox(gameId: string): GameBox | undefined;
  cycleSort?(): SortMode;
}

/** Day / night lighting toggle. `isNight` lets the toast name the new state. */
export interface DayNightLike {
  toggleNight(): unknown;
  readonly isNight?: boolean;
}

/**
 * DOM overlay that edits the collection. `onOpenChange` is assigned by the session so that
 * closing the editor from its own UI (close button, Esc) also re-enters the room.
 */
export interface CollectionEditorLike {
  toggle(): unknown;
  readonly isOpen: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** The cat: the session calls it with a key and tells it which armchair the player sits in. */
export interface CatLike {
  readonly settings: { readonly name: string };
  /** The player calls it: it comes, ignores the call, or is asleep. */
  call(): 'coming' | 'ignored' | 'asleep';
  setPlayerSeat?(seat: Seat | null): void;
}

export interface SessionParts {
  player: FirstPersonController;
  inspector: Inspector;
  interactor: Interactor;
  overlay: Overlay;
  panel: GamePanel;
  videos: VideoProvider;

  // --- optional features (each is silently skipped when absent) -------------------------------
  toast?: Toast;
  search?: SearchBar;
  highlighter?: Highlighter;
  gameSource?: GameSource;
  shelving?: ShelvingLike;
  dayNight?: DayNightLike;
  collectionEditor?: CollectionEditorLike;
  cat?: CatLike;
  /** Re-enters the room after a modal (the collection editor) released the pointer lock: `() => void lockFlow.enter()`. */
  enterRoom?: () => void;
}
