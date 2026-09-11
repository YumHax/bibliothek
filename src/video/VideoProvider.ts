import type { Game } from '@/catalog/types';

export interface VideoInfo {
  videoId: string;
  title: string;
  durationSeconds: number;
}

/** Finds a gameplay video (ideally a full longplay) for a game. */
export interface VideoProvider {
  readonly id: string;
  findLongplay(game: Game): Promise<VideoInfo | null>;
}
