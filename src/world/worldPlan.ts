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
import { SALEROOM_PLAN, SALEROOM_ROOM } from './saleroom/saleroomPlan';
import { STREET_EXTENT, STREET_PLAN } from './street/streetPlan';
import { STAIRWELL_PLAN, STAIRWELL_ROOM } from './stairwell/stairwellPlan';
import { SHOP_PLANS, type ShopZoneId } from './shop/shopPlan';
import { NEIGHBOUR_FLAT_PLAN, NEIGHBOUR_FLAT_ROOM } from './neighbourFlat/neighbourFlatPlan';
import { ANNEX_ORIGIN, ANNEX_ROOM, STUDY_ORIGIN, STUDY_ROOM } from './annex/annexPlan';
import { COURTYARD_PLAN, COURTYARD_ROOM, inYard } from './courtyard/courtyardPlan';
import { SELLER_FLAT_PLAN, SELLER_FLAT_ROOM } from './sellerFlat/sellerFlatPlan';
import { CELLAR_PLAN, CELLAR_ROOM, cellCentre } from './cellar/cellarPlan';
import { ATTIC_PLAN, ATTIC_ROOM } from './attic/atticPlan';
import { ROOF_PLAN, ROOF_ROOM } from './roof/roofPlan';

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
 *              collection room  x -3 .. 3, z -3 .. 3  [opening z 2.3]  Mrs Roux's room x 3.06 .. 7.96, z -0.66 .. 3
 *                                                          and her study behind it, z -3 .. -0.72 (`annex`, walled up till bought)
 *
 * Two zones sharing a doorway keep `WALL_GAP` between their wall planes (coplanar walls would
 * z-fight); the `Door`'s lining bridges it. Both shells cut the same opening; one hangs the leaf.
 *
 * Elsewhere: the street at x 140, walked into from the stairwell's entrance hall through the sas (the
 * front door opens on the landing and the stairs down; `world/airlock`); its doors lead by travel
 * (`travel`) into the arcade and into the retro games shop, the arcade at x 40 and
 * the flea market at x 80, each a windowless hall of its own (`src/world/arcade/`, `src/world/market/`),
 * and far past the street the four shops one walks into (x 600 to 645, `src/world/shop/`), whose exits lead back to the street
 * (clear of Front Street's far end, walked once its works move on: `street/details/roadworks`, world x 250).
 *
 * Outside: Front Street runs past the front wall (+z), Park Street past the left wall (-x); the
 * right side (+x) is the neighbours' and the landing, the back (-z) the block's courtyard (the panes'
 * `Courtyard`; in the street, `COURTYARD` behind the workshop on Park Street).
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
export type ZoneKind = 'collectionRoom' | 'hallway' | 'bathroom' | 'bedroom' | 'kitchen' | 'balcony' | 'stairwell' | 'arcade' | 'market' | 'street' | 'shop' | 'annex' | 'annexStudy' | 'neighbourFlat' | 'courtyard' | 'saleroom' | 'sellerFlat' | 'cellar' | 'attic' | 'roof';

/**
 * A zone the player is teleported to (and from) instead of walking: the arcade, the market and the walk-in shops
 * (their `StreetDoor` in, their `TravelDoor` out), the street (coming out of them), the hallway (the pause menu's
 * "Go home") and the entrance hall (the street's home door when the sas is not connected). `arrival` is the zone-local floor spot
 * the player is set down on, `yaw` the way they face there. The travel menu lists every such zone but the current one.
 */
interface TravelPlan {
  label: string;
  arrival: readonly [x: number, z: number];
  yaw: number;
  /** Other arrival spots by the zone the player comes from (the street: in front of the door they came out of). */
  arrivals?: Partial<Record<ZoneId, { at: readonly [x: number, z: number]; yaw: number }>>;
  /** Reached only through its own door (the cellars behind a locked door, a neighbour's flat): never offered by the travel menu. */
  unlisted?: boolean;
}

interface ZonePlan extends ZoneSpec<ZoneId> {
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
export const FLAT = ['living', 'hallway', 'bathroom', 'bedroom', 'kitchen', 'balcony', 'annex', 'annexStudy', 'stairwell'] as const satisfies readonly ZoneId[];
/** A room of the flat. */
type FlatId = (typeof FLAT)[number];
/** The rest of the flat, seen from `id`. */
const flatBut = (id: FlatId): FlatId[] => FLAT.filter((other) => other !== id);

/** Whether zone `id` is one of the flat's (the pause menu offers Go home everywhere else). */
export function inFlat(id: ZoneId): id is FlatId {
  return (FLAT as readonly ZoneId[]).includes(id);
}

/** A shop's zone: its room at `x` (far past the street), reached by travel only, like the arcade. */
function shopZone(id: ShopZoneId, x: number, label: string) {
  const plan = SHOP_PLANS[id];
  return {
    kind: 'shop',
    origin: [x, 0, 0],
    extent: plan.room,
    neighbours: [],
    travel: { label, arrival: plan.arrival.at, yaw: plan.arrival.yaw },
    look: 'shop',
  } as const satisfies ZoneEntry;
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
  // Mrs Roux's two rooms next door (src/world/annex/): the room on the street behind the collection room's right wall
  // and the study behind it, joined to the flat through the opening knocked in that wall once bought (`building/rouxMove`;
  // walled up till then). In the flat from the start, so their lights are compiled with it and a purchase recompiles
  // nothing; declared before the stairwell, whose box spans theirs, so walking in from the collection room finds them first.
  annex: {
    kind: 'annex',
    origin: ANNEX_ORIGIN,
    extent: ANNEX_ROOM,
    neighbours: flatBut('annex'),
    persistent: true,
  },
  annexStudy: {
    kind: 'annexStudy',
    origin: STUDY_ORIGIN,
    extent: STUDY_ROOM,
    neighbours: flatBut('annexStudy'),
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
    // Not "Home" (the hallway is): the travel menu lists both.
    travel: {
      label: 'The entrance hall',
      arrival: STAIRWELL_PLAN.arrival.at,
      yaw: STAIRWELL_PLAN.arrival.yaw,
      // Back in from the yard: at the foot of the stairs, in front of the courtyard's door.
      arrivals: { courtyard: STAIRWELL_PLAN.courtyardDoor.arrival },
    },
    look: 'stairwell',
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
    // Back from the saleroom: in front of its door at the back of the hall.
    travel: { label: 'Flea market', arrival: MARKET_PLAN.arrival.at, yaw: MARKET_PLAN.arrival.yaw, arrivals: { saleroom: MARKET_PLAN.saleroom.arrival } },
    look: 'market',
  },
  // Front Street, outside the building (src/world/street/): walked into through the sas from the entrance hall,
  // reached by travel from the exits of the arcade, the market and the shops; its doors lead back to them. Not persistent.
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
  // Front Street's shops inside (src/world/shop/): SECOND HOME, TV REPAIR, PAWS & CLAWS and the florist, each a
  // windowless room reached by travel from its door on the street, beyond the street along +x; their exits lead back.
  furnitureShop: shopZone('furnitureShop', 600, 'Second Home (furniture)'),
  tvShop: shopZone('tvShop', 615, 'TV Repair'),
  petShop: shopZone('petShop', 630, 'Paws & Claws (pet shop)'),
  flowerShop: shopZone('flowerShop', 645, 'The florist'),
  // The neighbours' flats (src/world/neighbourFlat/): one shell dressed for whoever asked the player in, reached by
  // travel from their door on the stairs (and back onto that landing: `travel/nextArrival`), never from the menu.
  neighbourFlat: {
    kind: 'neighbourFlat',
    origin: [320, 0, 0],
    extent: NEIGHBOUR_FLAT_ROOM,
    neighbours: [],
    travel: { label: 'A neighbour’s flat', arrival: NEIGHBOUR_FLAT_PLAN.arrival.at, yaw: NEIGHBOUR_FLAT_PLAN.arrival.yaw, unlisted: true },
  },
  // Our block's courtyard behind the building (src/world/courtyard/), walked: through the door at the foot of the
  // stairs (a travel door), out of our back wall; the same yard the stairwell's windows look down on. Far along +x
  // (its frame is the yard's middle), not persistent: nothing of it is built while the player is in the flat.
  courtyard: {
    kind: 'courtyard',
    origin: [400, 0, 0],
    extent: COURTYARD_ROOM,
    neighbours: [],
    travel: { label: 'The courtyard', arrival: inYard(COURTYARD_PLAN.arrival.at), yaw: COURTYARD_PLAN.arrival.yaw, unlisted: true },
    look: 'street',
  },
  // The saleroom behind the flea market (src/world/saleroom/): a windowless room reached by its door in the market's
  // back wall, and back; never from the menu.
  saleroom: {
    kind: 'saleroom',
    origin: [440, 0, 0],
    extent: SALEROOM_ROOM,
    neighbours: [],
    travel: { label: 'The saleroom', arrival: SALEROOM_PLAN.arrival.at, yaw: SALEROOM_PLAN.arrival.yaw, unlisted: true },
    look: 'market',
  },
  // A small ad's seller at home, in Park Corner Mansions (src/world/sellerFlat/): one living room dressed for whoever
  // the player rang, reached by the bell at the block's street door (`street/MansionBell`) and left by its landing
  // door back onto Front Street; never from the menu.
  sellerFlat: {
    kind: 'sellerFlat',
    origin: [520, 0, 0],
    extent: SELLER_FLAT_ROOM,
    neighbours: [],
    travel: { label: 'A seller’s flat', arrival: SELLER_FLAT_PLAN.arrival.at, yaw: SELLER_FLAT_PLAN.arrival.yaw, unlisted: true },
  },
  // The building's cellars (src/world/cellar/): a vaulted maze under the entrance hall, through its cellar door once
  // the concierge has given the key, and back up its stairs; reached by travel only, never from the menu.
  cellar: {
    kind: 'cellar',
    origin: [360, 0, 60],
    extent: CELLAR_ROOM,
    neighbours: [],
    travel: { label: 'The cellars', arrival: cellCentre(...CELLAR_PLAN.arrival.cell), yaw: CELLAR_PLAN.arrival.yaw, unlisted: true },
    look: 'stairwell',
  },
  // The attic under our mansard (src/world/attic/), where it is: over the flat, a storey above our landing, its lift
  // right over the stairwell's. Only the old lift's code brings the player up (a travel behind a fade, arriving in its
  // car; `stairwell/Lift`), and its car takes them back down to our landing; never from the menu, not persistent.
  attic: {
    kind: 'attic',
    origin: ATTIC_PLAN.origin,
    extent: ATTIC_ROOM,
    neighbours: [],
    travel: { label: 'The attic', arrival: [(ATTIC_PLAN.car.x0 + ATTIC_PLAN.car.x1) / 2, (ATTIC_PLAN.car.z0 + ATTIC_PLAN.car.z1) / 2 + ATTIC_PLAN.arrival.towardGate], yaw: ATTIC_PLAN.arrival.yaw, unlisted: true },
    look: 'stairwell',
  },
  // The zinc top of the mansard (src/world/roof/), over the attic, through its hatch; the street's frame is laid
  // under it (Front Street's ground, facades and roofs), so the city seen from up there is the one walked down there.
  roof: {
    kind: 'roof',
    origin: ROOF_PLAN.origin,
    extent: ROOF_ROOM,
    neighbours: [],
    travel: { label: 'The roof', arrival: ROOF_PLAN.arrival.at, yaw: ROOF_PLAN.arrival.yaw, unlisted: true },
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
