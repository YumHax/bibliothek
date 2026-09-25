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
  // Its own paint, a warm cream behind the sage cabinets, over a floor of terracotta and cream tiles laid as a checkerboard.
  finish: {
    walls: 0xf1e6cf,
    floor: 'tiles',
    floorTiles: { pattern: 'checker', size: 0.25, tile: 0xb3623b, alt: 0xe6d9bf, grout: 0x9b8e7e, groutWidth: 0.004, variance: 0.05, roughness: 0.75 },
  },
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
  /** Its switch inside the door, on the latch side of the opening (z 1.1..1.3; the leaf swings the other way). */
  lightSwitch: { wall: 'right', along: 1.2, y: 1.1 } as Placement,

  /**
   * Base cabinets, units left to right as seen from the room. The back run spans the whole wall
   * up to the fridge (x -1.6 to 1.0) with the hob and oven towards its right; its corner unit is
   * blank, hidden by the left run, which ends flush with the back run's worktop (z -0.7) and
   * carries the sink under the window.
   * Every door, drawer and the oven door opens on a click. Base doors open square to the run; a
   * single door hangs on its unit's `hinge` side (default left): the one by the fridge on the left,
   * or its thickness would sweep into the fridge's side; the left run's single door on the left
   * too (towards +z, away from the corner), so it opens clear of the back run's drawers.
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
          { kind: 'doors', width: 0.5, hinge: 'left' },
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
          { kind: 'doors', width: 0.3, hinge: 'left' },
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

  /**
   * The fridge in the back-right corner, past the end of the run; its front stays short of the open
   * door. Its doors are hung on the left: hinged in the corner they would swing into the right wall.
   */
  fridge: { at: { wall: 'back', along: 1.3, y: 0 } as Placement, hinge: 'left' as const },

  /**
   * One window over the sink on the left wall, glass starting above the worktop (`sill` is the
   * height of the bottom of its frame). No curtains, they would hang in the sink: a roller blind
   * (click the window) that comes down no lower than the glass, 64 mm off the wall, in front of the
   * frame and 5 mm behind the tap's riser.
   */
  window: { wall: 'left' as const, along: -0.1, width: 0.9, height: 1.1, sill: 0.95, blind: true },

  /** Breakfast table against the front wall, a chair at each end facing the other. */
  table: { floor: [-0.15, 0.8] } as Placement,
  chairs: [
    { floor: [-0.75, 0.8], rotationY: Math.PI / 2 },
    { floor: [0.45, 0.8], rotationY: -Math.PI / 2 },
  ] as Placement[],

  /**
   * On the worktop: kettle by the fridge (click: it boils), toaster (click: toast) and board along
   * the back run, the fruit in the dead corner; the radio (click: on/off) against the tiles between
   * the hob (x up to 0.49) and the kettle's handle (x 0.7, further out).
   */
  kettle: { wall: 'back', along: 0.85, y: WORKTOP, offset: 0.3 } as Placement,
  toaster: { wall: 'back', along: -0.35, y: WORKTOP, offset: 0.27 } as Placement,
  choppingBoard: { wall: 'back', along: -0.8, y: WORKTOP, offset: 0.33 } as Placement,
  radio: { wall: 'back', along: 0.62, y: WORKTOP, offset: 0.1 } as Placement,
  fruitBowl: { wall: 'back', along: -1.3, y: WORKTOP, offset: 0.3 } as Placement,
  /** Storage jars back against the splashback behind the board; the dish rack on the sink run's drawers, left of the sink. */
  storageJars: { wall: 'back', along: -0.7, y: WORKTOP, offset: 0.1 } as Placement,
  dishRack: { wall: 'left', along: -0.52, y: WORKTOP, offset: 0.3 } as Placement,

  /** Where the cat comes to sniff: the runner by the cooker, under the table. */
  catVisits: [
    [-0.1, -0.4],
    [-0.15, 0.75],
  ] as [number, number][],

  /** The clock on the front wall, right of the table, where it is seen from the cooker. */
  clock: { wall: 'front', along: 1.05, y: 1.95 } as Placement,

  /**
   * The cat's second water bowl, on the floor in the inside corner of the L (the runs' fronts at x -1.0 and z -0.7),
   * turned so it drinks from the room side; the drawers slide out over it.
   */
  catWater: { floor: [-0.86, -0.58], rotationY: Math.PI / 4 } as Placement,

  /**
   * A game from the collection left on the breakfast table, at its left end on the wall side, clear of the plate
   * (table-local x -0.26..-0.04) and the paper: table-local [x, z] on its top, and its turn.
   */
  strayBox: { at: [-0.28, 0.24] as [number, number], yaw: Math.PI / 2 + 0.25 },

  /**
   * Where the market's home goods for the kitchen (`economy/homeGoods.ts`) go once bought. The portable CRT stands on
   * top of the fridge (1.85 m), facing the table: `screenWidth` of its tube, `setBack` from the fridge's front.
   */
  homeGoods: { crt: { screenWidth: 0.3, setBack: 0.3 } },

  decor: [
    // A runner along the back run, between the cabinets and the table, stopping short of the cat's water bowl in the
    // corner (x up to -0.79): under it, the rug's top would z-fight with the bowl's inside floor.
    { kind: 'rug', at: { floor: [0, -0.4] }, options: { width: 1.5, depth: 0.6, field: 0x6e7b8c, border: 0x3e4a5c, motif: 0x9aa5b4 } },
    // A yucca in the front-left corner, by the window end of the room, and a small pot on the sink run's drawers.
    { kind: 'plant', at: { corner: 'front-left', inset: 0.32 }, options: { kind: 'yucca', pot: 'terracotta', seed: 21 } },
    { kind: 'plant', at: { wall: 'left', along: 0.35, y: WORKTOP, offset: 0.3 }, options: { kind: 'small', pot: 'ceramic', seed: 27, collides: false } },
    // A framed print over the table.
    { kind: 'pictureFrame', at: { wall: 'front', along: -0.15, y: 1.5 }, options: { motif: 'sunset', seed: 6, width: 0.5, height: 0.38 } },
    // The pedal bin by the front wall right of the table's far chair (x 0.21..0.72), its pedal to the room. Slim
    // (x 0.77..1.03, z 0.97..1.28) so the way in from the door stays 0.7 m wide between it and the open leaf, which
    // stands 0.25 m off the right wall down to z 0.34.
    { kind: 'pedalBin', at: { floor: [0.9, 1.15], rotationY: Math.PI }, options: { radius: 0.13 } },
    // Open shelves over the print (x -0.55..0.25): mugs on the lower board, jars on the top one, both above head height.
    { kind: 'wallShelf', at: { wall: 'front', along: -0.15, y: 1.85 }, options: { width: 0.8, tiers: 2, spacing: 0.3, items: 'mixed', seed: 4 } },
    // The calendar left of the clock, over the far chair (x 0.47..0.77, y 1.23..1.68), open at this month.
    { kind: 'wallCalendar', at: { wall: 'front', along: 0.62, y: 1.45 } },
    // A spice rack on the tiles over the toaster, clear of the toast (up to y 1.16) and under the wall cupboards (1.45).
    { kind: 'spiceRack', at: { wall: 'back', along: -0.35, y: 1.25, offset: 0.012 }, options: { width: 0.4, rows: 2, seed: 3 } },
    // A compact panel radiator in the front-right corner, between the bin (x up to 1.03) and the right wall, outside the
    // door's swing (more than 0.83 m from its hinge) and under the light switch (y 1.1).
    { kind: 'radiator', at: { wall: 'front', along: 1.35, y: 0 }, options: { style: 'panel', width: 0.34, height: 0.5 } },
  ] as DecorEntry[],
};
