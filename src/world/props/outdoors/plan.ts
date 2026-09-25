import { deg } from './paint';

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

/** Far building line of both streets (a 24 m street: two pavements and a four-lane road). */
export const FRONTAGE = 27;
/** The far kerb, a pavement's width nearer. */
export const KERB = 23;
/** Our own kerb: the pavement under the windows is this wide. */
export const NEAR_KERB = 4;
/**
 * Where each street ends at a building standing across it, so the view down the street closes
 * on a facade rather than running on to the horizon: Front Street at x = FRONT_END, Park Street
 * at z = -PARK_END.
 */
export const FRONT_END = 230;
export const PARK_END = 230;
/** Azimuth ranges those two end buildings fill (Park Street's straddles the seam behind the room). */
export const FRONT_END_FROM = Math.atan2(FRONT_END, FRONTAGE);
export const FRONT_END_TO = Math.atan2(FRONT_END, -2);
export const PARK_END_FROM = deg(-180) - Math.atan2(2, PARK_END);
export const PARK_END_TO = Math.atan2(-FRONTAGE, -PARK_END);
/** Where the parked cars, the street lamps and the street trees stand. */
export const CAR_LINE = KERB - 1.1;
export const LAMP_LINE = KERB + 0.7;
export const STREET_TREE_LINE = FRONTAGE - 1.6;
/** The park's near edge is Park Street's far frontage; its far edge is lined with mid-rise blocks. */
export const PARK_EDGE = FRONTAGE;
export const PARK_FAR = 250;

/** Azimuth of the street corner: Front Street's facades run right of it, the park lies left of it. */
export const CORNER = deg(-45);
/** Azimuth range the park is painted over (it is hidden behind Front Street's block right of the corner). */
export const PARK_FROM = deg(-180);
export const PARK_TO = deg(-20);

/**
 * Distance along azimuth `a` to a line running `offset` metres beyond the eye on the far side of
 * the nearer street: z = offset ahead, x = -offset to the left, both receding to the horizon.
 * The 0.06 floor keeps the unseen back of the room at a finite distance.
 */
export function frontage(a: number, offset = FRONTAGE): number {
  return offset / Math.max(Math.cos(a), -Math.sin(a), 0.06);
}

/** Distance along azimuth `a` to the building closing the end of a street, or Infinity where there is none. */
export function streetEnd(a: number): number {
  if (a >= FRONT_END_FROM && a <= FRONT_END_TO) return FRONT_END / Math.sin(a);
  const w = a > 0 ? a - 2 * Math.PI : a;
  if (w >= PARK_END_FROM && w <= PARK_END_TO) return PARK_END / Math.max(-Math.cos(a), 0.06);
  return Infinity;
}

/** `frontage()` stopped at the end buildings: where the ground `offset` out along the streets ends. */
export function ground(a: number, offset: number): number {
  return Math.min(frontage(a, offset), streetEnd(a));
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
export const COURT_EAST = 15;
export const COURT_BACK = 24;
/** Azimuth range the courtyard fills: from our front wall's plane round to our side wall's, the seam behind the room. */
export const COURT_FROM = deg(90);
export const COURT_TO = deg(180);
