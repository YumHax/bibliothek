import type * as THREE from 'three';
import { cylinderMesh } from '../../meshUtils';
import { part } from '../../props/Prop';
import { paint } from '../../materials/palette';

/** What something hangs from the ceiling by: a chain, a steel rod, a cord, a jute rope (a macramé plant hanger). */
type DropStyle = 'chain' | 'rod' | 'cord' | 'jute';

const LOOKS: Record<DropStyle, { material: THREE.Material; thick: number }> = {
  chain: { material: paint(0x8a8680, 0.35), thick: 0.008 },
  rod: { material: paint(0x3a3a3c, 0.4), thick: 0.01 },
  cord: { material: paint(0x2a2624, 0.8), thick: 0.004 },
  jute: { material: paint(0xb89a6a, 1), thick: 0.006 },
};
const ROSE = paint(0xf2f0ea, 0.7);

/**
 * For a thing hung from the ceiling (a `{ ceiling: [x, z] }` placement puts the origin on the ceiling, local y up):
 * adds the drop from the ceiling down to `length` below it (a little ceiling rose where it is fixed, the chain, rod or
 * cord), and returns the y (negative) the thing itself hangs from, so the prop builds its body below that point:
 * hanging baskets, a mobile, a bird's hoop, cable trays, a fan's down-rod.
 */
export function hangFromCeiling(parent: THREE.Object3D, length: number, style: DropStyle = 'chain'): number {
  const { material, thick } = LOOKS[style];
  parent.add(cylinderMesh(0.035, 0.012, ROSE, { y: -0.006 }, { segments: 16 }));
  if (style === 'rod') parent.add(cylinderMesh(thick, length, material, { y: -length / 2 }, { segments: 10 }));
  else part(parent, thick, length, thick, material, { y: -length / 2 });
  return -length;
}
