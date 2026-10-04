import { currentSeason } from '@/time/season';
import * as THREE from 'three';

const scratchA = new THREE.Color();
const scratchB = new THREE.Color();

/** `hex` darkened (k < 1) or lightened (k > 1): the street's own formula (`city/colour`), so both pictures agree. */
export { shade } from '../../city/colour';

/** Blend of two CSS colours, `t` = 0 all `a` .. 1 all `b`. */
export function mixHex(a: string, b: string, t: number): string {
  scratchA.set(a).lerp(scratchB.set(b), THREE.MathUtils.clamp(t, 0, 1));
  return `#${scratchA.getHexString()}`;
}

export function deg(degrees: number): number {
  return THREE.MathUtils.degToRad(degrees);
}

/** The lawn's colour in the current season: fresh in spring, parched at the end of summer, dun in winter. */
export function seasonalLawn(hex: string): string {
  const { name, depth } = currentSeason();
  if (name === 'spring') return mixHex(hex, '#8fc05a', 0.25);
  if (name === 'summer') return mixHex(hex, '#a8a860', 0.2 * depth);
  if (name === 'autumn') return mixHex(hex, '#9a9658', 0.15 + 0.2 * depth);
  return mixHex(hex, '#8f8a6a', 0.6);
}
