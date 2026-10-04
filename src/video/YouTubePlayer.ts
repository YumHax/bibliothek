import { channelVolume } from '@/audio/audioContext';

const YOUTUBE_ORIGIN = 'https://www.youtube.com';
/** The sound comes up over this long once the picture runs (it autoplays muted, is unmuted at 0 when ready, ramped from the first frame). */
const RAMP_IN_MS = 1200;
/** Steps of a fade out (ms between two volume commands). */
const FADE_STEP_MS = 30;
/** The IFrame API's player states and the events it posts. */
const STATE_ENDED = 0;
const STATE_PLAYING = 1;
const STATE_BUFFERING = 3;

/** What the embed tells its owner. */
interface YouTubeEvents {
  /** The picture is running (first frame, or again after buffering). */
  onPlaying?(): void;
  /** The picture stalled to buffer (YouTube would show its spinner): the owner may cover it. */
  onBuffering?(): void;
  /** The video reached its end: the owner cuts away before YouTube's end screen. */
  onEnded?(): void;
  /** The embed refused the video: 2 bad id, 5 player error, 100 removed, 101 / 150 embedding disabled. */
  onError?(code: number): void;
}

/**
 * A YouTube embed driven through the IFrame API's postMessage protocol (no key needed):
 * after the iframe loads we send `listening`, the player answers `onReady`, and from then on
 * commands such as `setVolume` are accepted. It autoplays muted (always allowed), then is
 * unmuted at volume 0 and ramped in. Owns the iframe element; place it wherever.
 */
export class YouTubePlayer {
  readonly element: HTMLIFrameElement;

  private ready = false;
  /** Last volume (0–100) sent to the player; -1 until the player is ready. */
  private sentVolume = -1;
  /** Last volume asked for, before the ramp and the fade. */
  private wanted = 0;
  /** When the sound's ramp began (`performance.now`): the first PLAYING, or `startSound`; 0 before. */
  private soundAt = 0;
  /** 1 normally, falling to 0 during `fadeOut`. */
  private fade = 1;
  private fadeTimer: ReturnType<typeof setInterval> | null = null;
  private lastState = -1;

  constructor(width: number, height: number, private readonly events: YouTubeEvents = {}) {
    this.element = document.createElement('iframe');
    this.element.width = String(width);
    this.element.height = String(height);
    this.element.allow = 'autoplay; encrypted-media; fullscreen';
    this.element.referrerPolicy = 'strict-origin-when-cross-origin';
    this.element.style.border = '0';
    this.element.style.background = '#000';
    this.element.addEventListener('load', () => {
      this.post({ event: 'listening' });
      this.listen();
    });
    window.addEventListener('message', this.onMessage);
  }

  get isReady(): boolean {
    return this.ready;
  }

  /** Autoplays `videoId` from `startSeconds`, muted, without controls or branding. */
  load(videoId: string, startSeconds: number): void {
    const params = new URLSearchParams({
      autoplay: '1',
      mute: '1',
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

  /**
   * Lowers the volume to nothing over `seconds`, then unloads and calls `done`. A `load` or
   * `unload` meanwhile cancels it (and `done` is not called).
   */
  fadeOut(seconds: number, done: () => void): void {
    this.stopFade();
    if (!this.ready) {
      this.unload();
      done();
      return;
    }
    const from = this.fade;
    const started = performance.now();
    this.fadeTimer = setInterval(() => {
      const t = (performance.now() - started) / (seconds * 1000);
      this.fade = from * Math.max(0, 1 - t);
      this.send();
      if (t < 1) return;
      this.unload();
      done();
    }, FADE_STEP_MS);
  }

  /**
   * Starts the volume ramp now if it has not begun (the owner shows the picture without a word from
   * the player); normally the first PLAYING starts it, so the sound never comes up over the static.
   */
  startSound(): void {
    if (this.soundAt) return;
    this.soundAt = performance.now();
    this.send();
  }

  /** 0–100, scaled by the mixer's screens channel. Ignored until the player is ready; only sent when the rounded value changes. */
  setVolume(volume: number): void {
    this.wanted = volume;
    this.send();
  }

  dispose(): void {
    window.removeEventListener('message', this.onMessage);
    this.unload();
  }

  /** The asked volume, ramped in after ready and faded out on the way off. */
  private send(): void {
    if (!this.ready) return;
    const ramp = this.soundAt ? Math.min(1, (performance.now() - this.soundAt) / RAMP_IN_MS) : 0;
    const v = Math.round(Math.min(100, Math.max(0, this.wanted * channelVolume('screens') * ramp * ramp * this.fade)));
    if (v === this.sentVolume) return;
    this.sentVolume = v;
    this.post({ event: 'command', func: 'setVolume', args: [v] });
  }

  private reset(): void {
    this.stopFade();
    this.ready = false;
    this.sentVolume = -1;
    this.soundAt = 0;
    this.fade = 1;
    this.lastState = -1;
  }

  private stopFade(): void {
    if (this.fadeTimer !== null) clearInterval(this.fadeTimer);
    this.fadeTimer = null;
  }

  private post(message: Record<string, unknown>): void {
    this.element.contentWindow?.postMessage(JSON.stringify(message), YOUTUBE_ORIGIN);
  }

  /** Asks the player to post its state changes and errors (sent on load and again once ready). */
  private listen(): void {
    for (const name of ['onStateChange', 'onError']) this.post({ event: 'command', func: 'addEventListener', args: [name] });
  }

  private onMessage = (e: MessageEvent): void => {
    if (e.origin !== YOUTUBE_ORIGIN || e.source !== this.element.contentWindow || typeof e.data !== 'string') return;
    let data: { event?: string; info?: unknown };
    try {
      data = JSON.parse(e.data);
    } catch {
      return;
    }
    if (data.event === 'onReady') {
      this.ready = true;
      this.sentVolume = -1; // the first setVolume after ready must always go out
      this.listen();
      this.send();
      this.post({ event: 'command', func: 'unMute', args: [] });
    } else if (data.event === 'onStateChange' && typeof data.info === 'number') {
      this.onState(data.info);
    } else if (data.event === 'infoDelivery' && typeof data.info === 'object' && data.info !== null) {
      const state = (data.info as { playerState?: unknown }).playerState;
      if (typeof state === 'number') this.onState(state);
    } else if (data.event === 'onError') {
      this.events.onError?.(typeof data.info === 'number' ? data.info : -1);
    }
  };

  private onState(state: number): void {
    if (state === this.lastState) return;
    this.lastState = state;
    if (state === STATE_PLAYING) {
      this.startSound();
      this.events.onPlaying?.();
    }
    else if (state === STATE_BUFFERING) this.events.onBuffering?.();
    else if (state === STATE_ENDED) this.events.onEnded?.();
  }
}
