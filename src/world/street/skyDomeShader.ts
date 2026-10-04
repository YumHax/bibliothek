import { SINE_HASH, fbm2, valueNoise2 } from '@/graphics/glslNoise';
import { SKY_CHUNK } from '../city/skyGlsl';
import SKY_DOME_VERTEX from './skyDome.vert.glsl?raw';
import skyDomeFrag from './skyDome.frag.glsl?raw';
import { assemble } from '@/graphics/glslAssemble';
export { SKY_DOME_VERTEX };

/** Angular radii of the sun's and the moon's discs over the street (the window view's are drawn larger). */
const DOME_SUN_RADIUS = 0.02;
export const DOME_MOON_RADIUS = 0.024;

/**
 * GLSL of the street's sky dome (`SkyDome`): `skyDome.vert.glsl` and `skyDome.frag.glsl`, the fragment made whole
 * with the sky chunk, the hash and noise it was tuned on, and the two radii above.
 */
export const SKY_DOME_FRAGMENT = assemble(skyDomeFrag, {
  chunks: {
    fbm2_fbm: fbm2('fbm', 'noise2', 5, [17, 9]),
    valueNoise2_noise2: valueNoise2('noise2', 'sineHash'),
    sine_hash: SINE_HASH,
    sky_chunk: SKY_CHUNK,
  },
  defines: { TS_DOME_MOON_RADIUS: DOME_MOON_RADIUS.toFixed(4), TS_DOME_SUN_RADIUS: DOME_SUN_RADIUS.toFixed(4) },
});
