import * as THREE from 'three';
import { arriveNextAt } from '../travel/nextArrival';
import { ATTIC_PLAN as plan } from './atticPlan';

/**
 * The roof's hatch back down sets the player at the foot of the attic's ladder, facing down the
 * corridor towards the collector's room (the attic's own arrival is in the lift's car). A leaf of
 * its own: the roof's chunk imports it without the attic's builder.
 */
export function arriveAtHatch(): void {
  const [ox, oy, oz] = plan.origin;
  arriveNextAt('attic', new THREE.Vector3(ox + plan.hatch.x, oy, oz + plan.corridor.z1 - 0.5), Math.PI / 2);
}
