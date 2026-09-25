/*
 * FRONT STREET, walkable: the stretch outside the flat's building, between the Park Street corner
 * and the next cross street. Zone-local metres, origin in the middle of the road; x runs along the
 * street (towards the park is -x), z across it (our building is on the -z side, facing +z). The
 * zone is not rotated, so +z is the way the flat's front windows look and the sun agrees with the
 * painted view (`SUN_ROTATION_Y`). Consistent with `props/outdoors/plan.ts`: a 24 m street
 * between building lines (4 m pavements, a four-lane road with a parking lane each side), the
 * retro games shop across the street, a little right of our door, the park beyond Park Street.
 *
 *                 z = 50 (a building across Park Street's end)           z = 46 (across the cross street)
 *   park  | hedge |   Park Street   |                                         | cross street |
 *   trees |  -40  | -36 road -20    | -16 ── far row (F1 F2=RÉTRO JEUX F3 F4) ── 36 | 40  road  48 | 52 far row
 *         |       |                 |  z 12 building line, z 8 kerb            |              |
 *         |       |      (junction) |  ─────── road z -8 .. 8, zebra at x 3 ──  |  (junction)  |
 *         |       |                 |  z -8 kerb, z -12 building line          |              |
 *         |       |                 | -16 ─ near row (OURS  ARCADE  N3  N4) ── 36 |              |
 *                 z = -50                                                          z = -46
 *
 * Walkable: x -39.5 .. 38 (the hedge; an invisible line where the cross street turns out of
 * sight), z between the two building lines. Everything beyond is scenery.
 */

export type Vec2 = [x: number, z: number];

/** The zone's box: the player is "in the street" inside it. */
export const STREET_EXTENT = { width: 80, depth: 26, height: 40 };

/** Front Street's cross-section (z): building lines and kerbs. The road is `KERB_HEIGHT` below the pavements. */
export const FRONT = { ourLine: -12, nearKerb: -8, farKerb: 8, farLine: 12 } as const;
/** Park Street (x): our building's side, its kerbs, the park's hedge. */
export const PARK_STREET = { line: -16, nearKerb: -20, farKerb: -36, hedge: -40 } as const;
/** The cross street at the far end (x): the corner buildings' line, its kerbs, the row across it. */
export const CROSS_STREET = { line: 36, nearKerb: 40, farKerb: 48, farLine: 52 } as const;
/** |z| of the buildings closing the view down Park Street and the cross street. */
export const STREET_ENDS = { park: 50, cross: 46 } as const;
export const KERB_HEIGHT = 0.12;

/** Where the player can walk (zone-local): invisible walls stand on these lines. */
export const WALKABLE = { minX: -39.5, maxX: 38, minZ: FRONT.ourLine + 0.1, maxZ: FRONT.farLine - 0.1 } as const;

/** Ground floor and floor-to-floor heights, as in the painted view (`Facades.GROUND`). */
export const GROUND_FLOOR = 4.2;
export const STOREY = 3.1;

/** What stands at street level of a facade. */
export type ShopKind = 'cafe' | 'bakery' | 'pharmacy' | 'books' | 'grocer' | 'florist' | 'tabac' | 'bar' | 'butcher' | 'laundry' | 'retro' | 'arcade' | 'shut';

export interface ShopSpec {
  kind: ShopKind;
  /** Along the facade from its left end (as seen from the street), metres. */
  from: number;
  to: number;
  /** Where its door is (along the facade); somewhere along it when absent. */
  door?: number;
}

/**
 * One building's face on the street: `from` is its left end as seen from in front of it, `to`
 * its right end (so the face looks towards the left-hand normal of from -> to). Storeys over the
 * ground floor, the street-level shops, and a residential door (`door`, along) if any.
 * `detail`: pixels per metre in the facade atlas (near facades are painted finer).
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
}

const NEAR = 34;
const FAR = 14;

/** Every building face in view. The near and far rows first, then the side streets and the street ends. */
export const FACADES: readonly FacadeSpec[] = [
  // Our side (faces +z; left end is -x).
  { id: 'ours', from: [-16, -12], to: [2, -12], storeys: 6, seed: 11, shops: [{ kind: 'books', from: 0.6, to: 7 }, { kind: 'grocer', from: 12.4, to: 17.6 }], door: 10, detail: NEAR },
  { id: 'arcade', from: [2, -12], to: [14, -12], storeys: 5, seed: 23, shops: [{ kind: 'arcade', from: 0.4, to: 11.6, door: 6 }], detail: NEAR },
  { id: 'n3', from: [14, -12], to: [26, -12], storeys: 4, seed: 37, shops: [{ kind: 'laundry', from: 0.4, to: 5.8 }, { kind: 'florist', from: 6.2, to: 11.6 }], detail: NEAR },
  { id: 'n4', from: [26, -12], to: [36, -12], storeys: 6, seed: 41, shops: [{ kind: 'tabac', from: 0.4, to: 4.8 }, { kind: 'bar', from: 5.2, to: 9.6 }], detail: NEAR },
  // Across the street (faces -z; left end is +x).
  { id: 'f4', from: [36, 12], to: [22, 12], storeys: 5, seed: 53, shops: [{ kind: 'pharmacy', from: 0.4, to: 6.6 }, { kind: 'shut', from: 7.4, to: 13.6 }], detail: NEAR },
  { id: 'f3', from: [22, 12], to: [10, 12], storeys: 6, seed: 67, shops: [{ kind: 'bakery', from: 0.4, to: 5.8 }, { kind: 'cafe', from: 6.2, to: 11.6 }], detail: NEAR },
  { id: 'retro', from: [10, 12], to: [-2, 12], storeys: 5, seed: 71, shops: [{ kind: 'retro', from: 1.2, to: 10.8, door: 7 }], detail: NEAR },
  { id: 'f1', from: [-2, 12], to: [-16, 12], storeys: 4, seed: 83, shops: [{ kind: 'butcher', from: 0.4, to: 6.6 }, { kind: 'bar', from: 7.4, to: 13.6 }], detail: NEAR },
  // Park Street: our building's side and the corner block across Front Street (face -x).
  { id: 'oursSide', from: [-16, -50], to: [-16, -12], storeys: 6, seed: 12, shops: [], detail: FAR },
  { id: 'f1Side', from: [-16, 12], to: [-16, 50], storeys: 4, seed: 84, shops: [{ kind: 'cafe', from: 32, to: 37.6 }], detail: FAR },
  // The cross street: the corner blocks' sides (face +x) and the row across it (face -x).
  { id: 'n4Side', from: [36, -12], to: [36, -46], storeys: 6, seed: 42, shops: [], detail: FAR },
  { id: 'f4Side', from: [36, 46], to: [36, 12], storeys: 5, seed: 54, shops: [{ kind: 'grocer', from: 28, to: 33.6 }], detail: FAR },
  { id: 'crossA', from: [52, -46], to: [52, -14], storeys: 5, seed: 91, shops: [{ kind: 'bakery', from: 20, to: 25 }], detail: FAR },
  { id: 'crossB', from: [52, -14], to: [52, 14], storeys: 6, seed: 97, shops: [{ kind: 'bar', from: 6, to: 11 }, { kind: 'books', from: 16, to: 22 }], detail: FAR },
  { id: 'crossC', from: [52, 14], to: [52, 46], storeys: 4, seed: 103, shops: [], detail: FAR },
  // The street ends: a building across Park Street each way, one across the cross street each way.
  { id: 'parkNorth', from: [-16, 50], to: [-46, 50], storeys: 5, seed: 111, shops: [], detail: FAR },
  { id: 'parkSouth', from: [-46, -50], to: [-16, -50], storeys: 6, seed: 113, shops: [], detail: FAR },
  { id: 'crossNorth', from: [52, 46], to: [36, 46], storeys: 5, seed: 117, shops: [], detail: FAR },
  { id: 'crossSouth', from: [36, -46], to: [52, -46], storeys: 4, seed: 119, shops: [], detail: FAR },
];

/** A door the player can click, on a facade: where, which way it faces (yaw, 0 = its front looks +z) and where it leads. */
export interface DoorSpec {
  at: Vec2;
  yaw: number;
  width: number;
  height: number;
  to: string;
  label: string;
}

/** An arrival spot: where the player is set down (zone-local floor point) and the way they face (0 looks down -z). */
export interface ArrivalSpec {
  at: Vec2;
  yaw: number;
}

export const STREET_PLAN = {
  /** The doors: our building's (home), the arcade's, the retro games shop's (the flea market's way in). */
  doors: {
    home: { at: [-6, -12], yaw: 0, width: 1.3, height: 2.6, to: 'hallway', label: 'Click to go home' } as DoorSpec,
    arcade: { at: [8, -12], yaw: 0, width: 1.6, height: 2.5, to: 'arcade', label: 'Click to go into the arcade' } as DoorSpec,
    market: { at: [3, 12], yaw: Math.PI, width: 1.4, height: 2.5, to: 'market', label: 'Click to go into RÉTRO JEUX (the flea market is in the back)' } as DoorSpec,
  },
  /** Arrival spots by the zone the player comes from (`TravelPlan.arrivals`): on the pavement in front of the matching door, facing the street. */
  arrivals: {
    hallway: { at: [-6, -10.7], yaw: Math.PI } as ArrivalSpec,
    arcade: { at: [8, -10.7], yaw: Math.PI } as ArrivalSpec,
    market: { at: [3, 10.7], yaw: 0 } as ArrivalSpec,
  },
  /** Neon over the arcade and the retro games shop: centre (zone-local, y up), facing yaw, size. */
  signs: [
    { text: 'ARCADE', color: 0xff2fa0, at: [8, 3.55, -11.93] as [number, number, number], yaw: 0, width: 3.6, seed: 5 },
    { text: 'RÉTRO JEUX', color: 0x5fe6ff, at: [4, 3.55, 11.93] as [number, number, number], yaw: Math.PI, width: 4.2, seed: 9 },
  ],
  /** Street lamps on the kerbs: position and the way the arm reaches (yaw of the arm, 0 = +z). */
  lamps: [
    { at: [-12, -8.7], yaw: 0 }, { at: [3, -8.7], yaw: 0 }, { at: [18, -8.7], yaw: 0 }, { at: [33, -8.7], yaw: 0 },
    { at: [-5, 8.7], yaw: Math.PI }, { at: [10, 8.7], yaw: Math.PI }, { at: [25, 8.7], yaw: Math.PI },
    { at: [-20.7, -26], yaw: -Math.PI / 2 }, { at: [-20.7, 24], yaw: -Math.PI / 2 }, { at: [39.3, -26], yaw: Math.PI / 2 },
  ] as { at: Vec2; yaw: number }[],
  /** Lamp head height, and how many real lights follow the lamps nearest the player (the rest glow only). */
  lampHeight: 6.2,
  lampLights: 4,
  /** Street trees on the pavements. */
  trees: [[-1, -9.3], [12, -9.3], [26, -9.3], [-12, 9.3], [17, 9.3], [32, 9.3], [-18, -20], [-18, 30], [38, -30], [38, 22]] as Vec2[],
  /** The park beyond the hedge: trees scattered over this rectangle (seeded), and how many. */
  park: { from: [-86, -60] as Vec2, to: [-44, 60] as Vec2, trees: 26, seed: 7 },
  /** Parked cars: centre and heading (yaw 0 = nose towards +x, -π/2 = towards +z). */
  parked: [
    // Westbound on our side (nose to -x), eastbound across (nose to +x): right-hand traffic.
    { at: [-13, -7], yaw: Math.PI }, { at: [-8.2, -7], yaw: Math.PI }, { at: [11, -7], yaw: Math.PI }, { at: [15.8, -7], yaw: Math.PI }, { at: [21, -7], yaw: Math.PI }, { at: [30.5, -7], yaw: Math.PI },
    { at: [-13.5, 7], yaw: 0 }, { at: [-8.5, 7], yaw: 0 }, { at: [13, 7], yaw: 0 }, { at: [17.8, 7], yaw: 0 },
    { at: [-34.6, -30], yaw: -Math.PI / 2 }, { at: [-34.6, 26], yaw: -Math.PI / 2 },
  ] as { at: Vec2; yaw: number }[],
  /** Road markings: the zebra (x range), the lane dashes and the parking lines (|z|). */
  zebra: { from: 1, to: 5 },
  laneDash: 3,
  parkingLine: 6,
  /** The bus shelter on the far pavement (centre, faces the road), the benches and bins. */
  shelter: { at: [28, 10] as Vec2, yaw: Math.PI, length: 4 },
  benches: [{ at: [-10.5, -11.4], yaw: 0 }, { at: [-8, 11.4], yaw: Math.PI }] as { at: Vec2; yaw: number }[],
  bins: [[4.6, -8.55], [19.4, -8.55], [8.6, 8.55], [21.2, 8.55]] as Vec2[],
  /** The park's hedge and railings along x = hedge, from z to z. */
  hedge: { x: -40.4, from: -60, to: 60, height: 1.5, depth: 0.9 },
  railings: { x: -39.75, from: -60, to: 60, height: 1.15 },
  /** The newsstand (kiosk): centre, the way its hatch faces. */
  kiosk: { at: [15.5, -11.05] as Vec2, yaw: 0 },
  /** The busker by the bus shelter: where they stand and face; the chiptune's reach. */
  busker: { at: [22.6, 10.8] as Vec2, yaw: Math.PI, hours: [9, 21.5] as [number, number], tipsPerDay: 3, reach: 22 },
  /** The garage sale's folding table (some days): centre, facing the pavement. */
  garageSale: { at: [29.5, -11.2] as Vec2, yaw: 0, oneDayIn: 3 },
  /** Passers-by: how many walk at once, and their routes (they appear at the first point, vanish at the last). */
  crowd: {
    count: 2,
    seeds: [301, 317, 331, 347],
    /** A passer-by further than this from the player is not drawn (people are the costly meshes). */
    drawDistance: 38,
    routes: [
      [[-18, -52], [-18, -10.2], [37.6, -10.2], [37.6, -48]],
      [[37.8, 48], [37.8, 10.2], [-18, 10.2], [-18, 52]],
      [[-18, 52], [-18, 10.4], [37.8, 10.4], [37.8, 48]],
      [[37.6, -48], [37.6, -10.4], [-18, -10.4], [-18, -52]],
    ] as Vec2[][],
  },
  /** Traffic: the two routes (right-hand traffic), cruising speed, and how long between cars. */
  traffic: {
    routes: [
      // Up Park Street, left into Front Street, left again up the cross street.
      [[-31, -70], [-31, -10], [-28.5, -1.5], [-22, 1.6], [0, 1.6], [37, 1.6], [41.5, 6.5], [42.2, 14], [42.2, 70]],
      // Down the cross street, right into Front Street towards the park, left down Park Street.
      [[45.8, 70], [45.8, 12], [44.2, 2.5], [38, -1.6], [0, -1.6], [-21, -1.6], [-24.6, -6], [-25, -14], [-25, -70]],
    ] as Vec2[][],
    speed: 8.5,
    gap: [7, 22] as [number, number],
    cars: 3,
    /** A car stops for anyone standing this close ahead of it. */
    stopFor: 4,
  },
} as const;
