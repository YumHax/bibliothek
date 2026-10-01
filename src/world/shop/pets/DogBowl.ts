import * as THREE from 'three';
import { Prop, part } from '../../props/Prop';
import { cylinderMesh } from '../../meshUtils';
import { METAL, cloth, paint, standard } from '../../materials/palette';

/**
 * A water bowl for dogs by the door: a steel bowl on a rubber mat, full, a bone-shaped biscuit left beside it. The
 * shop's welcome. Static: its parts merge. Origin on the floor under the bowl. Decoration: never collides.
 */
export class DogBowl extends Prop {
  constructor() {
    super();
    this.name = 'DogBowl';
    part(this, 0.34, 0.006, 0.26, cloth(0x2f6a6a, 0.9), { y: 0.003, x: 0.03 });
    const steel = METAL.steel();
    // The bowl filled nearly to its rolled rim: its body, the water's face just under the rim.
    this.add(cylinderMesh(0.105, 0.05, steel, { y: 0.006 + 0.025 }, { radiusBottom: 0.085, segments: 24 }));
    this.add(cylinderMesh(0.1, 0.004, standard({ color: 0x8ab8c8, roughness: 0.04, metalness: 0 }), { y: 0.058 }, { segments: 24 }));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.104, 0.007, 6, 28), steel);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.062;
    this.add(rim);
    const biscuit = paint(0xc8904a, 0.9);
    const bone = new THREE.Group();
    bone.position.set(0.15, 0.012, 0.05);
    bone.rotation.y = 0.7;
    part(bone, 0.06, 0.012, 0.015, biscuit);
    for (const s of [-1, 1]) for (const t of [-1, 1]) bone.add(cylinderMesh(0.01, 0.012, biscuit, { x: s * 0.032, z: t * 0.008 }, { segments: 8 }));
    this.add(bone);
  }
}
