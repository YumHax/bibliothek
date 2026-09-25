import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { part, matte } from './Prop';
import { wood as woodMaterial } from '@/world/materials/finishes';

export interface ShoeRackOptions {
  /** Length along the wall. Default 0.7. */
  width?: number;
  /** Timber colour. Default a pale oak. */
  wood?: number;
}

const DEPTH = 0.26;
const HEIGHT = 0.46;
/** Heights of the two slatted shelves (the top one is the bench). */
const SHELVES = [0.1, HEIGHT - 0.02];
const RUBBER = matte(0x2a2826, 0.8);
const SOLE = matte(0xe8e4dc, 0.8);

type ShoeKind = 'trainer' | 'boot' | 'shoe' | 'slipper';

/**
 * A slatted oak shoe rack under the coats by a front door, two tiers: trainers and a pair of
 * leather shoes below, boots and slippers on the top, a trainer knocked over by the end. Wall
 * placement with `y: 0`: origin on the floor at the wall, +z into the room. Collides.
 */
export class ShoeRack extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;

  constructor(options: ShoeRackOptions = {}) {
    super();
    this.name = 'ShoeRack';
    const width = options.width ?? 0.7;
    const oak = woodMaterial(options.wood ?? 0xb38a5c, 0.55);
    const z = 0.01 + DEPTH / 2;

    // Two end frames, each two legs and a rail, and the slatted shelves between them.
    for (const sx of [-1, 1]) {
      const x = sx * (width / 2 - 0.015);
      for (const dz of [-DEPTH / 2 + 0.02, DEPTH / 2 - 0.02]) part(this, 0.03, HEIGHT, 0.03, oak, { x, y: HEIGHT / 2, z: z + dz });
      // Rails a hair thinner than the legs, so their sides do not fight the legs' grain.
      for (const y of SHELVES) part(this, 0.026, 0.03, DEPTH, oak, { x, y: y - 0.02, z });
    }
    for (const y of SHELVES) for (let i = 0; i < 4; i++) part(this, width - 0.06, 0.016, 0.05, oak, { y, z: z - DEPTH / 2 + 0.035 + i * 0.063 });

    const lower = SHELVES[0]! + 0.008;
    const upper = SHELVES[1]! + 0.008;
    this.pair('trainer', 0xf0eee8, -width * 0.3, lower, z);
    this.pair('shoe', 0x3a2418, -width * 0.02, lower, z);
    this.pair('trainer', 0x2f4f7a, width * 0.27, lower, z);
    this.pair('boot', 0x6a4326, -width * 0.25, upper, z);
    this.pair('slipper', 0x8a8f96, width * 0.2, upper, z);

    this.footprint = new THREE.Box3(new THREE.Vector3(-width / 2, 0, 0), new THREE.Vector3(width / 2, HEIGHT, 0.01 + DEPTH));
  }

  /** Two shoes side by side, toes to the room, at (x, y) on a shelf. */
  private pair(kind: ShoeKind, color: number, x: number, y: number, z: number): void {
    const leather = matte(color, kind === 'shoe' ? 0.35 : 0.75);
    for (const side of [-1, 1]) this.add(shoe(kind, leather, x + side * 0.055, y, z + 0.02, side * 0.05));
  }
}

/** One shoe on its sole, toe towards +z: a sole, an upper tapering to the toe, a shaft for a boot. */
function shoe(kind: ShoeKind, leather: THREE.Material, x: number, y: number, z: number, yaw: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = yaw;
  const length = kind === 'boot' ? 0.26 : 0.25;
  const soleH = kind === 'trainer' ? 0.025 : 0.012;
  part(g, 0.085, soleH, length, kind === 'trainer' ? SOLE : RUBBER, { y: soleH / 2 });
  const upperH = kind === 'slipper' ? 0.035 : 0.055;
  part(g, 0.08, upperH, length * 0.62, leather, { y: soleH + upperH / 2, z: -length * 0.17 });
  part(g, 0.075, upperH * 0.6, length * 0.34, leather, { y: soleH + upperH * 0.3, z: length * 0.3 });
  if (kind === 'boot') part(g, 0.075, 0.13, 0.1, leather, { y: soleH + upperH + 0.065, z: -length * 0.3 });
  return g;
}
