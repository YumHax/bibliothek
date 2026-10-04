import * as THREE from 'three';
import type { LabelPlacement } from '@/interaction/Interactable';
import type { VideoInfo } from '@/video/VideoProvider';
import type { VideoSurface } from './VideoSurface';
import type { ScreenFeed, ScreenState, ScreenStateListener, VideoScreen } from './VideoScreen';

/**
 * A screen whose picture is a `VideoSurface` (the television, the projector): the `VideoScreen` shape forwarded to
 * the surface, and where the caption sits, so each set only builds its body, makes its surface and decides what a
 * click does. The subclass makes `surface` in its constructor (it needs the CSS layer and the picture's size).
 */
export abstract class SurfaceScreen extends THREE.Group implements VideoScreen {
  abstract readonly screenName: string;
  protected abstract readonly surface: VideoSurface;

  get state(): ScreenState {
    return this.surface.state;
  }

  get isPlaying(): boolean {
    return this.surface.isPlaying;
  }

  /** Called whenever the screen changes state (off / searching / playing / error). Returns an unsubscribe function. */
  onStateChange(listener: ScreenStateListener): () => void {
    return this.surface.onStateChange(listener);
  }

  /** The caption keeps off the picture while it plays. */
  labelPlacement(): LabelPlacement {
    return this.isPlaying ? 'edge' : 'crosshair';
  }

  searching(title: string): void {
    this.surface.searching(title);
  }

  play(video: VideoInfo, startSeconds: number, onRejected?: (videoId: string) => void): void {
    this.surface.play(video, startSeconds, onRejected);
  }

  fail(message: string): void {
    this.surface.fail(message);
  }

  stop(): void {
    this.surface.stop();
  }

  /** A program's canvas lit on the screen (docs/media.md "Programs on the screen"). */
  showFeed(feed: THREE.Texture): ScreenFeed {
    return this.surface.showFeed(feed);
  }
}
