import * as THREE from 'three';
import { cylinderMesh } from '../../meshUtils';
import { Prop, part } from '../../props/Prop';
import { paint } from '../../materials/palette';
import { seededRandom } from '@/graphics/canvas';
import { LeafBatch, LEAF_GREENS, addBunch, headGeometry, pick } from './greenery';

export interface BouquetStandOptions {
  /** Length of the stand. Default 1.2. */
  width?: number;
  seed?: number;
}

/** Three tiers, glass side first: the height of each tread and where it is (z, the glass at -z). */
const TIERS: readonly [y: number, z: number][] = [[0.1, -0.13], [0.24, 0], [0.38, 0.13]];
const TREAD = 0.13;
/** The window's bouquets: mixed, the way they are sold (two or three colours each). */
const MIXES: readonly (readonly number[])[] = [
  [0xe84a5a, 0xf4f0f4],
  [0xf0d040, 0xf08a30, 0xf4f0f4],
  [0xd87ab8, 0x8a5ad8],
  [0xc8203a, 0xf0a0b8],
  [0xf4f0f4, 0xe8d040],
  [0xb04ac0, 0xf0a0b8, 0xf4f0f4],
];
/** Vases: glazed stoneware in cream, sage and plum, a zinc pail now and then (opaque: they merge). */
const VASES = [0xf0ead8, 0x9ab0a0, 0x6a4a7a, 0x3a5a6a];

/**
 * The florist's window display (`on: 'windowDisplay'`), the same as the street sees through the glass: a stepped
 * stand in white-painted wood, three treads rising from the glass into the shop, a vase on each spot along them
 * holding a mixed bouquet, the tallest at the back so the street sees them all. Origin on the plinth's top under its
 * middle, the glass at -z. Decoration: never collides.
 */
export class BouquetStand extends Prop {
  constructor(options: BouquetStandOptions = {}) {
    super();
    this.name = 'BouquetStand';
    const W = options.width ?? 1.2;
    const random = seededRandom(options.seed ?? 44);
    const wood = paint(0xeeeae0, 0.55);
    const leaves = new LeafBatch();
    const head = headGeometry();
    for (const [i, [y, z]] of TIERS.entries()) {
      part(this, W, 0.025, TREAD, wood, { y: y - 0.0125, z });
      part(this, W, y - 0.025, 0.018, wood, { y: (y - 0.025) / 2, z: z - TREAD / 2 + 0.009 });
      const count = 4 - (i === 2 ? 1 : 0);
      const step = (W - 0.16) / count;
      for (let v = 0; v < count; v++) {
        const x = -W / 2 + 0.08 + step * (v + 0.5) + (i % 2 ? step * 0.2 : 0);
        const h = 0.14 + random() * 0.08;
        const r = 0.045 + random() * 0.015;
        const vase = paint(pick(random, VASES), 0.35);
        this.add(cylinderMesh(r * 0.8, h, vase, { x, y: y + h / 2, z }, { radiusBottom: r, segments: 16 }));
        addBunch(this, leaves, head, new THREE.Vector3(x, y + h, z), { colors: pick(random, MIXES), stems: 10 + Math.floor(random() * 5), height: 0.26 + i * 0.04, spread: 0.1, head: 0.026, green: pick(random, LEAF_GREENS.classic) }, random);
      }
    }
    // The risers at each end.
    for (const x of [-W / 2 + 0.01, W / 2 - 0.01]) part(this, 0.02, TIERS[2]![0] - 0.025, TIERS[2]![1] - TIERS[0]![1] + TREAD, wood, { x, y: (TIERS[2]![0] - 0.025) / 2, z: (TIERS[0]![1] + TIERS[2]![1]) / 2 });
    leaves.addTo(this);
  }
}
