import * as THREE from 'three';
import { random } from '@/random';
import { PARK_TREES, STREET_TREES, treeHeight, type PlantedTree } from '@/world/city/trees';

const ALL: readonly PlantedTree[] = [...STREET_TREES, ...PARK_TREES];

/** The trees round a zone-local point, as the birds and the wind in the leaves hear them. */
export interface TreesNear {
  /** How much leafage is round the listener: each tree within reach counts by how near and how big (0 none .. ~4 in the park). */
  leafy: number;
  /** Where the leaves are heard from, weighted by nearness (zone-local, crown height). */
  centre: THREE.Vector3;
  /** A crown to sing from: one of the nearest trees picked at random each call (zone-local), null with none near. */
  perch(): THREE.Vector3 | null;
}

/**
 * The street's and the park's trees round `local` (zone-local) within `reach` metres (`city/trees`, as `StreetTrees`
 * plants them). Kept by the caller and refreshed now and then (`update`), not every frame.
 */
export class TreesAround implements TreesNear {
  leafy = 0;
  readonly centre = new THREE.Vector3();
  private readonly near: PlantedTree[] = [];
  private readonly spot = new THREE.Vector3();

  constructor(private readonly reach: number) {}

  update(local: THREE.Vector3): void {
    this.near.length = 0;
    this.leafy = 0;
    this.centre.set(0, 0, 0);
    for (const tree of ALL) {
      const dx = tree.at[0] - local.x;
      const dz = tree.at[1] - local.z;
      if (Math.abs(dx) > this.reach || Math.abs(dz) > this.reach) continue;
      const d = Math.hypot(dx, dz);
      if (d > this.reach) continue;
      const weight = (1 - d / this.reach) * tree.scale;
      this.leafy += weight;
      this.centre.x += tree.at[0] * weight;
      this.centre.y += treeHeight(tree.scale) * 0.75 * weight;
      this.centre.z += tree.at[1] * weight;
      this.near.push(tree);
    }
    if (this.leafy > 0) this.centre.divideScalar(this.leafy);
  }

  perch(): THREE.Vector3 | null {
    const tree = this.near[Math.floor(random() * this.near.length)];
    if (!tree) return null;
    return this.spot.set(tree.at[0] + (random() - 0.5) * 2, treeHeight(tree.scale) * (0.6 + random() * 0.3), tree.at[1] + (random() - 0.5) * 2);
  }
}
