import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { CssLayer } from '@/core/CssLayer';
import type { Interactable, LabelPlacement } from '@/interaction/Interactable';
import type { PlayerState, SessionActions } from '@/game/SessionActions';
import type { VideoInfo } from '@/video/VideoProvider';
import type { Furniture } from './Furniture';
import { boxMesh } from './meshUtils';
import type { SoundOcclusion } from './acoustics/SoundOcclusion';
import { VideoSurface, type ScreenState, type ScreenStateListener, type VideoScreen } from './screen';

export interface ProjectorOptions {
  /** Width of the picture on the wall (metres). */
  pictureWidth?: number;
  /** Object whose distance to the picture drives the volume (the camera). */
  listener?: THREE.Object3D;
  /** Walls between the listener and the picture damp the volume (see `SoundOcclusion`). */
  occlusion?: SoundOcclusion;
}

/** Light thrown by the lens: cool white, brightest while a video plays. */
const BEAM_COLOR = 0xdfe8ff;
const BEAM_PLAYING = 22;
const BEAM_MESSAGE = 8;
/** Bounce light in front of the wall so the picture lights the room like the TV does. */
const SPILL_PLAYING = 5;
/** Opacity of the visible light cone while playing (dust in the beam). */
const CONE_OPACITY = 0.05;

/**
 * A projector hung from the ceiling on a short pole, throwing a big picture on a bare wall.
 * Local +z is the throw direction, y = 0 the ceiling. The picture (a `VideoSurface`) is a child
 * placed by `aimAt()` at the wall, so the beam (a spot light and a translucent frustum) follows
 * wherever the projector is placed. Clicking the unit or the lit wall behaves like the TV.
 */
export class Projector extends THREE.Group implements Furniture, Updatable, Interactable, VideoScreen {
  readonly hitboxes: THREE.Object3D[];
  readonly screenName = 'projector';

  private readonly surface: VideoSurface;
  private readonly unitMaterial: THREE.MeshStandardMaterial;
  private readonly lens: THREE.Object3D;
  private readonly beam: THREE.SpotLight;
  private readonly spill: THREE.PointLight;
  private readonly cone: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly standby: THREE.MeshStandardMaterial;
  private beamTime = 0;

  constructor(cssLayer: CssLayer, options: ProjectorOptions = {}) {
    super();
    this.name = 'Projector';

    // Ceiling plate and pole, then the unit hanging under it.
    const dark = new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 0.6 });
    this.unitMaterial = new THREE.MeshStandardMaterial({ color: 0xe6e6e2, roughness: 0.45 });
    const poleLength = 0.3;
    const unitW = 0.32;
    const unitH = 0.1;
    const unitD = 0.26;
    const plate = boxMesh(0.12, 0.01, 0.12, dark, { y: -0.005 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, poleLength, 12), dark);
    pole.position.y = -poleLength / 2;
    const unitY = -poleLength - unitH / 2;
    const unit = boxMesh(unitW, unitH, unitD, this.unitMaterial, { y: unitY });
    const lensRing = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.03, 20), dark);
    lensRing.rotation.x = Math.PI / 2;
    lensRing.position.set(unitW * 0.2, unitY, unitD / 2 + 0.015);
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x0a0f1a, roughness: 0.1, metalness: 0.3 });
    const lensGlass = new THREE.Mesh(new THREE.CircleGeometry(0.028, 20), glassMat);
    lensGlass.position.set(lensRing.position.x, unitY, unitD / 2 + 0.031);
    this.standby = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2a1a, emissiveIntensity: 1.2 });
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.006, 0.004), this.standby);
    led.position.set(-unitW * 0.35, unitY - unitH * 0.2, unitD / 2 + 0.002);
    // Overhead, right next to the ceiling lamp: a shadow from here would smear across a wall.
    for (const mesh of [plate, pole, unit, lensRing, lensGlass, led]) mesh.castShadow = false;
    this.add(plate, pole, unit, lensRing, lensGlass, led);

    this.lens = new THREE.Object3D();
    this.lens.position.copy(lensGlass.position);
    this.add(this.lens);

    this.surface = new VideoSurface(cssLayer, {
      width: options.pictureWidth ?? 2.2,
      listener: options.listener,
      occlusion: options.occlusion,
      idle: 'nothing',
      message: { background: '#000000', ink: '#e8ecf5' },
      volume: { referenceDistance: 2.5, rolloff: 1.2, maxDistance: 14, rearGain: 0.6 },
    });
    // Until `aimAt()` runs, throw straight ahead onto an imaginary wall 3 m away.
    this.surface.position.set(0, -1, 3);
    this.surface.rotation.y = Math.PI; // the picture faces the projector
    this.add(this.surface);

    this.beam = new THREE.SpotLight(BEAM_COLOR, 0, 0, Math.PI / 8, 0.4, 1.2);
    this.beam.position.copy(this.lens.position);
    this.add(this.beam, this.beam.target);

    this.spill = new THREE.PointLight(BEAM_COLOR, 0, 6, 2);
    this.add(this.spill);

    this.cone = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({
        color: BEAM_COLOR,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    this.cone.renderOrder = 10;
    this.add(this.cone);

    this.hitboxes = [unit, this.surface.glass];
    this.aimAt(this.surface.position.clone());
  }

  /** Overhead: never blocks the player. */
  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  /**
   * Puts the picture's centre at `centre` (projector-local coordinates), facing back towards the
   * lens along local -z, and rebuilds the light frustum from the lens to the picture's corners.
   * Call after `zone.place()`: `projector.aimAt(projector.worldToLocal(wallPoint))`.
   */
  aimAt(centre: THREE.Vector3): void {
    this.surface.position.copy(centre);
    this.beam.target.position.copy(centre);
    this.spill.position.copy(centre).add(new THREE.Vector3(0, 0, -0.6));

    const { width, height } = this.surface;
    const throwDistance = Math.max(0.1, centre.z - this.lens.position.z);
    this.beam.distance = throwDistance + 1;
    this.beam.angle = Math.atan(Math.hypot(width, height) / 2 / throwDistance);

    // Frustum: apex at the lens, base = the picture rectangle.
    const a = this.lens.position;
    const corners = [
      [-width / 2, height / 2],
      [width / 2, height / 2],
      [width / 2, -height / 2],
      [-width / 2, -height / 2],
    ].map(([x, y]) => new THREE.Vector3(centre.x + x, centre.y + y, centre.z));
    const positions: number[] = [];
    for (let i = 0; i < 4; i++) {
      const c0 = corners[i]!;
      const c1 = corners[(i + 1) % 4]!;
      positions.push(a.x, a.y, a.z, c0.x, c0.y, c0.z, c1.x, c1.y, c1.z);
    }
    this.cone.geometry.dispose();
    this.cone.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  }

  get state(): ScreenState {
    return this.surface.state;
  }

  get isPlaying(): boolean {
    return this.surface.isPlaying;
  }

  onStateChange(listener: ScreenStateListener): () => void {
    return this.surface.onStateChange(listener);
  }

  // --- Interactable -------------------------------------------------------------------------

  setHovered(hovered: boolean): void {
    this.unitMaterial.emissive.setHex(hovered ? 0x222222 : 0x000000);
  }

  label(player: PlayerState): string | null {
    if (player.held) return `Play ${player.held.game.title} on the projector`;
    return this.isPlaying ? 'Click to turn the projector off' : 'Projector';
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

  update(dt: number): void {
    this.updateBeam(dt);
    this.surface.update();
  }

  /** Lamp: full beam with a faint flicker while playing, dimmer while a message is on the wall, off otherwise. */
  private updateBeam(dt: number): void {
    let beam = 0;
    let spill = 0;
    if (this.state === 'playing') {
      this.beamTime += dt;
      const t = this.beamTime;
      const flicker = 0.5 * Math.sin(t * 9.7) + 0.3 * Math.sin(t * 5.3) + 0.2 * Math.sin(t * 1.9);
      beam = BEAM_PLAYING * (0.9 + 0.1 * flicker);
      spill = SPILL_PLAYING * (0.85 + 0.15 * flicker);
    } else if (this.state !== 'off') {
      beam = BEAM_MESSAGE;
      spill = SPILL_PLAYING * 0.25;
    }
    const ease = Math.min(1, dt * 5);
    this.beam.intensity += (beam - this.beam.intensity) * ease;
    this.spill.intensity += (spill - this.spill.intensity) * ease;
    const coneTarget = beam > 0 ? CONE_OPACITY * (beam / BEAM_PLAYING) : 0;
    this.cone.material.opacity += (coneTarget - this.cone.material.opacity) * ease;
    this.cone.visible = this.cone.material.opacity > 0.002;
    // Standby LED: red when off, green while running.
    this.standby.emissive.setHex(this.state === 'off' ? 0xff2a1a : 0x2aff5a);
  }
}
