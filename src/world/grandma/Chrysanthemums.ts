import * as THREE from 'three';
import { cylinderMesh } from '../meshUtils';
import { Prop } from '../props/Prop';
import { paint } from '../materials/palette';
import { SEAM } from '../props/joinery';
import { lcg } from '@/random';

const POT = { r: 0.075, h: 0.1, rim: 0.012 };
const MOUND = { r: 0.11, blooms: 22, bloom: 0.022 };
const COLOURS = [0xc8782a, 0xe0a83a, 0xb8502a, 0xe8c85a] as const;

/**
 * The pot of chrysanthemums on Mémé's table round All Saints (docs/grandma.md "Sunday lunch, recipes and favours"):
 * a terracotta pot, the leaves in a mound, the bronze and yellow heads all over it. Origin on the cloth; never collides.
 */
export class Chrysanthemums extends Prop {
  readonly contactShadow = false;

  constructor(seed = 11) {
    super();
    this.name = 'Chrysanthemums';
    const random = lcg(seed);
    this.add(cylinderMesh(POT.r, POT.h, paint(0xa8583a, 0.8), { y: POT.h / 2 }, { radiusBottom: POT.r * 0.75, segments: 18 }));
    this.add(cylinderMesh(POT.r * 1.08, POT.rim, paint(0xa8583a, 0.8), { y: POT.h - POT.rim / 2 + SEAM }, { segments: 18 }));
    const leaves = new THREE.Mesh(new THREE.SphereGeometry(MOUND.r, 14, 10), paint(0x3a5a2a, 0.8));
    leaves.scale.set(1, 0.7, 1);
    leaves.position.y = POT.h + MOUND.r * 0.45;
    leaves.castShadow = true;
    this.add(leaves);
    const bloom = new THREE.SphereGeometry(MOUND.bloom, 8, 6);
    for (let i = 0; i < MOUND.blooms; i++) {
      // Heads over the top of the mound, a little proud of it.
      const a = random() * Math.PI * 2;
      const up = 0.25 + random() * 0.75;
      const r = MOUND.r * 1.02;
      const head = new THREE.Mesh(bloom, paint(COLOURS[i % COLOURS.length]!, 0.7));
      head.position.set(Math.cos(a) * r * Math.sqrt(1 - up * up), leaves.position.y + up * r * 0.7, Math.sin(a) * r * Math.sqrt(1 - up * up));
      this.add(head);
    }
  }
}
