import type { LookName } from '@/graphics/grade';
import type { ZoneSpec } from './zone/Zone';
import type { ZoneId } from './zoneIds';
import type { NearWall } from './props/outdoors/Outdoors';
import { EYE_HEIGHT as STREET_TO_EYE } from './props/outdoors/Sheet';
import { DEFAULT_ROOM, ROOM_PLAN } from './roomPlan';
import { HALLWAY_PLAN, HALLWAY_ROOM } from './hallway/hallwayPlan';
import { BATHROOM_ROOM } from './bathroom/bathroomPlan';
import { BEDROOM_ROOM } from './bedroom/bedroomPlan';
import { KITCHEN_ROOM } from './kitchen/kitchenPlan';
import { BALCONY_ROOM } from './balcony/balconyPlan';
import { ARCADE_PLAN, ARCADE_ROOM } from './arcade/arcadePlan';
import { MARKET_PLAN, MARKET_ROOM } from './market/marketPlan';
import { STREET_EXTENT, STREET_PLAN } from './street/streetPlan';
import { STAIRWELL_PLAN, STAIRWELL_ROOM } from './stairwell/stairwellPlan';

/*
 * THE WORLD PLAN: the zones (rooms, corridors, the street one day) and how they connect. Each zone
 * has a `kind`, built by `ZONE_BUILDERS[kind]` in `layout.ts` from its own plan (`ROOM_PLAN` for
 * the collection room, `src/world/<kind>/<kind>Plan.ts` for the others). Zone-local coordinates
 * inside a zone; `origin` places the zone in the world. The player only ever has the current zone
 * and its `neighbours` loaded (see `zone/ZoneManager.ts`).
 *
 * The flat, in world metres (x right, z towards the collection room's spawn):
 *
 *            kitchen            bathroom | bedroom
 *   x -6.26 ........ -3.06   -3.0 .. -1.2 | -1.1 ........ 2.3
 *   z -5.7 .. -3.1            z -6.82 .. -4.42 | z -8.02 .. -4.42
 *          [door]                  [door]    [door]
 *   ------ hallway  x -3.0 .. 1.0, z -4.36 .. -3.06 ------ [entrance]
 *                      [door at x -1.5]
 *              collection room  x -3 .. 3, z -3 .. 3
 *
 * Two zones sharing a doorway keep `WALL_GAP` between their wall planes (coplanar walls would
 * z-fight); the `Door`'s lining bridges it. Both shells cut the same opening; one hangs the leaf.
 *
 * Elsewhere, reached by teleport (`travel`): the street at x 140 (the front door leads down to
 * it; its doors lead home, into the arcade and into the retro games shop), the arcade at x 40 and
 * the flea market at x 80, each a windowless hall of its own (`src/world/arcade/`, `src/world/market/`),
 * whose exits lead back to the street.
 *
 * Outside: Front Street runs past the front wall (+z), Park Street past the left wall (-x); the
 * right side (+x) is the neighbours' and the landing, the back (-z) a courtyard nothing paints.
 * The kitchen juts past the collection room's left wall, so its wall shows in the left windows
 * (`KITCHEN_WING`, rendered by the pane shader; see `docs/outdoors.md`).
 */

/** Gap between the wall planes of two adjacent zones (metres). */
export const WALL_GAP = 0.06;

/** Where the kitchen zone stands (world metres); also what `KITCHEN_WING` is built from. */
const KITCHEN_ORIGIN: [number, number, number] = [-4.66, 0, -4.4];

/** Masonry of the building's outside walls: the shells are planes, this is what the massing seen outside adds around them. */
const OUTER_WALL = 0.3;
/** Roof slab and parapet above the top floor's ceiling (the flat is on the top floor). */
const ROOF = 0.6;
/** The street is this far below the flat's floor (`EYE_HEIGHT` above the street in the panorama, eye 1.7 m over the floor). */
const STREET_DROP = STREET_TO_EYE - 1.7;
/** Storeys of the building below the flat's floor. */
const STOREYS_BELOW = 5;

/** World z of the back edge of the collection room's rearmost left-wall window: the wing's wall is flush with that jamb. */
const LEFT_WINDOW_BACK_EDGE = Math.min(...ROOM_PLAN.windows.list.filter((w) => w.wall === 'left').map((w) => w.along)) - ROOM_PLAN.windows.size.width / 2;

/**
 * The wall of the kitchen wing that faces +z, seen from the collection room's left windows: the
 * kitchen sticks out past the room's left wall by its whole width, so looking left along Park
 * Street one sees its blind end wall from the street up to the roof, right beside the window.
 * That wall is a thick pier whose outer face is flush with the window's back jamb (a hair behind
 * the glass edge) and runs from the glass plane out to the kitchen's far side: so no sliver of
 * street shows between the frame and the wall, whatever the angle. Only rays heading forward
 * (+z) or skimming along the wall past its end still reach the park, as they would.
 */
export const KITCHEN_WING: NearWall = {
  z: LEFT_WINDOW_BACK_EDGE - 0.01,
  x: [KITCHEN_ORIGIN[0] - KITCHEN_ROOM.width / 2 - OUTER_WALL, -DEFAULT_ROOM.width / 2],
  y: [-STREET_DROP, KITCHEN_ROOM.height + ROOF],
  storey: STREET_DROP / STOREYS_BELOW,
};

/** What a zone is; one builder per kind in `layout.ts`. */
export type ZoneKind = 'collectionRoom' | 'hallway' | 'bathroom' | 'bedroom' | 'kitchen' | 'balcony' | 'stairwell' | 'arcade' | 'market' | 'street';

/**
 * A zone the player is teleported to (and from) through a `TravelDoor`, instead of walking: the
 * hallway (the flat's front door), the arcade, the market. `arrival` is the zone-local floor spot
 * the player is set down on, `yaw` the way they face there. The travel menu lists every such zone but the current one.
 */
export interface TravelPlan {
  label: string;
  arrival: readonly [x: number, z: number];
  yaw: number;
  /** Other arrival spots by the zone the player comes from (the street: in front of the door they came out of). */
  arrivals?: Partial<Record<ZoneId, { at: readonly [x: number, z: number]; yaw: number }>>;
}

export interface ZonePlan extends ZoneSpec<ZoneId> {
  kind: ZoneKind;
  travel?: TravelPlan;
  /** Colour grade and haze while the player is here (`graphics/grade.ts`); default `home`. */
  look?: LookName;
}

/** A zone's entry in `ZONES` (its id is the key). */
type ZoneEntry = Omit<ZonePlan, 'id'>;

/**
 * World yaw the sun's azimuth is expressed against: the collection room's front wall (+z, rotation π).
 * One value for the whole world so every window agrees on where the sun is.
 */
export const SUN_ROTATION_Y = Math.PI;

/**
 * Neighbours are what stays active around a zone. In the flat every room is every other room's
 * neighbour (`FLAT`), so the flat's active set, and with it the scene's light count, never changes
 * at a doorway: a zone coming or going adds or removes lights, and a different light count
 * recompiles every shader program in the scene (seconds of freeze with the graphics materials).
 * The `PortalCuller` still draws only what is seen through open doors, and a room's shadow maps
 * only follow while it is occupied, so an active room out of sight costs little.
 * Every room of the flat is `persistent`: small enough to keep, and rebuilding one on the way back
 * (geometry, painted textures) is a hitch in a doorway. Leave it off for something big, like the street.
 */
export const FLAT = ['living', 'hallway', 'bathroom', 'bedroom', 'kitchen', 'balcony', 'stairwell'] as const satisfies readonly ZoneId[];
/** A room of the flat. */
export type FlatId = (typeof FLAT)[number];
/** The rest of the flat, seen from `id`. */
const flatBut = (id: FlatId): FlatId[] => FLAT.filter((other) => other !== id);

/** Whether zone `id` is one of the flat's (the pause menu offers Go home everywhere else). */
export function inFlat(id: ZoneId): id is FlatId {
  return (FLAT as readonly ZoneId[]).includes(id);
}

/**
 * Every zone by id, in the order they are declared to the `World` (which gives each its shadow
 * layer). `satisfies` checks it against `ZoneId` both ways (an id without an entry, or an entry
 * without an id, fails to compile) and keeps each entry's `kind` literal for `ZoneKindOf`.
 */
const ZONES = {
  living: {
    kind: 'collectionRoom',
    origin: [0, 0, 0],
    extent: DEFAULT_ROOM,
    neighbours: flatBut('living'),
    persistent: true,
  },
  hallway: {
    kind: 'hallway',
    origin: [-1, 0, -3 - WALL_GAP - HALLWAY_ROOM.depth / 2],
    extent: HALLWAY_ROOM,
    neighbours: flatBut('hallway'),
    persistent: true,
    travel: { label: 'Home', arrival: HALLWAY_PLAN.arrival.at, yaw: HALLWAY_PLAN.arrival.yaw },
  },
  bathroom: {
    kind: 'bathroom',
    origin: [-2.1, 0, -5.62],
    extent: BATHROOM_ROOM,
    neighbours: flatBut('bathroom'),
    persistent: true,
  },
  bedroom: {
    kind: 'bedroom',
    origin: [0.6, 0, -6.22],
    extent: BEDROOM_ROOM,
    neighbours: flatBut('bedroom'),
    persistent: true,
  },
  kitchen: {
    kind: 'kitchen',
    origin: KITCHEN_ORIGIN,
    extent: KITCHEN_ROOM,
    neighbours: flatBut('kitchen'),
    persistent: true,
  },
  // The open-air balcony on the collection room's front wall (Front Street), through the glazed door at x 2.
  balcony: {
    kind: 'balcony',
    origin: [2, 0, 3 + WALL_GAP + BALCONY_ROOM.depth / 2],
    extent: BALCONY_ROOM,
    neighbours: flatBut('balcony'),
    persistent: true,
  },
  // The building's stairwell behind the flat's front door (src/world/stairwell/): our landing,
  // five storeys of stairs and the lift down to the entrance hall on the street (world y -16.3,
  // x 1..8.2, z -8.4..3.3: east of the bedroom, behind the collection room's right wall, under
  // the neighbours). Part of the flat (always active with it: its lights are compiled with the
  // flat's); its box overlaps the living room's and the bedroom's corners, which is harmless:
  // the current zone stays current while the player is inside it. Its street door travels out.
  stairwell: {
    kind: 'stairwell',
    origin: STAIRWELL_PLAN.origin,
    extent: STAIRWELL_ROOM,
    neighbours: flatBut('stairwell'),
    persistent: true,
    travel: { label: 'Home (the entrance hall)', arrival: STAIRWELL_PLAN.arrival.at, yaw: STAIRWELL_PLAN.arrival.yaw },
  },
  // Out of the flat, reached by teleport only (see `travel`): far enough along +x never to touch
  // the flat, no neighbours (nothing is seen through a door), not persistent (rebuilt on return).
  arcade: {
    kind: 'arcade',
    origin: [40, 0, 0],
    extent: ARCADE_ROOM,
    neighbours: [],
    travel: { label: 'Arcade', arrival: ARCADE_PLAN.arrival.at, yaw: ARCADE_PLAN.arrival.yaw },
    look: 'arcade',
  },
  market: {
    kind: 'market',
    origin: [80, 0, 0],
    extent: MARKET_ROOM,
    neighbours: [],
    travel: { label: 'Flea market', arrival: MARKET_PLAN.arrival.at, yaw: MARKET_PLAN.arrival.yaw },
    look: 'market',
  },
  // Front Street, outside the building (src/world/street/): reached by the flat's front door and
  // the arcade's and market's exits, all by travel; its doors lead back to them. Not persistent.
  street: {
    kind: 'street',
    origin: [140, 0, 0],
    extent: STREET_EXTENT,
    neighbours: [],
    travel: {
      label: 'Street',
      arrival: STREET_PLAN.arrivals.hallway.at,
      yaw: STREET_PLAN.arrivals.hallway.yaw,
      arrivals: STREET_PLAN.arrivals,
    },
    look: 'street',
  },
} satisfies { [Id in ZoneId]: ZoneEntry };

/** What zone `id` is, as its entry says (`ZONE_BUILDERS[kind]` builds it; `ZoneHandleById` is what that returns). */
export type ZoneKindOf<Id extends ZoneId> = (typeof ZONES)[Id]['kind'];

/** The world: every zone (`ZONES` with its id), and where the player starts. */
export const WORLD_PLAN: { readonly start: ZoneId; readonly zones: readonly ZonePlan[] } = {
  start: 'living',
  zones: (Object.keys(ZONES) as ZoneId[]).map((id): ZonePlan => ({ id, ...ZONES[id] })),
};

/** Zone `id`'s entry of the plan. */
export function zonePlan(id: ZoneId): ZonePlan {
  return WORLD_PLAN.zones.find((plan) => plan.id === id)!;
}

/** Whether `id` (a saved position's, say) names a zone of the plan. */
export function isZoneId(id: string): id is ZoneId {
  return WORLD_PLAN.zones.some((plan) => plan.id === id);
}
