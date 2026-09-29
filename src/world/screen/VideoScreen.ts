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
  /** Short name used in labels ("TV", "projector"). */
  readonly screenName: string;
  /** The set comes on and looks for a signal (static, a source slate); `title` is for the console only. */
  searching(title: string): void;
  /**
   * Shows `video` from `startSeconds`. When the embed refuses it, `onRejected` hears its id and the
   * screen tries `video.fallbacks` in turn, then shows "no signal".
   */
  play(video: VideoInfo, startSeconds: number, onRejected?: (videoId: string) => void): void;
  /** No picture to show: the screen says "no signal"; `message` (the technical reason) goes to the console. */
  fail(message: string): void;
  stop(): void;
  onStateChange(listener: ScreenStateListener): () => void;
}
