import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { cylinderMesh } from '../meshUtils';
import { softPart } from '../props/softBlock';
import { timber } from '../materials/palette';
import { wovenCloth } from '../materials/weave';
import { SEAM } from '../props/joinery';

const W = 0.42;
const D = 0.32;
const LEG = 0.1;
const PAD = 0.14;

/**
 * Mémé's footstool by her armchair (`furnishGrandmaDecor`): a buttoned velvet pad on four turned legs. Origin on the
 * floor under its middle. Collides (a low box).
 */
export class Footstool extends THREE.Group implements Furniture {
  readonly footprint = new THREE.Box3(new THREE.Vector3(-W / 2, 0, -D / 2), new THREE.Vector3(W / 2, LEG + PAD, D / 2));

  constructor(color = 0x6a2a3a) {
    super();
    this.name = 'Footstool';
    const wood = timber(0x4a2e1a, 0.5);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.add(cylinderMesh(0.018, LEG, wood, { x: sx * (W / 2 - 0.04), y: LEG / 2, z: sz * (D / 2 - 0.04) }, { radiusBottom: 0.012, segments: 10 }));
    softPart(this, W, PAD, D, wovenCloth(color, 0.9), { y: LEG + SEAM + PAD / 2 }, { round: 5, pinch: 0.15, lumps: 0.004, seed: 7 });
  }
}
