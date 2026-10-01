import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { cylinderMesh } from '../meshUtils';
import { part } from '../props/Prop';
import { paint, timber, METAL } from '../materials/palette';
import { seededRandom } from '@/graphics/canvas';

export interface FlowerStandOptions {
  width?: number;
  seed?: number;
}

/** The steps of the stand: height of each tread and how far back it is. */
const STEPS: readonly [y: number, z: number][] = [[0.2, 0.42], [0.45, 0.24], [0.7, 0.06]];
const TREAD = 0.2;
const BLOOMS: readonly number[] = [0xe84a5a, 0xf0d040, 0xf4f0f4, 0xd87ab8, 0xf08a30, 0x8a5ad8, 0xe82a3a];
const STEM = 0x4a7a3a;

/**
 * The florist's stepped stand of cut flowers: three wooden treads rising to the wall, galvanised buckets along each,
 * every bucket a bunch of one colour (tulips, roses, daisies...), a price card on a stick in some. The shop's, not
 * for the flat: the flat's plants are the potted ones on the tables. Static: its parts merge. Wall-hung with `y: 0`:
 * origin on the floor at the wall, +z into the room. Collides as its box.
 */
export class FlowerStand extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;

  constructor(options: FlowerStandOptions = {}) {
    super();
    this.name = 'FlowerStand';
    const W = options.width ?? 1.6;
    const random = seededRandom(options.seed ?? 21);
    const wood = timber(0x9a7048, 0.7);
    const zinc = METAL.satinSteel();
    const stem = paint(STEM, 0.7);
    const stick = paint(0x6a5a3a, 0.8);
    const card = paint(0xf4f0e4, 0.8);
    // One unit sphere for every head (scaled): the merge still makes one draw per colour.
    const headShape = new THREE.SphereGeometry(1, 10, 8);
    for (const [y, z] of STEPS) {
      part(this, W, 0.03, TREAD, wood, { y: y - 0.015, z: z + TREAD / 2 });
      part(this, W, y - 0.03, 0.02, wood, { y: (y - 0.03) / 2, z: z + TREAD - 0.01 });
      let x = -W / 2 + 0.14;
      while (x < W / 2 - 0.12) {
        const r = 0.09;
        this.add(cylinderMesh(r, 0.22, zinc, { x, y: y + 0.11, z: z + TREAD / 2 }, { radiusBottom: r * 0.8, segments: 16 }));
        const bloom = paint(BLOOMS[Math.floor(random() * BLOOMS.length)]!, 0.6);
        const stems = 7 + Math.floor(random() * 4);
        for (let i = 0; i < stems; i++) {
          const a = (i / stems) * Math.PI * 2 + random();
          const d = random() * r * 0.6;
          const h = 0.3 + random() * 0.18;
          const sx = x + Math.cos(a) * d;
          const sz = z + TREAD / 2 + Math.sin(a) * d;
          this.add(cylinderMesh(0.004, h, stem, { x: sx, y: y + 0.1 + h / 2, z: sz }, { segments: 5 }));
          const head = new THREE.Mesh(headShape, bloom);
          const size = 0.028 + random() * 0.01;
          head.position.set(sx + Math.cos(a) * 0.02, y + 0.1 + h, sz + Math.sin(a) * 0.02);
          head.scale.set(size, size * 0.8, size);
          head.castShadow = true;
          this.add(head);
        }
        // A price card on a stick in some of them, turned to the room.
        if (random() < 0.45) {
          const cz = z + TREAD / 2 + r * 0.7;
          part(this, 0.003, 0.26, 0.003, stick, { x: x + r * 0.4, y: y + 0.13 + 0.12, z: cz });
          part(this, 0.055, 0.038, 0.003, card, { x: x + r * 0.4, y: y + 0.4, z: cz + 0.003 });
        }
        x += r * 2 + 0.06;
      }
    }
    const [, frontZ] = STEPS[0]!;
    this.footprint = new THREE.Box3(new THREE.Vector3(-W / 2, 0, 0), new THREE.Vector3(W / 2, 1.2, frontZ + TREAD));
  }
}
