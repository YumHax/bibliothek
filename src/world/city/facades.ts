/*
 * THE FACADES: every building face in view of the street and of the flat's windows, with its shops and, on ours, the
 * flat. The description the walkable street (`street/`), the painted view (`props/outdoors`), the window views
 * (`outlook/`) and the roofscape all build from, so the shops one sees from the windows are the ones down in the
 * street, RETRO GAMES included. Street-local metres (`measures/street`). Where things stand in the street itself
 * (doors, arrivals, props, routes) is `street/streetPlan.ts`.
 */
import type { FlatRoomId } from './flatWindows';
import type { ShopZoneId } from '../shop/shopPlan';
import { CORNER_BAY, COURTYARD, FLAT_IN_STREET, PARK_STREET, isWalkable, type Vec2 } from '../measures/street';
import { STREET_DOOR } from '../measures/doors';

/** What stands at street level of a facade. */
export type ShopKind = 'cafe' | 'bakery' | 'pharmacy' | 'books' | 'grocer' | 'florist' | 'tabac' | 'bar' | 'butcher' | 'laundry' | 'retro' | 'arcade' | 'furniture' | 'electronics' | 'pets' | 'shut';

export interface ShopSpec {
  kind: ShopKind;
  /** Along the facade from its left end (as seen from the street), metres. */
  from: number;
  to: number;
  /** Where its door is (along the facade); the middle when absent. */
  door?: number;
  /** Its own name on the fascia (instead of the kind's). */
  name?: string;
}

/**
 * One building's face on the street: `from` is its left end as seen from in front of it, `to`
 * its right end (so the face looks towards the left-hand normal of from -> to). Storeys over the
 * ground floor, the street-level shops, and a residential door (`door`, along) if any.
 * `detail`: pixels per metre in the facade atlas (near facades are painted finer).
 * `flat`: our own flat on its top floor (the real windows and the balcony, painted and built where they are).
 */
export interface FacadeSpec {
  id: string;
  from: Vec2;
  to: Vec2;
  storeys: number;
  seed: number;
  shops: ShopSpec[];
  door?: number;
  detail: number;
  flat?: FlatFront;
  /** Holes through the face at street level (along, width, height): a door one walks through, whose painting is not drawn. */
  openings?: { at: number; width: number; height: number }[];
  /** Window bays per storey, when not one per 2.7 m (the kitchen wing's front has the panes' two). */
  bays?: number;
  /** The street's name on an enamel plate at a corner: its middle along the face, the name (`facadePainter`). */
  nameplates?: { at: number; name: string }[];
  /**
   * Its ground floor is built in 3D in front of it (the walked courtyard's, `courtyard/YardGroundFloors`, set by that
   * zone's builder only): painted as bare wall, no plinth, windows, doors, posters or plates of its own.
   */
  builtGround?: boolean;
}

/**
 * Our flat on one of its building's faces: the floor's height over the pavement, the windows (bottom
 * and top over that floor; `frosted`: obscured glass, the bathroom's and the bedroom's) and the
 * balcony, along the facade. A face with no windows there is blank on the flat's floor.
 */
export interface FlatFront {
  floorY: number;
  /** `room`: whose window it is (lit at night as that room was left: its lamp, its curtains, `city/flatWindows`). */
  windows: { at: number; width: number; bottom: number; top: number; frosted?: boolean; room: FlatRoomId }[];
  /** The balcony's glazed door is the collection room's. */
  balcony?: { at: number; width: number; depth: number; door: { width: number; height: number } };
}

/*
 * Facade atlas densities (px/m, scaled by quality in `furnishStreet`): the near and middle rows also have their windows
 * built in 3D (`Buildings`' `FRAMED_DETAIL`), so their paint is wall, glass and the shops' fronts; the far rows, seen
 * from 20 m and more, give up a little so the near ones fit the 4096 atlas finer (54 px/m on high).
 */
const NEAR = 40;
const MID = 24;
const FAR = 12;

/**
 * Every building face in view. The near and far rows first, then the side streets and the street ends.
 * Our building's top floor is the flat: the collection room's front window (world x 0.3) and the balcony door
 * (world x 2.0) are 3.6 and 5.3 m along from the corner (world x -3.3), as in `BALCONY_PLAN.front`.
 */
export const FACADES: readonly FacadeSpec[] = [
  // Our side (faces +z; left end is -x).
  {
    // The residents' door (10 along, x -6) is a hole: the sas behind it is walked through (`world/airlock`).
    id: 'ours', from: [-16, -12], to: [2, -12], storeys: 6, seed: 11, door: 10, detail: NEAR, nameplates: [{ at: 0.9, name: 'FRONT STREET' }],
    openings: [{ at: 10, width: STREET_DOOR.width, height: STREET_DOOR.height }],
    shops: [{ kind: 'books', from: 0.6, to: 7, name: 'CORNER BOOKS' }, { kind: 'grocer', from: 12.4, to: 17.6 }],
    // Mrs Roux's two French windows (world x 4.3, 6.9), the flat's own once her rooms are joined to it (`world/annex`).
    flat: {
      floorY: FLAT_IN_STREET.height,
      windows: [
        { at: 3.6, width: 1.2, bottom: 0.1, top: 2.5, room: 'living' },
        { at: 7.6, width: 1.2, bottom: 0.1, top: 2.5, room: 'annex' },
        { at: 10.2, width: 1.2, bottom: 0.1, top: 2.5, room: 'annex' },
      ],
      balcony: { at: 5.3, width: 2.6, depth: 1.3, door: { width: 0.9, height: 2.3 } },
    },
  },
  { id: 'arcade', from: [2, -12], to: [14, -12], storeys: 5, seed: 23, shops: [{ kind: 'arcade', from: 0.4, to: 11.6, door: 6 }], detail: NEAR },
  { id: 'n3', from: [14, -12], to: [26, -12], storeys: 4, seed: 37, shops: [{ kind: 'laundry', from: 0.4, to: 5.8 }, { kind: 'florist', from: 6.2, to: 11.6, door: 8.9 }], detail: NEAR },
  { id: 'n4', from: [26, -12], to: [36, -12], storeys: 6, seed: 41, shops: [{ kind: 'tabac', from: 0.4, to: 4.8 }, { kind: 'bar', from: 5.2, to: 9.6, name: 'THE ANCHOR' }], detail: NEAR },
  { id: 'n5', from: [36, -12], to: [50, -12], storeys: 5, seed: 43, shops: [{ kind: 'shut', from: 0.4, to: 6.6 }, { kind: 'butcher', from: 7.4, to: 13.6 }], detail: MID },
  { id: 'n6', from: [50, -12], to: [64, -12], storeys: 6, seed: 45, shops: [{ kind: 'cafe', from: 0.6, to: 6.8 }], door: 10.5, detail: FAR },
  { id: 'n7', from: [64, -12], to: [80, -12], storeys: 5, seed: 47, shops: [{ kind: 'pharmacy', from: 0.6, to: 6.4 }, { kind: 'bakery', from: 9.4, to: 15.4 }], detail: FAR },
  { id: 'n8', from: [80, -12], to: [96, -12], storeys: 6, seed: 49, shops: [{ kind: 'grocer', from: 0.6, to: 6.4 }], door: 11, detail: FAR },
  { id: 'n9', from: [96, -12], to: [112, -12], storeys: 5, seed: 51, shops: [{ kind: 'bar', from: 8.4, to: 15.4 }], door: 4, detail: FAR, nameplates: [{ at: 15.1, name: 'FRONT STREET' }] },
  { id: 'n10', from: [120, -12], to: [136, -12], storeys: 6, seed: 56, shops: [{ kind: 'laundry', from: 0.6, to: 6 }], door: 11, detail: FAR, nameplates: [{ at: 0.9, name: 'FRONT STREET' }] },
  // Across the street (faces -z; left end is +x). fA and fB close Park Street's end.
  { id: 'fA', from: [-29, 12], to: [-40, 12], storeys: 6, seed: 81, shops: [{ kind: 'grocer', from: 0.4, to: 5.6, name: 'PARK FRUIT & VEG' }], door: 8, detail: NEAR, nameplates: [{ at: 10.1, name: 'FRONT STREET' }] },
  { id: 'fB', from: [-16, 12], to: [-29, 12], storeys: 5, seed: 82, shops: [{ kind: 'books', from: 0.4, to: 6.2, name: 'COMICS & MANGA' }, { kind: 'pets', from: 6.8, to: 12.6, door: 9.7, name: 'PAWS & CLAWS' }], detail: NEAR },
  { id: 'f1', from: [-2, 12], to: [-16, 12], storeys: 4, seed: 83, shops: [{ kind: 'butcher', from: 0.4, to: 6.6 }, { kind: 'bar', from: 7.4, to: 13.6, name: 'THE LOCAL' }], detail: NEAR },
  { id: 'retro', from: [10, 12], to: [-2, 12], storeys: 5, seed: 71, shops: [{ kind: 'retro', from: 1.2, to: 10.8, door: 7 }], detail: NEAR },
  { id: 'f3', from: [22, 12], to: [10, 12], storeys: 6, seed: 67, shops: [{ kind: 'bakery', from: 0.4, to: 5.8 }, { kind: 'cafe', from: 6.2, to: 11.6, name: 'SUNNY SIDE CAFE' }], detail: NEAR },
  { id: 'f4', from: [36, 12], to: [22, 12], storeys: 5, seed: 53, shops: [{ kind: 'pharmacy', from: 0.4, to: 6.6 }, { kind: 'furniture', from: 7.4, to: 13.6, door: 10.5, name: 'SECOND HOME' }], detail: NEAR },
  { id: 'f5', from: [50, 12], to: [36, 12], storeys: 6, seed: 55, shops: [{ kind: 'florist', from: 0.6, to: 6.2 }, { kind: 'tabac', from: 8, to: 13.4 }], detail: MID },
  { id: 'f6', from: [63, 12], to: [50, 12], storeys: 5, seed: 57, shops: [{ kind: 'books', from: 0.6, to: 6.4 }], door: 9.5, detail: FAR },
  { id: 'f7', from: [78, 12], to: [63, 12], storeys: 6, seed: 59, shops: [{ kind: 'cafe', from: 0.6, to: 7 }, { kind: 'shut', from: 8, to: 14.4 }], detail: FAR },
  { id: 'f8', from: [94, 12], to: [78, 12], storeys: 5, seed: 61, shops: [{ kind: 'bakery', from: 9, to: 15.4 }], door: 4, detail: FAR },
  { id: 'f9', from: [112, 12], to: [94, 12], storeys: 6, seed: 63, shops: [{ kind: 'bar', from: 0.6, to: 7 }, { kind: 'grocer', from: 11, to: 17.4 }], detail: FAR },
  { id: 'f10', from: [136, 12], to: [112, 12], storeys: 5, seed: 65, shops: [{ kind: 'pharmacy', from: 0.6, to: 6.4 }], door: 14, detail: FAR },
  // Our building round the corner bay (`CORNER_BAY`), in its stone: the collection room's left wall with its two
  // windows (world z -1.8 and 1.8), the kitchen wing's blind front, its side on Park Street with the kitchen's window.
  {
    id: 'oursBay', from: [-16, CORNER_BAY.z0], to: [-16, -12], storeys: 6, seed: 11, detail: NEAR,
    shops: [{ kind: 'cafe', from: 0.4, to: 5.3, name: 'PARKSIDE CAFE' }],
    flat: { floorY: FLAT_IN_STREET.height, windows: [{ at: 0.61, width: 1.2, bottom: 0.1, top: 2.5, room: 'living' }, { at: 4.21, width: 1.2, bottom: 0.1, top: 2.5, room: 'living' }] },
  },
  { id: 'oursWing', from: [PARK_STREET.line, CORNER_BAY.z0], to: [-16, CORNER_BAY.z0], storeys: 6, seed: 11, shops: [], bays: 2, detail: NEAR, flat: { floorY: FLAT_IN_STREET.height, windows: [] } },
  {
    id: 'oursSide', from: [PARK_STREET.line, COURTYARD.back], to: [PARK_STREET.line, CORNER_BAY.z0], storeys: 6, seed: 11, detail: NEAR, nameplates: [{ at: 5.4, name: 'PARK STREET' }],
    shops: [{ kind: 'shut', from: 0.5, to: 3.4 }], door: 4.9,
    flat: { floorY: FLAT_IN_STREET.height, windows: [{ at: 4.1, width: 0.9, bottom: 0.95, top: 2.05, room: 'kitchen' }] },
  },
  // The courtyard behind (`COURTYARD`): the workshop on Park Street, and over it the upper floors round the yard. Our
  // back wall carries the bedroom's frosted window (world x -0.3) and, in the light well, the bathroom's (world x -1.75).
  { id: 'courtWorkshop', from: [PARK_STREET.line, COURTYARD.far], to: [PARK_STREET.line, COURTYARD.back], storeys: 1, seed: 14, shops: [{ kind: 'electronics', from: 1.2, to: 6.8, door: 4, name: 'TV REPAIR' }], door: 11.5, detail: MID },
  {
    id: 'oursBack', from: [COURTYARD.east, COURTYARD.back], to: [COURTYARD.well.x1, COURTYARD.back], storeys: 6, seed: 15, shops: [], detail: MID,
    flat: { floorY: FLAT_IN_STREET.height, windows: [{ at: 15.3, width: 0.7, bottom: 1.15, top: 2.05, frosted: true, room: 'bedroom' }] },
  },
  { id: 'oursWellE', from: [COURTYARD.well.x1, COURTYARD.back], to: [COURTYARD.well.x1, COURTYARD.well.z], storeys: 6, seed: 15, shops: [], detail: MID, flat: { floorY: FLAT_IN_STREET.height, windows: [] } },
  {
    id: 'oursWell', from: [COURTYARD.well.x1, COURTYARD.well.z], to: [COURTYARD.well.x0, COURTYARD.well.z], storeys: 6, seed: 15, shops: [], detail: MID,
    flat: { floorY: FLAT_IN_STREET.height, windows: [{ at: 0.6, width: 0.6, bottom: 1.75, top: 2.25, frosted: true, room: 'bathroom' }] },
  },
  { id: 'oursWellW', from: [COURTYARD.well.x0, COURTYARD.well.z], to: [COURTYARD.well.x0, COURTYARD.back], storeys: 6, seed: 15, shops: [], detail: MID, flat: { floorY: FLAT_IN_STREET.height, windows: [] } },
  { id: 'oursBackW', from: [COURTYARD.well.x0, COURTYARD.back], to: [PARK_STREET.line, COURTYARD.back], storeys: 6, seed: 15, shops: [], detail: MID, flat: { floorY: FLAT_IN_STREET.height, windows: [] } },
  { id: 'courtEast', from: [COURTYARD.east, COURTYARD.far], to: [COURTYARD.east, COURTYARD.back], storeys: 5, seed: 16, shops: [], detail: FAR },
  { id: 'courtRear', from: [PARK_STREET.line, COURTYARD.far], to: [COURTYARD.east, COURTYARD.far], storeys: 6, seed: 17, shops: [], detail: FAR },
  // Park Street on from the courtyard: the rear building's side, the row beyond; the block across Front Street's flank on the park (faces -x).
  { id: 'parkMid', from: [PARK_STREET.line, -60], to: [PARK_STREET.line, COURTYARD.far], storeys: 6, seed: 12, shops: [{ kind: 'laundry', from: 0.8, to: 6.4 }], door: 17.5, detail: FAR },
  { id: 'parkRow', from: [PARK_STREET.line, -96], to: [PARK_STREET.line, -60], storeys: 5, seed: 13, shops: [], door: 18, detail: FAR },
  { id: 'fASide', from: [-40, 12], to: [-40, 30], storeys: 6, seed: 85, shops: [], detail: FAR },
  // The side street far along on our side: the corner blocks' flanks.
  { id: 'n9Side', from: [112, -12], to: [112, -60], storeys: 5, seed: 52, shops: [], detail: FAR, nameplates: [{ at: 0.9, name: 'MILL LANE' }] },
  { id: 'n10Side', from: [120, -60], to: [120, -12], storeys: 6, seed: 54, shops: [], detail: FAR },
  // The street ends: across Park Street far south, across Front Street far east, across the side street.
  { id: 'parkSouth', from: [-40, -96], to: [PARK_STREET.line, -96], storeys: 6, seed: 113, shops: [], detail: FAR },
  // The building closing the long view down Front Street: a café on the corner, the residents' door, a shop gone.
  { id: 'frontEnd', from: [136, -12], to: [136, 12], storeys: 7, seed: 117, shops: [{ kind: 'cafe', from: 0.8, to: 8.4, name: 'TERMINUS CAFE' }, { kind: 'shut', from: 15.6, to: 23.2 }], door: 12, detail: FAR },
  { id: 'sideSouth', from: [112, -60], to: [120, -60], storeys: 5, seed: 119, shops: [], detail: FAR },
];

/**
 * The paint a facade gets once the player walks along it (`Buildings`' windows in 3D and the shopfront kit start
 * there): the far rows of Front Street are walked past once the roadworks move on (`WORKS_LIFT`).
 */
const WALKED_DETAIL = 20;

/**
 * `facades` as the walkable street builds them: the rows of Front Street that stand along the walked stretch, up to
 * `walkEnd` (street x), painted at least at `WALKED_DETAIL` (a FAR row walked a metre off would read as a flat print).
 */
export function walkedFacades(facades: readonly FacadeSpec[], walkEnd: number): FacadeSpec[] {
  return facades.map((spec) => {
    const alongFront = spec.from[1] === spec.to[1] && Math.abs(spec.from[1]) === FRONT_ROW_Z;
    const walked = alongFront && Math.min(spec.from[0], spec.to[0]) < walkEnd;
    return walked && spec.detail < WALKED_DETAIL ? { ...spec, detail: WALKED_DETAIL } : spec;
  });
}
/** Front Street's two rows of facades stand at z = ±this. */
const FRONT_ROW_Z = 12;

/**
 * The shops one walks into (`world/shop/`): their door travels to their room, the way RETRO GAMES' leads to the
 * flea market, and coming back out sets the player down in front of it (`STREET_PLAN.arrivals`).
 */
export const SHOP_ZONE_OF: Partial<Record<ShopKind, ShopZoneId>> = { furniture: 'furnitureShop', electronics: 'tvShop', pets: 'petShop', florist: 'flowerShop' };

/** How far out on the pavement a door's step is (where the player comes back out of a shop is the street plan's `COMING_OUT`). */
const DOOR_STEP = 0.5;

/** Whether the pavement in front of `door` is somewhere the player can stand (only those doors get a click). */
export function doorOnPavement(door: ShopDoor): boolean {
  return isWalkable([door.at[0] + Math.sin(door.yaw) * DOOR_STEP, door.at[1] + Math.cos(door.yaw) * DOOR_STEP]);
}

/** The door on the walkable pavements of each shop one walks into, by its zone (the first of a kind, should two share one). */
export function walkInShops(): { zone: ShopZoneId; door: ShopDoor }[] {
  const seen = new Set<ShopZoneId>();
  return shopDoors().flatMap((door) => {
    const zone = SHOP_ZONE_OF[door.shop.kind];
    if (!zone || seen.has(zone) || !doorOnPavement(door)) return [];
    seen.add(zone);
    return [{ zone, door }];
  });
}

/** A shop's front door in the street: which shop, where (zone-local, on the building line) and the way it faces (yaw, 0 = +z). */
export interface ShopDoor {
  facade: FacadeSpec;
  shop: ShopSpec;
  at: Vec2;
  yaw: number;
  /** The shopfront's two ends (zone-local, on the building line). */
  from: Vec2;
  to: Vec2;
}

/** Every shop's door along the facades, worked out from `FACADES` (the arcade and RETRO GAMES included). */
export function shopDoors(facades: readonly FacadeSpec[] = FACADES): ShopDoor[] {
  const doors: ShopDoor[] = [];
  for (const facade of facades) {
    const [ax, az] = facade.from;
    const [bx, bz] = facade.to;
    const length = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / length;
    const uz = (bz - az) / length;
    // The face looks along the left-hand normal (-uz, ux); yaw 0 looks +z.
    const yaw = Math.atan2(-uz, ux);
    const along = (s: number): Vec2 => [ax + ux * s, az + uz * s];
    for (const shop of facade.shops) {
      doors.push({ facade, shop, at: along(shop.door ?? (shop.from + shop.to) / 2), yaw, from: along(shop.from), to: along(shop.to) });
    }
  }
  return doors;
}

