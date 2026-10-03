import type { RoomOptions } from '../Room';
import { ROOF_SLOPE } from '../city/facadeStyle';
import { facadeHeight } from '../street/facadePainter';
import { COURTYARD, FLAT_IN_STREET } from '../street/streetPlan';
import { ATTIC_PLAN } from '../attic/atticPlan';

/*
 * THE ROOF: the zinc top of our building's slate mansard (`facadeStyle` seed 11), over the attic,
 * reached through the attic's hatch. It stands where it is: the street's frame is laid under it
 * (Front Street's walkable ground, its facades and their roofs, `Buildings`, at their places), so
 * the city seen from up here is the one walked down there. Zone-local metres, origin on the zinc
 * at the middle of the roof; x as the flat's, z towards Front Street (+z).
 */

/** Our building's front in the flat's world frame: Front Street's `ours` facade (street z -12) and its ends (street x -16, 2). */
const FRONT_Z = -12 - FLAT_IN_STREET.z;
const EAST_X = 2 - FLAT_IN_STREET.x;
const WEST_X = -16 - FLAT_IN_STREET.x;
/** How far under the parapet's top a mansard starts (`Buildings`' `ROOF_FOOT`). */
const ROOF_FOOT = 0.3;
const MANSARD = ROOF_SLOPE.mansard;
/** The mansard's top, world: the parapet of our six storeys, less the foot, plus its rise. */
const TOP_Y = facadeHeight(6) - ROOF_FOOT + MANSARD.rise - FLAT_IN_STREET.height;
/** The zinc's front edge (where the slope reaches it), its back edge (the courtyard side's slope, as deep), world z. */
const RIDGE_FRONT = FRONT_Z - MANSARD.run;
const RIDGE_BACK = COURTYARD.back - FLAT_IN_STREET.z + MANSARD.run;

const WIDTH = EAST_X - WEST_X;
const DEPTH = RIDGE_FRONT - RIDGE_BACK;

/** The zone's box: the zinc top and the air over it. */
export const ROOF_ROOM: RoomOptions = { width: WIDTH, depth: DEPTH, height: 5 };

const ORIGIN: [number, number, number] = [(WEST_X + EAST_X) / 2, TOP_Y, (RIDGE_FRONT + RIDGE_BACK) / 2];

/** A point of the world (x, z) in the roof's frame. */
function local(x: number, z: number): [number, number] {
  return [x - ORIGIN[0], z - ORIGIN[2]];
}

/** The attic's hatch, right over its ladder (world), in the roof's frame. */
const HATCH = local(ATTIC_PLAN.origin[0] + ATTIC_PLAN.hatch.x, ATTIC_PLAN.origin[2] + ATTIC_PLAN.hatch.z);

export const ROOF_PLAN = {
  /** World position of the zone's origin (see `worldPlan.ts`). */
  origin: ORIGIN,
  /** Where the street's frame (its zone-local origin) stands in the roof's: everything of the street is placed there. */
  street: [-FLAT_IN_STREET.x - ORIGIN[0], -FLAT_IN_STREET.height - ORIGIN[1], -FLAT_IN_STREET.z - ORIGIN[2]] as [number, number, number],
  /** The zinc top (local half sizes), the railing just inside its edges, and its height. */
  half: { x: WIDTH / 2, z: DEPTH / 2 },
  rail: { inset: 0.35, height: 0.95, post: 1.6 },
  /** The hatch out of the attic (local x, z), and where one stands by it on coming up, looking out over Front Street. */
  hatch: { at: HATCH as [number, number], size: 0.8 },
  arrival: { at: [HATCH[0] + 0.9, HATCH[1] + 0.4] as [number, number], yaw: Math.PI },
  /** The chimney stacks (local x, z; size along x and z; their pots). */
  chimneys: [
    { at: [-6.2, 1.6], size: [1.2, 0.5], pots: 4, height: 1.3 },
    { at: [1.2, -2.8], size: [0.9, 0.5], pots: 3, height: 1.1 },
    { at: [6.8, 2.2], size: [1.4, 0.5], pots: 5, height: 1.4 },
  ] as { at: [number, number]; size: [number, number]; pots: number; height: number }[],
  /** The duckboards from the hatch along the roof, a plank walk (local x span, z, width). */
  walk: { x0: -7.5, x1: 7.5, z: HATCH[1] + 0.8, width: 0.7 },
  /** The old TV aerial on its tripod by the hatch, its signal meter's box at its foot. */
  aerial: { at: [HATCH[0] + 2.6, HATCH[1] - 0.6] as [number, number], height: 3.2 },
  /** Where the pigeons sit (on the chimneys' tops and the ridge, local x, y, z). */
  pigeons: [
    [-6.5, 1.32, 1.6], [-6.1, 1.32, 1.7], [-5.8, 1.32, 1.5],
    [6.4, 1.42, 2.2], [7.0, 1.42, 2.1],
    [3.5, 0.05, 4.2], [4.1, 0.05, 4.25], [-2.0, 0.05, 4.2],
  ] as [number, number, number][],
  /** The fireworks over the park, beyond Park Street (local x, y, z of the show's middle; its spread). */
  fireworks: { at: [-95, 40, -40] as [number, number, number], spread: 45 },
};
