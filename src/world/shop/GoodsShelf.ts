import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { cylinderMesh } from '../meshUtils';
import { part } from '../props/Prop';
import { paint, timber } from '../materials/palette';
import { lcg, pick } from '@/random';

/** What stands on the shelves: kibble bags and tins (the pet shop), boxed spares and valves (the TV repair), empty pots (the florist), cushions and table lamps (the furniture shop). */
export type ShelfStock = 'pets' | 'spares' | 'pots' | 'homewares';

export interface GoodsShelfOptions {
  width?: number;
  /** Shelves, bottom first. Default 4. */
  shelves?: number;
  stock: ShelfStock;
  seed?: number;
}

const DEPTH = 0.36;
const BOARD = 0.022;
const SPACING = 0.42;
const BOTTOM = 0.12;

const COLOURS: Record<ShelfStock, readonly number[]> = {
  pets: [0xc8402e, 0x2e6ab8, 0xe8b830, 0x3a8a4a, 0xe8e0d0, 0x8a3a8a],
  spares: [0xd8c8a0, 0xb89a68, 0x4a5a6e, 0xe8e0d0, 0x8a2a22],
  pots: [0xb86a44, 0xc8784e, 0xe8e0d4, 0x5a7a8a, 0x9a4a3a],
  homewares: [0xb85a3a, 0x3a6a5a, 0xd8c8a8, 0x6a4a7a, 0xc8a040, 0x4a5a7a],
};
/** A table lamp's shade, and its base (the furniture shop's shelf). */
const SHADE = 0xf0e6d0;
const LAMP_BASE = 0x8a6a40;

/**
 * A wall of shop shelving: plain boards on uprights, stocked by kind: bags and tins of cat food and boxes of litter for
 * the pet shop, cardboard boxes of spares and tubes for the TV repair shop, stacks of empty pots for the florist,
 * cushions in piles and little table lamps for the furniture shop. Not
 * for sale (the goods of the flat are on the floor, tagged). Static: its parts merge. Wall-hung with `y: 0`: origin on
 * the floor at the wall, +z into the room. Collides as its box.
 */
export class GoodsShelf extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;

  constructor(options: GoodsShelfOptions) {
    super();
    this.name = 'GoodsShelf';
    const W = options.width ?? 1.6;
    const shelves = options.shelves ?? 4;
    const random = lcg(options.seed ?? 11);
    const wood = timber(0xc9a878, 0.6);
    const top = BOTTOM + (shelves - 1) * SPACING + 0.4;
    part(this, W, top, 0.015, wood, { y: top / 2, z: 0.0075 });
    for (const x of [-W / 2 + 0.015, W / 2 - 0.015]) part(this, 0.03, top, DEPTH, wood, { x, y: top / 2, z: DEPTH / 2 });
    const colours = COLOURS[options.stock];
    const pickPaint = (): THREE.Material => paint(pick(random, colours), 0.7);
    for (let s = 0; s < shelves; s++) {
      const y = BOTTOM + s * SPACING;
      part(this, W - 0.06, BOARD, DEPTH - 0.02, wood, { y: y - BOARD / 2, z: DEPTH / 2 + 0.005 });
      let x = -W / 2 + 0.06;
      while (x < W / 2 - 0.12) {
        const w = this.item(options.stock, x, y, random, pickPaint);
        x += w + 0.015 + random() * 0.03;
      }
    }
    this.footprint = new THREE.Box3(new THREE.Vector3(-W / 2, 0, 0), new THREE.Vector3(W / 2, top, DEPTH));
  }

  /** One thing on a shelf at (x, y), its left edge at x; returns its width. */
  private item(stock: ShelfStock, x: number, y: number, random: () => number, pick: () => THREE.Material): number {
    const z = DEPTH / 2 + 0.02;
    const roll = random();
    if (stock === 'homewares') return this.homeware(x, y, z, roll, random, pick);
    if (stock === 'pots' || (stock === 'pets' && roll < 0.35) || (stock === 'spares' && roll < 0.2)) {
      // Round: a stack of pots, a tin, a tube.
      const r = stock === 'pots' ? 0.06 + random() * 0.03 : 0.035 + random() * 0.01;
      const count = stock === 'pots' ? 2 + Math.floor(random() * 3) : 1 + Math.floor(random() * 3);
      const material = pick();
      for (let i = 0; i < count; i++) {
        const h = stock === 'pots' ? 0.09 : 0.07;
        this.add(cylinderMesh(r, h, material, { x: x + r, y: y + h / 2 + i * (stock === 'pots' ? 0.03 : h), z }, { radiusBottom: stock === 'pots' ? r * 0.75 : r, segments: 14 }));
      }
      return r * 2;
    }
    // Square: a bag of kibble, a box.
    const w = stock === 'pets' ? 0.16 + random() * 0.08 : 0.1 + random() * 0.14;
    const h = stock === 'pets' ? 0.24 + random() * 0.08 : 0.08 + random() * 0.16;
    const d = stock === 'pets' ? 0.1 : 0.12 + random() * 0.1;
    part(this, w, h, d, pick(), { x: x + w / 2, y: y + h / 2, z });
    return w;
  }

  /** The furniture shop's odds and ends: a pile of two or three cushions, or a table lamp with its shade. */
  private homeware(x: number, y: number, z: number, roll: number, random: () => number, pick: () => THREE.Material): number {
    if (roll < 0.35) {
      const r = 0.05 + random() * 0.02;
      this.add(cylinderMesh(r * 0.6, 0.12, paint(LAMP_BASE, 0.4), { x: x + r, y: y + 0.06, z }, { radiusBottom: r * 0.8, segments: 12 }));
      this.add(cylinderMesh(r * 0.9, 0.12, paint(SHADE, 0.9), { x: x + r, y: y + 0.18, z }, { radiusBottom: r * 1.35, segments: 16 }));
      return r * 2.7;
    }
    const w = 0.26 + random() * 0.1;
    const count = 2 + Math.floor(random() * 2);
    for (let i = 0; i < count; i++) {
      // Squashed, a little askew on the one under it.
      const cushion = part(this, w - i * 0.02, 0.09, 0.26, pick(), { x: x + w / 2 + (random() - 0.5) * 0.02, y: y + 0.045 + i * 0.085, z });
      cushion.rotation.y = (random() - 0.5) * 0.25;
    }
    return w;
  }
}
