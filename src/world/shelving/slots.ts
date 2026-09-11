import * as THREE from 'three';
import type { RoomOptions } from '../Room';
import type { BookcaseSpec } from './plan';

/** Where a bookcase may stand: floor position of its centre, yaw, and the direction it faces. */
export interface Slot {
  position: THREE.Vector3;
  rotationY: number;
  facing: THREE.Vector3;
}

/** A stretch of the right wall, in world z. */
export interface ZRange {
  minZ: number;
  maxZ: number;
}

const MIN_WIDTH = 1.0;
const MAX_WIDTH = 1.2;
/** Space between two neighbouring bookcases, and between a bookcase and a wall. */
const BETWEEN = 0.02;
const WALL_GAP = 0.01;

/**
 * Bookcase positions along the back wall (from `backWallMinX` to the right corner), then down
 * the right wall from that corner towards the front, facing -x, skipping `keepClear` (a stretch
 * reserved for something else, such as the projector picture). The bookcase width is chosen so
 * the back-wall run is filled evenly with 1.0–1.2 m units.
 */
export function computeSlots(
  room: RoomOptions,
  spec: Omit<BookcaseSpec, 'width' | 'rows'>,
  backWallMinX: number,
  keepClear?: ZRange,
): { slots: Slot[]; width: number } {
  const halfW = room.width / 2;
  const halfD = room.depth / 2;

  const backRun = halfW - WALL_GAP - backWallMinX;
  const count = Math.max(1, Math.floor((backRun + BETWEEN) / (MIN_WIDTH + BETWEEN)));
  const width = Math.min(MAX_WIDTH, (backRun + BETWEEN) / count - BETWEEN);

  const slots: Slot[] = [];
  // Back wall, left to right, flush with the right corner so the right-wall run can meet it.
  const backZ = -halfD + WALL_GAP + spec.depth / 2;
  for (let i = count - 1; i >= 0; i--) {
    const x = halfW - WALL_GAP - width / 2 - i * (width + BETWEEN);
    slots.push({ position: new THREE.Vector3(x, 0, backZ), rotationY: 0, facing: new THREE.Vector3(0, 0, 1) });
  }
  // Right wall, from the back corner (past the back-wall bookcases) towards the front wall.
  const rightX = halfW - WALL_GAP - spec.depth / 2;
  let z = -halfD + WALL_GAP + spec.depth + BETWEEN + width / 2;
  while (z + width / 2 <= halfD - WALL_GAP) {
    if (keepClear && z + width / 2 > keepClear.minZ - BETWEEN && z - width / 2 < keepClear.maxZ + BETWEEN) {
      z = keepClear.maxZ + BETWEEN + width / 2; // jump past the reserved stretch
      continue;
    }
    slots.push({ position: new THREE.Vector3(rightX, 0, z), rotationY: -Math.PI / 2, facing: new THREE.Vector3(-1, 0, 0) });
    z += width + BETWEEN;
  }
  return { slots, width };
}
