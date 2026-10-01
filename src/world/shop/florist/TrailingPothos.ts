import * as THREE from 'three';
import { cylinderMesh } from '../../meshUtils';
import { Prop, part } from '../../props/Prop';
import { paint, timber } from '../../materials/palette';
import { seededRandom } from '@/graphics/canvas';
import { LeafBatch, LEAF_GREENS, addTrail, pick, stem } from './greenery';

export interface TrailingPothosOptions {
  /** Length of the shelf top they stand along. Default 1.3. */
  width?: number;
  /** How deep the shelf is: the vines fall over its front edge. Default 0.36. */
  depth?: number;
  /** Pots along it. Default 3. */
  pots?: number;
  /** How far the longest vines fall. Default 0.8. */
  trail?: number;
  /** A board of its own across the top (a `GoodsShelf` is open at the top), in the shelf's pale wood. Default true. */
  board?: boolean;
  seed?: number;
}

const POTS = [0xb8643a, 0xf1ede6, 0x9ab0a0];

/**
 * Pothos and string-of-hearts in little pots along the top of a shelf, their vines spilling over the front edge and
 * down across the shelf's face, the way a florist's shelving disappears under what grows on it. Static (baked leaves,
 * merged pots). Wall-hung at the shelf top's height: origin at the wall on the shelf's top, +z into the room.
 * Decoration: never collides.
 */
export class TrailingPothos extends Prop {
  constructor(options: TrailingPothosOptions = {}) {
    super();
    this.name = 'TrailingPothos';
    const W = options.width ?? 1.3;
    const D = options.depth ?? 0.36;
    const pots = options.pots ?? 3;
    const trail = options.trail ?? 0.8;
    const random = seededRandom(options.seed ?? 3);
    const leaves = new LeafBatch();
    const soil = paint(0x2e2119, 1);
    const vine = paint(0x5a7a3a, 0.7);
    // A board across the shelf's open top (between its uprights) for them to stand on.
    if (options.board ?? true) part(this, W, 0.022, D - 0.02, timber(0xc9a878, 0.6), { y: -0.011, z: D / 2 + 0.005 });
    for (let i = 0; i < pots; i++) {
      const x = -W / 2 + W * ((i + 0.5) / pots) + (random() - 0.5) * 0.08;
      const z = D * 0.55;
      const r = 0.06 + random() * 0.02;
      const h = 0.1 + random() * 0.03;
      this.add(cylinderMesh(r, h, paint(pick(random, POTS), 0.7), { x, y: h / 2, z }, { radiusBottom: r * 0.8, segments: 16 }));
      this.add(cylinderMesh(r * 0.94, 0.01, soil, { x, y: h - 0.015, z }, { segments: 16 }));
      const greens = i % 2 ? LEAF_GREENS.classic : LEAF_GREENS.lime;
      for (let k = 0; k < 10; k++) {
        const a = random() * Math.PI * 2;
        leaves.leaf(pick(random, greens), new THREE.Vector3(x + Math.cos(a) * r * 0.5, h - 0.01, z + Math.sin(a) * r * 0.5), new THREE.Vector3(Math.cos(a), 0.9, Math.sin(a)), 0.06, 0.05, random() * Math.PI);
      }
      // Vines out over the front edge and down, a couple back along the top.
      const vines = 5 + Math.floor(random() * 3);
      for (let v = 0; v < vines; v++) {
        const edge = new THREE.Vector3(x + (random() - 0.5) * 0.3, 0.005, D + 0.01);
        stem(this, new THREE.Vector3(x, h - 0.01, z), edge, vine, 0.004);
        addTrail(this, leaves, edge, trail * (0.35 + random() * 0.65), random, greens, 0.042, new THREE.Vector3(0, 0, 1));
      }
    }
    leaves.addTo(this);
  }
}
