import * as THREE from 'three';
import { QUALITY } from '@/graphics/quality';
import { coverageKeepsAlpha } from '../../materials/palette';

/**
 * A material of its own for a painted sheet cut out by its alpha (a notice's curled corner, a card's torn edge, a
 * sticker): cut, never blended, so the canvas's alpha (the video cut-out, docs/graphics.md) is kept; with MSAA its edge
 * is smoothed by coverage (`coverageKeepsAlpha`).
 */
export function cutOut(map: THREE.Texture, roughness = 0.85): THREE.MeshStandardMaterial {
  return coverageKeepsAlpha(new THREE.MeshStandardMaterial({ map, roughness, alphaTest: 0.5, alphaToCoverage: QUALITY.msaa > 0 }));
}
