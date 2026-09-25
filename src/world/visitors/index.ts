import * as THREE from 'three';
import { Visitors, type VisitorsOptions } from './Visitors';

export { Visitors, type VisitorsOptions, type VisitorsCollection, type VisitorSeat } from './Visitors';
export { VisitBook, type Loan } from './VisitBook';
export { FRIENDS, VISIT_RULES } from './friendsPlan';

/**
 * Lets the friends visit: places the director and the friends (hidden until they come) in the
 * collection room's zone, and tells the front door who may ring. Call it from `main.ts` once the
 * flat is built and before `world.prime()` (so the friends' materials compile with the rest).
 */
export function furnishVisitors(options: VisitorsOptions): Visitors {
  return options.living.place(new Visitors(options), new THREE.Vector3());
}
