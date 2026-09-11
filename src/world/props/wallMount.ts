import * as THREE from 'three';
import type { RoomOptions, Wall } from '../Room';

export type { Wall };

export interface WallMount {
  position: THREE.Vector3;
  rotationY: number;
}

/**
 * Where to `place()` an object so that it hangs flat on `wall` with its local +z facing into the
 * room. `along` is the world coordinate along the wall (x for front/back, z for left/right), `y`
 * the height of the object's origin and `offset` how far off the wall surface it sits.
 * Walls are named as seen from the default spawn: back = -z (shelves), front = +z, left = -x (TV), right = +x (see `Wall`).
 */
export function wallMount(room: RoomOptions, wall: Wall, along: number, y: number, offset = 0): WallMount {
  const halfW = room.width / 2;
  const halfD = room.depth / 2;
  switch (wall) {
    case 'front':
      return { position: new THREE.Vector3(along, y, halfD - offset), rotationY: Math.PI };
    case 'back':
      return { position: new THREE.Vector3(along, y, -halfD + offset), rotationY: 0 };
    case 'left':
      return { position: new THREE.Vector3(-halfW + offset, y, along), rotationY: Math.PI / 2 };
    case 'right':
      return { position: new THREE.Vector3(halfW - offset, y, along), rotationY: -Math.PI / 2 };
  }
}
