import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { cylinderMesh } from '../meshUtils';
import { part } from './Prop';
import { wood as woodMaterial } from '@/world/materials/finishes';
import { fabric } from '@/world/materials/finishes';

export interface BedroomChairOptions {
  /** Colour of the shirt thrown over the back; `null` for a bare chair. */
  shirt?: number | null;
  /** Colour of the jeans folded on the seat; `null` for none. */
  jeans?: number | null;
}

const SEAT = 0.42;
const SEAT_Y = 0.45;
const BACK_Y = 0.9;
const LEG_R = 0.018;

const BEECH = woodMaterial(0xc9a97a, 0.6);

/**
 * A plain wooden bedroom chair, the kind clothes end up on: four turned legs, a seat, two back
 * posts with two slats, a shirt thrown over the back and a pair of jeans folded on the seat.
 * Origin on the floor under the middle of the seat; the back is at -z, so it faces +z.
 * Collides at its seat.
 */
export class BedroomChair extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;

  constructor(options: BedroomChairOptions = {}) {
    super();
    this.name = 'BedroomChair';
    const shirt = options.shirt === undefined ? 0xe8eef2 : options.shirt;
    const jeans = options.jeans === undefined ? 0x3d4d6b : options.jeans;
    const half = SEAT / 2;

    part(this, SEAT, 0.035, SEAT, BEECH, { y: SEAT_Y - 0.0175 });
    const legInset = half - 0.03;
    for (const dx of [-legInset, legInset]) {
      for (const dz of [-legInset, legInset]) this.add(cylinderMesh(LEG_R, SEAT_Y - 0.035, BEECH, { x: dx, y: (SEAT_Y - 0.035) / 2, z: dz }, { radiusBottom: LEG_R * 0.75, segments: 10 }));
      // Back posts continue up from the rear legs, leaning back a touch.
      const post = cylinderMesh(LEG_R, BACK_Y - SEAT_Y + 0.02, BEECH, { x: dx, y: SEAT_Y + (BACK_Y - SEAT_Y) / 2, z: -legInset - 0.02 }, { segments: 10 });
      post.rotation.x = 0.1;
      this.add(post);
    }
    for (const y of [BACK_Y - 0.06, BACK_Y - 0.22]) {
      const slat = part(this, SEAT - 0.06, 0.06, 0.016, BEECH, { y, z: -legInset - 0.02 - (y - SEAT_Y) * 0.1 });
      slat.rotation.x = 0.1;
    }

    if (shirt !== null) {
      // The shirt hangs over the top rail: a body folded in two down the back, sleeves dangling.
      const cloth = fabric({ color: shirt, roughness: 0.95 });
      const drape = part(this, 0.36, 0.42, 0.05, cloth, { y: BACK_Y - 0.2, z: -legInset - 0.07 });
      drape.rotation.x = 0.1;
      part(this, 0.34, 0.16, 0.04, cloth, { y: BACK_Y - 0.09, z: -legInset + 0.02 });
      for (const dx of [-0.2, 0.2]) part(this, 0.07, 0.3, 0.04, cloth, { x: dx, y: BACK_Y - 0.28, z: -legInset - 0.06 }).castShadow = false;
    }
    if (jeans !== null) {
      const denim = fabric({ color: jeans, roughness: 1 });
      const fold = part(this, 0.3, 0.05, 0.24, denim, { y: SEAT_Y + 0.025, z: 0.02 });
      fold.rotation.y = -0.2;
      part(this, 0.24, 0.03, 0.2, denim, { y: SEAT_Y + 0.065, z: 0.03 }).castShadow = false;
    }

    this.footprint = new THREE.Box3(new THREE.Vector3(-half, 0, -half - 0.08), new THREE.Vector3(half, BACK_Y, half));
  }
}
