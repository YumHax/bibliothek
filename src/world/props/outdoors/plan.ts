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

/** Distance along azimuth `a` to the line x = -offset (a line parallel to Park Street inside the park). */
export function parkLine(a: number, offset: number): number {
  return offset / Math.max(-Math.sin(a), 0.06);
}
