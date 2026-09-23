import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { cylinderMesh } from '../meshUtils';
import { part, matte } from './Prop';

export interface PedalBinOptions {
  /** Default 0.15. */
  radius?: number;
  /** Height of the body under the lid. Default 0.62. */
  height?: number;
}

const STEEL = new THREE.MeshStandardMaterial({ color: 0xc4c7cb, metalness: 0.7, roughness: 0.3 });
const BLACK = matte(0x1e1f22, 0.6);

/**
 * A brushed-steel pedal bin: a tall cylinder, a domed black lid with its hinge at the back, the
 * pedal sticking out at the front. Local origin is the centre of the foot on the floor; the pedal
 * faces +z. Collides at its body.
 */
export class PedalBin extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;

  constructor(options: PedalBinOptions = {}) {
    super();
    this.name = 'PedalBin';
    const r = options.radius ?? 0.15;
    const h = options.height ?? 0.62;
    this.add(cylinderMesh(r, h, STEEL, { y: h / 2 }, { radiusBottom: r * 0.96, segments: 28 }));
    this.add(cylinderMesh(r + 0.005, 0.012, BLACK, { y: h + 0.006 }, { segments: 28 }));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(r * 0.98, 28, 8, 0, Math.PI * 2, 0, Math.PI / 2), BLACK);
    dome.scale.y = 0.22;
    dome.position.y = h + 0.012;
    dome.castShadow = true;
    this.add(dome);
    // Hinge box at the back, pedal at the front.
    part(this, 0.06, 0.03, 0.03, BLACK, { y: h + 0.01, z: -r + 0.005 });
    part(this, 0.08, 0.012, 0.06, BLACK, { y: 0.012, z: r + 0.02 });
    this.footprint = new THREE.Box3(new THREE.Vector3(-r, 0, -r), new THREE.Vector3(r, h + 0.05, r + 0.05));
  }
}
