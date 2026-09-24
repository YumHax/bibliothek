import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { cylinderMesh } from '../meshUtils';
import { part, matte } from './Prop';
import { wood as woodMaterial } from '@/world/materials/finishes';

export interface ChairOptions {
  /** Wood colour. Default the pale beech of `KitchenTable`. */
  wood?: number;
  /** Colour of the tied-on seat cushion; `null` for a bare seat. Default a faded terracotta. */
  cushion?: number | null;
}

const SEAT = 0.42;
const SEAT_HEIGHT = 0.45;
const BACK_HEIGHT = 0.9;
const LEG_RADIUS = 0.018;

/**
 * A plain wooden kitchen chair: a square seat on four turned legs, two back posts carrying three
 * slats, and a thin cushion tied on. Local origin is the centre of the floor under the seat; the
 * sitter faces +z, the back is at -z. Collides as a box up to the top of the back.
 */
export class Chair extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;

  constructor(options: ChairOptions = {}) {
    super();
    this.name = 'Chair';
    const wood = woodMaterial(options.wood ?? 0xc9a577, 0.55);
    const half = SEAT / 2;

    part(this, SEAT, 0.035, SEAT, wood, { y: SEAT_HEIGHT - 0.0175 });
    const legH = SEAT_HEIGHT - 0.035;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.add(cylinderMesh(LEG_RADIUS, legH, wood, { x: sx * (half - 0.04), y: legH / 2, z: sz * (half - 0.04) }, { radiusBottom: LEG_RADIUS * 0.75, segments: 10 }));
    // Stretchers between the legs, a little below halfway.
    for (const sx of [-1, 1]) {
      const bar = cylinderMesh(0.01, SEAT - 0.08, wood, { x: sx * (half - 0.04), y: 0.2 }, { segments: 8 });
      bar.rotation.x = Math.PI / 2;
      this.add(bar);
    }
    // The back: two posts leaning back a touch (a negative x rotation tips their top towards -z), three slats between them.
    const postH = BACK_HEIGHT - SEAT_HEIGHT + 0.035;
    const lean = 0.08;
    for (const sx of [-1, 1]) {
      const post = cylinderMesh(LEG_RADIUS, postH, wood, { x: sx * (half - 0.04), y: SEAT_HEIGHT - 0.035 + postH / 2, z: -(half - 0.04) - 0.02 }, { radiusBottom: LEG_RADIUS * 1.1, segments: 10 });
      post.rotation.x = -lean;
      this.add(post);
    }
    for (const dy of [0.12, 0.25, 0.38]) {
      const y = SEAT_HEIGHT + dy;
      const slat = part(this, SEAT - 0.1, 0.05, 0.014, wood, { y, z: -(half - 0.04) - 0.02 - (y - SEAT_HEIGHT - postH / 2 + 0.035) * lean });
      slat.rotation.x = -lean;
    }
    if (options.cushion !== null) {
      const cloth = matte(options.cushion ?? 0xb9705a, 0.95);
      part(this, SEAT - 0.06, 0.03, SEAT - 0.06, cloth, { y: SEAT_HEIGHT + 0.015, z: 0.01 });
    }

    this.footprint = new THREE.Box3(new THREE.Vector3(-half, 0, -half - 0.06), new THREE.Vector3(half, BACK_HEIGHT, half));
  }
}
