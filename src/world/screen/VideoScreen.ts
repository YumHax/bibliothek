import type { VideoInfo } from '@/video/VideoProvider';

export type ScreenState = 'off' | 'searching' | 'playing' | 'error';
export type ScreenStateListener = (state: ScreenState) => void;

/**
 * Anything in the room that can show a longplay: the CRT television, the projector wall…
 * The session drives playback through this shape only, so a new kind of screen needs no rule changes.
 */
export interface VideoScreen {
  readonly state: ScreenState;
  readonly isPlaying: boolean;
  /** Short name used in toasts and labels ("TV", "projector"). */
  readonly screenName: string;
  searching(title: string): void;
  play(video: VideoInfo, startSeconds: number): void;
  fail(message: string): void;
  stop(): void;
  onStateChange(listener: ScreenStateListener): () => void;
}
