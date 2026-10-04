import type { Placement } from '../Placement';

/*
 * Where the consoles bought broken stand (docs/household.md "Repairing a console"), as data. The kitchen's spot is in
 * the right-hand chair's frame (origin on the floor under its seat, `Chair`: seat 0.45 m, cushion 0.03 m); TV REPAIR's
 * are in its zone (`shop/plans/tvShop.ts`: the counter at floor [-1.9, -1.3], 1.3 m wide, its top 0.95 m) and in
 * the counter's frame (+z towards the customer; the spike at x 0.04, the valve jar at 0.22, the till at the left end).
 */
export const REPAIR_PLAN = {
  /** On the kitchen's right-hand chair, on its cushion, turned a little to the table. */
  kitchenChair: { at: [0, 0.48, 0.02] as [number, number, number], yaw: 0.4 },
  tvShop: {
    /**
     * The crate of spares-or-repair inside the door, left of the way in, against the front wall: clear of the speakers
     * on show (x -2.2) and of the walk from the door round the sets' table (0.6 m for the player's body).
     */
    crate: { at: { floor: [-1.4, 2.1], rotationY: 0.15 } as Placement, options: { style: 'cardboard', width: 0.5, height: 0.3, depth: 0.4, label: 'AS SEEN', seed: 21 } as const },
    /** The card on the counter, counter-local (x, y on its top, z towards the customer). */
    card: [-0.26, 0.95, 0.16] as [number, number, number],
  },
} as const;
