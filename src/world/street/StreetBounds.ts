import * as THREE from 'three';
import type { Furniture } from '../Furniture';

export interface Walkable {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const THICK = 1;
const HIGH = 3;

/**
 * The street's edges as invisible walls (zone-local colliders): the two building lines, the park's
 * hedge at one end, the corner where the cross street turns out of sight at the other; plus the
 * `extra` obstacles drawn by instanced meshes that cannot collide themselves (lamp posts, tree
 * trunks). Nothing is drawn; the facades, the hedge and the corner are what the player sees there.
 */
export class StreetBounds extends THREE.Group implements Furniture {
  readonly contactShadow = false;
  readonly colliders: THREE.Box3[];

  constructor({ minX, maxX, minZ, maxZ }: Walkable, extra: readonly THREE.Box3[] = []) {
    super();
    this.name = 'StreetBounds';
    const box = (x0: number, z0: number, x1: number, z1: number) => new THREE.Box3(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, HIGH, z1));
    this.colliders = [
      box(minX - THICK, minZ - THICK, maxX + THICK, minZ),
      box(minX - THICK, maxZ, maxX + THICK, maxZ + THICK),
      box(minX - THICK, minZ, minX, maxZ),
      box(maxX, minZ, maxX + THICK, maxZ),
      ...extra,
    ];
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }
}
