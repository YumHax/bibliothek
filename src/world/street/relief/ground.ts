import { FRONT, KERB_HEIGHT, PARK_STREET, SIDE_STREET, STREET_ENDS } from '../streetPlan';

/** The side street runs south to the building across its end (as `StreetGround` lays it). */
const SIDE_END = -60;

/** Whether zone-local (x, z) is on the road (Front Street, Park Street, the side street), a kerb below the pavements. */
export function isRoad(x: number, z: number): boolean {
  if (x >= PARK_STREET.farKerb && x <= STREET_ENDS.east && z >= FRONT.nearKerb && z <= FRONT.farKerb) return true;
  if (x >= PARK_STREET.farKerb && x <= PARK_STREET.nearKerb && z >= STREET_ENDS.south && z <= FRONT.nearKerb) return true;
  return x >= SIDE_STREET.nearKerb && x <= SIDE_STREET.farKerb && z >= SIDE_END && z <= FRONT.nearKerb;
}

/** The ground's height at zone-local (x, z): the road's, else the pavement's (0). */
export function groundHeight(x: number, z: number): number {
  return isRoad(x, z) ? -KERB_HEIGHT : 0;
}
