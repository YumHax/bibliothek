import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import type { Engine } from '@/core/Engine';
import { QUALITY } from './quality';
import { PostFx } from './PostFx';
import { Environment } from './Environment';
import { Haze } from './Haze';
import { LOOKS, type Look, type LookName } from './grade';

export { QUALITY, QUALITY_LEVELS, setQuality, type QualityLevel, type QualitySettings } from './quality';
export { LOOKS, NEUTRAL_LOOK, type Look, type LookName } from './grade';

export interface GraphicsOptions {
  /** Distance of the box held up to read, or null (depth of field). */
  focus: () => number | null;
  /** How lit the player's room is, 0 dark .. 1 lamp or sun (reflections and haze follow it). */
  lightLevel: () => number;
}

export interface Graphics {
  /** The post-processing chain, null on `low` quality (the scene renders straight to the canvas). */
  readonly postFx: PostFx | null;
  /** A zone's grade and haze; eased, or at once with `snap`. */
  setLook(look: LookName | Look | undefined, snap?: boolean): void;
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
  if (QUALITY.environment) engine.addUpdatable(new Environment(engine.renderer, engine.scene, options.lightLevel));
  const haze = new Haze(engine.scene, options.lightLevel);
  engine.addUpdatable(haze);

  return {
    postFx,
    setLook(look, snap = false) {
      const resolved = typeof look === 'object' ? look : LOOKS[look ?? 'home'];
      postFx?.setLook(resolved, snap);
      haze.setLook(resolved, snap);
    },
  };
}
