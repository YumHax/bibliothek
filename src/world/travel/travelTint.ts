import * as THREE from 'three';
import type { ZoneKind } from '../worldPlan';

/** The curtain's colours: a shop's lamplight, the street's air by day and by night, a room's dusk. */
const WARM = new THREE.Color(0x24170c);
const DAY_AIR = new THREE.Color(0x2c3640);
const NIGHT_AIR = new THREE.Color(0x06080d);
const INDOORS = new THREE.Color(0x0d0b09);
const scratch = new THREE.Color();

/**
 * The colour a trip's curtain falls in (`Travel`'s `tint`): the light of where the player is going, kept
 * dark (the curtain is still a curtain) but warm for a shop, the arcade, the market or the saleroom, the
 * sky's grey-blue for the street and the courtyard by day, near black at night.
 */
export function travelTint(kind: ZoneKind, daylight: number): string {
  if (kind === 'shop' || kind === 'arcade' || kind === 'market' || kind === 'saleroom') return `#${WARM.getHexString()}`;
  if (kind === 'street' || kind === 'courtyard' || kind === 'roof') return `#${scratch.copy(NIGHT_AIR).lerp(DAY_AIR, THREE.MathUtils.clamp(daylight, 0, 1)).getHexString()}`;
  return `#${INDOORS.getHexString()}`;
}
