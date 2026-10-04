import { DEPTH_SCALE, ELEVATION_MAX, ELEVATION_MIN, EYE_HEIGHT, SCENE_HEIGHT, SCENE_WIDTH } from './Sheet';
import { SPRITE_COUNT } from './Life';
import { QUALITY } from '@/graphics/quality';
import { FRACT_HASH, SINE_HASH, fbm2, valueNoise2 } from '@/graphics/glslNoise';
import { VEHICLE_FUNCTIONS, VEHICLE_UNIFORMS } from './vehicleShader';
import { SKY_CHUNK } from '../../city/skyGlsl';
import vertexShader from './outdoors.vert.glsl?raw';
import outdoorsFrag from './outdoors.frag.glsl?raw';
import { assemble } from '@/graphics/glslAssemble';
export { vertexShader };

/** Angular radius of the sun disc and of the moon, in radians. */
const SUN_RADIUS = 0.05;
export const MOON_RADIUS = 0.045;
/** Angular radii of the sunrise / sunset glow along the horizon (wide) and up the sky (short). */
const GLOW_RADIUS_X = 2.3;
const GLOW_RADIUS_Y = 0.7;
/**
 * Fixed-point steps that find where the eye ray really meets the painted scenery (see `main()`):
 * the panorama was painted from one eye, and a camera a few metres from it sees it shifted by
 * parallax, the near pavement most. Each step is one depth lookup. Fewer on low quality, like the
 * clouds' octaves: the pane shader runs on every pixel of every window and the balcony's sky.
 */
const PARALLAX_STEPS = QUALITY.level === 'low' ? 3 : 6;
const CLOUD_OCTAVES = QUALITY.level === 'low' ? 3 : 4;

/**
 * The pane shader (also on the balcony's surround). Along the eye ray through the pane: the sky at infinity (gradient, sunset
 * glow, stars, drifting clouds and the overcast, the city's glow at night, the sun and the moon),
 * then the scenery where the ray leaves the sphere around the room. The scenery textures hold the
 * day colours, the lights that come on at night (and the curfew each goes out at, against the
 * city's `wakefulness`), how much each surface mirrors the sky, how far away it is, the shadows
 * cast on it and how it takes rain and snow; everything time-dependent is a uniform, so nothing
 * is repainted as the day and the weather go by. Over the scenery, the moving sprites of `Life`
 * (cars, walkers, birds): textured rectangles in band space, hidden where the scenery is nearer.
 * Last, the weather between the eye and the view: falling rain or snow, and drops on the glass.
 *
 * The GLSL is `outdoors.frag.glsl`; the hashes, noises, sky and vehicle chunks and the constants above are written in here.
 */
export const fragmentShader = assemble(outdoorsFrag, {
  chunks: {
    fbm2_fbm: fbm2('fbm', 'valueNoise', CLOUD_OCTAVES, [17.1, 9.2]),
    valueNoise2_valueNoise: valueNoise2('valueNoise', 'fractHash'),
    fract_hash: FRACT_HASH,
    sine_hash: SINE_HASH,
    sky_chunk: SKY_CHUNK,
    vehicle_functions: VEHICLE_FUNCTIONS,
    vehicle_uniforms: VEHICLE_UNIFORMS,
  },
  defines: {
    TS_INV_SCENE_HEIGHT: (1 / SCENE_HEIGHT).toFixed(8),
    TS_INV_SCENE_WIDTH: (1 / SCENE_WIDTH).toFixed(8),
    TS_ELEVATION_MAX: ELEVATION_MAX.toFixed(5),
    TS_ELEVATION_MIN: ELEVATION_MIN.toFixed(5),
    TS_GLOW_RADIUS_Y: GLOW_RADIUS_Y.toFixed(4),
    TS_GLOW_RADIUS_X: GLOW_RADIUS_X.toFixed(4),
    TS_MOON_RADIUS: MOON_RADIUS.toFixed(4),
    TS_SUN_RADIUS: SUN_RADIUS.toFixed(4),
    TS_PARALLAX_STEPS: PARALLAX_STEPS,
    TS_EYE_HEIGHT: EYE_HEIGHT.toFixed(1),
    TS_DEPTH_SCALE: DEPTH_SCALE.toFixed(1),
    TS_SPRITE_COUNT: SPRITE_COUNT,
  },
});
