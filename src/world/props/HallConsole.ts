import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { cylinderMesh } from '../meshUtils';
import { Plant } from './Plant';
import { part, matte } from './Prop';
import { wood as woodMaterial } from '@/world/materials/finishes';
import { mirrorGlass } from './MirrorGlass';

export interface HallConsoleOptions {
  /** Length along the wall. Default 0.9. */
  width?: number;
  /** A mirror hung on the wall above it (a true reflection on high quality, see `mirrorGlass`). Default true. */
  mirror?: boolean;
  /** A (static) key lying in the bowl. Default false: the hallway puts its clickable `HouseKeys` there. */
  keys?: boolean;
}

const DEPTH = 0.24;
const TOP_Y = 0.82;
/** How far the console stands off the wall (its back legs). */
const OFF_WALL = 0.01;
const MIRROR_W = 0.55;
const MIRROR_H = 0.75;
const MIRROR_Y = 1.55;

const WALNUT = woodMaterial(0x5e412b, 0.5);
const BRASS = new THREE.MeshStandardMaterial({ color: 0xc9a75b, metalness: 0.85, roughness: 0.3 });
const GLASS = new THREE.MeshStandardMaterial({ color: 0xb8c4cc, roughness: 0.08, metalness: 0.2 });

/**
 * A narrow walnut console against a wall: a key bowl, the mail in a small pile, a plant at the
 * end, and a mirror over it. Wall-hung with `y: 0`: origin on the floor at the wall,
 * +z into the room. Collides at its top.
 */
export class HallConsole extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;
  /** The inside bottom of the key bowl, local: where a builder sets the keys down (`HouseKeys`, via `placeWith`). */
  readonly bowl: THREE.Vector3;

  constructor(options: HallConsoleOptions = {}) {
    super();
    this.name = 'HallConsole';
    const width = options.width ?? 0.9;
    const z = OFF_WALL + DEPTH / 2;
    const legInset = width / 2 - 0.05;

    part(this, width, 0.03, DEPTH, WALNUT, { x: 0, y: TOP_Y - 0.015, z });
    for (const dx of [-legInset, legInset])
      for (const dz of [-0.08, 0.08]) this.add(cylinderMesh(0.014, TOP_Y - 0.03, WALNUT, { x: dx, y: (TOP_Y - 0.03) / 2, z: z + dz }, { radiusBottom: 0.01, segments: 8 }));

    // A bowl for the keys (the keys themselves are a clickable prop the builder sets in it), a small pile of letters, a plant at the end.
    const bowl = cylinderMesh(0.09, 0.05, matte(0x2f3a44, 0.4), { x: -width * 0.22, y: TOP_Y + 0.025, z }, { radiusBottom: 0.055, segments: 18 });
    this.add(bowl);
    this.bowl = new THREE.Vector3(-width * 0.22, TOP_Y + 0.051, z);
    if (options.keys ?? false) part(this, 0.03, 0.008, 0.06, BRASS, { x: -width * 0.22 - 0.02, y: TOP_Y + 0.054, z: z + 0.01 });
    part(this, 0.22, 0.012, 0.11, matte(0xf4f1ea, 0.8), { x: width * 0.09, y: TOP_Y + 0.006, z: z + 0.04 });
    part(this, 0.2, 0.004, 0.1, matte(0xe6dfd0, 0.8), { x: width * 0.1, y: TOP_Y + 0.014, z: z + 0.035 });
    const plant = new Plant({ kind: 'small', pot: 'ceramic', seed: 23, collides: false, scale: 0.8 });
    plant.position.set(width * 0.38, TOP_Y, z);
    this.add(plant);

    if (options.mirror ?? true) {
      part(this, MIRROR_W, MIRROR_H, 0.02, WALNUT, { y: MIRROR_Y, z: 0.01 });
      part(this, MIRROR_W - 0.06, MIRROR_H - 0.06, 0.008, GLASS, { y: MIRROR_Y, z: 0.012 });
      const silver = mirrorGlass(MIRROR_W - 0.06, MIRROR_H - 0.06);
      silver.position.set(0, MIRROR_Y, 0.0165);
      this.add(silver);
    }

    this.footprint = new THREE.Box3(new THREE.Vector3(-width / 2, 0, 0), new THREE.Vector3(width / 2, TOP_Y, OFF_WALL + DEPTH));
  }
}
