import { FRONT, KERB_HEIGHT, PARK_STREET, SIDE_STREET, STREET_ENDS, STREET_PLAN } from '../streetPlan';

/** The side street runs south to the building across its end (as `StreetGround` lays it). */
const SIDE_END = -60;

/** Whether zone-local (x, z) is on the road (Front Street, Park Street, the side street), a kerb below the pavements. */
export function isRoad(x: number, z: number): boolean {
  if (x >= PARK_STREET.farKerb && x <= STREET_ENDS.east && z >= FRONT.nearKerb && z <= FRONT.farKerb) return true;
  if (x >= PARK_STREET.farKerb && x <= PARK_STREET.nearKerb && z >= STREET_ENDS.south && z <= FRONT.nearKerb) return true;
  return x >= SIDE_STREET.nearKerb && x <= SIDE_STREET.farKerb && z >= SIDE_END && z <= FRONT.nearKerb;
}

/** Whether x is across one of Front Street's pedestrian crossings (where the kerbs are dropped). */
export function atCrossing(x: number): boolean {
  return STREET_PLAN.crossings.some((c) => x >= c.from && x <= c.to);
}

/**
 * The ground's height at zone-local (x, z): the road's, else the pavement's (0), ramping down to
 * the dropped kerb's lip at the crossings (`STREET_PLAN.droppedKerb`, as `StreetGround` lays it).
 */
export function groundHeight(x: number, z: number): number {
  if (isRoad(x, z)) return -KERB_HEIGHT;
  const { rise, run } = STREET_PLAN.droppedKerb;
  // Front Street's kerbs are at z = ±farKerb (the near one at -farKerb).
  const fromKerb = Math.abs(z) - FRONT.farKerb;
  if (fromKerb >= 0 && fromKerb < run && atCrossing(x)) return -KERB_HEIGHT + rise + (KERB_HEIGHT - rise) * (fromKerb / run);
  return 0;
}
