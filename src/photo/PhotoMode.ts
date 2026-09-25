import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Look } from '@/graphics';
import type { PhotoLens } from '@/graphics/PostFx';
import { PHOTO_FRAMES, cropOf } from './frames';
import { PHOTO_LOOKS } from './photoLooks';
import { PhotoHud } from './PhotoHud';
import { savePhoto } from './savePhoto';
import { ACTIONS, isAction, type ActionId } from '@/input/actions';

/** The player as photo mode parks and frees it (`FirstPersonController` fits). */
export interface PhotoPlayer {
  readonly isLocked: boolean;
  readonly isSeated: boolean;
  sit(eyePosition: THREE.Vector3, yaw: number): void;
  stand(): void;
  getLook(): { yaw: number; pitch: number };
  setLook(yaw: number, pitch: number): void;
}

export interface PhotoModeDeps {
  camera: THREE.PerspectiveCamera;
  /** The WebGL canvas (`engine.renderer.domElement`). */
  canvas: HTMLCanvasElement;
  /** Renders a frame now (`engine.renderFrame`): the photo is read straight after, in the same task. */
  renderFrame: () => void;
  player: PhotoPlayer;
  /** Held keys (logical codes, after the bindings): `Input` fits. */
  keys: { isDown(...codes: string[]): boolean };
  /** The post-processing's lens hook (`graphics.postFx`); null on the low quality level (no depth of field, no exposure). */
  postFx: { setLens(lens: PhotoLens | null): void } | null;
  /** The zone's own look, and setting a look on the frame (`graphics.setLook`). */
  zoneLook: () => Look;
  setLook: (look: Look, snap?: boolean) => void;
  /** Where the guides and the card go (the app container). */
  container: HTMLElement;
  /** The crosshair's picking, turned off while framing. */
  interactor?: { enabled: boolean };
  /** Why photo mode cannot start now (a box in hand, a panel open, at a machine…), or null. */
  blocked?: () => string | null;
  /** A line for the HUD (the Toast or the hint), shown once photo mode is left or when it cannot start. */
  say?: (text: string) => void;
}

/** How far the camera may fly from where photo mode started (m), and how fast (m/s). */
const RANGE = 4;
const RISE = 1.4;
const SPEED = 1.1;
const FOCUS = { min: 0.3, max: 25, start: 2.5 };
const BLUR = { max: 12, start: 0 };
const EXPOSURE = { min: -2, max: 2 };
const FOV = { min: 18, max: 80 };

/**
 * PHOTO MODE: the HUD goes, the camera comes loose (a slow fly within `RANGE` of where it started;
 * through furniture, not through the range), and the frame is set like a camera's: zoom, focus
 * and blur (the pipeline's depth of field), exposure, a grade over the zone's look, a guide (thirds,
 * cinema bars, square). A photo is a PNG of the canvas cropped to the guide, with the video
 * cut-outs filled black (the canvas is transparent where a screen plays). Leaving puts the camera
 * back exactly where it was.
 *
 * Keys: `toggle` / `capture` / `handleKey` are the API a key map calls; while active every key is
 * photo mode's (the router should hand them all to `handleKey`), the held ones (fly, focus, blur,
 * exposure) are read each frame from `keys`. The mouse wheel zooms and a click takes the photo.
 */
export class PhotoMode implements Updatable {
  private active = false;
  private readonly hud: PhotoHud;
  private readonly start = new THREE.Vector3();
  private readonly startQuaternion = new THREE.Quaternion();
  private startFov = 70;
  private satDown = false;
  private focus = FOCUS.start;
  private blur = BLUR.start;
  private exposure = 0;
  private lookIndex = 0;
  private frameIndex = 0;
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();

  constructor(private readonly deps: PhotoModeDeps) {
    this.hud = new PhotoHud(deps.container);
    this.hud.setFrame(PHOTO_FRAMES[0]!);
    window.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    document.addEventListener('mousedown', (e) => {
      if (this.active && e.button === 0 && this.deps.player.isLocked) this.capture();
    });
  }

  get isActive(): boolean {
    return this.active;
  }

  toggle(): void {
    if (this.active) this.exit();
    else this.enter();
  }

  enter(): void {
    if (this.active) return;
    const { camera, player, interactor } = this.deps;
    if (!player.isLocked) return;
    const reason = this.deps.blocked?.() ?? null;
    if (reason) {
      this.deps.say?.(reason);
      return;
    }
    this.active = true;
    this.start.copy(camera.position);
    this.startQuaternion.copy(camera.quaternion);
    this.startFov = camera.fov;
    // Parked like in an armchair: walking stops, the look stays free; an armchair player stays seated.
    this.satDown = !player.isSeated;
    if (this.satDown) {
      const { yaw, pitch } = player.getLook();
      player.sit(camera.position.clone(), yaw);
      player.setLook(yaw, pitch);
    }
    if (interactor) interactor.enabled = false;
    this.hud.show(true);
    this.applyLook();
    this.applyLens();
    this.refresh();
  }

  exit(): void {
    if (!this.active) return;
    this.active = false;
    const { camera, player, interactor } = this.deps;
    camera.position.copy(this.start);
    camera.quaternion.copy(this.startQuaternion);
    camera.fov = this.startFov;
    camera.updateProjectionMatrix();
    if (this.satDown && player.isSeated) player.stand();
    this.satDown = false;
    if (interactor) interactor.enabled = true;
    this.deps.postFx?.setLens(null);
    this.deps.setLook(this.deps.zoneLook(), true);
    this.hud.show(false);
  }

  /** Renders the frame now and saves it as a PNG, cropped to the guide, with a shutter flash. */
  capture(): void {
    if (!this.active) return;
    const { canvas, renderFrame } = this.deps;
    renderFrame();
    const crop = cropOf(PHOTO_FRAMES[this.frameIndex]!, canvas.width, canvas.height);
    const out = document.createElement('canvas');
    out.width = crop.w;
    out.height = crop.h;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    // The canvas is see-through where a video plays (the screen is a cut-out onto the page behind): black there.
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, crop.w, crop.h);
    ctx.drawImage(canvas, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
    this.hud.flash();
    savePhoto(out);
  }

  /** A key press while active: true when photo mode used it (always, while active: nothing else should hear it). */
  handleKey(code: string): boolean {
    if (!this.active) return false;
    if (isAction(code, 'photoMode')) this.exit();
    else if (isAction(code, 'photoCapture')) this.capture();
    else if (isAction(code, 'photoLook')) {
      this.lookIndex = (this.lookIndex + 1) % PHOTO_LOOKS.length;
      this.applyLook();
    } else if (isAction(code, 'photoFrame')) {
      this.frameIndex = (this.frameIndex + 1) % PHOTO_FRAMES.length;
      this.hud.setFrame(PHOTO_FRAMES[this.frameIndex]!);
    } else if (isAction(code, 'photoHelp')) this.hud.toggleHelp();
    else if (isAction(code, 'photoReset')) {
      this.focus = FOCUS.start;
      this.blur = BLUR.start;
      this.exposure = 0;
      this.lookIndex = 0;
      this.deps.camera.fov = this.startFov;
      this.deps.camera.updateProjectionMatrix();
      this.applyLook();
      this.applyLens();
    }
    this.refresh();
    return true;
  }

  update(dt: number): void {
    if (!this.active) return;
    const { player, keys, camera } = this.deps;
    // Out of the room (Esc, a panel), or stood up by something else: leave, the camera back in place.
    if (!player.isLocked || (this.satDown && !player.isSeated)) {
      this.exit();
      return;
    }
    const axis = (neg: ActionId, pos: ActionId) => (keys.isDown(...ACTIONS[pos].codes) ? 1 : 0) - (keys.isDown(...ACTIONS[neg].codes) ? 1 : 0);
    camera.getWorldDirection(this.forward);
    this.right.crossVectors(this.forward, camera.up).normalize();
    const step = SPEED * dt;
    camera.position
      .addScaledVector(this.forward, axis('back', 'forward') * step)
      .addScaledVector(this.right, axis('left', 'right') * step);
    camera.position.y += axis('photoDown', 'photoUp') * step;
    // On a leash round the start: a few metres, not through the building.
    const dx = camera.position.x - this.start.x;
    const dz = camera.position.z - this.start.z;
    const far = Math.hypot(dx, dz);
    if (far > RANGE) {
      camera.position.x = this.start.x + (dx / far) * RANGE;
      camera.position.z = this.start.z + (dz / far) * RANGE;
    }
    camera.position.y = THREE.MathUtils.clamp(camera.position.y, this.start.y - 1.5, this.start.y + RISE);

    const focusIn = axis('photoFocusNear', 'photoFocusFar');
    const blurIn = axis('photoBlurLess', 'photoBlurMore');
    const exposureIn = axis('photoDarker', 'photoBrighter');
    if (focusIn || blurIn || exposureIn) {
      // Focus moves in proportion (fine up close, quick far away).
      this.focus = THREE.MathUtils.clamp(this.focus * Math.exp(focusIn * dt * 1.2), FOCUS.min, FOCUS.max);
      this.blur = THREE.MathUtils.clamp(this.blur + blurIn * dt * 8, 0, BLUR.max);
      this.exposure = THREE.MathUtils.clamp(this.exposure + exposureIn * dt * 1.2, EXPOSURE.min, EXPOSURE.max);
      this.applyLens();
      this.refresh();
    }
  }

  private onWheel(e: WheelEvent): void {
    if (!this.active) return;
    e.preventDefault();
    const camera = this.deps.camera;
    camera.fov = THREE.MathUtils.clamp(camera.fov * Math.exp(Math.sign(e.deltaY) * 0.08), FOV.min, FOV.max);
    camera.updateProjectionMatrix();
    this.refresh();
  }

  private applyLens(): void {
    this.deps.postFx?.setLens({ focus: this.focus, blur: Math.round(this.blur), exposure: this.exposure });
  }

  private applyLook(): void {
    this.deps.setLook(PHOTO_LOOKS[this.lookIndex]!.apply(this.deps.zoneLook()), true);
  }

  private refresh(): void {
    this.hud.render({
      focus: this.focus,
      blur: Math.round(this.blur),
      exposure: this.exposure,
      fov: this.deps.camera.fov,
      look: PHOTO_LOOKS[this.lookIndex]!.name,
      frame: PHOTO_FRAMES[this.frameIndex]!.name,
      lens: this.deps.postFx !== null,
    });
  }
}
