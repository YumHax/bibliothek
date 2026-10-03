import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { cylinderMesh } from '../meshUtils';
import { cloth, paint } from '../materials/palette';
import { seededRandom } from '@/graphics/canvas';

export interface RugRollsOptions {
  /** How many stand on end. Default 4. */
  count?: number;
  seed?: number;
}

const COLOURS: readonly number[] = [0x8a2a2a, 0x2a4a6a, 0xc8a878, 0x4a6a3a, 0x6a3a5a, 0xb86a3a];

/**
 * The furniture shop's rugs still rolled up, in a corner: a few standing on end, leaning on the walls and on each
 * other, one lying across the floor in front of them, a paper label round each. Not for sale (the rugs for the flat
 * are laid out, tagged). Static: its parts merge. Origin on the floor in the corner's angle; the rolls stand towards
 * +x and +z from it. Collides as its box.
 */
export class RugRolls extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;

  constructor(options: RugRollsOptions = {}) {
    super();
    this.name = 'RugRolls';
    const random = seededRandom(options.seed ?? 13);
    const count = options.count ?? 4;
    const label = paint(0xf2ecdc, 0.9);
    let reach = 0.3;
    for (let i = 0; i < count; i++) {
      const r = 0.07 + random() * 0.05;
      const h = 1.4 + random() * 0.8;
      const roll = new THREE.Group();
      roll.add(cylinderMesh(r, h, cloth(COLOURS[Math.floor(random() * COLOURS.length)]!), { y: h / 2 }, { segments: 14 }));
      // The label band stands clear of its own rounded rims (on high they curl in by a few millimetres).
      roll.add(cylinderMesh(r + 0.006, 0.1, label, { y: h * 0.62 }, { segments: 14 }));
      // Along the wall on +x, each a little further out, leaning back into the corner.
      const along = 0.14 + i * 0.2;
      roll.position.set(along, 0, 0.12 + random() * 0.08);
      roll.rotation.set(-0.08 - random() * 0.06, 0, 0.1 + random() * 0.06);
      this.add(roll);
      reach = Math.max(reach, along + r + 0.15);
    }
    // One on the floor in front, unrolled a few centimetres.
    const r = 0.1;
    const lying = cylinderMesh(r, 1.4, cloth(COLOURS[Math.floor(random() * COLOURS.length)]!), { x: 0.8, y: r, z: 0.45 }, { segments: 14 });
    lying.rotation.z = Math.PI / 2;
    this.add(lying);
    this.footprint = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.max(reach, 1.5), 2.2, 0.58));
  }
}
