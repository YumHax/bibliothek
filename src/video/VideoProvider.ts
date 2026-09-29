import type { Game } from '@/catalog/types';

export interface VideoInfo {
  videoId: string;
  title: string;
  durationSeconds: number;
  /** The next-best hits of the same search, best first: tried in turn when the embed refuses this one. */
  fallbacks?: VideoInfo[];
}

/** Finds a gameplay video (ideally a full longplay) for a game. */
export interface VideoProvider {
  readonly id: string;
  findLongplay(game: Game): Promise<VideoInfo | null>;
  /**
   * The embed refused `videoId` for `game` (removed, or embedding disabled): forget it, so the next
   * search starts from the next hit, or answers "nothing" for a while when none is left.
   */
  reject?(game: Game, videoId: string): void;
}
