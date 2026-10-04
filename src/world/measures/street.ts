/*
 * THE STREET'S MEASURES: the coordinates and heights the plans and the classes both read of Front Street, Park Street
 * and our block (street-local metres, origin in the middle of Front Street's road: x along it, towards the park is -x;
 * z across it, our building on the -z side). Measures live here, never in a plan, so a prop or a view needs no plan to
 * know where the kerb is (docs/architecture.md "Layers": furniture reads `world/measures/`, the plans lay things out
 * with them). The street's own layout (its doors, props and routes) is `street/streetPlan.ts`; the facades are
 * `city/facades.ts`.
 */

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
/**
 * How far the streets run: Park Street south to `south`, Front Street east to `east` (a building across it),
 * the side street south to `side` (the building across its end).
 */
export const STREET_ENDS = { south: -96, east: 136, side: -60 } as const;
export const KERB_HEIGHT = 0.12;
/**
 * How far the park's lawn is laid beyond the hedge (x) and along it (|z|): past it the sky dome's far blocks stand. Out
 * past the whole pond (`city/park` POND, street x -88 to -168), where the park's far shrubbery closes it (`StreetPark`).
 */
export const LAWN_REACH = { x: -175, z: 100 } as const;

/** Where the roadworks close the walkable street: across Front Street at x `front`, across Park Street at z `park`. */
export const WORKS = { front: 38.4, park: -47 } as const;
/**
 * The works move on (`details/roadworks.syncWorks`): from market day `afterGameDay` the gas main past the first works is
 * done and Front Street's closure moves along to x `front`, short of the side street (`SIDE_STREET.line`), so the
 * stretch between (its shops' doors included) is walked. Park Street's works stay.
 */
export const WORKS_LIFT = { afterGameDay: 14, front: 110.4 } as const;
/** Park Street's parking lanes are this wide (Front Street's end at `STREET_PLAN.parkingLine`). */
export const PARK_PARKING = 2.1;

/** A rectangle of ground (zone-local). */
interface Area {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Front Street between its building lines, from the park's railings to the roadworks (its end moves on with them: `setFrontStreetEnd`). */
export const WALKABLE: Area = { minX: -39.5, maxX: WORKS.front - 0.4, minZ: FRONT.ourLine + 0.1, maxZ: FRONT.farLine - 0.1 };
/**
 * The park's gardens behind the gate (zone-local), walked in the park's hours (`STREET_PLAN.parkGate.hours`): from the
 * railings out to a low hoop fence short of the pond (x `minX`) and across the lawn north and south of the gate (z), the
 * playground inside, the pond, the bandstand and the far lawn seen over the fence (`StreetPark`). It lies clear of the
 * arcade's and the market's zones (world z -5..5), whose rooms sit west of the street along +x.
 */
export const PARK_WALK: Area = { minX: -85, maxX: PARK_STREET.hedge - 0.5, minZ: -90, maxZ: -8 };
/**
 * Everywhere the player can walk: Front Street, Park Street down to its roadworks, the corner bay, the park's gardens.
 * Nothing invisible stands on the edges: facades, the railings, the hoardings and barriers
 * (`StreetBounds`, `StreetDetails`), the park's fences, and in the road's gap at the works a roadworker (`Flagger`).
 * Front Street's end past the zone's box (x 40) is still the street's: no other zone stands there (`worldPlan`).
 */
export const WALKABLE_AREAS: readonly Area[] = [
  WALKABLE,
  { minX: WALKABLE.minX, maxX: PARK_STREET.line - 0.1, minZ: WORKS.park + 0.4, maxZ: WALKABLE.minZ },
  { minX: CORNER_BAY.x0, maxX: CORNER_BAY.x1 - 0.1, minZ: CORNER_BAY.z0 + 0.1, maxZ: WALKABLE.minZ },
  PARK_WALK,
];

/** Where Front Street's closure stands now (the works moved on or not): its walkable end follows (`details/roadworks.syncWorks`). */
export function setFrontStreetEnd(worksX: number): void {
  WALKABLE.maxX = worksX - 0.4;
}

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

/** Whether a point (zone-local) is on the walkable pavements or road. */
export function isWalkable([x, z]: Vec2): boolean {
  return WALKABLE_AREAS.some((a) => x >= a.minX && x <= a.maxX && z >= a.minZ && z <= a.maxZ);
}

/**
 * World yaw the sun's azimuth is expressed against: the collection room's front wall (+z, rotation π). One value for
 * the whole world so every window, painted or built, agrees on where the sun is.
 */
export const SUN_ROTATION_Y = Math.PI;
