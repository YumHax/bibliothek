import * as THREE from 'three';
import { cylinderMesh } from '../../meshUtils';
import { Prop, part } from '../../props/Prop';
import { METAL, paint } from '../../materials/palette';
import { seededRandom } from '@/graphics/canvas';
import { LeafBatch, LEAF_GREENS, addBunch, headGeometry, pick } from './greenery';

export interface WateringCanOptions {
  /** A zinc bucket of stems beside it, and one of greenery. Default true. */
  buckets?: boolean;
  seed?: number;
}

const WATER = paint(0x3a4a4a, 0.08);
const BLOOMS = [0xe84a5a, 0xf0d040, 0xf4f0f4, 0xd87ab8];

/**
 * A galvanised watering can on the floor by the work table, its long spout and its rose, the handle over the top; and
 * beside it the day's buckets waiting to be sorted, one of cut stems and one of eucalyptus and ferns. Static: its
 * parts merge. Origin on the floor under the can, the spout towards +x. Decoration: never collides (it is small).
 */
export class WateringCan extends Prop {
  constructor(options: WateringCanOptions = {}) {
    super();
    this.name = 'WateringCan';
    const zinc = METAL.satinSteel();
    // The body, its top, the spout from low on its side up and out, the rose at its end, the handle.
    this.add(cylinderMesh(0.1, 0.24, zinc, { y: 0.12 }, { radiusBottom: 0.11, segments: 20 }));
    this.add(cylinderMesh(0.07, 0.03, zinc, { y: 0.255 }, { radiusBottom: 0.1, segments: 20 }));
    const spout = cylinderMesh(0.014, 0.4, zinc, { x: 0.22, y: 0.2 }, { radiusBottom: 0.022, segments: 10 });
    spout.rotation.z = -1.0;
    this.add(spout);
    const rose = cylinderMesh(0.035, 0.03, METAL.brass(), { x: 0.39, y: 0.31 }, { radiusBottom: 0.02, segments: 14 });
    rose.rotation.z = -1.0;
    this.add(rose);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.01, 8, 20, Math.PI), zinc);
    handle.position.set(-0.02, 0.26, 0);
    handle.castShadow = true;
    this.add(handle);
    part(this, 0.02, 0.14, 0.02, zinc, { x: -0.12, y: 0.17 });

    if (options.buckets ?? true) {
      const random = seededRandom(options.seed ?? 9);
      const leaves = new LeafBatch();
      const head = headGeometry();
      for (const [i, [x, z]] of ([[-0.2, -0.22], [0.08, -0.3]] as const).entries()) {
        this.add(cylinderMesh(0.12, 0.3, zinc, { x, y: 0.15, z }, { radiusBottom: 0.095, segments: 18 }));
        this.add(cylinderMesh(0.112, 0.004, WATER, { x, y: 0.27, z }, { segments: 18 }));
        const at = new THREE.Vector3(x, 0.28, z);
        if (i === 0) addBunch(this, leaves, head, at, { colors: [pick(random, BLOOMS), pick(random, BLOOMS)], stems: 16, height: 0.42, spread: 0.12, head: 0.03 }, random);
        else addBunch(this, leaves, head, at, { colors: [LEAF_GREENS.sage[0]], stems: 14, height: 0.5, spread: 0.13, head: 0.014, green: LEAF_GREENS.sage[1] }, random);
      }
      leaves.addTo(this);
    }
  }
}
