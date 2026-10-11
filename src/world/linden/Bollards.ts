import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { snowPaint } from '../street/snowCover';

/**
 * The cast-iron bollards along both of Linden Avenue's kerbs, between the pavement and the parked cars (the plateau
 * has no step to keep the cars off it): one instanced post with its ball top, solid. Zone-local `spots`.
 */
export class Bollards extends THREE.Group implements Furniture {
  readonly colliders: THREE.Box3[];

  constructor(spots: readonly (readonly [number, number])[], height: number) {
    super();
    this.name = 'Bollards';
    const post = new THREE.CylinderGeometry(0.065, 0.08, height, 10).translate(0, height / 2, 0);
    const top = new THREE.SphereGeometry(0.075, 10, 6).translate(0, height + 0.03, 0);
    const iron = snowPaint(0x2a3a32, 0.45);
    const matrix = new THREE.Matrix4();
    for (const geometry of [post, top]) {
      const mesh = new THREE.InstancedMesh(geometry, iron, spots.length);
      spots.forEach(([x, z], i) => mesh.setMatrixAt(i, matrix.makeTranslation(x, 0, z)));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.add(mesh);
    }
    this.colliders = spots.map(([x, z]) => new THREE.Box3(new THREE.Vector3(x - 0.1, 0, z - 0.1), new THREE.Vector3(x + 0.1, height, z + 0.1)));
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }
}
