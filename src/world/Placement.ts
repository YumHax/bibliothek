import * as THREE from 'three';
import type { RoomOptions, Wall } from './Room';
import { wallMount } from './props/wallMount';

/** Room corners as seen from the default spawn (back = -z, the shelves; left = -x, the TV). */
export type Corner = 'back-left' | 'back-right' | 'front-left' | 'front-right';

/**
 * Where a piece of furniture goes, in plain numbers (metres, world axes). Resolved by
 * `resolvePlacement()` into a position + yaw for `Zone.place()`.
 *
 * - `floor: [x, z]` standing on the floor; `ceiling: [x, z]` hanging from the ceiling.
 * - `corner` + `inset`: that far from both walls of the corner, on the floor or (`hung: true`) the ceiling.
 * - `wall` + `along` + `y`: hung flat on a wall, local +z facing into the room; `along` is x for
 *   front/back walls and z for left/right, `offset` how far off the wall surface (0 = touching).
 *   With `y: 0` it doubles as "on the floor against that wall".
 */
export type Placement =
  | { floor: [x: number, z: number]; rotationY?: number }
  | { ceiling: [x: number, z: number]; rotationY?: number }
  | { corner: Corner; inset: number; hung?: boolean; rotationY?: number }
  | { wall: Wall; along: number; y: number; offset?: number };

export interface ResolvedPlacement {
  position: THREE.Vector3;
  rotationY: number;
}

export function resolvePlacement(room: RoomOptions, at: Placement): ResolvedPlacement {
  if ('wall' in at) return wallMount(room, at.wall, at.along, at.y, at.offset ?? 0);
  if ('corner' in at) {
    const x = at.corner.endsWith('left') ? -room.width / 2 + at.inset : room.width / 2 - at.inset;
    const z = at.corner.startsWith('back') ? -room.depth / 2 + at.inset : room.depth / 2 - at.inset;
    return { position: new THREE.Vector3(x, at.hung ? room.height : 0, z), rotationY: at.rotationY ?? 0 };
  }
  if ('floor' in at) return { position: new THREE.Vector3(at.floor[0], 0, at.floor[1]), rotationY: at.rotationY ?? 0 };
  return { position: new THREE.Vector3(at.ceiling[0], room.height, at.ceiling[1]), rotationY: at.rotationY ?? 0 };
}
