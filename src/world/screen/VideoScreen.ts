import type * as THREE from 'three';
import type { VideoInfo } from '@/video/VideoProvider';

export type ScreenState = 'off' | 'searching' | 'playing' | 'error';
export type ScreenStateListener = (state: ScreenState) => void;

/**
 * A picture made in the page shown on a screen (`VideoScreen.showFeed`): where the listener hears the set from, for
 * the program's own sound, and the switch. Stale once the screen went off or showed something else.
 */
export interface ScreenFeed {
  /** The set's level where the listener stands, 0..1 (distance, facing, the walls between); 0 once off. */
  readonly loudness: number;
  /** Where it is heard from, -1 left .. 1 right. */
  readonly pan: number;
  /** False while the zone holding the screen is dormant (the program holds still, silent). */
  readonly zoneActive: boolean;
  /** Still on the glass: false once the screen was switched off or given something else. */
  readonly live: boolean;
  /** Takes the picture off (the screen goes off). */
  stop(): void;
}

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
  /**
   * Shows `feed` (a texture the page paints, e.g. a `ScreenProgram`'s canvas) lit on the glass, as `playing`, until
   * `stop`. Absent on a screen that cannot (docs/media.md "Programs on the screen").
   */
  showFeed?(feed: THREE.Texture): ScreenFeed;
}
