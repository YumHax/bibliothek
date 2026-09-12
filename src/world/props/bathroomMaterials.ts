import * as THREE from 'three';
import { matte } from './Prop';

/*
 * The materials every sanitary fitting shares: one white ceramic, one chrome, so the bathtub,
 * the basin and the WC read as one suite. Module-level, so shared across instances; none of
 * them carries per-instance state.
 */

/** Glazed white ceramic (sanitaryware, tiles' cousin). */
export const CERAMIC = matte(0xf4f4f0, 0.25);
/** Polished chrome for taps, rails and brackets. */
export const CHROME = new THREE.MeshStandardMaterial({ color: 0xd8dde0, metalness: 0.9, roughness: 0.2 });
/** White plastic of seats and lids: a touch less glossy than the ceramic. */
export const WHITE_PLASTIC = matte(0xf7f7f4, 0.4);
/** Clear glass of shower screens and shelves: see-through, never a shadow caster. */
export const CLEAR_GLASS = new THREE.MeshStandardMaterial({
  color: 0xdff0f0,
  roughness: 0.05,
  metalness: 0.1,
  transparent: true,
  opacity: 0.28,
  side: THREE.DoubleSide,
  depthWrite: false,
});
