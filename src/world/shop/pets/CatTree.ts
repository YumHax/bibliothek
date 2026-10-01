import * as THREE from 'three';
import type { Furniture } from '../../Furniture';
import { cylinderMesh } from '../../meshUtils';
import { part } from '../../props/Prop';
import { cloth, paint, standard } from '../../materials/palette';

export interface CatTreeOptions {
  /** The carpet's colour. Default a warm grey. */
  carpet?: number;
}

const BASE = 0.5;
const SISAL = paint(0xc8a870, 0.95);
const TOP = 1.34;

/**
 * A cat tree on show: a carpeted base, three sisal-wrapped posts, a platform, a little den box with a round door, a
 * hammock slung between two posts, a bed ring on the top, and a pompom dangling on its cord. The shop's own (the cats
 * visiting the clerk use it), not one of the flat's pieces. Static: its parts merge. Origin on the floor under the
 * base's middle. Collides as its box.
 */
export class CatTree extends THREE.Group implements Furniture {
  readonly footprint = new THREE.Box3(new THREE.Vector3(-BASE / 2, 0, -BASE / 2), new THREE.Vector3(BASE / 2, TOP + 0.08, BASE / 2));

  constructor(options: CatTreeOptions = {}) {
    super();
    this.name = 'CatTree';
    const carpet = cloth(options.carpet ?? 0x9a948a);
    const wood = paint(0xd8c8a8, 0.8);
    part(this, BASE, 0.04, BASE, carpet, { y: 0.02 });
    // The posts: two to the platform, one on up to the top.
    const posts: readonly [x: number, z: number, h: number][] = [
      [-0.15, -0.15, 0.62],
      [0.16, 0.12, 0.62],
      [-0.12, 0.14, TOP - 0.04],
    ];
    for (const [x, z, h] of posts) {
      this.add(cylinderMesh(0.045, h, SISAL, { x, y: 0.04 + h / 2, z }, { segments: 14 }));
      // The rope's windings: a few darker rings.
      for (let y = 0.1; y < h - 0.05; y += 0.12) this.add(cylinderMesh(0.047, 0.008, paint(0xa88a58, 0.95), { x, y: 0.04 + y, z }, { segments: 14 }));
    }
    // The den on the base, its door facing +z.
    part(this, 0.26, 0.22, 0.24, carpet, { x: 0.1, y: 0.04 + 0.11, z: -0.1 });
    const door = cylinderMesh(0.06, 0.004, paint(0x2a2622, 1), { x: 0.1, y: 0.04 + 0.1, z: 0.022 }, { segments: 16 });
    door.rotation.x = Math.PI / 2;
    this.add(door);
    // The platform on the two short posts, the hammock under the top.
    part(this, 0.44, 0.03, 0.38, wood, { y: 0.66 + 0.015 });
    part(this, 0.44, 0.012, 0.38, carpet, { y: 0.66 + 0.036 });
    const hammock = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.26, 16, 1, true, Math.PI, Math.PI), standard({ color: 0xc86a4a, roughness: 1, side: THREE.DoubleSide }));
    hammock.rotation.z = Math.PI / 2;
    hammock.scale.set(1, 1, 0.5);
    hammock.position.set(0.05, 1.08, 0.02);
    this.add(hammock);
    for (const s of [-1, 1]) part(this, 0.008, 0.2, 0.008, paint(0x3a3a3a, 0.5), { x: 0.05 + s * 0.13, y: 1.14, z: 0.02 });
    part(this, 0.28, 0.015, 0.02, wood, { x: 0.05, y: 1.24, z: 0.02 });
    // The top: a round board and its bed ring.
    this.add(cylinderMesh(0.19, 0.03, wood, { x: -0.08, y: TOP + 0.015, z: 0.06 }, { segments: 20 }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.04, 8, 22), carpet);
    ring.rotation.x = Math.PI / 2;
    ring.scale.set(1, 1, 0.8);
    ring.position.set(-0.08, TOP + 0.055, 0.06);
    this.add(ring);
    this.add(cylinderMesh(0.13, 0.02, cloth(0xb8b2a8), { x: -0.08, y: TOP + 0.04, z: 0.06 }, { segments: 20 }));
    // The pompom on its cord, off the platform's edge.
    part(this, 0.003, 0.22, 0.003, paint(0xe8e0d0, 0.8), { x: -0.2, y: 0.66 - 0.11, z: 0.17 });
    const pom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.025, 1), cloth(0xe84a8a));
    pom.position.set(-0.2, 0.66 - 0.24, 0.17);
    this.add(pom);
  }
}
