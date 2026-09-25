import { channelVolume } from '@/audio/audioContext';

const YOUTUBE_ORIGIN = 'https://www.youtube.com';

/**
 * A YouTube embed driven through the IFrame API's postMessage protocol (no key needed):
 * after the iframe loads we send `listening`, the player answers `onReady`, and from then on
 * commands such as `setVolume` are accepted. Owns the iframe element; place it wherever.
 */
export class YouTubePlayer {
  readonly element: HTMLIFrameElement;

  private ready = false;
  /** Last volume (0–100) sent to the player; -1 until the player is ready. */
  private sentVolume = -1;

  constructor(width: number, height: number) {
    this.element = document.createElement('iframe');
    this.element.width = String(width);
    this.element.height = String(height);
    this.element.allow = 'autoplay; encrypted-media; fullscreen';
    this.element.referrerPolicy = 'strict-origin-when-cross-origin';
    this.element.style.border = '0';
    this.element.style.background = '#000';
    this.element.addEventListener('load', () => this.post({ event: 'listening' }));
    window.addEventListener('message', this.onMessage);
  }

  get isReady(): boolean {
    return this.ready;
  }

  /** Autoplays `videoId` from `startSeconds`, without controls or branding. */
  load(videoId: string, startSeconds: number): void {
    const params = new URLSearchParams({
      autoplay: '1',
      start: String(Math.max(0, Math.floor(startSeconds))),
      controls: '0',
      rel: '0',
      modestbranding: '1',
      playsinline: '1',
      iv_load_policy: '3',
      disablekb: '1',
      enablejsapi: '1',
      origin: window.location.origin,
    });
    this.reset();
    this.element.src = `${YOUTUBE_ORIGIN}/embed/${videoId}?${params}`;
  }

  unload(): void {
    this.reset();
    this.element.src = 'about:blank';
  }

  /** 0–100, scaled by the mixer's screens channel. Ignored until the player is ready; only sent when the rounded value changes. */
  setVolume(volume: number): void {
    const v = Math.round(Math.min(100, Math.max(0, volume * channelVolume('screens'))));
    if (!this.ready || v === this.sentVolume) return;
    this.sentVolume = v;
    this.post({ event: 'command', func: 'setVolume', args: [v] });
  }

  dispose(): void {
    window.removeEventListener('message', this.onMessage);
    this.unload();
  }

  private reset(): void {
    this.ready = false;
    this.sentVolume = -1;
  }

  private post(message: Record<string, unknown>): void {
    this.element.contentWindow?.postMessage(JSON.stringify(message), YOUTUBE_ORIGIN);
  }

  private onMessage = (e: MessageEvent): void => {
    if (e.origin !== YOUTUBE_ORIGIN || e.source !== this.element.contentWindow || typeof e.data !== 'string') return;
    let data: { event?: string };
    try {
      data = JSON.parse(e.data);
    } catch {
      return;
    }
    if (data.event === 'onReady') {
      this.ready = true;
      this.sentVolume = -1; // the first setVolume after ready must always go out
    }
  };
}
