/*
 * THE BUILDING'S MEASURES: what the plans and the classes both read of our building, the storeys the stairwell climbs
 * and the gap kept between two zones' walls. Measures live here, never in a plan, so a class needs no plan to know the
 * height of a storey (docs/architecture.md "Layers": furniture reads `world/measures/`, the plans lay things out with
 * them). The street's facades count their own storeys (`measures/street` GROUND_FLOOR and STOREY).
 */

/** Height of one storey, and how many there are between our landing and the street. */
export const STOREY = 3.26;
export const STOREYS = 5;

/** Local y (the stairwell's frame) of floor landing `k` (0 = ours, at the top; `STOREYS` = the entrance hall's). */
export function landingY(k: number): number {
  return (STOREYS - k) * STOREY;
}

/** Gap between the wall planes of two adjacent zones (metres): coplanar walls would fight. */
export const WALL_GAP = 0.06;
