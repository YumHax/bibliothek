import * as THREE from 'three';
import type { Furniture } from '../../Furniture';
import { part } from '../../props/Prop';
import { cloth, paint, timber } from '../../materials/palette';
import { seededRandom } from '@/graphics/canvas';
import { LeafBatch, LEAF_GREENS, addFern, addTrail, pick } from './greenery';

export interface FernWallOptions {
  /** Size of the panel. Default 1.3 x 1.1. */
  width?: number;
  height?: number;
  /** Height of its bottom edge over the floor. Default 0.95. */
  bottom?: number;
  /** Pockets across and up. Default 4 x 3. */
  columns?: number;
  rows?: number;
  seed?: number;
}

const FELT = cloth(0x3a3a34, 1);
const POCKET = cloth(0x4a4a40, 1);

/**
 * A living wall: a panel of dark felt pockets in an oak frame, a fern arching out of each pocket and now and then a
 * trailing ivy or a creeping fig instead, a drip rail along its foot. Static: its leaves are baked by green
 * (`LeafBatch`), its parts merge. Wall-hung with `y: 0`: origin on the floor at the wall, +z into the room. Collides as
 * its box (a hand's depth off the wall).
 */
export class FernWall extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;

  constructor(options: FernWallOptions = {}) {
    super();
    this.name = 'FernWall';
    const W = options.width ?? 1.3;
    const H = options.height ?? 1.1;
    const y0 = options.bottom ?? 0.95;
    const columns = options.columns ?? 4;
    const rows = options.rows ?? 3;
    const random = seededRandom(options.seed ?? 8);
    const oak = timber(0xa07a4e, 0.6);
    const F = 0.05;
    part(this, W - 2 * F, H - 2 * F, 0.02, FELT, { y: y0 + H / 2, z: 0.01 });
    for (const y of [y0 + F / 2, y0 + H - F / 2]) part(this, W, F, 0.07, oak, { y, z: 0.035 });
    for (const x of [-W / 2 + F / 2, W / 2 - F / 2]) part(this, F, H - 2 * F, 0.07, oak, { x, y: y0 + H / 2, z: 0.035 });
    // The drip rail under it.
    part(this, W - 0.1, 0.02, 0.1, paint(0x6a6e70, 0.4), { y: y0 - 0.02, z: 0.05 });

    const leaves = new LeafBatch();
    const cw = (W - 2 * F) / columns;
    const rh = (H - 2 * F) / rows;
    const out = new THREE.Vector3(0, 0, 1);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        const x = -W / 2 + F + cw * (c + 0.5);
        const y = y0 + F + rh * (r + 0.35);
        part(this, cw * 0.78, rh * 0.32, 0.05, POCKET, { x, y: y - rh * 0.1, z: 0.045 });
        const at = new THREE.Vector3(x, y + 0.02, 0.07);
        if (random() < 0.75) addFern(this, leaves, at, 0.2 + random() * 0.08, random, out, pick(random, [LEAF_GREENS.lime[1], LEAF_GREENS.lime[2], LEAF_GREENS.classic[1]]));
        else for (let v = 0; v < 4; v++) addTrail(this, leaves, at.clone().add(new THREE.Vector3((random() - 0.5) * 0.1, 0, 0)), 0.25 + random() * 0.2, random, LEAF_GREENS.deep, 0.035, out);
      }
    }
    leaves.addTo(this);
    this.footprint = new THREE.Box3(new THREE.Vector3(-W / 2, 0, 0), new THREE.Vector3(W / 2, y0 + H, 0.12));
  }
}
