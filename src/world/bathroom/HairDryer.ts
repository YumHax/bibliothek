import * as THREE from 'three';
import { cylinderMesh } from '../meshUtils';
import { part } from '../props/Prop';
import { UsableProp, type UseOptions } from '../props/UsableProp';
import { METAL, paint } from '../materials/palette';

/**
 * A hair dryer in its wall holder: a chrome ring on a plate, the dryer hanging nozzle down, its
 * curly cable looping to the floor-side socket. Warm air lifts an old price sticker off a box in
 * hand (the builder wires the click to `HomeLife.peelSticker`). Wall-hung: origin on the wall at
 * the holder, +z into the room.
 */
export class HairDryer extends UsableProp {
  constructor(use: UseOptions) {
    super(use);
    this.name = 'HairDryer';
    const body = paint(0x2f3b52, 0.4);
    part(this, 0.06, 0.08, 0.008, METAL.chrome(), { z: 0.004 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.005, 8, 20), METAL.chrome());
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, -0.01, 0.045);
    this.add(ring);
    // The barrel lies across the ring, the handle hanging down through it.
    const barrel = cylinderMesh(0.035, 0.16, body, { y: 0.02, z: 0.085 }, { radiusBottom: 0.04, segments: 16 });
    barrel.rotation.x = Math.PI / 2;
    this.add(barrel);
    const nozzle = cylinderMesh(0.02, 0.02, paint(0x1c1c1f, 0.7), { y: 0.02, z: 0.175 }, { segments: 12 });
    nozzle.rotation.x = Math.PI / 2;
    this.add(nozzle);
    const handle = part(this, 0.03, 0.12, 0.04, body, { y: -0.05, z: 0.045 });
    handle.rotation.x = 0.1;
    part(this, 0.012, 0.02, 0.006, paint(0xd8dadd, 0.4), { y: -0.03, z: 0.068 }).castShadow = false; // the switch
    // The cable, a few coils down the wall.
    for (let i = 0; i < 6; i++) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0025, 6, 12), paint(0x1c1c1f, 0.7));
      coil.position.set(0.004 * (i % 2), -0.13 - i * 0.022, 0.035);
      coil.rotation.y = Math.PI / 2;
      this.add(coil);
    }
    this.target(0.1, 0.34, 0.19, { y: -0.06, z: 0.095 });
  }
}
