import { isTouchDevice } from '@/input/deviceDetect';
import { KEYS, safeStorage } from '@/persistence';
import { flagValue } from '@/settings/flags';
import { toneMapEveryMaterial } from './displayTone';
import { brightenMetalReflections } from './metalReflections';

/**
 * How much the GPU is asked to do. `low` is the plain forward render the game shipped with;
 * `medium` adds the post-processing chain (bloom, grade, exposure, depth of field) and the cheap
 * material work; `high` adds everything that costs per pixel or a second render (ambient
 * occlusion, area lights, mirrors, clearcoat and sheen, fur).
 */
export type QualityLevel = 'low' | 'medium' | 'high';

export const QUALITY_LEVELS: readonly QualityLevel[] = ['low', 'medium', 'high'];

/**
 * How many lights of each kind the renderer is handed at once (`world/lighting/LightCuller`): every
 * light in the scene is evaluated by every lit fragment, so the budget keeps the best of them (the
 * player's room first, then what is seen through the doorways, bright and near before dim and far)
 * and hides the rest. Each count is fixed, so choosing other lights recompiles nothing.
 * `pointShadows` / `spotShadows` are the lights that must cast their shadow to be shown at all (the
 * ceiling lamps, the window suns: without it they would shine through the walls).
 */
export interface LightBudgetSettings {
  point: number;
  pointShadows: number;
  spot: number;
  spotShadows: number;
  hemisphere: number;
}

export interface QualitySettings {
  level: QualityLevel;
  /** Ceiling of the renderer's pixel ratio (the frame's cost is per pixel). */
  maxPixelRatio: number;
  /** Floor the pixel ratio may drop to while the GPU cannot keep up (`core/AdaptiveResolution`). */
  minPixelRatio: number;
  /** Frames per second the loop never goes past (a 120 Hz screen would double the work); 0 for the display's rate. */
  maxFps: number;
  /** Shadow map size of the lamps. */
  shadowMapSize: number;
  /**
   * Shadow map size of the narrow sun spots through the windows and onto the balcony: a small patch
   * of floor at a grazing angle, where the mullions' shadows need the texels (the street's wide sun
   * takes twice `shadowMapSize`, at most 2048).
   */
  sunShadowMapSize: number;
  /**
   * Anisotropic filtering of the textures seen at a grazing angle (floors, walls, labels, signs):
   * the default of `toTexture` and the floor and wall finishes. three.js caps it at the GPU's own
   * maximum (`capabilities.getMaxAnisotropy()`). Never a number per prop: `graphics/canvas` `Anisotropy`.
   */
  anisotropy: number;
  /** Scale of the texel densities canvases are painted at (`graphics/canvas` `canvasFor`, `DENSITY`). */
  canvasScale: number;
  /**
   * How often a lit lamp or sun of the player's room re-renders its shadow map (per second; 0 = every
   * frame). Each refresh redraws the room from the light (six times for a lamp).
   */
  shadowRefreshHz: number;
  /** Casters smaller than this (metres, largest side) cast no shadow: below a shadow texel, a draw call each for nothing. */
  minShadowCaster: number;
  lights: LightBudgetSettings;
  /** The off-screen HDR pipeline (`PostFx`); off, the scene renders straight to the canvas as before. */
  postFx: boolean;
  /** MSAA samples of the HDR target (the canvas's own antialiasing does not reach an off-screen target). */
  msaa: number;
  /** A light FXAA in the output pass, on the tone-mapped values (the MSAA resolve happens in HDR, before tone mapping: bright edges still step). */
  fxaa: boolean;
  bloom: boolean;
  /** Screen-space ambient occlusion from the depth buffer (no extra scene render). */
  ssao: boolean;
  /** Blur beyond the box held up to read. */
  depthOfField: boolean;
  /** The eye adapting between a dark and a bright view. */
  autoExposure: boolean;
  /** Per-zone colour grade, vignette and film grain. */
  grade: boolean;
  /** Reflections of the room on glossy surfaces (PMREM environment). */
  environment: boolean;
  /** Painted wood, plaster and wear (textures and shader work, no extra draw calls). */
  detailedMaterials: boolean;
  /** Rounded edges on the boxy furniture. */
  bevels: boolean;
  /** Clearcoat on the boxes' plastic, sheen on fabrics. */
  physicalMaterials: boolean;
  /** Soft rectangular light from the windows and the TV. */
  areaLights: boolean;
  /** Real reflections in the mirrors and the market's polished floor (a second render each while in view). */
  reflections: boolean;
  /** Sunbeams and the dust floating in them. */
  lightShafts: boolean;
  /** Shell fur on the cat. */
  fur: boolean;
  /** Soft dark blobs under furniture and the cat. */
  contactShadows: boolean;
}

const PRESETS: Record<QualityLevel, Omit<QualitySettings, 'level'>> = {
  low: {
    maxPixelRatio: 1.25,
    minPixelRatio: 0.75,
    maxFps: 60,
    shadowMapSize: 512,
    sunShadowMapSize: 512,
    anisotropy: 2,
    canvasScale: 0.75,
    shadowRefreshHz: 15,
    minShadowCaster: 0.15,
    lights: { point: 5, pointShadows: 2, spot: 6, spotShadows: 3, hemisphere: 2 },
    postFx: false,
    msaa: 0,
    fxaa: false,
    bloom: false,
    ssao: false,
    depthOfField: false,
    autoExposure: false,
    grade: false,
    environment: true,
    detailedMaterials: false,
    bevels: false,
    physicalMaterials: false,
    areaLights: false,
    reflections: false,
    lightShafts: false,
    fur: false,
    contactShadows: true,
  },
  medium: {
    maxPixelRatio: 1.5,
    minPixelRatio: 1,
    maxFps: 60,
    shadowMapSize: 1024,
    sunShadowMapSize: 1024,
    anisotropy: 4,
    canvasScale: 1,
    shadowRefreshHz: 30,
    minShadowCaster: 0.08,
    lights: { point: 8, pointShadows: 3, spot: 10, spotShadows: 4, hemisphere: 2 },
    postFx: true,
    msaa: 4,
    fxaa: true,
    bloom: true,
    ssao: false,
    depthOfField: true,
    autoExposure: true,
    grade: true,
    environment: true,
    detailedMaterials: true,
    bevels: true,
    physicalMaterials: false,
    areaLights: false,
    reflections: false,
    lightShafts: true,
    fur: false,
    contactShadows: true,
  },
  high: {
    maxPixelRatio: 1.5,
    minPixelRatio: 1,
    maxFps: 0,
    shadowMapSize: 1024,
    sunShadowMapSize: 2048,
    anisotropy: 8,
    canvasScale: 1.25,
    shadowRefreshHz: 0,
    minShadowCaster: 0.04,
    lights: { point: 12, pointShadows: 5, spot: 16, spotShadows: 5, hemisphere: 2 },
    postFx: true,
    msaa: 4,
    fxaa: true,
    bloom: true,
    ssao: true,
    depthOfField: true,
    autoExposure: true,
    grade: true,
    environment: true,
    detailedMaterials: true,
    bevels: true,
    physicalMaterials: true,
    areaLights: true,
    reflections: true,
    lightShafts: true,
    fur: true,
    contactShadows: true,
  },
};

const STORAGE_KEY = KEYS.quality;

function isLevel(value: unknown): value is QualityLevel {
  return typeof value === 'string' && (QUALITY_LEVELS as readonly string[]).includes(value);
}

function stored(): QualityLevel | null {
  try {
    const value = safeStorage()?.getItem(STORAGE_KEY) ?? null;
    return isLevel(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * The default when nothing was chosen: phones and tablets get `low`, Firefox `medium` (it pays
 * every draw call and every render pass far more than Chrome), everything else `high`.
 */
export function recommendedQuality(): QualityLevel {
  if (isTouchDevice()) return 'low';
  if (/firefox/i.test(navigator.userAgent)) return 'medium';
  return 'high';
}

function resolve(): QualitySettings {
  const param = flagValue('quality');
  const level = isLevel(param) ? param : (stored() ?? recommendedQuality());
  return { level, ...PRESETS[level] };
}

/**
 * The settings for this session, fixed at start: materials and passes are built once from them,
 * so a change is saved and applied by reloading (`setQuality`). `?quality=low|medium|high` overrides.
 */
export const QUALITY: Readonly<QualitySettings> = resolve();

// One tone-mapping rule for every level (see `displayTone`): set before any material is made.
toneMapEveryMaterial(!QUALITY.postFx);
// Bare metal takes more of the reflections than paint (see `metalReflections`): before any program compiles.
brightenMetalReflections();

/** Saves `level` as the player's choice and reloads the page to rebuild everything with it. */
export function setQuality(level: QualityLevel): void {
  try {
    safeStorage()?.setItem(STORAGE_KEY, level);
  } catch {
    // Private mode: the choice lasts for this reload only, through the URL.
  }
  const url = new URL(location.href);
  url.searchParams.delete('quality');
  if (stored() !== level) url.searchParams.set('quality', level);
  location.replace(url.toString());
}
