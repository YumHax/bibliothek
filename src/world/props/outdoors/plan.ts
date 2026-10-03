import { deg } from './paint';
import { BUS_STOP, COURT, FRONT_SECTION, PARK_SECTION, STREET_END, STREET_LAMPS } from '@/world/city/frontage';
import type { LampDesign } from '@/world/street/streetPlan';

/**
 * The plan of the neighbourhood, the eye at the origin on a sixth floor at the corner of two
 * streets. Front Street runs left to right outside the front wall (+z), lined across with
 * mid-rise facades; Park Street runs outside the left wall (-x) with a park on its far side,
 * mid-rise blocks beyond the park and, further still, the towers of the skyline all around.
 *
 *          x = -PARK_FAR          x = -PARK_EDGE                Front Street
 *   ┌──── backdrop ────┐     ┌ hedge ┐                        (facades along z = FRONTAGE)
 *   │       park       │     │ street│  ┌────────────────────────────────────────┐
 *   │  lawn, pond ...  │     │       │  │ eye at (0, 0)                          │
 *
 * Distances are metres from the eye; azimuth 0 looks straight out of the front wall, +90° is +x.
 */

/*
 * The street's lines are the walkable street's (`city/frontage`, from `street/streetPlan.ts`): Front
 * Street's cross-section out of the front windows, and Park Street's far side painted as its mirror
 * (x = -z, where the two agree: the far kerb and the hedge), as every painter here assumes. Park
 * Street's near side (our kerb, our building line) is its own (`PARK_NEAR_KERB`, `PARK_OUR_LINE`):
 * `frontage()` and `ground()` take it as a second offset.
 */
/** Front Street's cross-section, metres out of the front windows (`FRONT_SECTION`). */
export const ROAD = FRONT_SECTION;
/** Far building line of both streets (a 24 m street: two pavements, two parking lanes, four traffic lanes). */
export const FRONTAGE = ROAD.farLine;
/** The far kerb, a pavement's width nearer. */
export const KERB = ROAD.farKerb;
/** Our own kerb; our building line (the front wall's outer face) is `OUR_LINE`, the pavement between. */
export const NEAR_KERB = ROAD.nearKerb;
export const OUR_LINE = ROAD.ourLine;
/** Park Street's own near side, metres out of the left windows: our kerb, and our building line (the kitchen wing's face). */
export const PARK_NEAR_KERB = -PARK_SECTION.nearKerb;
export const PARK_OUR_LINE = -PARK_SECTION.ourLine;
/**
 * Where each street ends at a building standing across it, so the view down the street closes
 * on a facade rather than running on to the horizon: Front Street at x = FRONT_END, Park Street
 * at z = -PARK_END (the walkable street's end buildings).
 */
export const FRONT_END = STREET_END.front;
export const PARK_END = STREET_END.park;
/** Azimuth ranges those two end buildings fill (Park Street's straddles the seam behind the room). */
export const FRONT_END_FROM = Math.atan2(FRONT_END, FRONTAGE);
export const FRONT_END_TO = Math.atan2(FRONT_END, -2);
export const PARK_END_FROM = deg(-180) - Math.atan2(2, PARK_END);
export const PARK_END_TO = Math.atan2(-FRONTAGE, -PARK_END);
/** Where the far street lamps stand. */
export const LAMP_LINE = STREET_LAMPS.find((lamp) => lamp.yaw === Math.PI)!.at[1];
/** The park (`city/park`): its near edge is Park Street's hedge, its far edge lined with mid-rise blocks. */
export { FOUNTAIN, PARK_EDGE, PARK_FAR, PARK_PATHS, POND } from '@/world/city/park';
/** The bus shelter on Front Street's far pavement (its middle), and where the bus in `Life` pulls up (x). */
export const BUS_SHELTER = { x: BUS_STOP.shelter[0], z: BUS_STOP.shelter[1] };
export const BUS_STOP_X = BUS_STOP.stop[0];

/**
 * Traffic lanes, metres from the eye. Both streets end at the corner (the block across Front
 * Street fills the quadrant beyond it, the park the one to the left), so the road simply bends
 * there, round the corner of the two near pavements (-NEAR_KERB, NEAR_KERB). Right-hand traffic
 * (facing +z, right is -x): cars coming west along Front Street are on its near lane and turn
 * right, down Park Street's near lane; cars coming north up Park Street's far lane turn left,
 * east along Front Street's far lane.
 */
export const NEAR_LANE = ROAD.nearLane;
export const FAR_LANE = ROAD.farLane;
/**
 * The centre of the turn at the corner: arcs about it take Front Street's near lane onto Park
 * Street's (the walkable street's, `PARK_SECTION.nearLane`); the far lane's arc, concentric, lands
 * within half a metre of Park Street's far lane, and the cycle routes turn about it too.
 */
export const TURN_CENTRE: [number, number] = [NEAR_LANE - NEAR_KERB + PARK_SECTION.nearLane, NEAR_KERB];
/** The cycle routes: the outer lanes, a little to the kerb side of the cars. */
export const CYCLE_NEAR = ROAD.nearCycle;
export const CYCLE_FAR = ROAD.farCycle;
/** Where pedestrians walk: the far pavement, just past the kerb. */
export const WALK_LINE = KERB + 1.6;
/**
 * How far out along both streets what moves is simulated (x on Front Street, -z on Park Street):
 * far enough for cars to be tiny when they appear or leave, short of `PARK_END`.
 */
export const LIFE_REACH = 62;

/** A street lamp: where it stands, and whether it is on a far pavement (washing the facade behind it) or ours. */
export interface PaintedLamp {
  x: number;
  z: number;
  far: boolean;
  /** Its kind, the walkable street's (`street/StreetLamps` `LAMP_DESIGNS`). */
  design: LampDesign;
}

/**
 * The street lamps where the walkable street has them (`STREET_LAMPS`). Park Street's stand where
 * they are along it; ours on it at our Front Street lamps' distance out, like the mirrored road.
 */
export const LAMPS: readonly PaintedLamp[] = (() => {
  const ours = STREET_LAMPS.find((lamp) => lamp.yaw === 0)!.at[1];
  return STREET_LAMPS.map(({ at: [x, z], yaw, design }): PaintedLamp => {
    if (yaw === 0) return { x, z, far: false, design };
    if (yaw === -Math.PI / 2) return { x: -ours, z, far: false, design };
    return { x, z, far: true, design };
  });
})();

/** The lamp standing nearest to (x, z). */
export function nearestLamp(x: number, z: number): PaintedLamp {
  let best = LAMPS[0]!;
  for (const lamp of LAMPS) if (Math.hypot(lamp.x - x, lamp.z - z) < Math.hypot(best.x - x, best.z - z)) best = lamp;
  return best;
}

/** Azimuth of the street corner: Front Street's facades run right of it, the park lies left of it. */
export const CORNER = deg(-45);
/** Azimuth range the park is painted over (it is hidden behind Front Street's block right of the corner). */
export const PARK_FROM = deg(-180);
export const PARK_TO = deg(-20);

/**
 * Distance along azimuth `a` to a line running `offset` metres beyond the eye on the far side of
 * the nearer street: z = offset ahead, x = -`parkOffset` to the left (the same, but on Park Street's
 * near side), both receding to the horizon. The 0.06 floor keeps the unseen back of the room at a
 * finite distance.
 */
export function frontage(a: number, offset = FRONTAGE, parkOffset = offset): number {
  return 1 / Math.max(Math.cos(a) / offset, -Math.sin(a) / parkOffset, 0.06 / offset);
}

/** Distance along azimuth `a` to the building closing the end of a street, or Infinity where there is none. */
export function streetEnd(a: number): number {
  if (a >= FRONT_END_FROM && a <= FRONT_END_TO) return FRONT_END / Math.sin(a);
  const w = a > 0 ? a - 2 * Math.PI : a;
  if (w >= PARK_END_FROM && w <= PARK_END_TO) return PARK_END / Math.max(-Math.cos(a), 0.06);
  return Infinity;
}

/** `frontage()` stopped at the end buildings: where the ground `offset` out along the streets ends. */
export function ground(a: number, offset: number, parkOffset = offset): number {
  return Math.min(frontage(a, offset, parkOffset), streetEnd(a));
}

/** Distance along azimuth `a` to the line x = -offset (a line parallel to Park Street inside the park). */
export function parkLine(a: number, offset: number): number {
  return offset / Math.max(-Math.sin(a), 0.06);
}

/**
 * Our own block's courtyard, behind the building (the quarter x > 0, z < 0, azimuths +90°..180°,
 * which no street painter reaches): the neighbour's side wing closes it at x = COURT_EAST, the
 * rear building across its back at z = -COURT_BACK. Painted by `paintCourtyard`.
 */
export const COURT_EAST = COURT.east;
export const COURT_BACK = COURT.back;
/** Azimuth range the courtyard fills: from our front wall's plane round to our side wall's, the seam behind the room. */
export const COURT_FROM = deg(90);
export const COURT_TO = deg(180);
