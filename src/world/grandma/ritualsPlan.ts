import type { Placement } from '../Placement';
import type { HerSpot } from './presencePlan';

/*
 * MÉMÉ'S WAYS IN HER FLAT, zone-local like `grandmaFlatPlan.ts` (docs/grandma.md "Sunday lunch, recipes and favours"):
 * her walk to the table for lunch, the player's place at its right end, the favours' spots, the tree and the
 * chrysanthemums of the season.
 */

type Vec2 = [number, number];

export const RITUALS_PLAN = {
  lunch: {
    /**
     * Her chair at the table's back (`GRANDMA_FLAT_PLAN.memeDay.table`), from the room's crossing (`visit/herWay`):
     * behind the table, clear of the china cabinet and the dresser on the back wall; she sits down there facing it.
     */
    herChair: { via: [[0.3, -1.3], [1.35, -1.35]], at: [1.35, -0.92], yaw: 0 } as HerSpot,
    /** The player's place: the chair at the table's right end (`GRANDMA_FLAT_PLAN.chairs[1]`), facing the table (-x). */
    seat: { at: [2.2, -0.15] as Vec2, eye: 1.2, yaw: Math.PI / 2 },
    /** The click on that chair while lunch waits: a box over its seat. */
    seatSpot: { at: [2.28, -0.15] as Vec2, size: [0.5, 0.9, 0.5] as [number, number, number] },
  },
  favours: {
    /** Round the set on the sideboard (set-local, from its foot) and the clock's hood (clock-local), a box to click. */
    set: { at: [0, -0.01, 0] as [number, number, number], size: [0.6, 0.46, 0.44] as [number, number, number] },
    clock: { at: [0, 1.48, 0.17] as [number, number, number], size: [0.54, 0.54, 0.34] as [number, number, number] },
  },
  /** Her tree in the season, where the Christmas of 1995 had it (`christmas.tree`). */
  tree: { at: { floor: [-2.25, 1.8] } as Placement, height: 1.5, radius: 0.42 },
  /** The chrysanthemums of All Saints on the dining table's cloth (table-local): her birthday cake's spot, left of the album. */
  chrysanthemums: [-0.52, 0.22] as Vec2,
} as const;
