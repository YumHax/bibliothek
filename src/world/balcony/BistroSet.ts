import * as THREE from 'three';
import { cylinderMesh } from '../meshUtils';
import { Prop, part } from '../props/Prop';

const METAL = new THREE.MeshStandardMaterial({ color: 0x2f5a44, roughness: 0.5, metalness: 0.5 });

/**
 * A folding bistro table and two chairs in painted steel, the balcony's furniture: a round top on
 * a single stem, the chairs either side of it facing the street. Collides at the table.
 */
export class BistroSet extends Prop {
  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-0.3, 0, -0.3), new THREE.Vector3(0.3, 0.72, 0.3));
  }

  constructor() {
    super();
    this.name = 'BistroSet';
    const top = cylinderMesh(0.3, 0.02, METAL, { y: 0.72 }, { segments: 32 });
    const stem = cylinderMesh(0.025, 0.7, METAL, { y: 0.36 }, { segments: 10 });
    const foot = cylinderMesh(0.2, 0.02, METAL, { y: 0.01 }, { segments: 24 });
    this.add(top, stem, foot);
    for (const side of [-1, 1]) this.add(chair(side * 0.52, side * -0.25));
  }
}

/** A slatted folding chair at (x, 0, 0), turned `yaw` towards the table. */
function chair(x: number, yaw: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, 0.05);
  g.rotation.y = yaw;
  for (let i = 0; i < 4; i++) part(g, 0.4, 0.015, 0.06, METAL, { y: 0.45, z: -0.14 + i * 0.09 });
  for (let i = 0; i < 3; i++) part(g, 0.38, 0.06, 0.015, METAL, { y: 0.62 + i * 0.1, z: -0.2 });
  for (const lx of [-0.18, 0.18]) {
    const back = part(g, 0.02, 0.9, 0.02, METAL, { x: lx, y: 0.45, z: -0.12 });
    back.rotation.x = 0.28;
    const front = part(g, 0.02, 0.5, 0.02, METAL, { x: lx, y: 0.22, z: 0.05 });
    front.rotation.x = -0.35;
  }
  return g;
}
