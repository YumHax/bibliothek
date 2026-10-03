import type * as THREE from 'three';
import type { ZoneId } from '../zoneIds';

/*
 * A one-off arrival spot for the next travel into a zone, for a door whose other side is not the
 * zone's usual arrival: a neighbour's door on the stairs leads into their flat, and their flat's
 * door back out onto the landing in front of it (whichever landing that is). The door sets it just
 * before asking the Session to travel; `Travel.go` takes it (once) for that zone instead of the
 * plan's arrival. Set for another zone, or never taken, it is dropped by the next travel.
 */

interface Spot {
  to: ZoneId;
  /** World floor position (y: the feet's height there). */
  position: THREE.Vector3;
  /** Camera yaw on arrival (0 looks down -z). */
  yaw: number;
}

let next: Spot | null = null;

/** The next travel into `to` sets the player down at `position` (world, feet at its y), facing `yaw`. */
export function arriveNextAt(to: ZoneId, position: THREE.Vector3, yaw: number): void {
  next = { to, position: position.clone(), yaw };
}

/** The spot set for a travel into `to`, if any; whatever was set is used up either way. */
export function takeArrival(to: ZoneId): { position: THREE.Vector3; yaw: number } | null {
  const spot = next;
  next = null;
  return spot && spot.to === to ? spot : null;
}
