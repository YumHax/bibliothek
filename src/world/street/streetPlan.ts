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

import type { DecorEntry } from '../props/decor';
import { SAS } from '../airlock/airlockPlan';
import type { ZoneId } from '../zoneIds';
import type { ShopZoneId } from '../shop/shopPlan';
import type { SpillSpot } from './shopfronts/ShopSpill';
import type { AttractionSpec, CrowdRoute } from './life/crowdTrips';
import type { LoiterSpec } from './life/Loiterers';
import { SEASON_FLOWERS } from '@/errands/errands';
import { seasonOf } from '@/time/season';
import { COURTYARD, FRONT, PARK_STREET, STREET_ENDS, type Vec2 } from '../measures/street';
import { walkInShops, type ShopKind } from '../city/facades';

// The street's measures (kerbs, building lines, the flat's place) are `measures/street`, its facades `city/facades`:
// their types are re-exported here for the plan's many readers, the values are imported from their homes.
export type { Vec2 } from '../measures/street';
export type { ShopKind, ShopSpec, FacadeSpec, FlatFront, ShopDoor } from '../city/facades';

/** A street lamp's kind: the modern arm over the road, a cast-iron column with a lantern on a crook, a post-top lantern. */
export type LampDesign = 'arm' | 'crook' | 'post';

/**
 * The road's wear (`StreetGround`, in its shader): potholes (x, z, radius) in the parking lanes and by the gutters,
 * clear of the manholes and the crossings; the bays painted along Park Street's parking lanes (metres a bay).
 */
export const ROAD_WEAR = {
  potholes: [[-3.5, 6.7, 0.32], [46.5, -6.4, 0.42], [-29.2, -41, 0.38], [26.2, -6.5, 0.26]] as [number, number, number][],
  parkBay: 5.6,
} as const;

/** A door the player can click, on a facade: where, which way it faces (yaw, 0 = its front looks +z) and where it leads. */
interface DoorSpec {
  at: Vec2;
  yaw: number;
  width: number;
  height: number;
  to: ZoneId;
  label: string;
}

/** An arrival spot: where the player is set down (zone-local floor point) and the way they face (0 looks down -z). */
interface ArrivalSpec {
  at: Vec2;
  yaw: number;
}

/** A point on the pavement and the way something standing there faces (yaw 0 = +z). */
export interface Spot {
  at: Vec2;
  yaw: number;
}

/** How far out on the pavement the player comes back out of a shop (its door's step is `city/facades`' concern). */
const COMING_OUT = 1.3;

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
    // Back down from a small ad's seller (`world/sellerFlat`): out of Park Corner Mansions' door (facade fA, at 8 along).
    sellerFlat: { at: [-37, 10.7], yaw: 0 } as ArrivalSpec,
    // Off the bus back from Mémé's (`world/grandma`): on the pavement by the stop's pole, facing the road.
    grandmaFlat: { at: [31.8, 9.8], yaw: 0 } as ArrivalSpec,
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
  /**
   * Street lamps on the kerbs: position and the way the arm reaches (yaw of the arm, 0 = +z), and which kind
   * (`StreetLamps` `LAMP_DESIGNS`; the modern arm when absent): Park Street, along the park, keeps its old cast-iron
   * columns with a lantern on a crook, the corner at its mouth a post-top lantern.
   */
  lamps: [
    { at: [-12, -8.7], yaw: 0 }, { at: [3, -8.7], yaw: 0 }, { at: [18, -8.7], yaw: 0 }, { at: [33, -8.7], yaw: 0 },
    { at: [48, -8.7], yaw: 0 }, { at: [63, -8.7], yaw: 0 }, { at: [78, -8.7], yaw: 0 }, { at: [93, -8.7], yaw: 0 }, { at: [108, -8.7], yaw: 0 },
    { at: [-27, 8.7], yaw: Math.PI, design: 'post' }, { at: [-5, 8.7], yaw: Math.PI }, { at: [10, 8.7], yaw: Math.PI }, { at: [25, 8.7], yaw: Math.PI },
    { at: [40, 8.7], yaw: Math.PI }, { at: [55, 8.7], yaw: Math.PI }, { at: [70, 8.7], yaw: Math.PI }, { at: [85, 8.7], yaw: Math.PI }, { at: [100, 8.7], yaw: Math.PI },
    { at: [-22.6, -28], yaw: -Math.PI / 2, design: 'crook' }, { at: [-22.6, -52], yaw: -Math.PI / 2, design: 'crook' }, { at: [-22.6, -76], yaw: -Math.PI / 2, design: 'crook' },
    { at: [-36.7, -38], yaw: Math.PI / 2, design: 'crook' }, { at: [-36.7, -62], yaw: Math.PI / 2, design: 'crook' },
  ] as { at: Vec2; yaw: number; design?: LampDesign }[],
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
  /**
   * The park's gate in the railings on Park Street, where the walkers going into the park leave the street: open in
   * `hours` (the gardens behind it, `PARK_WALK`, walked then), shut and chained the rest of the time (never on someone
   * still inside: it waits for them to come out).
   */
  parkGate: { at: PARK_GATE, width: 1.6, hours: [7.5, 20.5] as [number, number] },
  /**
   * The roadworkers' shift (`Flagger`): out of it they have gone home, and a ROAD CLOSED board and two portable
   * signals stand in the gap instead (its collider stays: the pavements are shut all the same).
   */
  flaggerHours: [7, 18.5] as [number, number],
  /** The newsstand (kiosk): centre, the way its hatch faces. */
  kiosk: { at: [15.5, -11.05] as Vec2, yaw: 0 },
  /** The busker by the bus shelter: where they stand and face; the chiptune's reach. */
  busker: { at: [22.6, 10.8] as Vec2, yaw: Math.PI, hours: [9, 21.5] as [number, number], tipsPerDay: 3, reach: 22 },
  /** The garage sale's folding table (some days): centre, facing the pavement. */
  garageSale: { at: [29.5, -11.2] as Vec2, yaw: 0, oneDayIn: 3 },
  /**
   * The bells of Park Corner Mansions (`MansionBell`), the flats over PARK FRUIT & VEG (facade fA, its painted entrance
   * at 8 along, its surround to 8.95): on the wall right of the door as the street sees it, at hand height.
   */
  mansionBell: { at: [-38.25, 12] as Vec2, y: 1.35, yaw: Math.PI },
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
    gap: [5, 16] as [number, number],
    /** How many cars can drive at once, by quality (the window view runs up to 14 across its two streets). */
    cars: 3,
    carsByQuality: { low: 4, medium: 6, high: 8 },
    /** A car stops for anyone standing this close ahead of it. */
    stopFor: 4,
    /** Now and then a parked car pulls out of its bay, or a driver parks in a free one: real seconds between two. */
    manoeuvres: [30, 80] as [number, number],
  },
  /**
   * A taxi pulling in to the kerb now and then (`StreetCars`): where it stands (its middle, heading), the kerb its fare
   * steps onto and the door they come from or go to; real seconds between two.
   */
  taxi: {
    stops: [
      // Our side, westbound, in the gap between the bays at x 21 and 30.5.
      { at: [25.8, -3.6], yaw: Math.PI, kerb: [25.4, -9], door: [22.9, -12] },
      // The far side, eastbound, past the bus stop.
      { at: [35.4, 3.6], yaw: 0, kerb: [35.6, 9], door: [32.5, 12] },
    ] as { at: Vec2; yaw: number; kerb: Vec2; door: Vec2 }[],
    every: [70, 170] as [number, number],
  },
  /** Scooters, motorbikes and couriers (a scooter with a box) in the car lanes: how many at once by quality, seconds between two, shares. */
  twoWheelers: { ridersByQuality: { low: 1, medium: 2, high: 3 }, gap: [12, 34] as [number, number], courier: 0.35, moto: 0.35 },
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
  /**
   * Riding the bus (`StreetBus`, boarded while its doors stand open at the stop): the fare (coins, the way back
   * included), and where line 38 takes the player, the first that is on (`hours` absent: always; else when, and the
   * word for when not). Only somewhere the player cannot walk to: Mémé's, across town (docs/story.md "Mémé").
   * The stop's pole by the shelter carries the flag and the timetable (`wayfinding/BusStopPole`), clicked to read it.
   */
  busRide: {
    fare: 2,
    destinations: [
      { to: 'grandmaFlat', label: 'Mémé’s on Linden Avenue', board: 'LINDEN AVENUE', hours: [8, 21], shut: 'Mémé’s in bed by now' },
    ] as { to: ZoneId; label: string; board: string; hours?: [number, number]; shut?: string }[],
    pole: { at: [30.6, 8.9] as Vec2, yaw: 0 },
  },
  /** Cyclists on the road's outer lanes, and the bike racks on the pavements (with a few bikes locked to them). */
  bikes: { riders: 2, ridersByQuality: { low: 1, medium: 2, high: 3 }, racks: [{ at: [-2.6, -8.75], yaw: 0, bikes: 3 }, { at: [19.8, 8.75], yaw: Math.PI, bikes: 2 }, { at: [-22.6, -32.5], yaw: -Math.PI / 2, bikes: 2 }] as (Spot & { bikes: number })[] },
  /** The morning: the delivery van double-parked outside the bakery (f3), and the bin lorry doing the round. */
  delivery: { at: [19, 4.4] as Vec2, yaw: 0, door: [19, 11.9] as Vec2, hours: [6.5, 9.5] as [number, number], later: [[14, 15.5]] as [number, number][] },
  /** The bin lorry's morning round, and the recycling round in the afternoon. */
  binLorry: { hours: [5.5, 7.5] as [number, number], later: [[13, 14.5]] as [number, number][] },
  /** The parcel van: double-parked by the far row's door at x 13 a while (late morning, late afternoon), the courier running a parcel in. */
  parcels: { at: [13.6, 4.4] as Vec2, yaw: 0, door: [13.1, 11.9] as Vec2, hours: [11, 12.5] as [number, number], later: [[16, 17.5]] as [number, number][] },
  /**
   * Now and then an emergency vehicle along one of the traffic's routes, siren on (one out at a time): real seconds
   * between two, before the first, its speed.
   */
  ambulance: { every: [420, 1100] as [number, number], first: [90, 400] as [number, number], cruise: 11 },
  police: { every: [520, 1400] as [number, number], first: [200, 700] as [number, number], cruise: 11.5 },
  fireEngine: { every: [1500, 3600] as [number, number], first: [700, 1800] as [number, number], cruise: 9.5 },

  // --- People and animals -------------------------------------------------------------------
  /** Passers-by: how many walk at once, and their routes (they appear at the first point, vanish at the last). */
  crowd: {
    /** How many walk at once at the busiest hour (`streetBusyAt`), by quality; fewer as the hour, the day and the rain say. */
    countByQuality: { low: 3, medium: 6, high: 8 },
    /** The regulars (the same faces every day; the second walks the dog, the fifth is old) and, besides, the day's strangers, by quality. */
    seeds: [301, 317, 331, 347, 353, 367],
    strangersByQuality: { low: 2, medium: 6, high: 8 },
    /** How many of them walk with someone (a child by day, a friend), and how many walk a dog. */
    companionsByQuality: { low: 0, medium: 2, high: 3 },
    dogsByQuality: { low: 1, medium: 2, high: 2 },
    /** People drawn at once in the whole street, all of them (passers-by, the queues, terraces, standing about): the nearest only. */
    budgetByQuality: { low: 6, medium: 10, high: 13 },
    /** A passer-by further than this from the player is not drawn (people are the costly meshes); they fade out over the last metres. */
    drawDistance: 40,
    fade: 6,
    /**
     * Past the draw distance, flat figures walk the pavements down the street (`FarWalkers`): their lanes (x0 to x1 at z,
     * both pavements, out to the street's far end) and how many at once by quality.
     */
    far: {
      lanes: [
        { x0: -38, x1: 134, z: -10.6 },
        { x0: -38, x1: 134, z: -9.3 },
        { x0: -38, x1: 134, z: 9.3 },
        { x0: -38, x1: 134, z: 10.6 },
      ],
      countByQuality: { low: 0, medium: 12, high: 20 },
    },
    /**
     * Where a passer-by may stop on the way, besides the shops' windows: the newsstand's front page (its counter, right on
     * the lane), a listen to the busker (in front of him, off the far pavement's lane), the bills on the Morris column.
     */
    attractions: [
      { at: [15.5, -9.62], look: [15.5, 1.3, -10.4], kind: 'kiosk', seconds: [3, 7], hours: [6, 22] },
      { at: [21.6, 9.75], look: [22.6, 1.4, 10.8], kind: 'busker', seconds: [6, 14], hours: [9, 21.5], dry: true },
      { at: [-24.5, 10.05], look: [-24.5, 1.7, 9.05], kind: 'column', seconds: [3, 7], dry: true },
    ] as AttractionSpec[],
    /**
     * The building's residents (`STAIRWELL_PLAN.residents`) out of our own street door at the hour they go out, and back
     * to it before the hour they come home: along our pavement, over the zebra at Park Street's mouth, along the far
     * pavement and into the park by its gate (and the same way back). Nobody else uses our door.
     */
    residents: {
      out: { path: [[-6, -12], [-6, -10.4], [-17.9, -10.4], [-17.9, -8.4], [-17.6, 8.4], [-17.6, 10.1], [-31.9, 10.1], [-32.4, 9.6], [-34.6, 9.6], [-35.1, 10.1], [-38.2, 10.1], [-38.2, PARK_GATE[1]], PARK_GATE], crossing: 3 } as CrowdRoute,
      back: { path: [PARK_GATE, [-38.2, PARK_GATE[1]], [-38.2, 10.1], [-35.1, 10.1], [-34.6, 9.6], [-32.4, 9.6], [-31.9, 10.1], [-17.6, 10.1], [-17.6, 8.4], [-17.9, -8.4], [-17.9, -10.4], [-6, -10.4], [-6, -12]], crossing: 8 } as CrowdRoute,
      /** Game hours after their `out` they may still be seen setting off; before their `back`, they set off home. */
      lateBy: 1.5,
      backBefore: [3, 1.5] as [number, number],
    },
    /**
     * Routes from a door, or from far down Park Street, to a door or back there. A route through
     * the crossing waits at the kerb (`crossing` marks the index of the kerb point) for the walkers' green.
     */
    routes: [
      { path: [[PARK_STREET.line, -27.8], [-20.4, -27.8], [-20.6, -10.2], [8, -10.2], [8, -12]] },
      { path: [[3, 12], [3, 10.1], [-9.4, 10.1], [-9.9, 9.85], [-15.2, 9.85], [-15.7, 10.1], [-17.6, 10.1], [-17.6, 8.4], [-18.2, -8.4], [-21, -10.4], [-21, -42.5], [PARK_STREET.line, -42.5]], crossing: 7 },
      // Out of the grocer's on our side (our own door is the residents', above).
      { path: [[-1, -12], [-1, -10.4], [3, -10.4], [3, -8.4], [3, 8.4], [3, 10.4], [10.3, 10.4], [10.7, 9.95], [12.7, 9.95], [13.1, 10.4], [13.1, 12]], crossing: 3 },
      // Round the front of the newsstand (x 14.4..16.6, its counter out to z -9.98).
      { path: [[PARK_STREET.line, -42.5], [-20.8, -42.5], [-20.8, -10.6], [13.6, -10.6], [14, -9.6], [17, -9.6], [17.4, -10.6], [22.9, -10.6], [22.9, -12]] },
      { path: [[13.1, 12], [13.1, 9.7], [10.6, 9.7], [10.1, 10.2], [3.4, 10.2], [3.4, 8.4], [3.4, -8.4], [3.4, -10.2], [-12, -10.2], [-12, -12]], crossing: 5 },
      { path: [[33.4, -12], [33.4, -10.3], [17.4, -10.3], [17, -9.6], [14, -9.6], [13.6, -10.3], [-21.4, -10.3], [-21.4, -27.8], [PARK_STREET.line, -27.8]] },
      // East along the far pavement: z 10.4, down to 10.15 / 9.95 past the terraces' chairs.
      { path: [[-32, 12], [-32, 10.4], [-15.7, 10.4], [-15.3, 10.15], [-9.8, 10.15], [-9.4, 10.4], [10.3, 10.4], [10.7, 9.95], [15.8, 9.95], [16.4, 10.4], [18.9, 10.4], [18.9, 12]] },
      { path: [[32.5, 12], [32.5, 11.05], ...FAR_WEST, [-38.2, PARK_GATE[1]], PARK_GATE] },
      // Out of the bakery (f3) with a loaf, west along the far pavement past RETRO GAMES, over the lights, home down Park Street.
      { path: [[18.9, 12], [18.9, 10.1], [16.4, 10.1], [15.9, 9.6], [10.6, 9.6], [10.1, 10.1], [3.4, 10.1], [3.4, 8.4], [3.4, -8.4], [3.4, -10.4], [-20.8, -10.4], [-20.8, -27.8], [PARK_STREET.line, -27.8]], crossing: 7 },
      // At night, out of THE LOCAL (f1) and off home through the park; out of THE ANCHOR (n4) and off down Park Street.
      { path: [[-12.5, 12], [-12.5, 9.85], [-15.2, 9.85], [-15.7, 10.1], [-31.9, 10.1], [-32.4, 9.6], [-34.6, 9.6], [-35.1, 10.1], [-38.2, 10.1], [-38.2, PARK_GATE[1]], PARK_GATE], night: true },
      { path: [[33.4, -12], [33.4, -10.3], [17.4, -10.3], [17, -9.6], [14, -9.6], [13.6, -10.3], [-21.4, -10.3], [-21.4, -42.5], [PARK_STREET.line, -42.5]], night: true },
    ] as CrowdRoute[],
  },
  /** People standing about: on the phone, waiting for the bus, on a bench. */
  standing: {
    phone: { at: [-2.4, -10.9], yaw: Math.PI * 0.85, hours: [8, 21] as [number, number] },
    /** The one waiting in the shelter, and where someone who got off walks to: out behind the shelter, along the far pavement, into the park by its gate. */
    busStop: { at: [28.6, 10.35], yaw: Math.PI, alight: [[31, 10.2], [30.9, 11.05], ...FAR_WEST, [-38.2, PARK_GATE[1]], PARK_GATE] as Vec2[] },
    /** More waiting in the shelter in the rush (beside the first, under its roof), and how many get off at most. */
    busQueue: [[27.5, 10.4], [29.6, 10.3]] as Vec2[],
    alightMax: 2,
    bench: { at: [-10.5, -11.3], yaw: 0, hours: [9, 19] as [number, number] },
  },
  /**
   * People who stand together a while (`life/Loiterers`): smokers outside the bars by night (THE LOCAL's end of the far
   * row, before COMICS & MANGA; past THE ANCHOR, before the roadworks), two neighbours catching up by PARK FRUIT & VEG by
   * day. Each spot is two (or three) people facing in; `hours` past 24 run on after midnight.
   */
  loiterers: [
    { kind: 'smokers', at: [[-16.6, 11.35], [-17.3, 11.05]] as Vec2[], hours: [19.5, 26] as [number, number], shop: 'bar' },
    { kind: 'smokers', at: [[36.5, -11.35], [37.1, -10.95], [36.4, -10.75]] as Vec2[], hours: [20, 26] as [number, number], shop: 'bar' },
    { kind: 'chatting', at: [[-29.7, 11.35], [-28.9, 11.3]] as Vec2[], hours: [9.5, 19] as [number, number], dry: true },
  ] as LoiterSpec[],
  /**
   * The morning queue outside the bakery (f3, its painted door found near `door`): spots along the wall from the door
   * towards the café (`dir` -1: towards -x), at `z`; who goes in comes out later with a loaf (a crowd route starts there).
   */
  shopQueues: [{ door: [18.9, 12] as Vec2, dir: -1 as const, z: 11.45, spots: 3, hours: [7, 10.5] as [number, number], every: [14, 30] as [number, number] }],
  /** The café's, the bars' terraces: along a stretch of pavement in front of them, how many tables, when they are out. */
  terraces: [
    { from: [15.5, 10.9] as Vec2, to: [10.9, 10.9] as Vec2, tables: 3, hours: [7.5, 20] as [number, number], customers: 4 },
    { from: [-9.9, 10.9] as Vec2, to: [-15.2, 10.9] as Vec2, tables: 3, hours: [11, 24] as [number, number], customers: 3 },
    // THE ANCHOR's front (x 31.2..35.6): a table either side of its door (the middle one gives way to the door).
    { from: [31.2, -10.9] as Vec2, to: [35.6, -10.9] as Vec2, tables: 3, hours: [10, 24] as [number, number], customers: 3 },
  ],
  /** Pigeons pecking about (they take off when the player comes close), and where the stray cat sits. */
  pigeons: [{ at: [6.5, -10.2] as Vec2, count: 7 }, { at: [-30, 10.2] as Vec2, count: 9 }, { at: [24, 10.6] as Vec2, count: 5 }],
  /** `on`: the perch is the bench (taken while someone sits there) or a bin (while the bin lorry is on its round): he sits elsewhere then. */
  strayCat: { perches: [{ at: [11, -7], y: 1.46, yaw: 0.6 }, { at: [-10.5, -11.55], y: 0.82, yaw: 0, on: 'bench' }, { at: [-38.5, -14], y: 0, yaw: -1.2 }, { at: [21.2, 8.55], y: 0.96, yaw: 2.4, on: 'bin' }] as StrayCatPerch[] },

  // --- Things to find, shops to go into -------------------------------------------------------
  /** Coins dropped on the pavement: where one may lie (a few a real day, seeded by the date, and one each market day), how many a real day. */
  coins: { spots: [[-14.2, -9.1], [-3.3, -11.2], [6.1, -8.9], [24.8, -9.4], [34.4, -11.5], [-22.4, 9.3], [-6.6, 9.1], [9.2, 11.2], [26.2, 9.2], [33.1, 11.3], [-21.9, -40.5], [-37.9, -22.6], [-30.5, -10.6], [1.2, -10.1], [15.8, -11.3], [-12.5, 10.6], [17.4, 9.4], [36.9, 9.8], [-21.0, -30.2], [-38.2, -41.0]] as Vec2[], perDay: 3 },
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
  /** The florist's chalk board out on the pavement: the season's cut flowers, three bunches for two at the counter (`errands/`). */
  chalkBoard: [SEASON_FLOWERS[seasonOf(new Date()).name].toUpperCase(), '3 for 2'] as [string, string],
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


/** The door on the walkable pavements of a shop one walks into (zone-local). */
function walkInDoor(zone: ShopZoneId): Vec2 {
  return walkInShops().find((s) => s.zone === zone)?.door.at ?? [0, 0];
}

/**
 * Finding one's way (`wayfinding/`): the fingerpost by our building's door (an arm per place, pointing at it, highest
 * first), the "you are here" plan on the wall between the bookshop and the residents' door (painted from `FACADES`,
 * clicked for the directions), and the pillar clock on the far pavement by RETRO GAMES (two faces, along the street).
 */
export const WAYFINDING = {
  signpost: {
    at: [-5, -8.95] as Vec2,
    arms: [
      { text: 'ARCADE', to: STREET_PLAN.doors.arcade.at, kind: 'arcade' },
      { text: 'RETRO GAMES · FLEA MARKET', to: STREET_PLAN.doors.market.at, kind: 'retro' },
      { text: 'SECOND HOME · furniture', to: walkInDoor('furnitureShop'), kind: 'furniture' },
      { text: 'THE FLORIST', to: walkInDoor('flowerShop'), kind: 'florist' },
      { text: 'PAWS & CLAWS · pets', to: walkInDoor('petShop'), kind: 'pets' },
      { text: 'TV REPAIR · Park Street', to: walkInDoor('tvShop'), kind: 'electronics' },
      { text: 'PARK', to: STREET_PLAN.parkGate.at },
      { text: 'BUS 38', to: STREET_PLAN.busRide.pole.at },
    ] as { text: string; to: Vec2; kind?: ShopKind }[],
  },
  planBoard: { at: [-8.25, -11.96] as Vec2, yaw: 0, y: 1.5, width: 0.82, height: 0.62 },
  clock: { at: [12.8, 8.95] as Vec2, yaw: Math.PI / 2, height: 3.2 },
};

/**
 * The Grand Flea Fair's day in the street (`events/FairDay`, on `marketEvents.isBrocante`): bunting slung across Front
 * Street by RETRO GAMES (x of each string, from building line to building line, `height` at its ends), a banner over
 * its fascia, an A-board pointing in, and a few people waiting by its door, clear of the queue and of the way out.
 */
export const FAIR_DAY = {
  bunting: { xs: [-2, 6, 14], height: 5.2, sag: 1.1 },
  banner: { at: [4, 4.27, 11.9] as [number, number, number], yaw: Math.PI, width: 6.2, height: 0.5 },
  board: { at: [1.25, 11.4] as Vec2, yaw: Math.PI - 0.25 },
  waiting: [
    { at: [0.2, 10.95] as Vec2, yaw: Math.PI * 0.55 },
    { at: [-0.55, 11.35] as Vec2, yaw: Math.PI * 0.7 },
    { at: [9.9, 11.25] as Vec2, yaw: -Math.PI * 0.6 },
  ],
};
