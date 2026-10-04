import * as THREE from 'three';
import type { ShopDoor } from '../street/streetPlan';
import { FLAT_IN_STREET } from '@/world/measures/street';

/*
 * Where a window of the world stands in the street's own frame (its zone-local metres, `STREET_PLAN`), so a view
 * built there (`streetOutlook`) is seen through it from exactly where it is. The flat and its stairwell are in the
 * world where the painted view has them (`FLAT_IN_STREET`: our building on Front Street, the flat five storeys up);
 * a shop is a room of its own far off, its front wall laid on its facade in the street, its exit on its door.
 */

/** World (the flat's frame: its rooms, the stairwell) to the street's frame: a shift, the flat's floor 16.3 m up. */
export function flatToStreet(out = new THREE.Matrix4()): THREE.Matrix4 {
  return out.makeTranslation(FLAT_IN_STREET.x, FLAT_IN_STREET.height, FLAT_IN_STREET.z);
}

/**
 * A shop's zone-local frame to the street's: its front wall's inner face (z `front`, the exit at x 0) laid `wall`
 * metres inside its door on the facade, the room's +z the way out of the door, +x along the facade (looking out, the
 * left hand), as `shopOutlook` has it.
 */
export function shopToStreet(door: ShopDoor, front: number, wall: number, out = new THREE.Matrix4()): THREE.Matrix4 {
  const n = [Math.sin(door.yaw), Math.cos(door.yaw)] as const;
  const u = [Math.cos(door.yaw), -Math.sin(door.yaw)] as const;
  const tx = door.at[0] - n[0] * (front + wall);
  const tz = door.at[1] - n[1] * (front + wall);
  return out.set(u[0], 0, n[0], tx, 0, 1, 0, 0, u[1], 0, n[1], tz, 0, 0, 0, 1);
}
