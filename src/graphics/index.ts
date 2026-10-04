import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import type { Engine, Updatable } from '@/core/Engine';
import { QUALITY } from './quality';
import { PostFx } from './PostFx';
import { Environment } from './Environment';
import { Haze } from './Haze';
import { LOOKS, displayColor, type Look, type LookName } from './grade';

export { QUALITY, QUALITY_LEVELS, recommendedQuality, setQuality, type QualityLevel,  } from './quality';
export { LOOKS,  type Look, type LookName } from './grade';

/** The DOM layer behind the canvas the video cut-outs show (`core/CssLayer`): the frame's grade is mirrored onto it as a CSS filter. */
interface VideoLayer {
  setFilter(filter: string): void;
}

interface GraphicsOptions {
  /** Distance of the box held up to read, or null (depth of field). */
  focus: () => number | null;
  /** How lit the player's room is, 0 dark .. 1 lamp or sun (reflections and haze follow it). */
  lightLevel: () => number;
  /** The video layer, to grade like the frame (exposure, contrast, saturation, blur). */
  videoLayer?: VideoLayer;
}

export interface Graphics {
  /** The post-processing chain, null on `low` quality (the scene renders straight to the canvas). */
  readonly postFx: PostFx | null;
  /** A zone's grade and haze; eased, or at once with `snap`. */
  setLook(look: LookName | Look | undefined, snap?: boolean): void;
  /**
   * Behind a travel's curtain, once the destination is the current zone: the look, the haze, the
   * reflections and the eye jump to where their easing is heading (the eye on the next light
   * reading), so the view fades in on the settled picture instead of adapting for seconds after.
   */
  settle(): void;
}

/** Per second: how fast `low`'s exposure follows the look (like `PostFx`'s grade). */
const LOW_EXPOSURE_RATE = 1.5;

/**
 * `low` has no `PostFx`: the zone's look still sets the exposure, through the renderer's own tone
 * mapping (`toneMappingExposure`), eased like the grade. Its contrast, saturation and warmth go on
 * the canvas as a CSS filter (the compositor's, no pass of ours; written only when it changes), so
 * the flat reads as warm on `low` as on the other levels and the arcade as punchy. The warmth is a
 * touch of sepia from the look's temperature and highlight gain (CSS has no cooler: cool looks keep
 * their contrast and saturation only).
 */
class LowExposure implements Updatable {
  exposure = 1;
  private target = 1;
  private readonly grade = { contrast: 1, saturation: 1, warmth: 0 };
  private readonly gradeTarget = { contrast: 1, saturation: 1, warmth: 0 };
  private lastFilter = '';

  constructor(private readonly renderer: THREE.WebGLRenderer) {}

  setLook(look: Look, snap: boolean): void {
    this.target = Math.pow(2, look.exposure);
    const gain = new THREE.Color();
    displayColor(gain, look.highlights);
    this.gradeTarget.contrast = look.contrast;
    this.gradeTarget.saturation = look.saturation;
    this.gradeTarget.warmth = THREE.MathUtils.clamp(look.temperature * 0.5 + (gain.r - gain.b) * 0.5, 0, 0.2);
    if (snap) this.settle();
  }

  settle(): void {
    this.exposure = this.target;
    Object.assign(this.grade, this.gradeTarget);
    this.apply();
  }

  update(dt: number): void {
    const t = 1 - Math.exp(-LOW_EXPOSURE_RATE * dt);
    this.exposure += (this.target - this.exposure) * t;
    const g = this.grade;
    const to = this.gradeTarget;
    g.contrast += (to.contrast - g.contrast) * t;
    g.saturation += (to.saturation - g.saturation) * t;
    g.warmth += (to.warmth - g.warmth) * t;
    this.apply();
  }

  /** The grade as a CSS filter, rounded so an easing writes the style a few times, not every frame. */
  get filter(): string {
    const round = (v: number, step: number): string => (Math.round(v / step) * step).toFixed(2);
    const { contrast, saturation, warmth } = this.grade;
    return `contrast(${round(contrast, 0.01)}) saturate(${round(saturation, 0.01)}) sepia(${round(warmth, 0.01)})`;
  }

  private apply(): void {
    this.renderer.toneMappingExposure = this.exposure;
    // A neutral grade is no filter at all: the canvas composites as it always did.
    const filter = this.filter === 'contrast(1.00) saturate(1.00) sepia(0.00)' ? '' : this.filter;
    if (filter === this.lastFilter) return;
    this.lastFilter = filter;
    this.renderer.domElement.style.filter = filter;
  }
}

/**
 * Mirrors the frame's exposure, grade and blur onto the video layer each frame (the cut-out shows
 * the DOM behind the canvas, which no pass reaches), writing the style only when it changes.
 */
class VideoGrade implements Updatable {
  private last = '';

  constructor(
    private readonly layer: VideoLayer,
    private readonly filter: () => string,
  ) {}

  update(): void {
    const filter = this.filter();
    if (filter === this.last) return;
    this.last = filter;
    this.layer.setFilter(filter);
  }
}

/** Everything that shapes the frame beyond the scene itself, built from `QUALITY`: pipeline, reflections, haze. */
export function setupGraphics(engine: Engine, options: GraphicsOptions): Graphics {
  engine.renderer.shadowMap.enabled = true;
  // The lookup tables the window and TV area lights need (before any material compiles with one).
  if (QUALITY.areaLights) RectAreaLightUniformsLib.init();
  const postFx = QUALITY.postFx ? new PostFx(engine.renderer, QUALITY, { focus: options.focus }) : null;
  if (postFx) {
    engine.setPipeline(postFx);
    engine.addUpdatable(postFx);
  }
  const low = postFx ? null : new LowExposure(engine.renderer);
  if (low) engine.addUpdatable(low);
  // Tinted reflections per look on medium and high (a prefiltered copy each); `low` only scales the one.
  const environment = QUALITY.environment ? new Environment(engine.renderer, engine.scene, options.lightLevel, QUALITY.postFx) : null;
  if (environment) {
    engine.addUpdatable(environment);
    environment.prewarm(Object.values(LOOKS).map((look) => look.reflections.tint));
  }
  const haze = new Haze(engine.scene, options.lightLevel);
  engine.addUpdatable(haze);
  if (options.videoLayer) {
    const filter = postFx
      // The canvas's own ratio: the frame is scaled inside it (`PostFx.setRenderScale`), the blur is in its pixels.
      ? () => postFx.videoFilter(engine.renderer.getPixelRatio())
      : () => `brightness(${(Math.round(Math.sqrt(low!.exposure) / 0.02) * 0.02).toFixed(2)}) ${low!.filter}`;
    engine.addUpdatable(new VideoGrade(options.videoLayer, filter));
  }

  return {
    postFx,
    setLook(look, snap = false) {
      const resolved = typeof look === 'object' ? look : LOOKS[look ?? 'home'];
      postFx?.setLook(resolved, snap);
      low?.setLook(resolved, snap);
      environment?.setLook(resolved, snap);
      haze.setLook(resolved, snap);
    },
    settle() {
      postFx?.settle();
      low?.settle();
      environment?.settle();
      haze.settle();
    },
  };
}
