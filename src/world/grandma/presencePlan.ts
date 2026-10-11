import { GRANDMA_FLAT_PLAN } from './grandmaFlatPlan';

/*
 * MÉMÉ ON HER FEET (docs/grandma.md "Her presence"), in her flat's zone-local metres (`grandmaFlatPlan.ts`'s frame:
 * +z the window, -z the landing door): the way out of each of her seats, the crossing between the sitting corner and
 * the kitchen side (`hub`), and the spots she walks to (the door to greet, the kettle, the canary, the plant, the
 * curtains, the clock, the telephone), each with the turns on the way (`via`) that keep her clear of the furniture and
 * the way she faces there. Walker yaw: 0 faces +z.
 */

type Vec2 = readonly [number, number];

/** A spot she walks to: through `via` from the hub, then `at`, facing `yaw`; `corner`: by the sitting corner, reached from her armchair without the hub. */
export interface HerSpot {
  via: readonly Vec2[];
  at: Vec2;
  yaw: number;
  corner?: boolean;
}

export const PRESENCE_PLAN = {
  /** Out of her armchair (towards the rug, then clear of the side table) and out of her chair at the table (behind it). */
  leave: {
    armchair: [
      [-1.5, 1.0],
      [-0.7, 0.6],
    ] as readonly Vec2[],
    table: [[1.35, -1.4]] as readonly Vec2[],
  },
  /** The crossing in the middle of the room, between the visitor's armchair and the table. */
  hub: [-0.15, -0.8] as Vec2,
  /** Where she meets the player coming in: a step from the door, turned to it. */
  greet: { via: [], at: [-1.15, -1.15], yaw: 0 } as HerSpot,
  /** Where the player stands coming in (she turns to it). */
  door: GRANDMA_FLAT_PLAN.arrival.at,
  spots: {
    /** At the cooker, facing the back wall: the kettle on its front burner. */
    kettle: { via: [[1.0, -1.35]], at: [2.25, -1.6], yaw: Math.PI },
    /** Back with the tea: by the side table, turned to the tray. */
    tray: { via: [[-0.55, 0.65]], at: [-0.45, 1.2], yaw: 0.35, corner: true },
    /** The canary's cage on its stand by the window. */
    cage: { via: [[0.3, 0.8]], at: [1.85, 1.0], yaw: Math.PI / 2 },
    /** The monstera in the corner. */
    plant: { via: [[0.3, 0.8]], at: [1.8, 1.45], yaw: 1.2 },
    /** At the window, facing the curtains. */
    curtains: { via: [[0.3, 0.8]], at: [0.9, 1.75], yaw: 0 },
    /** Before the longcase clock against the back wall. */
    clock: { via: [], at: [-0.75, -1.65], yaw: Math.PI },
    /** At the telephone table by the door (Félix and her in their frame over it). */
    phone: { via: [[-1.0, -1.05]], at: [-2.15, -1.0], yaw: -Math.PI / 2 },
  } satisfies Record<string, HerSpot>,
  /** Her walking pace (m/s): an old lady's. */
  speed: 0.62,
  /** The canary's cage and the frame over the telephone, for her eyes (y the height). */
  lookAt: {
    cage: [2.3, 1.45, 1.0] as readonly [number, number, number],
    frame: [-2.75, 1.45, -1.0] as readonly [number, number, number],
    clock: [-0.75, 1.75, -2.2] as readonly [number, number, number],
    plant: [2.24, 0.9, 1.74] as readonly [number, number, number],
  },
} as const;
