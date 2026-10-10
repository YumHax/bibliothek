import type { RoomOptions } from '../Room';
import type { Placement } from '../Placement';
import type { DecorEntry } from '../props/decor';

/*
 * THE SALEROOM behind the flea market: the hall's auction room (`economy/auction.ts`, `AuctionHouse`), reached by
 * its door in the market's back wall (travel: a windowless room of its own, far along +x). Zone-local, origin at the
 * middle of the floor; walls as named from the way in: the door back to the market on the front wall (+z), the
 * rostrum and the lot stand at the back (-z), the sale board on the back wall beside them, rows of chairs facing
 * them either side of an aisle. A green room, parquet, one pendant over the chairs.
 */

export const SALEROOM_ROOM: RoomOptions = {
  width: 8,
  depth: 9,
  height: 3.4,
  opaqueWalls: ['front', 'back', 'left', 'right'],
  finish: { floor: 'parquet', walls: 0x3f5a4b, ceiling: 0xe6e0d2, trim: 0x4a3426, moulding: false },
};

const HALF_DEPTH = SALEROOM_ROOM.depth / 2;
/** The chairs' rows (z) and their places (x), an aisle down the middle. */
const ROWS = [-1.3, -0.2, 0.9];
const PLACES = [-2.7, -2, -1.3, 1.3, 2, 2.7];

export const SALEROOM_PLAN = {
  room: SALEROOM_ROOM,

  /** The door back to the flea market, as tall as the one in the market's back wall. */
  exit: { wall: 'front', along: 2.4, y: 0 } as Placement,
  door: { width: 0.95, height: 2.2 },
  /** Coming in: just inside the door, facing the rostrum. */
  arrival: { at: [2.4, HALF_DEPTH - 0.85] as [number, number], yaw: 0 },

  /** Real lights lent to the lot's and the rostrum's glows (`LightPool`): the far end lit, not just the chairs. */
  glowLights: 2,

  /** The room's light: a pendant over the chairs; its switch by the door. */
  light: { ceiling: [0, -0.3] } as Placement,
  lightSwitch: { wall: 'front', along: 1.6, y: 1.1 } as Placement,

  /** The rostrum, facing the room; the auctioneer stands behind it. */
  rostrum: { floor: [0, -HALF_DEPTH + 1.25] } as Placement,
  auctioneerAt: [0, -HALF_DEPTH + 0.7] as [number, number],
  /** The stand the lot is shown on, left of the rostrum, turned a little to the room. */
  lotStand: { floor: [-1.7, -HALF_DEPTH + 1.45], rotationY: 0.3 } as Placement,
  /** The sale board on the back wall, right of the rostrum: the lot, the bid, who leads, going once... */
  board: { wall: 'back', along: 2.1, y: 1.75 } as Placement,

  /** Every chair: rows facing the rostrum (-z). */
  chairs: ROWS.flatMap((z) => PLACES.map((x) => ({ floor: [x, z], rotationY: Math.PI }) as Placement)),
  /** Where each bidder of the room sits (`SALEROOM_BIDDERS` by id): an index into `chairs`. */
  seats: { doris: 1, pettibone: 3, victor: 4, lenny: 6, okafor: 17 } as Record<string, number>,
  /** The chair's seat height, for the people sitting on them. */
  seatHeight: 0.46,

  decor: [
    // A runner down the aisle, from the door to the rostrum.
    { kind: 'rug', at: { floor: [0, 0.4], rotationY: Math.PI / 2 }, options: { width: 1.1, depth: 6.2, field: 0x6b2a2a, border: 0x3a1a16, motif: 0x8a5a3a } },
    // The conditions of sale by the door, the next sales and the viewing hours on the side walls.
    { kind: 'flyer', at: { wall: 'front', along: 0.4, y: 1.6 }, options: { title: 'CONDITIONS OF SALE', lines: ['the highest bidder buys', 'no returns · sold as seen', 'pay on the fall of the hammer'], accent: 0x6b1f2a, seed: 61 } },
    { kind: 'flyer', at: { wall: 'left', along: -1.5, y: 1.7 }, options: { title: 'WEEKLY SALE', lines: ['games · consoles', 'sealed house-clearance lots'], accent: 0x2a4a6b, seed: 62 } },
    { kind: 'flyer', at: { wall: 'right', along: -0.8, y: 1.7 }, options: { title: 'VIEWING', lines: ['lots on view', 'every day the hall is open'], accent: 0x4f6b3a, seed: 63 } },
    { kind: 'flyer', at: { wall: 'back', along: -1.7, y: 2.35 }, options: { style: 'cloth', width: 2.2, height: 0.42, title: 'SALEROOM', lines: ['auctioneers & valuers'], accent: 0x6b1f2a } },
    // Lots in waiting along the walls, palms in the corners.
    { kind: 'crate', at: { floor: [-3.65, -3.2], rotationY: 0.2 }, options: { style: 'wood', stack: 2, seed: 71, label: 'LOTS' } },
    { kind: 'crate', at: { floor: [3.65, -2.9], rotationY: -0.15 }, options: { style: 'cardboard', stack: 3, seed: 72 } },
    { kind: 'crate', at: { floor: [-3.65, 2.6], rotationY: -0.1 }, options: { style: 'cardboard', stack: 2, seed: 73 } },
    { kind: 'plant', at: { corner: 'back-left', inset: 0.45 }, options: { kind: 'yucca', pot: 'terracotta', seed: 74 } },
    { kind: 'plant', at: { corner: 'back-right', inset: 0.45 }, options: { kind: 'fig', pot: 'terracotta', seed: 75 } },
    { kind: 'plant', at: { corner: 'front-left', inset: 0.45 }, options: { kind: 'fig', pot: 'terracotta', seed: 76 } },
  ] as DecorEntry[],
};
