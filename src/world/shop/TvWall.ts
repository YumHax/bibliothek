import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { part } from '../props/Prop';
import { paint, METAL } from '../materials/palette';
import { seededRandom } from '@/graphics/canvas';
import { PortableTv } from './shopModels';

export interface TvWallOptions {
  /** Length along the wall. Default 2.4. */
  width?: number;
  /** Shelves, bottom first (each a row of sets). Default 3. */
  rows?: number;
  seed?: number;
}

const DEPTH = 0.42;
const SHELF = 0.025;
const ROW = 0.5;
const BOTTOM = 0.3;
const CASES: readonly number[] = [0x5a5a5e, 0xd8d2c4, 0x2a2a2c, 0x8a3a2a, 0x6a6f74, 0xb8b0a0];

/**
 * The TV repair shop's wall of sets, every one tuned to the same snowstorm: a steel rack of shelves along the wall,
 * each row a line of portable CRTs of all sizes and colours (`PortableTv` with the shared snow screen, repainted by the
 * `SnowTicker` placed with it: the rack stays static and merges). Not for sale: the ones for sale stand on the
 * tables. Wall-hung with `y: 0`: origin on the floor at the wall, +z into the room. Collides as its box.
 */
export class TvWall extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;

  constructor(options: TvWallOptions = {}) {
    super();
    this.name = 'TvWall';
    const W = options.width ?? 2.4;
    const rows = options.rows ?? 3;
    const random = seededRandom(options.seed ?? 5);
    const steel = METAL.satinSteel();
    const board = paint(0x3a3c40, 0.6);
    const top = BOTTOM + rows * ROW;
    for (const x of [-W / 2 + 0.02, W / 2 - 0.02]) for (const z of [0.03, DEPTH - 0.03]) part(this, 0.03, top, 0.03, steel, { x, y: top / 2, z });
    for (let r = 0; r <= rows; r++) {
      const y = BOTTOM + r * ROW - SHELF / 2;
      part(this, W - 0.07, SHELF, DEPTH - 0.02, board, { y, z: DEPTH / 2 });
      if (r === rows) break;
      let x = -W / 2 + 0.08;
      while (true) {
        const width = 0.24 + random() * 0.16;
        if (x + width > W / 2 - 0.06) break;
        const tv = new PortableTv({ width, case: CASES[Math.floor(random() * CASES.length)]!, snow: true });
        tv.position.set(x + width / 2, y + SHELF / 2, DEPTH / 2 - 0.02);
        tv.rotation.y = (random() - 0.5) * 0.12;
        this.add(tv);
        x += width + 0.04 + random() * 0.05;
      }
    }
    this.footprint = new THREE.Box3(new THREE.Vector3(-W / 2, 0, 0), new THREE.Vector3(W / 2, top, DEPTH));
  }
}
