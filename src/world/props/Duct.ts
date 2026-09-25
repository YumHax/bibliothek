import * as THREE from 'three';
import { boxMesh, cylinderMesh } from '../meshUtils';
import { matte, Prop } from './Prop';

export interface DuctOptions {
  /** Run length along local x, metres. Default 4. */
  length?: number;
  radius?: number;
  /** How far below the ceiling its centre runs. Default 0.3. */
  drop?: number;
  /** A vent grille every this many metres (0 for none). Default 1.6. */
  ventEvery?: number;
}

const METAL = new THREE.MeshStandardMaterial({ color: 0x8a9098, metalness: 0.75, roughness: 0.45 });
const SEAM = new THREE.MeshStandardMaterial({ color: 0x6a7078, metalness: 0.7, roughness: 0.5 });

/**
 * A round galvanised air duct run under a black ceiling, the kind every arcade left exposed:
 * a steel tube with seam rings, hung on straps, with the odd vent grille on its underside.
 * Ceiling placement: origin on the ceiling at the middle of the run, along local x. Decoration.
 */
export class Duct extends Prop {
  constructor(options: DuctOptions = {}) {
    super();
    this.name = 'Duct';
    const length = options.length ?? 4;
    const radius = options.radius ?? 0.14;
    const drop = options.drop ?? 0.3;
    const tube = cylinderMesh(radius, length, METAL, { y: -drop }, { segments: 20 });
    tube.rotation.z = Math.PI / 2;
    this.add(tube);
    for (let x = -length / 2 + 0.4; x < length / 2; x += 0.8) {
      const ring = cylinderMesh(radius + 0.008, 0.03, SEAM, { x, y: -drop }, { segments: 20 });
      ring.rotation.z = Math.PI / 2;
      this.add(ring);
    }
    const strap = matte(0x2a2a30, 0.5);
    for (let x = -length / 2 + 0.6; x < length / 2; x += 1.5) this.add(boxMesh(0.03, drop - radius, 0.02, strap, { x, y: -(drop - radius) / 2 }));
    const every = options.ventEvery ?? 1.6;
    if (every > 0) {
      for (let x = -length / 2 + every / 2; x < length / 2; x += every) this.add(boxMesh(0.22, 0.03, radius * 1.2, matte(0x1a1a1f, 0.6), { x, y: -drop - radius + 0.01 }));
    }
    this.traverse((obj) => ((obj as THREE.Mesh).castShadow = false));
  }
}
