import * as THREE from 'three';
import { CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { CssLayer } from '@/core/CssLayer';
import type { VideoInfo } from '@/video/VideoProvider';
import { YouTubePlayer } from '@/video/YouTubePlayer';
import { randomStartSeconds } from '@/video/randomStart';
import { facingGain, loudness, type HearingProfile } from '@/audio/hearing';
import type { SoundOcclusion } from '../acoustics/SoundOcclusion';
import { stereoPan } from '@/audio/spatial';
import { RENDER_ORDER } from '../surface/layers';
import type { ScreenFeed, ScreenState, ScreenStateListener } from './VideoScreen';
import { SignalCanvas, type SignalLook } from './SignalCanvas';
import { nowPlaying } from './nowPlaying';
import { additiveOne } from '@/world/materials/blend';

/** Pixel size of the embedded player; 4:3 like the longplays of the consoles on the shelves. */
const SURFACE_PX_W = 640;
const SURFACE_PX_H = 480;

/** A feed's picture is shown as painted (no slate tint). */
const WHITE = new THREE.Color(0xffffff);
/** A switched-off tube: dark grey-green glass, not black. */
const IDLE_GLASS = '#1a1f1c';
/** Switching off, the sound fades over this long before the video is let go (the tube collapses meanwhile). */
const POWER_OFF_SECONDS = 0.3;
/**
 * The static stays until the video reports its first frame, or this long after the player is loaded
 * if the player at least answered (some embeds never post their state).
 */
const REVEAL_FALLBACK_MS = 6000;
/** A stall to buffer longer than this covers the picture with the static (YouTube's spinner is never seen). */
const BUFFER_COVER_MS = 500;
/** "No signal" hisses this long, then the set switches itself off. */
const NO_SIGNAL_SLEEP_MS = 8000;
/** An embed that has not answered at all this long after loading is given up: "no signal". */
const EMBED_TIMEOUT_MS = 15000;

interface VideoSurfaceOptions {
  /** Physical width of the picture (metres); the height follows the 4:3 iframe. */
  width: number;
  /** Object whose distance and facing drive the volume (the camera). Omit for a fixed volume. */
  listener?: THREE.Object3D;
  /** Counts the walls between the listener and the picture; each damps the volume. Omit to hear through walls. */
  occlusion?: SoundOcclusion;
  volume?: HearingProfile;
  /** Ceiling of the video volume, 0..1: a small television speaker is quieter than a projector's sound system. */
  gain?: number;
  /**
   * What the surface shows while off: a dark `glass` (a switched-off CRT) or `nothing`
   * (a projector throws no light, so the bare wall shows through).
   */
  idle?: 'glass' | 'nothing';
  /**
   * How it shows that there is no picture yet (searching, waiting for the first frame, nothing
   * found): a tuner's `snow` on lit glass, or a projector's blue `slate`, added as light on the wall.
   */
  signal?: SignalLook;
}

/**
 * The picture area shared by every screen in the room: a plane that is either glass showing a
 * no-picture look (off: dark glass; searching / error: static or a source slate, see `SignalCanvas`)
 * or a cut-out in the WebGL canvas revealing a YouTube iframe positioned in the CSS3D layer at
 * exactly the same spot (playing, once the first frame runs). Technical reasons stay in the console.
 * Local +z is the viewing side; add it where the picture should be and call `update(dt)` every frame.
 * The screen holding it forwards its zone's `setZoneActive` and its `dispose`.
 */
export class VideoSurface extends THREE.Object3D {
  readonly width: number;
  readonly height: number;
  /** The visible plane; hand it to an `Interactable` as a hitbox. */
  readonly glass: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial | THREE.MeshBasicMaterial>;

  private _state: ScreenState = 'off';
  private readonly cutout: THREE.Mesh;
  private readonly player: YouTubePlayer;
  private readonly cssObject: CSS3DObject;
  private readonly idle: 'glass' | 'nothing';
  private readonly signal: SignalCanvas;
  private readonly volume: HearingProfile;
  private readonly gain: number;
  private readonly listener?: THREE.Object3D;
  private readonly occlusion?: SoundOcclusion;
  private _loudness = 0;
  /** The video `play()` put on and when, kept while the zone is dormant to reload it where it would be. */
  private showing: { video: VideoInfo; startSeconds: number; since: number; onRejected?: (videoId: string) => void } | null = null;
  /** When the loaded video is shown even without a word from the player (ms, `performance.now`); 0 once shown. */
  private revealBy = 0;
  /** When a loaded embed that never answered is given up (ms, `performance.now`); 0 once it answered or shown. */
  private giveUpBy = 0;
  /** When a stall to buffer covers the picture with the static again (ms, `performance.now`); 0 while it runs. */
  private coverBy = 0;
  /** When "no signal" gives up and the set goes off by itself (ms, `performance.now`); 0 otherwise. */
  private sleepBy = 0;
  private _pan = 0;
  private searchTitle = '';
  private _walls = 0;
  /** Bumped by every load and stop: a fade out finishing after the set came back on does nothing. */
  private generation = 0;
  /** False while the zone holding the screen is dormant (see `setZoneActive`). */
  private zoneActive = true;
  /** A picture painted in the page (`showFeed`: a program's canvas) on the glass instead of the iframe; null otherwise. */
  private feed: THREE.Texture | null = null;
  /** Bumped by every `showFeed`: a handle from an earlier one is stale. */
  private feedToken = 0;
  /** The slate's tint, put back once a feed (shown untinted) is off. */
  private readonly slateTint = new THREE.Color();
  private readonly stateListeners = new Set<ScreenStateListener>();
  private readonly dropSource: () => void;
  private readonly worldPos = new THREE.Vector3();
  private readonly worldQuat = new THREE.Quaternion();
  private readonly listenerPos = new THREE.Vector3();
  private readonly listenerForward = new THREE.Vector3();
  private readonly toScreen = new THREE.Vector3();

  constructor(
    private readonly cssLayer: CssLayer,
    options: VideoSurfaceOptions,
  ) {
    super();
    this.name = 'VideoSurface';
    this.width = options.width;
    this.height = (options.width * SURFACE_PX_H) / SURFACE_PX_W;
    this.listener = options.listener;
    this.occlusion = options.occlusion;
    this.volume = options.volume ?? {};
    this.gain = Math.min(1, Math.max(0, options.gain ?? 1));
    this.idle = options.idle ?? 'glass';
    const look = options.signal ?? 'snow';
    this.signal = new SignalCanvas(look, IDLE_GLASS);

    const geometry = new THREE.PlaneGeometry(this.width, this.height);
    this.glass = new THREE.Mesh(geometry, look === 'slate' ? slateMaterial(this.signal.texture) : glassMaterial(this.signal.texture));
    if (look === 'slate') this.glass.renderOrder = RENDER_ORDER.sheen;
    this.cutout = new THREE.Mesh(geometry, CssLayer.createCutoutMaterial());
    this.cutout.visible = false;
    this.add(this.glass, this.cutout);

    this.player = new YouTubePlayer(SURFACE_PX_W, SURFACE_PX_H, {
      onPlaying: () => {
        this.coverBy = 0; // a short stall that ran again before the cover: the picture stays
        this.reveal();
      },
      onBuffering: () => {
        if (this.cutout.visible) this.coverBy = performance.now() + BUFFER_COVER_MS;
      },
      onEnded: () => this.ended(),
      onError: (code) => this.rejected(code),
    });
    this.cssObject = new CSS3DObject(this.player.element);
    this.cssObject.scale.setScalar(this.width / SURFACE_PX_W);
    this.cssObject.visible = false;
    this.cssLayer.scene.add(this.cssObject);
    this.slateTint.copy(this.glass.material.color);
    this.dropSource = nowPlaying.addSource(() => (this._state === 'playing' && (this.cutout.visible || this.feed) ? this._loudness : 0));

    this.showSignal();
  }

  get state(): ScreenState {
    return this._state;
  }

  get isPlaying(): boolean {
    return this._state === 'playing';
  }

  /** Where the listener hears the set, 0..1 (0 while off): the video's volume, or the static's while there is no picture. */
  get loudness(): number {
    return this._loudness;
  }

  /** Where the set is heard from, for its speaker's bed: -1 left .. 1 right, and the walls between (updated while on). */
  get pan(): number {
    return this._pan;
  }

  get walls(): number {
    return this._walls;
  }

  /** Called whenever the state changes (off / searching / playing / error). Returns an unsubscribe function. */
  onStateChange(listener: ScreenStateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  /** A longplay was found and is loading: the static stays until its first frame. */
  get tuning(): boolean {
    return this._state === 'playing' && !this.cutout.visible;
  }

  /** The game whose longplay is being looked for, while `searching` (for the hover caption); null otherwise. */
  get searchingFor(): string | null {
    return this._state === 'searching' ? this.searchTitle : null;
  }

  searching(title: string): void {
    console.info(`[video] searching a longplay of ${title}`);
    this.cancelPicture();
    this.searchTitle = title;
    this.setState('searching');
    this.showSignal();
  }

  play(video: VideoInfo, startSeconds: number, onRejected?: (videoId: string) => void): void {
    this.cancelPicture();
    this.feed = null;
    this.setState('playing');
    this.showing = { video, startSeconds, since: performance.now(), onRejected };
    this.showSignal(); // static until the first frame
    if (this.zoneActive) this.load();
  }

  /**
   * A picture painted in the page (a `ScreenProgram`'s canvas, docs/media.md "Programs on the screen") lit on the
   * glass, as `playing`, until `stop` or anything else is shown. The handle tells the program where the set is heard.
   */
  showFeed(feed: THREE.Texture): ScreenFeed {
    this.cancelPicture();
    this.showing = null;
    this.setState('playing');
    this.feed = feed;
    const token = ++this.feedToken;
    this.showSignal();
    const live = (): boolean => this.feedToken === token && this.feed !== null;
    const surface = this; // the handle's getters read it live
    return {
      get loudness() {
        return live() ? surface._loudness : 0;
      },
      get pan() {
        return surface._pan;
      },
      get zoneActive() {
        return surface.zoneActive;
      },
      get live() {
        return live();
      },
      stop: () => {
        if (live()) this.stop();
      },
    };
  }

  fail(message: string): void {
    console.info(`[video] no signal: ${message}`);
    this.cancelPicture();
    this.setState('error');
    this.showSignal();
    this.sleepBy = performance.now() + NO_SIGNAL_SLEEP_MS;
  }

  /** Off: the sound fades out over `POWER_OFF_SECONDS` (the picture stays for the tube's collapse), then the video goes. */
  stop(): void {
    const fading = this.cssObject.visible;
    this.setState('off');
    const generation = ++this.generation;
    const off = (): void => {
      if (generation !== this.generation) return;
      this.cssObject.visible = false;
      this.cutout.visible = false;
      this._loudness = 0;
      this.showSignal();
    };
    if (fading) this.player.fadeOut(POWER_OFF_SECONDS, off);
    else {
      this.player.unload();
      off();
    }
  }

  /**
   * `ActivityAware` (forwarded by the screen holding it): a dormant zone is not ticked, so the
   * volume could no longer follow the listener; the iframe is let go (silent, no decoding behind
   * the walls) and the screen stays `playing`. Back in the loop, the video is reloaded where it
   * would be had it played on meanwhile, like a set left on in an empty room.
   */
  setZoneActive(active: boolean): void {
    if (active === this.zoneActive) return;
    this.zoneActive = active;
    if (!active) {
      if (this.cssObject.visible) this.cancelPicture();
      if (this.showing) this.showSignal();
    } else if (this.showing) this.load();
  }

  /** Stops the video for good and takes the iframe out of the page. The surface is unusable afterwards. */
  dispose(): void {
    this.setState('off');
    this.cancelPicture();
    this.stateListeners.clear();
    this.dropSource();
    this.player.dispose();
    this.signal.dispose();
    this.cssLayer.scene.remove(this.cssObject);
  }

  /** Loads the video showing into the iframe, where it has got to since `play()`; the static stays until it runs. */
  private load(): void {
    if (!this.showing) return;
    const { video, startSeconds, since } = this.showing;
    const elapsed = startSeconds + (performance.now() - since) / 1000;
    this.generation++;
    this.player.load(video.videoId, video.durationSeconds > 0 ? elapsed % video.durationSeconds : elapsed);
    this.cssObject.visible = true; // behind the lit glass until revealed: the iframe loads, nobody sees it
    this.revealBy = performance.now() + REVEAL_FALLBACK_MS;
    this.giveUpBy = performance.now() + EMBED_TIMEOUT_MS;
  }

  /** The first frame runs: the glass gives way to the cut-out. */
  private reveal(): void {
    if (this._state !== 'playing' || !this.cssObject.visible || this.cutout.visible) return;
    this.revealBy = 0;
    this.giveUpBy = 0;
    this.coverBy = 0;
    this.cutout.visible = true;
    this.glass.visible = false;
    this.player.startSound(); // no-op when the first PLAYING already started it
  }

  /** The longplay ran out: cut to static and off rather than show YouTube's end screen. */
  private ended(): void {
    if (this._state !== 'playing') return;
    console.info('[video] longplay ended');
    this.stop();
  }

  /** The embed refused the video: the next hit of the search, or "no signal". */
  private rejected(code: number): void {
    const showing = this.showing;
    if (this._state !== 'playing' || !showing) return;
    console.warn(`[video] embed refused ${showing.video.videoId} (error ${code})`);
    showing.onRejected?.(showing.video.videoId);
    const [next, ...rest] = showing.video.fallbacks ?? [];
    if (next) this.play({ ...next, fallbacks: rest }, randomStartSeconds(next.durationSeconds), showing.onRejected);
    else this.fail('every search hit refused to embed');
  }

  /** Empties the iframe and hides it at once; the glass comes back. */
  private cancelPicture(): void {
    this.generation++;
    this.player.unload();
    this.cssObject.visible = false;
    this.cutout.visible = false;
    this.revealBy = 0;
    this.giveUpBy = 0;
    this.coverBy = 0;
    this._loudness = 0;
  }

  /** The glass shows what the state calls for (dark while off, static or a slate otherwise). */
  private showSignal(): void {
    const material = this.glass.material;
    // A feed (a program's canvas) is the picture itself, lit and untinted.
    const map = this.feed ?? this.signal.texture;
    if (material.map !== map) {
      material.map = map;
      if (material instanceof THREE.MeshStandardMaterial) material.emissiveMap = map;
      material.color.copy(this.feed ? WHITE : this.slateTint);
    }
    if (this.feed) {
      this.glass.visible = true;
      if (material instanceof THREE.MeshStandardMaterial) material.emissive.setHex(0xffffff);
      return;
    }
    const scene = this._state === 'off' ? 'idle' : this._state === 'error' ? 'nosignal' : 'search';
    if (scene !== this.signal.current) this.signal.show(scene);
    this.glass.visible = scene !== 'idle' || this.idle === 'glass';
    if (material instanceof THREE.MeshStandardMaterial) material.emissive.setHex(scene === 'idle' ? 0x000000 : 0xffffff);
  }

  /** Keeps the iframe glued to the plane (even if the screen is moved), follows the listener for volume, animates the static. */
  update(dt: number): void {
    this.signal.update(dt);
    const now = performance.now();
    if (this.revealBy && now > this.revealBy && this.player.isReady) this.reveal();
    else if (this.giveUpBy && now > this.giveUpBy && !this.player.isReady && this._state === 'playing') this.fail('embed never answered');
    // Still stalled half a second on: the static covers YouTube's spinner until the picture runs again.
    if (this.coverBy && now > this.coverBy) {
      this.coverBy = 0;
      if (this._state === 'playing' && this.cutout.visible) {
        this.cutout.visible = false;
        this.showSignal();
      }
    }
    // "No signal" for a while: the set gives up and goes dark (a set left hissing all evening does not).
    if (this.sleepBy && now > this.sleepBy) {
      this.sleepBy = 0;
      if (this._state === 'error') this.stop();
    }
    if (this._state === 'off') return;
    this.getWorldPosition(this.worldPos);
    this.getWorldQuaternion(this.worldQuat);
    if (this.cssObject.visible) {
      this.cssObject.position.copy(this.worldPos);
      this.cssObject.quaternion.copy(this.worldQuat);
    }
    this.updateVolume();
  }

  private setState(next: ScreenState): void {
    if (next === this._state) return;
    this._state = next;
    if (next !== 'error') this.sleepBy = 0;
    if (next !== 'playing') {
      this.showing = null;
      this.feed = null;
    }
    if (next === 'off') this._loudness = 0;
    for (const listener of this.stateListeners) listener(next);
  }

  /** Volume from the listener's distance to the picture, whether they face it or turn away, and the walls in between. */
  private updateVolume(): void {
    if (!this.listener) {
      this._loudness = this.gain;
      if (this.cssObject.visible) this.player.setVolume(this.cutout.visible ? this.gain * 100 : 0);
      return;
    }
    this.listener.getWorldPosition(this.listenerPos);
    this.listener.getWorldDirection(this.listenerForward);
    this.toScreen.subVectors(this.worldPos, this.listenerPos);
    const distance = this.toScreen.length();
    const walls = this.occlusion?.wallsBetween(this.listenerPos, this.worldPos) ?? 0;
    this._walls = walls;
    this._pan = stereoPan(this.listener, this.worldPos);
    // Horizontal facing only: looking up or down should not change the loudness.
    this.listenerForward.y = 0;
    this.toScreen.y = 0;
    const facing =
      this.listenerForward.lengthSq() && this.toScreen.lengthSq()
        ? this.listenerForward.normalize().dot(this.toScreen.normalize())
        : 1;
    // The player takes a whole percent (0..100); the loudness is kept as it was handed to it.
    const volume = Math.round(loudness(distance, this.volume, walls) * facingGain(facing, this.volume.rearGain) * 100) * this.gain;
    this._loudness = volume / 100;
    // Silent behind the static: the sound comes in with the picture.
    if (this.cssObject.visible) this.player.setVolume(this.cutout.visible ? volume : 0);
  }
}

/** A tube's glass: the idle grey-green or the lit static, glossy enough for the room's sheen to read. */
function glassMaterial(map: THREE.Texture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0xffffff, map, emissiveMap: map, emissive: 0x000000, emissiveIntensity: 0.8, roughness: 0.12, metalness: 0 });
}

/**
 * A projection is light added to the wall, never paint over it: additive, so its black adds
 * nothing (the wall shows through) and the canvas's alpha is left alone (docs/graphics.md, the cut-out).
 */
function slateMaterial(map: THREE.Texture): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ map, color: 0xb8c4dc, transparent: true, depthWrite: false, fog: false });
  additiveOne(material);
  return material;
}
