import * as THREE from 'three';
import { standard } from '../materials/palette';
import { additive } from '@/world/materials/blend';
import { radialGlow, verticalGlow } from '@/world/materials/glowTextures';

/** A warm LED strip, lit (no light of its own: the displays never add one, see docs/props.md "Lights"). */
export const WARM_STRIP = standard({ color: 0xfff1d0, emissive: 0xffe2a8, emissiveIntensity: 1.6, roughness: 0.5 });
/** The lit front edge of a glass shelf (edge-lit glass), a cooler white. */
export const EDGE_LIGHT = standard({ color: 0xeaf4ff, emissive: 0xd8ecff, emissiveIntensity: 1.25, roughness: 0.3 });

/** A strip's light painted onto what it shines on: added over it, the canvas's alpha kept (docs/graphics.md). */
export function bakedGlow(color: number, opacity: number, map: THREE.Texture): THREE.MeshBasicMaterial {
  return additive(new THREE.MeshBasicMaterial({ color, map, opacity, depthWrite: false }));
}

/** Bright at the top (under the strip), fading down (shared: `materials/glowTextures`). */
export function washTexture(): THREE.CanvasTexture {
  return verticalGlow(64, [[0, 1], [0.35, 0.45], [1, 0.06]]);
}

/** A soft oval pool, brightest towards the front (shared: `materials/glowTextures`). */
export function poolTexture(): THREE.CanvasTexture {
  return radialGlow({ width: 64, height: 32, centre: [32, 20], radius: [2, 32], stops: [[0, 1], [1, 0]] });
}
