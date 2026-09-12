import type { RoomOptions } from '../Room';
import type { Placement } from '../Placement';
import type { DecorEntry } from '../props/decor';
import type { KitchenRunOptions } from '../props/KitchenRun';
import type { WallCabinetsOptions } from '../props/WallCabinets';
import { DOOR_LEAF } from '../roomPlan';

/*
 * THE KITCHEN PLAN, zone-local coordinates (origin at the centre of its floor). Walls as named
 * from the collection room's spawn: front = +z, back = -z, left = -x, right = +x (the hallway is
 * through it, at the corridor's end; the bathroom is behind the rest of it). 3.2 x 2.6 m, 2.8 m under the ceiling.
 * World: x from -6.26 to -3.06, z from -5.7 to -3.1; the door to the hallway is at world z -3.71.
 *
 * The door swings in from the right wall (hinge at local (1.6, 0.275)) and ends flat along that
 * wall towards -z: nothing stands within 0.8 m of the hinge. An L of cabinets fills the back wall
 * and the front half of the left wall, the fridge takes the back-right corner, and a breakfast
 * table sits against the front wall, out of the door's way.
 */

export const KITCHEN_ROOM: RoomOptions = {
  width: 3.2,
  depth: 2.6,
  height: 2.8,
  // The hallway and the bathroom are behind the right wall; the front wall faces the collection room's outside. Left and back face outside (windows go there).
  opaqueWalls: ['right', 'front'],
  doorways: [{ wall: 'right', along: 0.69, ...DOOR_LEAF, door: false, to: 'hallway' }],
};

/** Height of the worktop (what `KitchenRun` builds); things on the counter are placed at it. */
const WORKTOP = 0.9;
/** Sage doors under an oiled-oak top, matching across the runs and the wall cupboards. */
const FRONT = 0x8d9c85;
const WORKTOP_WOOD = 0x9a7248;

export interface KitchenRunPlan {
  at: Placement;
  options: KitchenRunOptions;
}

export const KITCHEN_PLAN = {
  room: KITCHEN_ROOM,

  /** The fixture of the room's ceiling light, mid-room. */
  pendant: { ceiling: [0, 0] } as Placement,

  /**
   * Base cabinets, units left to right as seen from the room. The back run spans the whole wall
   * up to the fridge (x -1.6 to 1.0) with the hob and oven towards its right; its corner unit is
   * blank, hidden by the left run, which ends flush with the back run's worktop (z -0.7) and
   * carries the sink under the window.
   */
  runs: [
    {
      at: { wall: 'back', along: -0.3, y: 0 },
      options: {
        front: FRONT,
        worktop: WORKTOP_WOOD,
        units: [
          { kind: 'blank', width: 0.6 },
          { kind: 'drawers', width: 0.4 },
          { kind: 'doors', width: 0.5 },
          { kind: 'oven', width: 0.6 },
          { kind: 'doors', width: 0.5 },
        ],
      },
    },
    {
      at: { wall: 'left', along: -0.1, y: 0 },
      options: {
        front: FRONT,
        worktop: WORKTOP_WOOD,
        // Only an upstand here: the window sits right behind the sink.
        splashback: 0.06,
        units: [
          { kind: 'drawers', width: 0.3 },
          { kind: 'sink', width: 0.6 },
          { kind: 'doors', width: 0.3 },
        ],
      },
    },
  ] as KitchenRunPlan[],

  /** Wall cupboards over the back run, the extractor hood in the bay over the hob (x 0.2). */
  wallCabinets: {
    at: { wall: 'back', along: -0.3, y: 0 } as Placement,
    options: {
      front: FRONT,
      ceiling: KITCHEN_ROOM.height,
      units: [
        { kind: 'doors', width: 0.5 },
        { kind: 'doors', width: 0.5 },
        { kind: 'doors', width: 0.5 },
        { kind: 'hood', width: 0.6 },
        { kind: 'doors', width: 0.5 },
      ],
    } as WallCabinetsOptions,
  },

  /** The fridge in the back-right corner, past the end of the run; its front stays short of the open door. */
  fridge: { wall: 'back', along: 1.3, y: 0 } as Placement,

  /**
   * One window over the sink on the left wall, glass starting above the worktop (`sill` is the
   * height of the bottom of its frame). No curtains: they would hang in the sink.
   */
  window: { wall: 'left' as const, along: -0.1, width: 0.9, height: 1.1, sill: 0.95 },

  /** Breakfast table against the front wall, a chair at each end facing the other. */
  table: { floor: [-0.15, 0.8] } as Placement,
  chairs: [
    { floor: [-0.75, 0.8], rotationY: Math.PI / 2 },
    { floor: [0.45, 0.8], rotationY: -Math.PI / 2 },
  ] as Placement[],

  /** On the worktop: kettle by the fridge, toaster and board along the back run, the fruit in the dead corner. */
  kettle: { wall: 'back', along: 0.85, y: WORKTOP, offset: 0.3 } as Placement,
  toaster: { wall: 'back', along: -0.35, y: WORKTOP, offset: 0.27 } as Placement,
  choppingBoard: { wall: 'back', along: -0.8, y: WORKTOP, offset: 0.33 } as Placement,
  fruitBowl: { wall: 'back', along: -1.3, y: WORKTOP, offset: 0.3 } as Placement,

  /** The clock on the front wall, right of the table, where it is seen from the cooker. */
  clock: { wall: 'front', along: 1.05, y: 1.95 } as Placement,

  decor: [
    // A runner along the back run, between the cabinets and the table.
    { kind: 'rug', at: { floor: [-0.1, -0.4] }, options: { width: 1.7, depth: 0.6, field: 0x6e7b8c, border: 0x3e4a5c, motif: 0x9aa5b4 } },
    // A yucca in the front-left corner, by the window end of the room, and a small pot on the sink run's drawers.
    { kind: 'plant', at: { corner: 'front-left', inset: 0.32 }, options: { kind: 'yucca', pot: 'terracotta', seed: 21 } },
    { kind: 'plant', at: { wall: 'left', along: 0.35, y: WORKTOP, offset: 0.3 }, options: { kind: 'small', pot: 'ceramic', seed: 27, collides: false } },
    // A framed print over the table.
    { kind: 'pictureFrame', at: { wall: 'front', along: -0.15, y: 1.5 }, options: { motif: 'sunset', seed: 6, width: 0.5, height: 0.38 } },
  ] as DecorEntry[],
};
