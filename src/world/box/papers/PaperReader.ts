import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { AsideReader } from '@/interaction/Inspector';
import { clamp, smooth } from '@/math/scalar';
import { dampFactor } from '@/math/damp';
import { reduceMotion } from '@/settings/motion';
import { playPageTurn, playPaperSlide, playSheetFlip } from '@/audio/paperSounds';
import { PaperModel } from './PaperModel';
import { pageTexture, type PageLook } from './pageArt';
import type { Paper } from './paperContents';

/** The way out of the box to the eye, and back, takes this long (s). */
const FLIGHT_SECONDS = 0.45;
/** What is read fills this much of the view (the rest is room about it), never nearer the eye than the near plane and this. */
const FILL = 0.82;
const NEAR_ROOM = 0.035;
/** Nothing is nearer the eye than this in front of a wall (m). */
const WALL_CLEARANCE = 0.03;
/** The loupe on the paper: the view magnified up to this, a notch of the wheel by this factor. */
const ZOOM_MAX = 3.5;
const ZOOM_PER_NOTCH = 1.25;
/** The right trigger's travel that does nothing (a resting finger). */
const TRIGGER_DEAD = 0.08;
/** In the loupe, a pixel of mouse moves the view across the paper by this many of its own. */
const PAN_GAIN = 1.2;
/** A quick sweep of the mouse (or a finger) across this many pixels within `FLICK_MS` turns a page. */
const FLICK_PX = 160;
const FLICK_MS = 300;
/** Changing paper: the one held goes down out of the view and the next comes up, this long all told (s). */
const SWAP_SECONDS = 0.38;

/** The box the papers come out of, as the reader sees it (a `GameBox`). */
export interface PapersBox {
  /** What its box holds besides its media, the booklet first (`paperContents`). */
  readonly papers: readonly Paper[];
  /** The booklet as it lies in the open box: where the papers come out of and go back to. */
  readonly bookletMesh: THREE.Object3D | null;
  /** The game, its accent and its cover art: what the pages are drawn with. */
  readonly pageLook: PageLook;
  /** The papers out of the box (the booklet in it hidden) or back in. */
  setPapersOut(out: boolean): void;
  readonly layers: THREE.Layers;
  readonly isDisposed: boolean;
}

/** The hands the papers are read from (the Inspector's). */
interface ReaderHands {
  readonly current: PapersBox | null;
  readonly readingAside: boolean;
  setAside(reader: AsideReader | null): void;
}

type Phase = 'idle' | 'out' | 'reading' | 'back';

/**
 * The papers of the box in hand read in front of the eye (docs/media.md "The papers in the box"): the booklet lifted
 * out of the open box flies up to the eye and opens at a spread; the arrows (and a click, a sweep) turn its pages, the
 * up and down arrows go to the other papers (a card, a leaflet, a folded poster that opens out), the wheel brings the
 * loupe and the mouse looks across the page. The box waits low in the hand (`Inspector.setAside`). Pages are drawn
 * one a frame as they come into view, the spread shown and the next, and freed when the paper goes back.
 */
export class PaperReader implements Updatable, AsideReader {
  private phase: Phase = 'idle';
  private box: PapersBox | null = null;
  private index = 0;
  private model: PaperModel | null = null;
  /** 0 in the box .. 1 held up to read. */
  private flight = 0;
  /** The loupe: asked for and shown (eased), and the view's own zoom it is set over. */
  private zoom = 1;
  private zoomShown = 1;
  private zoomBase: number | null = null;
  private zoomSet = 1;
  private triggerHeld = false;
  private readonly pan = new THREE.Vector2();
  private readonly panShown = new THREE.Vector2();
  /** How far from the eye the paper is held (m), eased as what shows grows (a booklet opening, a poster unfolding). */
  private distance = 0;
  private flickPx = 0;
  private flickAt = 0;
  /** Changing paper: how far through (0..1), to which, and whether the new one is in yet. */
  private swap: { t: number; to: number; done: boolean } | null = null;
  private readonly eye = new THREE.Vector3();
  private readonly view = new THREE.Quaternion();
  private readonly from = new THREE.Vector3();
  private readonly fromQuat = new THREE.Quaternion();
  private readonly to = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();
  private readonly ray = new THREE.Raycaster();
  private readonly hits: THREE.Intersection[] = [];

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly scene: THREE.Scene,
    private readonly hands: ReaderHands,
    private readonly walls: (() => readonly THREE.Object3D[]) | null = null,
  ) {
    // A click turns the page (the right button back); it goes no further: nothing behind the paper is picked or taken.
    window.addEventListener('mousedown', (e) => {
      if (this.phase !== 'reading' || !document.pointerLockElement || (e.button !== 0 && e.button !== 2)) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      this.turn(e.button === 2 || (this.zoomShown > 1.05 && this.panShown.x < 0) ? -1 : 1);
    }, true);
  }

  /** Whether papers are out of the box (read, or on their way out or back). */
  get active(): boolean {
    return this.phase !== 'idle';
  }

  /** Out of the box and not on its way back (flying up, or read): the keys are the reader's. */
  get out(): boolean {
    return this.phase === 'out' || this.phase === 'reading';
  }

  /** Read now (held up, not on the way): its keys line shows. */
  get reading(): boolean {
    return this.phase === 'reading';
  }

  /** The paper held: what it is called, whether it is leafed through or turned over, how many papers the box has. */
  get held(): { name: string; sheet: boolean; count: number } | null {
    const paper = this.model?.paper;
    if (!paper || !this.box) return null;
    return { name: paper.name, sheet: paper.kind === 'card' || paper.kind === 'poster', count: this.box.papers.length };
  }

  /** The paper's distance from the eye while it is out (what the view focuses on), else null. */
  get focusDistance(): number | null {
    if (!this.model || this.phase === 'idle') return null;
    this.camera.getWorldPosition(this.eye);
    return this.model.position.distanceTo(this.eye);
  }

  /** The paper out (`ReadingLight` lights it and leaves the room round it in shade), or null. */
  get object(): THREE.Object3D | null {
    return this.phase === 'idle' ? null : this.model;
  }

  setReading(radiance: number): void {
    this.model?.setReading(radiance);
  }

  /** Takes the box in hand's papers out, the booklet first, up to the eye. False when it has none (nothing happens). */
  show(box: PapersBox): boolean {
    if (this.phase !== 'idle' || !box.papers.length || this.hands.current !== box) return false;
    this.box = box;
    this.index = 0;
    this.flight = 0;
    this.zoom = this.zoomShown = 1;
    this.pan.set(0, 0);
    this.panShown.set(0, 0);
    this.swap = null;
    this.model = this.build(0);
    this.distance = this.readDistance();
    box.setPapersOut(true);
    this.hands.setAside(this);
    this.phase = 'out';
    this.place();
    playPaperSlide();
    return true;
  }

  /** Back into the box: shut, down to where the booklet lies, and in. */
  close(): void {
    if (this.phase === 'idle' || this.phase === 'back') return;
    this.phase = 'back';
    this.zoom = 1;
    this.swap = null;
    this.model?.setOpen(false);
    // The hands take the wheel back once the paper's loupe has let go of the camera (`update`): two loupes at once would
    // each keep the other's zoom as the view's own, and leave it magnified.
    if (this.hands.readingAside && this.zoomSet === 1) this.hands.setAside(null);
    playPaperSlide(0.05);
  }

  /** At once (the box put back, sold, gone): the papers are in it again and nothing is left in front of the eye. */
  closeNow(): void {
    if (this.phase === 'idle') return;
    if (this.hands.readingAside && this.hands.current === this.box) this.hands.setAside(null);
    if (this.box && !this.box.isDisposed) this.box.setPapersOut(false);
    this.model?.removeFromParent();
    this.model?.dispose();
    this.model = null;
    this.box = null;
    this.phase = 'idle';
    this.zoom = this.zoomShown = 1;
    this.setZoom(1);
  }

  /** A page on (`1`) or back (`-1`); a card or a poster turned over. False when there is no page that way. */
  turn(way: 1 | -1): boolean {
    const model = this.model;
    if (this.phase !== 'reading' || !model || this.swap) return false;
    if (!model.turn(way)) return false;
    this.pan.set(0, 0);
    if (model.paper.kind === 'card' || model.paper.kind === 'poster') playSheetFlip();
    else playPageTurn();
    return true;
  }

  /** The next paper in the box (`1`) or the one before; false when there is only the one. */
  nextPaper(way: 1 | -1): boolean {
    const count = this.box?.papers.length ?? 0;
    if (this.phase !== 'reading' || count < 2 || this.swap) return false;
    this.swap = { t: 0, to: (this.index + way + count) % count, done: false };
    this.zoom = 1;
    this.pan.set(0, 0);
    playPaperSlide(0.06);
    return true;
  }

  // --- The mouse, the wheel, the zoom (the Inspector hands them over while the box is set aside) ---------------

  move(dx: number, dy: number): void {
    if (this.phase !== 'reading') return;
    if (this.zoomShown > 1.05) {
      const perPixel = (2 * this.halfHeight() * PAN_GAIN) / Math.max(1, window.innerHeight);
      this.pan.x += dx * perPixel;
      this.pan.y -= dy * perPixel;
      this.clampPan();
      return;
    }
    // Not magnified: a quick sweep across turns a page, as a finger would (to the left: on).
    const now = performance.now(); // convention-ok: the mouse events' own pace (a sweep is input, not an animation)
    if (now - this.flickAt > FLICK_MS || Math.sign(dx) !== Math.sign(this.flickPx)) this.flickPx = 0;
    this.flickAt = now;
    this.flickPx += dx;
    if (Math.abs(this.flickPx) < FLICK_PX) return;
    this.turn(this.flickPx < 0 ? 1 : -1);
    this.flickPx = 0;
  }

  wheel(notches: number): void {
    if (this.phase !== 'reading') return;
    this.zoom = clamp(this.zoom * Math.pow(ZOOM_PER_NOTCH, notches), 1, ZOOM_MAX);
  }

  zoomBy(amount: number): void {
    if (this.phase !== 'reading') return;
    this.zoom = clamp(this.zoom * Math.pow(2, amount * 1.5), 1, ZOOM_MAX);
  }

  holdClose(pressure: number): void {
    if (this.phase !== 'reading') return;
    if (pressure > TRIGGER_DEAD) {
      this.triggerHeld = true;
      this.zoom = 1 + (ZOOM_MAX - 1) * clamp((pressure - TRIGGER_DEAD) / (1 - TRIGGER_DEAD), 0, 1);
    } else if (this.triggerHeld) {
      this.triggerHeld = false;
      this.zoom = 1;
    }
  }

  // --- Each frame -----------------------------------------------------------------------------------

  update(dt: number): void {
    if (this.phase === 'idle') return;
    const box = this.box!;
    // The box gone from the hand (put back, a panel, sold), or the hands' hold let go of: the papers are back in it.
    if (box.isDisposed || this.hands.current !== box || (this.phase !== 'back' && !this.hands.readingAside)) return this.closeNow();
    const step = reduceMotion() ? 1 : dt / FLIGHT_SECONDS;
    this.flight = clamp(this.flight + (this.phase === 'back' ? -step : step), 0, 1);
    this.stepSwap(dt);
    const model = this.model!;
    model.update(dt);
    const rate = dampFactor(reduceMotion() ? 30 : 10, dt);
    this.zoomShown += (this.zoom - this.zoomShown) * rate;
    if (Math.abs(this.zoom - this.zoomShown) < 1e-3) this.zoomShown = this.zoom;
    this.setZoom(this.zoomShown);
    if (this.phase === 'back' && this.zoomSet === 1 && this.hands.readingAside) this.hands.setAside(null);
    if (this.zoom <= 1.0001) this.pan.set(0, 0);
    this.clampPan();
    this.panShown.lerp(this.pan, dampFactor(reduceMotion() ? 30 : 16, dt));
    this.distance += (this.readDistance() - this.distance) * rate;
    this.drawPages(model);
    this.place();
    if (this.phase === 'out' && this.flight >= 1) {
      this.phase = 'reading';
      model.setOpen(true);
    } else if (this.phase === 'back' && this.flight <= 0) this.closeNow();
  }

  /** Changing paper: the one held down out of the view, the next in its place, up again. */
  private stepSwap(dt: number): void {
    const swap = this.swap;
    if (!swap) return;
    swap.t = Math.min(1, swap.t + (reduceMotion() ? 1 : dt / SWAP_SECONDS));
    if (!swap.done && swap.t >= 0.5) {
      swap.done = true;
      this.model?.removeFromParent();
      this.model?.dispose();
      this.index = swap.to;
      this.model = this.build(swap.to);
      this.model.setOpen(true);
    }
    if (swap.t >= 1) this.swap = null;
  }

  /** One page drawn a frame, the ones on show first; the ones out of reach freed. */
  private drawPages(model: PaperModel): void {
    const needed = model.pagesNeeded();
    model.dropPagesBut(new Set(needed));
    const missing = needed.find((index) => !model.hasPage(index));
    if (missing !== undefined && this.box) model.setPage(missing, pageTexture(model.paper, missing, this.box.pageLook));
  }

  private build(index: number): PaperModel {
    const box = this.box!;
    const model = new PaperModel(box.papers[index]!, box.layers.mask);
    this.scene.add(model);
    return model;
  }

  /** Where the paper is this frame: between the booklet in the box and the eye, by the flight. */
  private place(): void {
    const model = this.model;
    const box = this.box;
    if (!model || !box) return;
    this.camera.getWorldPosition(this.eye);
    this.camera.getWorldQuaternion(this.view);
    const dip = this.swap ? Math.sin(this.swap.t * Math.PI) * model.extent.height * 1.15 : 0;
    this.offset.set(-this.panShown.x, -this.panShown.y - dip, -this.distance).applyQuaternion(this.view);
    this.to.copy(this.eye).add(this.offset);
    const e = smooth(this.flight);
    const booklet = box.bookletMesh;
    if (e >= 1 || !booklet) {
      model.position.copy(this.to);
      model.quaternion.copy(this.view);
      return;
    }
    booklet.updateWorldMatrix(true, false);
    booklet.getWorldPosition(this.from);
    booklet.getWorldQuaternion(this.fromQuat);
    model.position.lerpVectors(this.from, this.to, e);
    model.quaternion.slerpQuaternions(this.fromQuat, this.view, e);
  }

  /** How far from the eye what shows fills the view (`FILL`), never inside the near plane, never through a wall. */
  private readDistance(): number {
    const extent = this.model?.extent ?? { width: 0.1, height: 0.1 };
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    const fit = Math.max(extent.height / (2 * tan * FILL), extent.width / (2 * tan * this.camera.aspect * FILL));
    let distance = Math.max(fit, this.camera.near + NEAR_ROOM);
    const walls = this.walls?.();
    if (walls?.length) {
      this.camera.getWorldPosition(this.eye);
      this.camera.getWorldDirection(this.offset);
      this.ray.set(this.eye, this.offset);
      this.ray.far = distance + WALL_CLEARANCE;
      this.hits.length = 0;
      this.ray.intersectObjects(walls as THREE.Object3D[], false, this.hits);
      const hit = this.hits[0];
      if (hit) distance = Math.max(this.camera.near + 0.01, Math.min(distance, hit.distance - WALL_CLEARANCE));
    }
    return distance;
  }

  /** Half the view's height at the paper's distance (m), magnified by the loupe. */
  private halfHeight(): number {
    return (this.distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / this.zoomShown;
  }

  private clampPan(): void {
    const extent = this.model?.extent;
    if (!extent) return;
    const half = this.halfHeight();
    const maxX = Math.max(0, extent.width / 2 - half * this.camera.aspect * 0.92);
    const maxY = Math.max(0, extent.height / 2 - half * 0.92);
    this.pan.set(clamp(this.pan.x, -maxX, maxX), clamp(this.pan.y, -maxY, maxY));
  }

  /** The loupe's zoom on the camera, over the view's own (put back exactly once it lets go). */
  private setZoom(factor: number): void {
    const z = factor < 1.002 ? 1 : factor;
    if (z === this.zoomSet) return;
    this.zoomBase ??= this.camera.zoom;
    this.camera.zoom = this.zoomBase * z;
    this.camera.updateProjectionMatrix();
    this.zoomSet = z;
    if (z === 1) this.zoomBase = null;
  }
}
