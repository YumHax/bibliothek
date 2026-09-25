import * as THREE from 'three';
import { STAIRWELL_PLAN as plan, STOREYS } from './stairwellPlan';

/*
 * The residents' ways about the stairs, as floor points (local x, z; their height comes from the
 * staircase under the feet as they walk). Down from a landing: across it to the top of flight A,
 * down the west side, across the half landing, down flight B on the east side onto the next
 * landing, and so on to the entrance hall and its street door. Up is the same the other way.
 */

const { walk } = plan;
const v = (x: number, z: number) => new THREE.Vector3(x, 0, z);

/** The spot in front of door `i` of landing `k` (ours has one, at `ourNeighbourX`). */
export function doorSpot(k: number, i: number): THREE.Vector3 {
  return v(k === 0 ? plan.ourNeighbourX : plan.doorX[i]!, walk.doorZ);
}

/** From the spot `from` on landing `k` down every flight to the hall's street door. */
export function routeDown(k: number, from: THREE.Vector3): THREE.Vector3[] {
  const path = [v(from.x, walk.landingZ)];
  for (let j = k; j < STOREYS; j++) {
    path.push(
      v(walk.flightAX, walk.landingZ),
      v(walk.flightAX, walk.flightTopZ),
      v(walk.flightAX, walk.flightFootZ),
      v(walk.flightAX, walk.halfLandingZ),
      v(walk.flightBX, walk.halfLandingZ),
      v(walk.flightBX, walk.flightFootZ),
      v(walk.flightBX, walk.flightTopZ),
      v(walk.flightBX, walk.landingZ),
    );
  }
  path.push(...hallToDoor(walk.flightBX));
  return path;
}

/** From the street door up to the spot `to` on landing `k`: `routeDown` backwards. */
export function routeUp(k: number, to: THREE.Vector3): THREE.Vector3[] {
  return [...routeDown(k, to).reverse().slice(1), to.clone()];
}

/** From the spot `from` on landing `k` to the lift's gate there. */
export function toLiftGate(from: THREE.Vector3): THREE.Vector3[] {
  return [v(from.x, walk.landingZ), v(walk.liftGate[0], walk.liftGate[1])];
}

/** From the lift's gate in the hall out through the street door. */
export function liftToStreet(): THREE.Vector3[] {
  return hallToDoor(walk.liftGate[0]);
}

/** The lift's gate on any landing (the car stops at ours and at the hall's). */
export function liftGate(): THREE.Vector3 {
  return v(walk.liftGate[0], walk.liftGate[1]);
}

/** Where the street door lets a resident in (and out). */
export function streetDoorSpot(): THREE.Vector3 {
  return v(walk.streetDoor[0], walk.streetDoor[1]);
}

/** From x on the hall's landing through the opening, down the hall to the street door. */
function hallToDoor(x: number): THREE.Vector3[] {
  const [hx, hz] = walk.hall;
  return [v(Math.min(Math.max(x, plan.opening.x0 + 0.4), plan.opening.x1 - 0.4), plan.floorLanding.z1 - 0.2), v(hx, hz), streetDoorSpot()];
}
