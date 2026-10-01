/*
 * FRONT STREET, walkable: the stretch outside the flat's building, from the park at the Park Street
 * corner to the roadworks that close the pavements further along. Zone-local metres, origin in the
 * middle of the road; x runs along the street (towards the park is -x), z across it (our building
 * is on the -z side, facing +z). The zone is not rotated, so +z is the way the flat's front windows
 * look and the sun agrees with the painted view (`SUN_ROTATION_Y`).
 *
 * It is the painted view's neighbourhood (`props/outdoors/plan.ts`) at street level: the flat is the
 * top floor of our corner building (`FLAT_IN_STREET`), Park Street runs away behind it (-z) with the
 * park on its far side, and ends at Front Street, where the block across closes it (a T junction).
 * Front Street runs on past the roadworks to a side street on our side and a building across its end.
 * The painted view's row across Front Street is painted from `FACADES` (`paintFrontBlock`), so the
 * shops one sees from the windows are the ones down here, RETRO GAMES included.
 *
 *            park        | fA  fB | f1  RETRO GAMES f3  f4 | f5 ... f10                         end
 *   lawn, trees  z 12 ── -40 ─── -16 ─── far row ──────── 36 ─────────────── 136 ─┐ building
 *   ─ hedge ─┐  (T)       ────── road z -8 .. 8, crossing at x 1..5, lights ─────  │ across
 *            │ Park   bay z -12 ── our row ── OURS ARCADE n3 n4 │ n5 .. n9 │side│ n10 │ at x 136
 *            │ Street -19.26 (-16 in the bay)                 38 roadworks  112..120
 *            │ -36..-23.3  courtyard z -24..-39 behind the workshop      (south)
 *            │ roadworks z -47   (runs on south to z -96)
 *
 * Walkable (`WALKABLE_AREAS`): Front Street from the park's railings (x -39.5) to the roadworks (x 38),
 * Park Street down to its own roadworks (z -47), the bay at our building's corner. Nothing invisible
 * stops the player: facades, railings, hoardings and barriers do, and in the road's gap at each works
 * a roadworker turns them back. Everything else is scenery.
 */

import type { FlatRoomId } from '../city/flatWindows';
import type { DecorEntry } from '../props/decor';
import { SAS } from '../airlock/airlockPlan';
import type { ZoneId } from '../zoneIds';
import type { ShopZoneId } from '../shop/shopPlan';
import type { SpillSpot } from './shopfronts/ShopSpill';

export type Vec2 = [x: number, z: number];

/** The zone's box: the player is "in the street" inside it (z -50..50: Park Street down to its roadworks; the sas behind our building's door is the street's, `world/airlock`). */
export const STREET_EXTENT = { width: 80, depth: 100, height: 40 };

/** Front Street's cross-section (z): building lines and kerbs. The road is `KERB_HEIGHT` below the pavements. */
export const FRONT = { ourLine: -12, nearKerb: -8, farKerb: 8, farLine: 12 } as const;
/**
 * Park Street (x): our building's side, its kerbs, the park's hedge; it runs south (-z) from Front Street.
 * Our side's building line is the kitchen wing's outer face (world x -6.56, `KITCHEN_WING`): the collection
 * room's left wall stands 3.26 m back from it, round the corner bay (`CORNER_BAY`).
 */
export const PARK_STREET = { line: -19.26, nearKerb: -23.3, farKerb: -36, hedge: -40 } as const;
/**
 * The bay at our building's corner, open from the pavement to the roof: the collection room's left
 * wall (x -16, world x -3.3, its two windows on the flat's floor) and, across its back, the kitchen
 * wing's blind front (z, world `KITCHEN_WING.z`: flush with the rear left window's back jamb, as the
 * panes paint it), which sticks out to Park Street's building line. The pavement runs into it.
 */
export const CORNER_BAY = { x0: PARK_STREET.line, x1: -16, z0: -17.71, z1: -12 } as const;
/**
 * Our block's courtyard behind the building (the panes' `COURT_*`, x 15 and z -24 in the flat's
 * frame): our back wall (z `back`, world -8.6: the bedroom's and the stairwell's backs, the bathroom
 * in a light well `well` deep), the neighbour's wing (x `east`), the rear building (z `far`). On Park
 * Street a one-storey workshop closes it, low enough for the upper floors round it to show.
 */
export const COURTYARD = { back: -23.9, well: { x0: -16, x1: -13.85, z: -22.42 }, east: 2.3, far: -39.3 } as const;
/** The side street on our side far along (x): its building lines and kerbs; it runs south from Front Street. */
export const SIDE_STREET = { line: 112, nearKerb: 114, farKerb: 118, farLine: 120 } as const;
/** How far the streets run: Park Street and the side street south to `south`, Front Street east to `east` (a building across it). */
export const STREET_ENDS = { south: -96, east: 136 } as const;
export const KERB_HEIGHT = 0.12;

/** Where the roadworks close the walkable street: across Front Street at x `front`, across Park Street at z `park`. */
export const WORKS = { front: 38.4, park: -47 } as const;
/** Park Street's parking lanes are this wide (Front Street's end at `STREET_PLAN.parkingLine`). */
export const PARK_PARKING = 2.1;

/** A rectangle of ground (zone-local). */
export interface Area {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Front Street between its building lines, from the park's railings to the roadworks. */
export const WALKABLE: Area = { minX: -39.5, maxX: WORKS.front - 0.4, minZ: FRONT.ourLine + 0.1, maxZ: FRONT.farLine - 0.1 };
/**
 * Everywhere the player can walk: Front Street, Park Street down to its roadworks, the corner bay.
 * Nothing invisible stands on the edges: facades, the railings, the hoardings and barriers
 * (`StreetBounds`, `StreetDetails`), and in the road's gap at the works a roadworker (`Flagger`).
 */
export const WALKABLE_AREAS: readonly Area[] = [
  WALKABLE,
  { minX: WALKABLE.minX, maxX: PARK_STREET.line - 0.1, minZ: WORKS.park + 0.4, maxZ: WALKABLE.minZ },
  { minX: CORNER_BAY.x0, maxX: CORNER_BAY.x1 - 0.1, minZ: CORNER_BAY.z0 + 0.1, maxZ: WALKABLE.minZ },
];

/**
 * Ground floor and floor-to-floor heights, as in the painted view (`Facades.GROUND`). Our flat's floor, on the fifth
 * floor, is the stairwell's five storeys of 3.26 m up (`FLAT_IN_STREET.height`, 16.3 m): the ground floor is what
 * puts the painted fifth floor there too (3.9 + 4 x 3.1).
 */
export const GROUND_FLOOR = 3.9;
export const STOREY = 3.1;

/**
 * The flat in the street's frame: the collection room's world floor centre (the painted view's eye)
 * sits at this zone-local (x, z), `height` over the pavement. World -> street: x + x, z + z.
 * Our building's corner on Park Street (world x -3.3) is the street's x -16; the front wall's
 * outer face (world z 3.3) is the building line z -12.
 */
export const FLAT_IN_STREET = { x: -12.7, z: -15.3, height: 16.3 } as const;

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

const NEAR = 34;
const MID = 22;
const FAR = 14;

/**
 * Every building face in view. The near and far rows first, then the side streets and the street ends.
 * Our building's top floor is the flat: the collection room's front window (world x 0.3) and the balcony door
 * (world x 2.0) are 3.6 and 5.3 m along from the corner (world x -3.3), as in `BALCONY_PLAN.front`.
 */
export const FACADES: readonly FacadeSpec[] = [
  // Our side (faces +z; left end is -x).
  {
    // The residents' door (10 along, x -6) is a hole: the sas behind it is walked through (`world/airlock`).
    id: 'ours', from: [-16, -12], to: [2, -12], storeys: 6, seed: 11, door: 10, detail: NEAR,
    openings: [{ at: 10, width: SAS.outerDoor.width, height: SAS.outerDoor.height }],
    shops: [{ kind: 'books', from: 0.6, to: 7, name: 'CORNER BOOKS' }, { kind: 'grocer', from: 12.4, to: 17.6 }],
    flat: { floorY: FLAT_IN_STREET.height, windows: [{ at: 3.6, width: 1.2, bottom: 0.1, top: 2.5, room: 'living' }], balcony: { at: 5.3, width: 2.6, depth: 1.3, door: { width: 0.9, height: 2.3 } } },
  },
  { id: 'arcade', from: [2, -12], to: [14, -12], storeys: 5, seed: 23, shops: [{ kind: 'arcade', from: 0.4, to: 11.6, door: 6 }], detail: NEAR },
  { id: 'n3', from: [14, -12], to: [26, -12], storeys: 4, seed: 37, shops: [{ kind: 'laundry', from: 0.4, to: 5.8 }, { kind: 'florist', from: 6.2, to: 11.6, door: 8.9 }], detail: NEAR },
  { id: 'n4', from: [26, -12], to: [36, -12], storeys: 6, seed: 41, shops: [{ kind: 'tabac', from: 0.4, to: 4.8 }, { kind: 'bar', from: 5.2, to: 9.6, name: 'THE ANCHOR' }], detail: NEAR },
  { id: 'n5', from: [36, -12], to: [50, -12], storeys: 5, seed: 43, shops: [{ kind: 'shut', from: 0.4, to: 6.6 }, { kind: 'butcher', from: 7.4, to: 13.6 }], detail: MID },
  { id: 'n6', from: [50, -12], to: [64, -12], storeys: 6, seed: 45, shops: [{ kind: 'cafe', from: 0.6, to: 6.8 }], door: 10.5, detail: FAR },
  { id: 'n7', from: [64, -12], to: [80, -12], storeys: 5, seed: 47, shops: [{ kind: 'pharmacy', from: 0.6, to: 6.4 }, { kind: 'bakery', from: 9.4, to: 15.4 }], detail: FAR },
  { id: 'n8', from: [80, -12], to: [96, -12], storeys: 6, seed: 49, shops: [{ kind: 'grocer', from: 0.6, to: 6.4 }], door: 11, detail: FAR },
  { id: 'n9', from: [96, -12], to: [112, -12], storeys: 5, seed: 51, shops: [{ kind: 'bar', from: 8.4, to: 15.4 }], door: 4, detail: FAR },
  { id: 'n10', from: [120, -12], to: [136, -12], storeys: 6, seed: 56, shops: [{ kind: 'laundry', from: 0.6, to: 6 }], door: 11, detail: FAR },
  // Across the street (faces -z; left end is +x). fA and fB close Park Street's end.
  { id: 'fA', from: [-29, 12], to: [-40, 12], storeys: 6, seed: 81, shops: [{ kind: 'grocer', from: 0.4, to: 5.6, name: 'PARK FRUIT & VEG' }], door: 8, detail: NEAR },
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
    id: 'oursSide', from: [PARK_STREET.line, COURTYARD.back], to: [PARK_STREET.line, CORNER_BAY.z0], storeys: 6, seed: 11, detail: NEAR,
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
  { id: 'n9Side', from: [112, -12], to: [112, -60], storeys: 5, seed: 52, shops: [], detail: FAR },
  { id: 'n10Side', from: [120, -60], to: [120, -12], storeys: 6, seed: 54, shops: [], detail: FAR },
  // The street ends: across Park Street far south, across Front Street far east, across the side street.
  { id: 'parkSouth', from: [-40, -96], to: [PARK_STREET.line, -96], storeys: 6, seed: 113, shops: [], detail: FAR },
  { id: 'frontEnd', from: [136, -12], to: [136, 12], storeys: 7, seed: 117, shops: [], detail: FAR },
  { id: 'sideSouth', from: [112, -60], to: [120, -60], storeys: 5, seed: 119, shops: [], detail: FAR },
];

/** A door the player can click, on a facade: where, which way it faces (yaw, 0 = its front looks +z) and where it leads. */
export interface DoorSpec {
  at: Vec2;
  yaw: number;
  width: number;
  height: number;
  to: ZoneId;
  label: string;
}

/** An arrival spot: where the player is set down (zone-local floor point) and the way they face (0 looks down -z). */
export interface ArrivalSpec {
  at: Vec2;
  yaw: number;
}

/** A point on the pavement and the way something standing there faces (yaw 0 = +z). */
export interface Spot {
  at: Vec2;
  yaw: number;
}

/**
 * The shops one walks into (`world/shop/`): their door travels to their room, the way RETRO GAMES' leads to the
 * flea market, and coming back out sets the player down in front of it (`STREET_PLAN.arrivals`).
 */
export const SHOP_ZONE_OF: Partial<Record<ShopKind, ShopZoneId>> = { furniture: 'furnitureShop', electronics: 'tvShop', pets: 'petShop', florist: 'flowerShop' };

/** How far out on the pavement a door's step is, and where the player comes back out of a shop. */
const DOOR_STEP = 0.5;
const COMING_OUT = 1.3;

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

/** Coming out of each walk-in shop: on the pavement in front of its door, facing the street. */
function shopArrivals(): Partial<Record<ShopZoneId, ArrivalSpec>> {
  return Object.fromEntries(
    walkInShops().map(({ zone, door }) => [zone, { at: [door.at[0] + Math.sin(door.yaw) * COMING_OUT, door.at[1] + Math.cos(door.yaw) * COMING_OUT], yaw: door.yaw + Math.PI }]),
  );
}

/** Where the stray cat sits: the spot, how high (a car roof, a bench, a bin), the way he faces, and what else may want the spot. */
export interface StrayCatPerch {
  at: Vec2;
  y: number;
  yaw: number;
  on?: 'bench' | 'bin';
}

/** The park's gate in the railings on Park Street (its middle). */
const PARK_GATE: Vec2 = [-39.75, -30];
/**
 * The far pavement walked west, from behind the bus shelter (its back at z 10.7; people pass behind it at z 11.05,
 * not through it, midway to SECOND HOME's pilaster plinths standing out to z 11.43 and its display windows to 11.55)
 * to Park Street's far kerb: the lane is z 10.1, bent to 9.6-9.85 past the terraces' chairs (z 10.5-11.3) and the
 * snowman (x -33.5), and back up past the street trees' pits (z up to 9.7).
 */
const FAR_WEST: Vec2[] = [
  [25.3, 11.05], [24.4, 10.1], [16.4, 10.1], [15.9, 9.6], [10.6, 9.6], [10.1, 10.1],
  [-9.4, 10.1], [-9.9, 9.85], [-15.2, 9.85], [-15.7, 10.1], [-31.9, 10.1], [-32.4, 9.6], [-34.6, 9.6], [-35.1, 10.1], [-38.2, 10.1],
];

export const STREET_PLAN = {
  /** The doors: our building's (into the stairwell's entrance hall), the arcade's, the retro games shop's (the flea market's way in). */
  doors: {
    // Our building's: the street door of the sas (`world/airlock`), placed at `at` by `furnishStreet`; `to` for the fallback's travel.
    home: { at: [-6, -12], yaw: 0, width: SAS.outerDoor.width, height: SAS.outerDoor.height, to: 'stairwell', label: 'Home · go in' } as DoorSpec,
    arcade: { at: [8, -12], yaw: 0, width: 1.6, height: 2.5, to: 'arcade', label: 'Arcade · go in' } as DoorSpec,
    market: { at: [3, 12], yaw: Math.PI, width: 1.4, height: 2.5, to: 'market', label: 'RETRO GAMES · go in (flea market at the back)' } as DoorSpec,
  },
  /** Arrival spots by the zone the player comes from (`TravelPlan.arrivals`): on the pavement in front of the matching door, facing the street. */
  arrivals: {
    stairwell: { at: [-6, -10.7], yaw: Math.PI } as ArrivalSpec,
    hallway: { at: [-6, -10.7], yaw: Math.PI } as ArrivalSpec,
    arcade: { at: [8, -10.7], yaw: Math.PI } as ArrivalSpec,
    market: { at: [3, 10.7], yaw: 0 } as ArrivalSpec,
    ...shopArrivals(),
  },
  /**
   * Neon over the arcade and the retro games shop: centre (zone-local, y up), facing yaw, size. Its panel (0.95 m
   * high) spans the fascia (3.05-3.75), under the ground floor's trim at `GROUND_FLOOR` (3.9) and over the glass (2.95).
   */
  signs: [
    { text: 'ARCADE', color: 0xff2fa0, at: [8, 3.42, -11.93] as [number, number, number], yaw: 0, width: 3.6, seed: 5 },
    { text: 'RETRO GAMES', color: 0x5fe6ff, at: [4, 3.42, 11.93] as [number, number, number], yaw: Math.PI, width: 4.2, seed: 9 },
    // TV REPAIR on Park Street (courtWorkshop, its fascia's middle 4 m along from z -39.3), standing on its shopfront's head (`shopfronts/`).
    { text: 'TV REPAIR', color: 0x5fd0ff, at: [PARK_STREET.line - 0.07, 3.47, COURTYARD.far + 4] as [number, number, number], yaw: -Math.PI / 2, width: 3.4, seed: 13 },
  ],
  /** Street lamps on the kerbs: position and the way the arm reaches (yaw of the arm, 0 = +z). `flicker`: the one that buzzes. */
  lamps: [
    { at: [-12, -8.7], yaw: 0 }, { at: [3, -8.7], yaw: 0 }, { at: [18, -8.7], yaw: 0 }, { at: [33, -8.7], yaw: 0 },
    { at: [48, -8.7], yaw: 0 }, { at: [63, -8.7], yaw: 0 }, { at: [78, -8.7], yaw: 0 }, { at: [93, -8.7], yaw: 0 }, { at: [108, -8.7], yaw: 0 },
    { at: [-27, 8.7], yaw: Math.PI }, { at: [-5, 8.7], yaw: Math.PI }, { at: [10, 8.7], yaw: Math.PI }, { at: [25, 8.7], yaw: Math.PI },
    { at: [40, 8.7], yaw: Math.PI }, { at: [55, 8.7], yaw: Math.PI }, { at: [70, 8.7], yaw: Math.PI }, { at: [85, 8.7], yaw: Math.PI }, { at: [100, 8.7], yaw: Math.PI },
    { at: [-22.6, -28], yaw: -Math.PI / 2 }, { at: [-22.6, -52], yaw: -Math.PI / 2 }, { at: [-22.6, -76], yaw: -Math.PI / 2 },
    { at: [-36.7, -38], yaw: Math.PI / 2 }, { at: [-36.7, -62], yaw: Math.PI / 2 },
  ] as { at: Vec2; yaw: number }[],
  /** Index (in `lamps`) of the lamp whose tube is going: it flickers and buzzes at night. */
  flickeringLamp: 3,
  /** Lamp head height, and how many real lights follow the lamps nearest the player (the rest glow only). */
  lampHeight: 6.2,
  lampLights: 4,
  /** Street trees on the pavements. */
  trees: [
    [-1, -9.3], [12, -9.3], [26, -9.3], [42, -9.3], [57, -9.3], [72, -9.3], [88, -9.3], [103, -9.3],
    [-12, 9.3], [17, 9.3], [32, 9.3], [46, 9.3], [60, 9.3], [76, 9.3], [91, 9.3], [106, 9.3],
    [-22.1, -20.5], [-22.1, -36], [-22.1, -56], [-22.1, -72],
  ] as Vec2[],
  /** The park beyond the hedge: trees scattered over this rectangle (seeded), and how many. */
  park: { from: [-90, -96] as Vec2, to: [-44, 60] as Vec2, trees: 30, seed: 7 },
  /** Parked cars: centre and heading (yaw 0 = nose towards +x, -π/2 = towards +z). */
  parked: [
    // Westbound on our side (nose to -x), eastbound across (nose to +x): right-hand traffic.
    { at: [-13, -7], yaw: Math.PI }, { at: [-8.2, -7], yaw: Math.PI }, { at: [11, -7], yaw: Math.PI }, { at: [15.8, -7], yaw: Math.PI }, { at: [21, -7], yaw: Math.PI }, { at: [30.5, -7], yaw: Math.PI },
    { at: [44, -7], yaw: Math.PI }, { at: [52, -7], yaw: Math.PI }, { at: [67, -7], yaw: Math.PI }, { at: [83, -7], yaw: Math.PI },
    { at: [-13.5, 7], yaw: 0 }, { at: [-8.5, 7], yaw: 0 }, { at: [13, 7], yaw: 0 }, { at: [17.8, 7], yaw: 0 },
    { at: [41, 7], yaw: 0 }, { at: [58, 7], yaw: 0 }, { at: [63, 7], yaw: 0 }, { at: [88, 7], yaw: 0 },
    { at: [-34.6, -30], yaw: -Math.PI / 2 }, { at: [-34.6, -41], yaw: -Math.PI / 2 }, { at: [-24.6, -64], yaw: Math.PI / 2 },
  ] as { at: Vec2; yaw: number }[],
  /**
   * Pedestrian crossings over Front Street (x ranges): the one with lights at the zebra (see
   * `signals`), and a plain zebra at Park Street's end where drivers give way to anyone on it.
   */
  crossings: [{ from: 1, to: 5, signals: true }, { from: -19.4, to: -16.6, signals: false }] as { from: number; to: number; signals: boolean }[],
  /** At each crossing the kerbs are dropped: a lip this high over the road, the pavement ramping down to it over `run`. */
  droppedKerb: { rise: 0.03, run: 0.9 },
  /** Road markings: the lane dashes and the parking lines (|z|), the stop lines' distance before a crossing. */
  laneDash: 3,
  parkingLine: 6,
  stopLine: 1.5,
  /** Patched repairs in the road (x0, z0, x1, z1): newer asphalt, clear of the manholes. */
  roadPatches: [[-5, -4.8, -2.2, -2.9], [14, 2.5, 17.5, 4.2], [40, -3.5, 44.5, -1.9], [60, 0.4, 62.5, 2.2], [-30.5, -30, -28.6, -26.2], [26, -1.2, 27.6, 0.9]] as [number, number, number, number][],
  /** The bus shelter on the far pavement (centre, faces the road), the benches and bins. */
  shelter: { at: [28, 10] as Vec2, yaw: Math.PI, length: 4 },
  benches: [{ at: [-10.5, -11.4], yaw: 0 }, { at: [-8, 11.4], yaw: Math.PI }] as { at: Vec2; yaw: number }[],
  bins: [[4.6, -8.55], [19.4, -8.55], [8.6, 8.55], [21.2, 8.55]] as Vec2[],
  /** The park's hedge and railings along x = hedge, from z to z (they stop where the block across Front Street begins). */
  hedge: { x: -40.4, from: STREET_ENDS.south, to: FRONT.farLine, height: 1.5, depth: 0.9 },
  railings: { x: -39.75, from: STREET_ENDS.south, to: FRONT.farLine, height: 1.15 },
  /**
   * The roadworks closing the walkable street (`WORKS`): across Front Street and across Park Street, a hoarding
   * across each pavement, barriers across the parking lanes, cones beyond, and in the road's gap between the
   * barriers a roadworker by a sign who turns back anyone on foot (`Flagger`).
   */
  roadworks: { depth: 0.25, height: 2.2 },
  /** The park's gate in the railings on Park Street, where the walkers going into the park leave the street (shut to the player: the gardeners are in). */
  parkGate: { at: PARK_GATE, width: 1.6 },
  /** The newsstand (kiosk): centre, the way its hatch faces. */
  kiosk: { at: [15.5, -11.05] as Vec2, yaw: 0 },
  /** The busker by the bus shelter: where they stand and face; the chiptune's reach. */
  busker: { at: [22.6, 10.8] as Vec2, yaw: Math.PI, hours: [9, 21.5] as [number, number], tipsPerDay: 3, reach: 22 },
  /** The garage sale's folding table (some days): centre, facing the pavement. */
  garageSale: { at: [29.5, -11.2] as Vec2, yaw: 0, oneDayIn: 3 },
  /**
   * The street's small print (`details/StreetDetails`), clear of the passers-by's routes (z about ±10.1..10.6 on the
   * pavements), the crossings and the signal posts: manhole covers, fire hydrants, the bollards either side of the
   * crossing and at Park Street's corners, the Morris column at the mouth of Park Street on the far pavement.
   */
  details: {
    manholes: [[-10, -4.5], [6.8, 3.2], [22, -2.8], [33, 4.4], [52, -3], [80, 2.8], [-28, -22], [-28, -58], [-7.6, -9.1], [14.2, 9.2], [29.2, -9.4], [-33, 9.3]] as Vec2[],
    hydrants: [[-15.4, -8.5], [24.6, 8.5], [35.6, -8.5], [-36.6, -24]] as Vec2[],
    bollards: [
      [-0.6, -8.35], [-1.3, -8.35], [5.6, -8.35], [6.3, -8.35],
      [-0.6, 8.35], [0.3, 8.35], [6.6, 8.35], [7.3, 8.35],
      [-23, -9.3], [-23, -10.3], [-23, -11.3],
      [-34.5, 8.35], [-32.5, 8.35], [-30.5, 8.35], [-22.5, 8.35],
    ] as Vec2[],
    column: { at: [-24.5, 9.05] as Vec2, radius: 0.6, height: 3.1 },
  },

  // --- Traffic -------------------------------------------------------------------------------
  /** Traffic: the two routes (right-hand traffic), cruising speed, and how long between cars. */
  traffic: {
    routes: [
      // Up Park Street from the south, left into Front Street, east past the roadworks, right into the side street.
      [[-31, -110], [-31, -10], [-28.5, -1.5], [-22, 1.6], [0, 1.6], [100, 1.6], [110, 3], [115, -6], [115.2, -14], [115.2, -80]],
      // Up the side street, left into Front Street towards the park, left again down Park Street.
      [[116.8, -80], [116.8, -14], [117.5, -5], [112, -1.6], [0, -1.6], [-22.5, -1.6], [-26.8, -6], [-27.4, -14], [-27.4, -110]],
    ] as Vec2[][],
    speed: 8.5,
    gap: [7, 22] as [number, number],
    /** How many cars can drive at once, by quality (the window view runs up to 14 across its two streets). */
    cars: 3,
    carsByQuality: { low: 3, medium: 5, high: 6 },
    /** A car stops for anyone standing this close ahead of it. */
    stopFor: 4,
  },
  /**
   * The signalled pedestrian crossing over Front Street at the zebra: the two signal posts (on the
   * kerbs, facing the traffic they stop), and the cycle in seconds: cars green, amber, all red,
   * walkers green, walkers flashing, all red again.
   */
  signals: {
    posts: [{ at: [0.3, -8.45] as Vec2, yaw: Math.PI / 2 }, { at: [5.7, 8.45] as Vec2, yaw: -Math.PI / 2 }],
    cycle: { carsGreen: 24, amber: 3, clear: 2, walkersGreen: 8, walkersFlash: 3 },
  },
  /**
   * The bus: it comes up Park Street on the first route's line, pulls in at the shelter (the stop on
   * the far kerb), waits, and goes on; one every `every` game minutes by day (about a minute and a
   * half real at the ten-minute day), `nightEvery` at night; `StreetBus` never runs them closer than
   * its own real-time floor, whatever the day's length.
   */
  bus: { stop: { at: [30, 6.6] as Vec2, dwell: 14 }, every: 200, nightEvery: 420, line: '38' },
  /** Cyclists on the road's outer lanes, and the bike racks on the pavements (with a few bikes locked to them). */
  bikes: { riders: 2, ridersByQuality: { low: 1, medium: 2, high: 3 }, racks: [{ at: [-2.6, -8.75], yaw: 0, bikes: 3 }, { at: [19.8, 8.75], yaw: Math.PI, bikes: 2 }, { at: [-22.6, -32.5], yaw: -Math.PI / 2, bikes: 2 }] as (Spot & { bikes: number })[] },
  /** The morning: the delivery van double-parked outside the bakery (f3), and the bin lorry doing the round. */
  delivery: { at: [19, 4.4] as Vec2, yaw: 0, door: [19, 11.9] as Vec2, hours: [6.5, 9.5] as [number, number] },
  binLorry: { hours: [5.5, 7.5] as [number, number] },
  /** Now and then an ambulance down Front Street, siren on: real seconds between two, before the first, its speed. */
  ambulance: { every: [420, 1100] as [number, number], first: [90, 400] as [number, number], cruise: 11 },

  // --- People and animals -------------------------------------------------------------------
  /** Passers-by: how many walk at once, and their routes (they appear at the first point, vanish at the last). */
  crowd: {
    count: 4,
    seeds: [301, 317, 331, 347, 353, 367],
    /** A passer-by further than this from the player is not drawn (people are the costly meshes); they fade out over the last metres. */
    drawDistance: 40,
    fade: 6,
    /**
     * Routes from a door, or from far down Park Street, to a door or back there. A route through
     * the crossing waits at the kerb (`crossing` marks the index of the kerb point) for the walkers' green.
     */
    routes: [
      { path: [[PARK_STREET.line, -27.8], [-20.4, -27.8], [-20.6, -10.2], [8, -10.2], [8, -12]] },
      { path: [[3, 12], [3, 10.1], [-9.4, 10.1], [-9.9, 9.85], [-15.2, 9.85], [-15.7, 10.1], [-17.6, 10.1], [-17.6, 8.4], [-18.2, -8.4], [-21, -10.4], [-21, -42.5], [PARK_STREET.line, -42.5]], crossing: 7 },
      { path: [[-6, -12], [-6, -10.4], [3, -10.4], [3, -8.4], [3, 8.4], [3, 10.4], [10.3, 10.4], [10.7, 9.95], [12.7, 9.95], [13.1, 10.4], [13.1, 12]], crossing: 3 },
      // Round the front of the newsstand (x 14.4..16.6, its counter out to z -9.98).
      { path: [[PARK_STREET.line, -42.5], [-20.8, -42.5], [-20.8, -10.6], [13.6, -10.6], [14, -9.6], [17, -9.6], [17.4, -10.6], [22.9, -10.6], [22.9, -12]] },
      { path: [[13.1, 12], [13.1, 9.7], [10.6, 9.7], [10.1, 10.2], [3.4, 10.2], [3.4, 8.4], [3.4, -8.4], [3.4, -10.2], [-12, -10.2], [-12, -12]], crossing: 5 },
      { path: [[33.4, -12], [33.4, -10.3], [17.4, -10.3], [17, -9.6], [14, -9.6], [13.6, -10.3], [-21.4, -10.3], [-21.4, -27.8], [PARK_STREET.line, -27.8]] },
      // East along the far pavement: z 10.4, down to 10.15 / 9.95 past the terraces' chairs.
      { path: [[-32, 12], [-32, 10.4], [-15.7, 10.4], [-15.3, 10.15], [-9.8, 10.15], [-9.4, 10.4], [10.3, 10.4], [10.7, 9.95], [15.8, 9.95], [16.4, 10.4], [18.9, 10.4], [18.9, 12]] },
      { path: [[32.5, 12], [32.5, 11.05], ...FAR_WEST, [-38.2, PARK_GATE[1]], PARK_GATE] },
    ] as { path: Vec2[]; crossing?: number }[],
  },
  /** People standing about: on the phone, waiting for the bus, on a bench. */
  standing: {
    phone: { at: [-2.4, -10.9], yaw: Math.PI * 0.85, hours: [8, 21] as [number, number] },
    /** The one waiting in the shelter, and where someone who got off walks to: out behind the shelter, along the far pavement, into the park by its gate. */
    busStop: { at: [28.6, 10.35], yaw: Math.PI, alight: [[31, 10.2], [30.9, 11.05], ...FAR_WEST, [-38.2, PARK_GATE[1]], PARK_GATE] as Vec2[] },
    bench: { at: [-10.5, -11.3], yaw: 0, hours: [9, 19] as [number, number] },
  },
  /** The café's, the bars' terraces: along a stretch of pavement in front of them, how many tables, when they are out. */
  terraces: [
    { from: [15.5, 10.9] as Vec2, to: [10.9, 10.9] as Vec2, tables: 3, hours: [7.5, 20] as [number, number], customers: 2 },
    { from: [-9.9, 10.9] as Vec2, to: [-15.2, 10.9] as Vec2, tables: 3, hours: [11, 24] as [number, number], customers: 2 },
    // THE ANCHOR's front (x 31.2..35.6): a table either side of its door (the middle one gives way to the door).
    { from: [31.2, -10.9] as Vec2, to: [35.6, -10.9] as Vec2, tables: 3, hours: [10, 24] as [number, number], customers: 2 },
  ],
  /** Pigeons pecking about (they take off when the player comes close), and where the stray cat sits. */
  pigeons: [{ at: [6.5, -10.2] as Vec2, count: 7 }, { at: [-30, 10.2] as Vec2, count: 9 }, { at: [24, 10.6] as Vec2, count: 5 }],
  /** `on`: the perch is the bench (taken while someone sits there) or a bin (while the bin lorry is on its round): he sits elsewhere then. */
  strayCat: { perches: [{ at: [11, -7], y: 1.46, yaw: 0.6 }, { at: [-10.5, -11.55], y: 0.82, yaw: 0, on: 'bench' }, { at: [-38.5, -14], y: 0, yaw: -1.2 }, { at: [21.2, 8.55], y: 0.96, yaw: 2.4, on: 'bin' }] as StrayCatPerch[] },

  // --- Things to find, shops to go into -------------------------------------------------------
  /** Coins dropped on the pavement: where one may lie (a few a day, seeded by the date), how many a day. */
  coins: { spots: [[-14.2, -9.1], [-3.3, -11.2], [6.1, -8.9], [24.8, -9.4], [34.4, -11.5], [-22.4, 9.3], [-6.6, 9.1], [9.2, 11.2], [26.2, 9.2], [33.1, 11.3], [-21.9, -40.5], [-37.9, -22.6]] as Vec2[], perDay: 3 },
  /** A cardboard box of cast-offs left out by a door (some days): "FREE TO TAKE". */
  giveaway: { spots: [{ at: [-4.8, -11.55], yaw: 0 }, { at: [-36.4, 11.5], yaw: Math.PI }, { at: [-19.75, -26.8], yaw: -Math.PI / 2 }] as Spot[], oneDayIn: 4 },
  /** The collector who sets up outside RETRO GAMES some days, selling and swapping. */
  trader: { at: [8.4, 10.85] as Vec2, yaw: Math.PI, oneDayIn: 3, hours: [10, 18] as [number, number] },
  /**
   * RETRO GAMES on a new market day, as the window view shows it (`RetroLure`): the NEW IN banner in its window
   * (middle, facing the road) and the spots of the queue along the pavement from its door (nearest first).
   */
  retroLure: {
    banner: { at: [6, 2.45, 11.94] as [number, number, number], yaw: Math.PI, width: 1.7, height: 0.48 },
    queue: [[3.9, 11.2], [4.6, 11.28], [5.3, 11.2], [6.0, 11.28], [6.7, 11.2], [7.4, 11.28]] as Vec2[],
  },
  /**
   * What the walk-in shops put out on the pavement while open (`shopfronts/ShopSpill`), in front of their display
   * windows (which stand out 0.45 m, `shopfronts/shopfrontPlan`), clear of their doors and of the passers-by's lanes.
   */
  shopSpill: [
    // The florist (n3, x 20.2..25.6, door x 22.9; the lanes at z -10.6 and -10.3): buckets and the chalk board by the left window, the stand of pots by the right.
    { piece: 'flowerBuckets', shop: 'florist', at: [20.85, -11.3], yaw: 0 },
    { piece: 'aBoard', shop: 'florist', at: [21.62, -11.2], yaw: 0.25 },
    { piece: 'flowerTiers', shop: 'florist', at: [24.55, -11.25], yaw: 0 },
    // SECOND HOME (f4, x 22.4..28.6, door x 25.5): its bench for sale right of the door, between the busker (x 22.6) and the lane's bend.
    { piece: 'saleBench', shop: 'furniture', at: [24.05, 11.3], yaw: Math.PI },
    // PAWS & CLAWS (fB, x -28.6..-22.8, door x -25.7; the lanes at z 10.1..10.4): the dogs' water and a sack of kibble.
    { piece: 'dogBowls', shop: 'pets', at: [-24.35, 11.3], yaw: Math.PI },
    { piece: 'kibbleSack', shop: 'pets', at: [-26.85, 11.35], yaw: Math.PI + 0.3 },
    // TV REPAIR (courtWorkshop on Park Street, facing -x, door z -35.3; the lanes at x -20.8..-21): a dead set out by the right window.
    { piece: 'brokenTv', shop: 'electronics', at: [-19.98, -34.0], yaw: -Math.PI / 2 - 0.2 },
  ] as SpillSpot[],
  /** The florist's chalk board out on the pavement. */
  chalkBoard: ['TULIPS', '3 for 2'] as [string, string],
  /** Where the church clock the bells ring from is (far off, beyond the park), for the sound's side. */
  church: [-160, 60] as Vec2,
  /** A snowman on the far pavement near the park, there while the snow lies. */
  snowman: { at: [-33.5, 10.4] as Vec2, yaw: Math.PI },
  /**
   * What the street puts up for the holidays (`holiday` gates, see `props/decor.ts`): strings of lights slung across
   * Front Street from first floor to first floor between the lamp posts (a floor placement turned to run along +z, from
   * our building line to the far one), and at Halloween lit pumpkins on the doorsteps, clear of the giveaway's spot.
   */
  decor: [
    { kind: 'fairyLights', at: { floor: [-20, -12], rotationY: -Math.PI / 2 }, options: { length: 24, height: 5.6, sag: 0.9, spacing: 0.45, bulb: 0.05, seed: 1 }, holiday: 'christmas' },
    { kind: 'fairyLights', at: { floor: [-1, -12], rotationY: -Math.PI / 2 }, options: { length: 24, height: 5.6, sag: 0.9, spacing: 0.45, bulb: 0.05, seed: 2 }, holiday: 'christmas' },
    { kind: 'fairyLights', at: { floor: [14, -12], rotationY: -Math.PI / 2 }, options: { length: 24, height: 5.6, sag: 0.9, spacing: 0.45, bulb: 0.05, seed: 3 }, holiday: 'christmas' },
    { kind: 'fairyLights', at: { floor: [29, -12], rotationY: -Math.PI / 2 }, options: { length: 24, height: 5.6, sag: 0.9, spacing: 0.45, bulb: 0.05, seed: 4 }, holiday: 'christmas' },
    // Left of our building's street door (x -6.7..-5.3, the sas; the giveaway box's spot is right of it, x -4.8).
    { kind: 'pumpkin', at: { floor: [-7.05, -11.7], rotationY: 0.2 }, options: { radius: 0.16, seed: 51 }, holiday: 'halloween' },
    { kind: 'pumpkin', at: { floor: [-7.45, -11.75], rotationY: -0.1 }, options: { radius: 0.1, seed: 52 }, holiday: 'halloween' },
    { kind: 'pumpkin', at: { floor: [13.5, 11.65], rotationY: Math.PI }, options: { radius: 0.14, seed: 53 }, holiday: 'halloween' },
    { kind: 'pumpkin', at: { floor: [30.5, -11.65], rotationY: 0 }, options: { radius: 0.13, seed: 54 }, holiday: 'halloween' },
  ] as DecorEntry[],
} as const;

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

/** Whether a point (zone-local) is on the walkable pavements or road. */
export function isWalkable([x, z]: Vec2): boolean {
  return WALKABLE_AREAS.some((a) => x >= a.minX && x <= a.maxX && z >= a.minZ && z <= a.maxZ);
}
