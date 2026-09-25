import * as THREE from 'three';
import { CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { CssLayer } from '@/core/CssLayer';
import type { VideoInfo } from '@/video/VideoProvider';
import { YouTubePlayer } from '@/video/YouTubePlayer';
import { proximityVolume, type ProximityVolumeOptions } from '@/video/proximityVolume';
import type { SoundOcclusion } from '../acoustics/SoundOcclusion';
import { createCanvas, toTexture, FONT } from '@/covers/generated/canvasUtils';
import type { ScreenState, ScreenStateListener } from './VideoScreen';

/** Pixel size of the embedded player; 4:3 like the longplays of the consoles on the shelves. */
export const SURFACE_PX_W = 640;
export const SURFACE_PX_H = 480;

export interface VideoSurfaceOptions {
  /** Physical width of the picture (metres); the height follows the 4:3 iframe. */
  width: number;
  /** Object whose distance and facing drive the volume (the camera). Omit for a fixed volume. */
  listener?: THREE.Object3D;
  /** Counts the walls between the listener and the picture; each damps the volume. Omit to hear through walls. */
  occlusion?: SoundOcclusion;
  volume?: ProximityVolumeOptions;
  /** Ceiling of the video volume, 0..1: a small television speaker is quieter than a projector's sound system. */
  gain?: number;
  /**
   * What the surface shows while off: a dark `glass` (a switched-off CRT) or `nothing`
   * (a projector throws no light, so the bare wall shows through).
   */
  idle?: 'glass' | 'nothing';
  /** Colours of the message drawn while searching or on error. */
  message?: { background: string; ink: string };
}

/**
 * The picture area shared by every screen in the room: a plane that is either dark glass
 * showing a text message (off / searching / error) or a cut-out in the WebGL canvas revealing a
 * YouTube iframe positioned in the CSS3D layer at exactly the same spot (playing).
 * Local +z is the viewing side; add it where the picture should be and call `update()` every frame.
 * The screen holding it forwards its zone's `setZoneActive` and its `dispose`.
 */
export class VideoSurface extends THREE.Object3D {
  readonly width: number;
  readonly height: number;
  /** The visible plane; hand it to an `Interactable` as a hitbox. */
  readonly glass: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;

  private _state: ScreenState = 'off';
  private readonly cutout: THREE.Mesh;
  private readonly player = new YouTubePlayer(SURFACE_PX_W, SURFACE_PX_H);
  private readonly cssObject: CSS3DObject;
  private readonly idle: 'glass' | 'nothing';
  private readonly messageColors: { background: string; ink: string };
  private readonly volume: ProximityVolumeOptions;
  private readonly gain: number;
  private readonly listener?: THREE.Object3D;
  private readonly occlusion?: SoundOcclusion;
  private _loudness = 0;
  /** The video `play()` put on and when, kept while the zone is dormant to reload it where it would be. */
  private showing: { video: VideoInfo; startSeconds: number; since: number } | null = null;
  /** False while the zone holding the screen is dormant (see `setZoneActive`). */
  private zoneActive = true;
  private readonly stateListeners = new Set<ScreenStateListener>();
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
    this.messageColors = options.message ?? { background: '#050608', ink: '#9ad4a8' };

    const geometry = new THREE.PlaneGeometry(this.width, this.height);
    this.glass = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.2, metalness: 0.1 }));
    this.cutout = new THREE.Mesh(geometry, CssLayer.createCutoutMaterial());
    this.cutout.visible = false;
    this.add(this.glass, this.cutout);

    this.cssObject = new CSS3DObject(this.player.element);
    this.cssObject.scale.setScalar(this.width / SURFACE_PX_W);
    this.cssObject.visible = false;
    this.cssLayer.scene.add(this.cssObject);

    this.showMessage('');
  }

  get state(): ScreenState {
    return this._state;
  }

  get isPlaying(): boolean {
    return this._state === 'playing';
  }

  /** Current volume of the video, 0..1 (0 while not playing): what the listener hears from where they stand. */
  get loudness(): number {
    return this._loudness;
  }

  /** Called whenever the state changes (off / searching / playing / error). Returns an unsubscribe function. */
  onStateChange(listener: ScreenStateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  searching(title: string): void {
    this.setState('searching');
    this.showMessage(`Searching a longplay of\n${title}…`);
  }

  play(video: VideoInfo, startSeconds: number): void {
    this.setState('playing');
    this.showing = { video, startSeconds, since: performance.now() };
    this.cutout.visible = true;
    this.glass.visible = false;
    if (this.zoneActive) this.load();
  }

  fail(message: string): void {
    this.setState('error');
    this.showMessage(message);
  }

  stop(): void {
    this.setState('off');
    this.letGo();
    this.cutout.visible = false;
    this.showMessage('');
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
      if (this.cssObject.visible) this.letGo();
    } else if (this.showing) this.load();
  }

  /** Stops the video for good and takes the iframe out of the page. The surface is unusable afterwards. */
  dispose(): void {
    this.stop();
    this.stateListeners.clear();
    this.player.dispose();
    this.cssLayer.scene.remove(this.cssObject);
  }

  /** Loads the video showing into the iframe, where it has got to since `play()`. */
  private load(): void {
    if (!this.showing) return;
    const { video, startSeconds, since } = this.showing;
    const elapsed = startSeconds + (performance.now() - since) / 1000;
    this.player.load(video.videoId, video.durationSeconds > 0 ? elapsed % video.durationSeconds : elapsed);
    this.cssObject.visible = true;
  }

  /** Empties the iframe and hides it; the picture area keeps its look. */
  private letGo(): void {
    this.player.unload();
    this.cssObject.visible = false;
    this._loudness = 0;
  }

  /** Keeps the iframe glued to the plane (even if the screen is moved) and follows the listener for volume. */
  update(): void {
    if (!this.cssObject.visible) return;
    this.getWorldPosition(this.worldPos);
    this.getWorldQuaternion(this.worldQuat);
    this.cssObject.position.copy(this.worldPos);
    this.cssObject.quaternion.copy(this.worldQuat);
    this.updateVolume();
  }

  private setState(next: ScreenState): void {
    if (next === this._state) return;
    this._state = next;
    if (next !== 'playing') {
      this._loudness = 0;
      this.showing = null;
    }
    for (const listener of this.stateListeners) listener(next);
  }

  /** Volume from the listener's distance to the picture, whether they face it or turn away, and the walls in between. */
  private updateVolume(): void {
    if (!this.listener || this._state !== 'playing') return;
    this.listener.getWorldPosition(this.listenerPos);
    this.listener.getWorldDirection(this.listenerForward);
    this.toScreen.subVectors(this.worldPos, this.listenerPos);
    const distance = this.toScreen.length();
    const walls = this.occlusion?.wallsBetween(this.listenerPos, this.worldPos) ?? 0;
    // Horizontal facing only: looking up or down should not change the loudness.
    this.listenerForward.y = 0;
    this.toScreen.y = 0;
    const facing =
      this.listenerForward.lengthSq() && this.toScreen.lengthSq()
        ? this.listenerForward.normalize().dot(this.toScreen.normalize())
        : 1;
    const volume = proximityVolume(distance, { ...this.volume, facing, walls }) * this.gain;
    this._loudness = volume / 100;
    this.player.setVolume(volume);
  }

  /** Draws a message on the dark plane (off / searching / error). An empty text shows the idle look. */
  private showMessage(text: string): void {
    this.glass.visible = Boolean(text) || this.idle === 'glass';
    const [canvas, ctx] = createCanvas(SURFACE_PX_W, SURFACE_PX_H);
    ctx.fillStyle = this.messageColors.background;
    ctx.fillRect(0, 0, SURFACE_PX_W, SURFACE_PX_H);
    if (text) {
      ctx.fillStyle = this.messageColors.ink;
      ctx.font = `bold 30px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lines = text.split('\n');
      lines.forEach((line, i) => ctx.fillText(line, SURFACE_PX_W / 2, SURFACE_PX_H / 2 + (i - (lines.length - 1) / 2) * 42));
    }
    const previous = this.glass.material.map;
    const tex = toTexture(canvas);
    this.glass.material.map = tex;
    this.glass.material.emissiveMap = tex;
    this.glass.material.emissive.setHex(text ? 0xffffff : 0x000000);
    this.glass.material.emissiveIntensity = 0.8;
    this.glass.material.needsUpdate = true;
    previous?.dispose();
  }
}
