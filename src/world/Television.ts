import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { CssLayer } from '@/core/CssLayer';
import type { Interactable, LabelPlacement } from '@/interaction/Interactable';
import type { PlayerState, SessionActions } from '@/game/SessionActions';
import type { VideoInfo } from '@/video/VideoProvider';
import { CrtSpeaker } from '@/audio/CrtSpeaker';
import type { ActivityAware, Furniture } from './Furniture';
import { boxMesh } from './meshUtils';
import type { SoundOcclusion } from './acoustics/SoundOcclusion';
import { VideoSurface, type ScreenState, type ScreenStateListener, type VideoScreen } from './screen';
import { CrtGlass } from './screen/CrtGlass';
import { QUALITY } from '@/graphics/quality';
import { wood as woodMaterial } from '@/world/materials/finishes';

/** Height of the built-in cabinet the CRT sits on when nothing else carries it (see `mountOn`). */
const OWN_CABINET_HEIGHT = 0.55;
/** Screen glow: bluish light thrown into the room while a video plays. */
const GLOW_COLOR = 0xa9c7ff;
const GLOW_PLAYING = 3;
const GLOW_MESSAGE = 0.7;
/** The same glow as a soft panel the size of the picture (`QUALITY.areaLights`), per unit of point-light glow. */
const PANEL_PER_GLOW = 1.4;
/**
 * The picture's light is not one colour: without access to the video's pixels (a cross-origin
 * iframe), the glow drifts between the hues a longplay is made of, a new one every few seconds.
 */
const GLOW_HUES = [0xa9c7ff, 0xd8e4ff, 0x9fd1b8, 0xffd9b0, 0xb8a9ff, 0xcfe8ff];
const HUE_SECONDS = 3.2;
/** A CRT's little speaker never gets as loud as the projector's sound system. */
const SPEAKER_GAIN = 0.8;

export interface TelevisionOptions {
  /** Object whose distance and facing drive the volume (the camera). */
  listener?: THREE.Object3D;
  /** Walls between the listener and the screen damp the volume (see `SoundOcclusion`). */
  occlusion?: SoundOcclusion;
  /** Width of the picture (m). Default 0.56, a 27" set; a portable is about 0.3. */
  screenWidth?: number;
}

/**
 * A CRT television on a cabinet. The picture is a `VideoSurface` (cut-out over a YouTube
 * iframe) set into the front of the body; the volume follows the `listener` (the camera).
 * A soft point light in front of the glass flickers while playing so the room reads as "TV on",
 * and a `CrtSpeaker` bed (hum, hiss, crackle) makes the sound read as "old TV".
 */
export class Television extends THREE.Group implements Furniture, Updatable, Interactable, VideoScreen, ActivityAware {
  readonly hitboxes: THREE.Object3D[];
  readonly screenName = 'TV';

  private readonly screenWidth: number;
  /** Size of the set, for the collider. */
  private readonly bodySize: THREE.Vector3;
  /** The CRT set itself (body, screen, glow); lifted to whatever it stands on. */
  private readonly crt = new THREE.Group();
  private readonly cabinet: THREE.Mesh;
  private readonly surface: VideoSurface;
  private readonly glow: THREE.PointLight;
  /** The picture as a soft area light (high quality); the point glow then only stands in for its falloff. */
  private readonly panel: THREE.RectAreaLight | null = null;
  private readonly glass: CrtGlass;
  private readonly hueFrom = new THREE.Color(GLOW_HUES[0]);
  private readonly hueTo = new THREE.Color(GLOW_HUES[1]);
  private hueTimer = 0;
  private hueIndex = 1;
  private readonly speaker = new CrtSpeaker();
  private glowTime = 0;
  private readonly bodyMaterial: THREE.MeshStandardMaterial;
  private readonly glowScale: number;

  constructor(cssLayer: CssLayer, { listener, occlusion, screenWidth = 0.56 }: TelevisionOptions = {}) {
    super();
    this.name = 'Television';
    this.screenWidth = screenWidth;
    /** A smaller tube is shallower and throws less light. */
    const scale = screenWidth / 0.56;

    this.cabinet = boxMesh(0.9, OWN_CABINET_HEIGHT, 0.45, woodMaterial(0x3b2a1e, 0.7), {
      y: OWN_CABINET_HEIGHT / 2,
    });

    this.surface = new VideoSurface(cssLayer, {
      width: this.screenWidth,
      listener,
      occlusion,
      idle: 'glass',
      volume: { referenceDistance: 1.5, rolloff: 1.5, maxDistance: 12, rearGain: 0.5 }, // the armchair sits just inside the reference: full volume when seated
      gain: SPEAKER_GAIN,
    });
    this.surface.onStateChange((state) => {
      this.speaker.setOn(state === 'playing');
      this.glass.setPlaying(state === 'playing');
    });

    // CRT body, slightly deeper than the screen. Local y = 0 is the underside of the set.
    const bodyW = this.screenWidth + 0.14 * scale;
    const bodyH = this.surface.height + 0.14 * scale;
    const bodyD = 0.45 * Math.sqrt(scale);
    this.bodySize = new THREE.Vector3(bodyW, bodyH, bodyD);
    this.bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.55 });
    const body = boxMesh(bodyW, bodyH, bodyD, this.bodyMaterial, { y: bodyH / 2, z: -0.02 });
    this.hitboxes = [body];

    // Picture on the front face of the body, facing +z, the tube's glass just in front of it.
    this.surface.position.set(0, body.position.y, body.position.z + bodyD / 2 + 0.002);
    this.glass = new CrtGlass(this.screenWidth, this.surface.height);
    this.glass.position.copy(this.surface.position).add(new THREE.Vector3(0, 0, 0.0015));

    // No shadows: a shadow-casting point light costs six passes and the glow is meant to be soft.
    this.glow = new THREE.PointLight(GLOW_COLOR, 0, 3.5, 2);
    this.glowScale = scale;
    this.glow.position.copy(this.surface.position).add(new THREE.Vector3(0, 0, 0.35));

    this.crt.position.y = OWN_CABINET_HEIGHT;
    this.crt.add(body, this.surface, this.glass, this.glow);
    if (QUALITY.areaLights) {
      this.panel = new THREE.RectAreaLight(GLOW_COLOR, 0, this.screenWidth, this.surface.height);
      this.panel.position.copy(this.surface.position).add(new THREE.Vector3(0, 0, 0.01));
      this.panel.rotation.y = Math.PI; // lights look down their -z: turned to face the room
      this.crt.add(this.panel);
    }
    this.add(this.cabinet, this.crt);
  }

  get state(): ScreenState {
    return this.surface.state;
  }

  get isPlaying(): boolean {
    return this.surface.isPlaying;
  }

  /** Bounding box for collisions (local space): the built-in cabinet and the set on it, or the set alone once mounted. */
  get footprint(): THREE.Box3 {
    const half = Math.max(0.45, this.bodySize.x / 2);
    const top = this.crt.position.y + this.bodySize.y;
    return new THREE.Box3(new THREE.Vector3(-half, 0, -0.25), new THREE.Vector3(half, top, 0.25));
  }

  /**
   * Stands the set on something else (e.g. a console stand) whose top is `height` above the TV's
   * origin: the built-in cabinet disappears and the CRT moves to that height.
   */
  mountOn(height: number): void {
    this.cabinet.visible = false;
    this.crt.position.y = height;
  }

  /** Called whenever the TV changes state (off / searching / playing / error). Returns an unsubscribe function. */
  onStateChange(listener: ScreenStateListener): () => void {
    return this.surface.onStateChange(listener);
  }

  // --- Interactable -------------------------------------------------------------------------

  setHovered(hovered: boolean): void {
    this.bodyMaterial.emissive.setHex(hovered ? 0x1a1a1a : 0x000000);
  }

  label(player: PlayerState): string | null {
    if (player.held) return `Play ${player.held.game.title} on the TV`;
    return this.isPlaying ? 'Click to turn the TV off' : 'TV';
  }

  labelPlacement(): LabelPlacement {
    return this.isPlaying ? 'edge' : 'crosshair';
  }

  activate(session: SessionActions): void {
    const box = session.held;
    if (box) {
      session.putBack();
      void session.playOn(this, box);
    } else if (this.state === 'playing' || this.state === 'error') {
      session.stopScreen(this);
    }
  }

  // --- VideoScreen ----------------------------------------------------------------------------

  searching(title: string): void {
    this.surface.searching(title);
  }

  play(video: VideoInfo, startSeconds: number): void {
    this.surface.play(video, startSeconds);
  }

  fail(message: string): void {
    this.surface.fail(message);
  }

  stop(): void {
    this.surface.stop();
  }

  /** Dormant zone: the picture lets its video go and the speaker's bed falls silent; both come back with the zone. */
  setZoneActive(active: boolean): void {
    this.surface.setZoneActive(active);
    this.speaker.setZoneActive(active);
  }

  /** Zone unload: the iframe leaves the page and the speaker's oscillators stop. */
  dispose(): void {
    this.surface.dispose();
    this.speaker.dispose();
  }

  update(dt: number): void {
    this.updateGlow(dt);
    this.surface.update();
    this.speaker.setLoudness(this.surface.loudness);
    this.speaker.update(dt);
  }

  /** Screen light: a gentle flicker while playing, a steady dim glow while the glass shows a message. */
  private updateGlow(dt: number): void {
    let target = 0;
    if (this.state === 'playing') {
      this.glowTime += dt;
      const t = this.glowTime;
      const flicker = 0.5 * Math.sin(t * 11.3) + 0.3 * Math.sin(t * 6.1) + 0.2 * Math.sin(t * 1.7);
      target = GLOW_PLAYING * this.glowScale * (0.85 + 0.15 * flicker);
    } else if (this.state !== 'off') {
      target = GLOW_MESSAGE * this.glowScale;
    }
    // Ease so switching the set on or off does not pop.
    this.glow.intensity += (target - this.glow.intensity) * Math.min(1, dt * 6);

    // The hue drifts from one to the next while playing; a message glows the plain bluish white.
    if (this.state === 'playing') {
      this.hueTimer += dt;
      if (this.hueTimer >= HUE_SECONDS) {
        this.hueTimer = 0;
        this.hueFrom.copy(this.hueTo);
        this.hueIndex = (this.hueIndex + 1 + Math.floor(Math.random() * (GLOW_HUES.length - 1))) % GLOW_HUES.length;
        this.hueTo.set(GLOW_HUES[this.hueIndex]!);
      }
      this.glow.color.lerpColors(this.hueFrom, this.hueTo, THREE.MathUtils.smoothstep(this.hueTimer / HUE_SECONDS, 0, 0.6));
    } else {
      this.glow.color.set(GLOW_COLOR);
    }
    if (this.panel) {
      this.panel.color.copy(this.glow.color);
      this.panel.intensity = this.glow.intensity * PANEL_PER_GLOW;
    }
  }
}
