import { STAIRWELL_PLAN, type ResidentOnStairs } from '@/world/stairwell/stairwellPlan';
import { inHours } from '@/time/clock';
import { movedOut } from './rouxMove';

/*
 * Who of the building is in, read from the residents' days (`STAIRWELL_PLAN.residents`: out between their `out` and
 * `back` hours, home otherwise), without the stairs' own bookkeeping: what the facades' night windows follow (a
 * resident's lit window means they are in), what the courtyard's party asks for its guests. The stairwell's
 * `Neighbours` keeps the live state while the player is on the stairs (an errand, a trip under way); this is the plan.
 */

/** The resident behind door `i` of landing `k` (0 our landing .. 4 the first floor), if the plan has one. */
export function residentAt(k: number, i: number): ResidentOnStairs | undefined {
  return STAIRWELL_PLAN.residents.find((r) => r.k === k && r.i === i);
}

/** Whether the resident behind door `i` of landing `k` has moved out (Mrs Roux, `rouxMove`): their windows stay dark. */
export function movedAway(k: number, i: number): boolean {
  // The door's key as `stairwell/building.doorKey` makes it.
  return movedOut(`${k}:${i}`);
}

/** Whether `r` is home at `hours` (game time): out between their hours, home the rest of the day and all night. */
export function isHomeAt(r: Pick<ResidentOnStairs, 'out' | 'back'>, hours: number): boolean {
  return !inHours(hours, [r.out, r.back]);
}

/** The name on door `i` of landing `k` (Mrs Roux's on ours), as its brass plate has it. */
export function residentName(k: number, i: number): string {
  if (k === 0) return STAIRWELL_PLAN.ourNeighbour;
  return STAIRWELL_PLAN.neighbours[k - 1]?.[i] ?? 'A neighbour';
}
