import type { RoomOptions } from '../Room';
import type { Placement } from '../Placement';
import type { DecorEntry } from '../props/decor';
import type { TiledWainscotOptions } from '../props/TiledWainscot';
import type { IndustrialPendantOptions } from '../props/IndustrialPendant';
import type { HallRoofOptions } from './HallRoof';
import type { BrowseSpot } from '../people/Shopper';

/*
 * THE MARKET PLAN: a covered flea market reached by teleport from the flat's front door (see
 * `worldPlan.ts`, `travel`). Zone-local coordinates, origin at the centre of the floor. Walls as
 * named from the arrival spot: the exit is on the front wall (+z), the mail-order counter against
 * the back wall (-z), the stalls in two rows either side of the central aisle, facing it. An old
 * covered market: concrete slab, brick to waist height, plaster above, iron trusses and a roof
 * light overhead, factory pendants down the aisle, bulbs and bunting between the stalls.
 */

/** 10 x 8 m hall under a 3.4 m ceiling, no windows, no doorways: teleport only. */
export const MARKET_ROOM: RoomOptions = {
  width: 10,
  depth: 8,
  height: 3.4,
  opaqueWalls: ['front', 'back', 'left', 'right'],
  finish: { floor: 'concrete', walls: 0xd9d0bf, ceiling: 0xb3aea6, trim: 0x6a655e, moulding: false },
};

/** Distance of each stall row from the aisle's centre line (z = 0). */
const ROW_Z = 1.5;
/** x of the stalls in each row. */
const STALL_X = [-3.2, 0, 3.2];
/** The awning poles' x either side of a stall (half the table plus the poles' stand-off); the bulb strings tie to the aisle-side ones. */
const POLE_DX = 0.88;
/** z of the aisle-side pole tops of both rows. */
const POLE_Z = ROW_Z - 0.405;
/** Height of the aisle-side pole tops, where the bulb strings tie on. */
const POLE_TOP = 2.3;

export const MARKET_PLAN = {
  room: MARKET_ROOM,

  /** Where the teleport sets the player down: just inside the exit, facing the hall (-z). */
  arrival: { at: [0, 3.1] as [number, number], yaw: 0 },

  exit: { wall: 'front', along: 0, y: 0 } as Placement,

  /** Brick to waist height round the hall, plaster above; it stops either side of the exit door (leaf 0.83 plus its architrave). */
  wainscot: {
    height: 1.15,
    tile: 0x8c4f3f,
    grout: 0x6e665c,
    accent: 0x4f322a,
    tileWidth: 0.22,
    tileHeight: 0.07,
    bevel: false,
    variance: 0.03,
    roughness: 0.85,
    openings: [{ wall: 'front', along: 0, width: 0.83 + 2 * 0.07 + 0.04 }],
  } as TiledWainscotOptions,

  /** Iron trusses across the hall and a roof light down the aisle. */
  roof: { trussSpacing: 2, trussDepth: 0.5, skylight: { width: 1.6, margin: 1.2 } } as HallRoofOptions,

  /** Factory pendants down the aisle, over each pair of stalls; one switch for all of them and the hall's light. */
  pendants: STALL_X.map((x) => ({ ceiling: [x, 0] }) as Placement),
  pendant: { drop: 1, color: 0x2f4f3f, intensity: 7 } as IndustrialPendantOptions,

  /**
   * One stall per platform, in `PLATFORM_LIST` order, both rows facing the aisle: the back row
   * (z < 0) faces +z, the front row (z > 0) is turned round. Cloth colours vary per stall.
   */
  stalls: [
    { at: { floor: [STALL_X[0]!, -ROW_Z] }, cloth: 0x6b2f2a },
    { at: { floor: [STALL_X[1]!, -ROW_Z] }, cloth: 0x2a4a6b },
    { at: { floor: [STALL_X[2]!, -ROW_Z] }, cloth: 0x3a5a2a },
    { at: { floor: [STALL_X[0]!, ROW_Z], rotationY: Math.PI }, cloth: 0x5a3a6b },
    { at: { floor: [STALL_X[1]!, ROW_Z], rotationY: Math.PI }, cloth: 0x6b5a2a },
    { at: { floor: [STALL_X[2]!, ROW_Z], rotationY: Math.PI }, cloth: 0x2a5a5a },
  ] as { at: Placement; cloth: number }[],

  /** The mail-order counter against the back wall, facing the aisle. */
  counter: { wall: 'back', along: 0, y: 0, offset: 0.38 } as Placement,

  /** The people: a stallholder behind every table, a few shoppers drifting along the aisle. */
  crowd: {
    /** Where a stallholder stands, stall-local (behind the table, clear of the awning's back poles). */
    vendorAt: [0, -0.75] as [number, number],
    /** What a stallholder says when clicked. */
    lines: [
      "Everything's tested. Well, most of it.",
      "That one? Rarer than you'd think.",
      'Prices are on the tags. I might listen to an offer.',
      'The whole crate came from a house clearance.',
      "Manual's missing on that one, hence the price.",
      "Take your time, I'm not going anywhere.",
      'Bought it new in the nineties. Never finished it.',
    ],
    shoppers: 3,
    /** The aisle the shoppers walk along (zone-local x range, on the centre line). */
    aisle: { x: [-4, 4] as [number, number], z: 0 },
    /** Where a shopper stops to browse: in front of each stall, a little left or right of its middle, facing it. */
    browseSpots: STALL_X.flatMap((x, i) => [
      { at: [x + (i % 2 ? 0.35 : -0.35), -(ROW_Z - 0.7)], yaw: Math.PI },
      { at: [x + (i % 2 ? -0.3 : 0.3), ROW_Z - 0.7], yaw: 0 },
    ]) as BrowseSpot[],
  },

  decor: [
    // A worn runner down the aisle.
    { kind: 'rug', at: { floor: [0, 0], rotationY: Math.PI / 2 }, options: { width: 1.6, depth: 7.4, field: 0x6a5a44, border: 0x3e3226, motif: 0x4e4234 } },

    // Bulb strings across the aisle, tied between the aisle-side awning poles of facing stalls (local +x turned to run along +z).
    ...[-STALL_X[2]! + POLE_DX, -POLE_DX, POLE_DX, STALL_X[2]! - POLE_DX].map(
      (x, i) => ({ kind: 'garland', at: { floor: [x, -POLE_Z], rotationY: -Math.PI / 2 }, options: { style: 'bulbs', length: 2 * POLE_Z, height: POLE_TOP, sag: 0.18, seed: i + 1 } }) as DecorEntry,
    ),
    // Bunting the length of both side walls, above the posters.
    { kind: 'garland', at: { floor: [-4.85, -3.7], rotationY: -Math.PI / 2 }, options: { style: 'bunting', length: 7.4, height: 2.85, sag: 0.3, seed: 11 } },
    { kind: 'garland', at: { floor: [4.85, -3.7], rotationY: -Math.PI / 2 }, options: { style: 'bunting', length: 7.4, height: 2.85, sag: 0.3, seed: 12 } },

    // Stock in waiting along the side walls and either side of the counter.
    { kind: 'crate', at: { floor: [-4.7, -2.3], rotationY: 0.15 }, options: { style: 'cardboard', stack: 2, seed: 3 } },
    { kind: 'crate', at: { floor: [-4.65, -0.6], rotationY: -0.1 }, options: { style: 'wood', stack: 2, seed: 4 } },
    { kind: 'crate', at: { floor: [-4.7, 1.6], rotationY: 0.3 }, options: { style: 'cardboard', stack: 3, seed: 5 } },
    { kind: 'crate', at: { floor: [4.7, -1.9], rotationY: -0.2 }, options: { style: 'wood', seed: 6 } },
    { kind: 'crate', at: { floor: [4.68, 0.5], rotationY: 0.1 }, options: { style: 'cardboard', stack: 2, seed: 7 } },
    { kind: 'crate', at: { floor: [4.7, 2.5], rotationY: -0.3 }, options: { style: 'wood', stack: 2, seed: 8 } },
    { kind: 'crate', at: { floor: [1.5, -3.6], rotationY: 0.2 }, options: { style: 'cardboard', stack: 2, seed: 9, label: 'ORDERS' } },
    { kind: 'crate', at: { floor: [-1.5, -3.65], rotationY: -0.15 }, options: { style: 'wood', stack: 3, seed: 10 } },

    // Words on the walls: the hall's banner over the counter, posters above the brick.
    { kind: 'flyer', at: { wall: 'back', along: 0, y: 2.6 }, options: { style: 'cloth', width: 3.2, height: 0.55, title: 'FLEA MARKET', lines: ['video games · second-hand · collectors'], accent: 0x6b2f2a } },
    { kind: 'flyer', at: { wall: 'left', along: -1.6, y: 1.85 }, options: { title: 'WE BUY · WE SELL', lines: ['WE TRADE', 'games · consoles · manuals'], accent: 0x2f6b8f, seed: 1 } },
    { kind: 'flyer', at: { wall: 'left', along: 1.3, y: 1.8 }, options: { title: 'EVERYTHING MUST GO', lines: ['last day', 'prices slashed'], accent: 0xc8443a, seed: 2 } },
    { kind: 'flyer', at: { wall: 'right', along: -0.7, y: 1.85 }, options: { title: 'RETRO GAMES', lines: ['tested · guaranteed', 'ask at the stall'], accent: 0x4f8a5a, seed: 3 } },
    { kind: 'flyer', at: { wall: 'right', along: 2.1, y: 1.78 }, options: { title: 'WANTED', lines: ['empty boxes', 'manuals · cables'], accent: 0xe6a83a, ink: 0x3a2a10, seed: 4 } },
    { kind: 'flyer', at: { wall: 'front', along: -1.7, y: 1.85 }, options: { title: 'OPEN', lines: ['every day', '9 am - 7 pm'], accent: 0x2a4a6b, seed: 5 } },

    // The A-board by the way in, where the player arrives.
    { kind: 'chalkboard', at: { floor: [1.15, 2.85], rotationY: 0.35 }, options: { lines: ['TODAY', 'prices as marked', 'haggling welcome!', '~ coins only ~'], seed: 2 } },

    // Plants in the far corners.
    { kind: 'plant', at: { corner: 'back-left', inset: 0.5 }, options: { kind: 'yucca', pot: 'terracotta', seed: 21 } },
    { kind: 'plant', at: { corner: 'back-right', inset: 0.5 }, options: { kind: 'fig', pot: 'terracotta', seed: 22 } },
  ] as DecorEntry[],
};
