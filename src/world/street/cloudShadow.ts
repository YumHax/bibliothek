import * as THREE from 'three';
import type { SkyState } from '../props/DayNight';
import { damp } from '@/math/damp';
import { oneDriver } from './oneDriver';

/**
 * The clouds' shadows sweeping over the street on a partly cloudy day: patches of shade, a few dozen metres to a
 * hundred across, drifting down the wind (`STREET_WIND`'s way) at the clouds' pace. Worked out in the sun's shadow
 * lookup (`shadowFade`): the point's ray towards the sun meets the cloud deck (`DECK` m up) and the deck's noise there
 * says how much of the sun gets through. xy the deck's drift (m), z the noise level over which a cloud is thick
 * enough to shade (lower as the cover closes), w how dark its shade is (none under a clear sky or an overcast one,
 * where the sun is gone anyway).
 */
export const CLOUD_SHADOW = { value: new THREE.Vector4(0, 0, 1, 0) };

/** The cloud deck's height (m) and the size of its noise's cells (m): shade patches some 40 to 120 m across. */
const DECK = 900;
const CELL = 140;
const driver = oneDriver();

/** Drifts the deck on by `dt` and follows the sky's cover (only for the rig driving it this frame). */
export function advanceClouds(owner: object, dt: number, sky: SkyState): void {
  if (!driver.drives(owner)) return;
  const c = CLOUD_SHADOW.value;
  const speed = 3 + 9 * sky.wind;
  c.x = (c.x + dt * speed * 0.96) % 20000;
  c.y = (c.y + dt * speed * 0.28) % 20000;
  const cover = sky.cloudCover;
  // Broken cloud shades most; a fair sky has a few small heaps, an overcast one no sun left to shade.
  const shaded = THREE.MathUtils.smoothstep(cover, 0.06, 0.35) * (1 - THREE.MathUtils.smoothstep(cover, 0.82, 0.97));
  c.z = damp(c.z, THREE.MathUtils.lerp(0.78, 0.38, cover), 0.5, dt);
  c.w = damp(c.w, 0.72 * shaded, 0.5, dt);
}

/** GLSL: `cloudShadowAt(world, toSun)` 1 in sunlight .. under a cloud's shade (`CLOUD_SHADOW` in the uniform `cloudShadow`). */
export const CLOUD_SHADOW_GLSL = /* glsl */ `
uniform vec4 cloudShadow;
float cloudHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cloudNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(cloudHash(i), cloudHash(i + vec2(1.0, 0.0)), f.x), mix(cloudHash(i + vec2(0.0, 1.0)), cloudHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float cloudShadowAt(vec3 w, vec3 toSun) {
  if (cloudShadow.w <= 0.001 || toSun.y <= 0.05) return 1.0;
  vec2 deck = (w.xz + toSun.xz * ((${DECK.toFixed(1)} - w.y) / toSun.y) + cloudShadow.xy) / ${CELL.toFixed(1)};
  float n = 0.55 * cloudNoise(deck) + 0.3 * cloudNoise(deck * 2.3 + 7.1) + 0.15 * cloudNoise(deck * 5.1 + 3.7);
  return 1.0 - cloudShadow.w * smoothstep(cloudShadow.z, cloudShadow.z + 0.14, n);
}
`;
