import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { wallMaterial } from '../materials/surfaces';
import { NEIGHBOUR_FLAT_PLAN as plan } from './neighbourFlatPlan';

/**
 * The little entrance hall inside a neighbour's door: a plaster partition across the front-left corner with an
 * opening into the room (a lintel over it), and its side wall back to the front wall. Painted like the room's walls
 * (`paint`, the host's colour). Zone-local, origin at the zone's origin; its pieces are its colliders, and the
 * crosshair does not see through them.
 */
export class Vestibule extends THREE.Group implements Furniture {
  readonly footprint = new THREE.Box3();
  readonly colliders: THREE.Box3[] = [];
  readonly occluders: THREE.Object3D[] = [];
  private readonly materials: THREE.MeshStandardMaterial[] = [];

  constructor() {
    super();
    this.name = 'Vestibule';
    const { room, vestibule } = plan;
    const { z, x1, opening, thickness: t } = vestibule;
    const x0 = -room.width / 2;
    const zFront = room.depth / 2;
    const h = room.height;
    const o0 = opening.x - opening.width / 2;
    const o1 = opening.x + opening.width / 2;
    // The partition either side of the opening and the lintel over it; the side wall from the partition to the front wall.
    this.piece(x0, 0, z - t / 2, o0, h, z + t / 2);
    this.piece(o1, 0, z - t / 2, x1 + t / 2, h, z + t / 2);
    this.piece(o0, opening.height, z - t / 2, o1, h, z + t / 2, false);
    this.piece(x1 - t / 2, 0, z + t / 2, x1 + t / 2, h, zFront);
  }

  /** The host's wall paint. */
  paint(color: number): void {
    for (const material of this.materials) material.color.setHex(color);
  }

  private piece(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, collides = true): void {
    const w = x1 - x0;
    const hgt = y1 - y0;
    const d = z1 - z0;
    const material = wallMaterial(0xe8dfcc, { length: Math.max(w, d), height: hgt, seed: Math.round((x0 + 7) * 31 + (z0 + 7) * 17) });
    this.materials.push(material);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), material);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.add(mesh);
    this.occluders.push(mesh);
    if (collides) this.colliders.push(new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)));
  }
}
