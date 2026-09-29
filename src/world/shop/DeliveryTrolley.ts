import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { cylinderMesh } from '../meshUtils';
import { part } from '../props/Prop';
import { METAL, paint } from '../materials/palette';

const WHEEL = 0.1;
const RAIL = 1.15;
const LEAN = 0.22;
const FRAME = paint(0xc83a2a, 0.45);
const TYRE = paint(0x1e1e20, 0.8);
const CARDBOARD = paint(0xb8905a, 0.9);
const TAPE = paint(0xd8c89a, 0.5);

/**
 * The furniture shop's sack truck, parked by the counter with a box still strapped to it, waiting for the next
 * delivery up someone's stairs: two red rails from the wheels to the handles, the toe plate on the floor, two fat
 * tyres, a cardboard carton. Static: its parts merge. Origin on the floor under the toe plate's middle, the carton
 * facing +z. Collides as its box.
 */
export class DeliveryTrolley extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;

  constructor() {
    super();
    this.name = 'DeliveryTrolley';
    const frame = new THREE.Group();
    // Leaning back on its wheels, as it stands when parked.
    frame.rotation.x = -LEAN;
    frame.position.z = -0.05;
    for (const x of [-0.2, 0.2]) part(frame, 0.03, RAIL, 0.03, FRAME, { x, y: RAIL / 2 + 0.02, z: -0.04 });
    for (const y of [0.35, 0.75]) part(frame, 0.42, 0.02, 0.02, FRAME, { y, z: -0.04 });
    part(frame, 0.5, 0.025, 0.03, METAL.satinSteel(), { y: RAIL + 0.03, z: -0.04 });
    part(frame, 0.46, 0.012, 0.2, METAL.satinSteel(), { y: 0.006, z: 0.07 });
    // The carton on the toe plate, taped shut.
    part(frame, 0.42, 0.5, 0.36, CARDBOARD, { y: 0.26, z: 0.16 });
    part(frame, 0.43, 0.04, 0.37, TAPE, { y: 0.4, z: 0.16 });
    this.add(frame);
    for (const x of [-0.26, 0.26]) {
      const tyre = cylinderMesh(WHEEL, 0.06, TYRE, { x, y: WHEEL, z: -0.1 }, { segments: 16 });
      tyre.rotation.z = Math.PI / 2;
      this.add(tyre);
    }
    this.footprint = new THREE.Box3(new THREE.Vector3(-0.32, 0, -0.35), new THREE.Vector3(0.32, 1.2, 0.36));
  }
}
