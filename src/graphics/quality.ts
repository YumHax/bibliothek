import { isTouchDevice } from '@/input/deviceDetect';

/**
 * How much the GPU is asked to do. `low` is the plain forward render the game shipped with;
 * `medium` adds the post-processing chain (bloom, grade, exposure, depth of field) and the cheap
 * material work; `high` adds everything that costs per pixel or a second render (ambient
 * occlusion, area lights, mirrors, clearcoat and sheen, fur).
 */
export type QualityLevel = 'low' | 'medium' | 'high';

export const QUALITY_LEVELS: readonly QualityLevel[] = ['low', 'medium', 'high'];

export interface QualitySettings {
  level: QualityLevel;
  /** Ceiling of the renderer's pixel ratio (the frame's cost is per pixel). */
  maxPixelRatio: number;
  /** Shadow map size of the lamps and the sun. */
  shadowMapSize: number;
  /** The off-screen HDR pipeline (`PostFx`); off, the scene renders straight to the canvas as before. */
  postFx: boolean;
  /** MSAA samples of the HDR target (the canvas's own antialiasing does not reach an off-screen target). */
  msaa: number;
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
    shadowMapSize: 512,
    postFx: false,
    msaa: 0,
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
    shadowMapSize: 1024,
    postFx: true,
    msaa: 4,
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
    shadowMapSize: 1024,
    postFx: true,
    msaa: 4,
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

const STORAGE_KEY = 'bibliothek.quality';

function isLevel(value: unknown): value is QualityLevel {
  return typeof value === 'string' && (QUALITY_LEVELS as readonly string[]).includes(value);
}

function stored(): QualityLevel | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLevel(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * The default when nothing was chosen: phones and tablets get `low`, Firefox `medium` (it pays
 * every draw call and every render pass far more than Chrome), everything else `high`.
 */
function detected(): QualityLevel {
  if (isTouchDevice()) return 'low';
  if (/firefox/i.test(navigator.userAgent)) return 'medium';
  return 'high';
}

function resolve(): QualitySettings {
  const param = new URLSearchParams(location.search).get('quality');
  const level = isLevel(param) ? param : (stored() ?? detected());
  return { level, ...PRESETS[level] };
}

/**
 * The settings for this session, fixed at start: materials and passes are built once from them,
 * so a change is saved and applied by reloading (`setQuality`). `?quality=low|medium|high` overrides.
 */
export const QUALITY: Readonly<QualitySettings> = resolve();

/** Saves `level` as the player's choice and reloads the page to rebuild everything with it. */
export function setQuality(level: QualityLevel): void {
  try {
    localStorage.setItem(STORAGE_KEY, level);
  } catch {
    // Private mode: the choice lasts for this reload only, through the URL.
  }
  const url = new URL(location.href);
  url.searchParams.delete('quality');
  if (stored() !== level) url.searchParams.set('quality', level);
  location.replace(url.toString());
}
