import * as THREE from 'three';
import type { SkyState } from '../props/DayNight';

/** Clear air still has some depth: the far end of the street is a little paler (per metre, `FogExp2`). */
const CLEAR_DENSITY = 0.0065;
const CITY_GLOW = new THREE.Color(0x3a2414);

/** How thick the air over the street is (`FogExp2` density): a light haze, far thicker in fog, rain and snow. */
export function airDensity(sky: SkyState): number {
  return CLEAR_DENSITY + 0.032 * sky.fog + 0.011 * sky.rain + 0.02 * sky.snow;
}

/**
 * The colour of the air: the horizon's (which the sky already greys with cloud and fog), a little
 * darker than the sky itself, warmed by the city's glow at night. The sky dome fades its low sky
 * into the same colour, so the far end of the street melts into the horizon.
 */
export function airColor(sky: SkyState, out: THREE.Color): THREE.Color {
  const night = 1 - THREE.MathUtils.smoothstep(sky.sunHeight, -0.2, 0.12);
  out.copy(sky.horizon).multiplyScalar(THREE.MathUtils.lerp(0.92, 0.6, night));
  return out.lerp(CITY_GLOW, night * 0.35 * (0.5 + sky.cloudCover));
}

/** 0 by day .. 1 at night, the way the painted view's lights come on (`Outdoors.nightness`). */
export function nightnessOf(sky: SkyState): number {
  return 1 - THREE.MathUtils.smoothstep(sky.sunHeight, -0.2, 0.12);
}
