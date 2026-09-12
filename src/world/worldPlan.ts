import type { ZoneSpec } from './zone/Zone';
import type { NearWall } from './props/outdoors/Outdoors';
import { EYE_HEIGHT as STREET_TO_EYE } from './props/outdoors/Sheet';
import { DEFAULT_ROOM, ROOM_PLAN } from './roomPlan';
import { HALLWAY_ROOM } from './hallway/hallwayPlan';
import { BATHROOM_ROOM } from './bathroom/bathroomPlan';
import { BEDROOM_ROOM } from './bedroom/bedroomPlan';
import { KITCHEN_ROOM } from './kitchen/kitchenPlan';

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
export type ZoneKind = 'collectionRoom' | 'hallway' | 'bathroom' | 'bedroom' | 'kitchen';

export interface ZonePlan extends ZoneSpec {
  kind: ZoneKind;
}

/**
 * World yaw the sun's azimuth is expressed against: the collection room's front wall (+z, rotation π).
 * One value for the whole world so every window agrees on where the sun is.
 */
export const SUN_ROTATION_Y = Math.PI;

/**
 * Neighbours are what is seen through a zone's doorways: from the collection room, the hallway
 * and (through the corridor) the two rooms whose doors face its own; from any room, the hallway
 * and the collection room. Sibling rooms are not each other's neighbours (their doors are coplanar).
 * Every room of the flat is `persistent`: small enough to keep, and rebuilding one on the way back
 * (geometry, painted textures) is a hitch in a doorway. Leave it off for something big, like the street.
 */
export const WORLD_PLAN = {
  start: 'living',
  zones: [
    {
      id: 'living',
      kind: 'collectionRoom',
      origin: [0, 0, 0],
      extent: DEFAULT_ROOM,
      neighbours: ['hallway', 'bathroom', 'bedroom'],
      persistent: true,
    },
    {
      id: 'hallway',
      kind: 'hallway',
      origin: [-1, 0, -3 - WALL_GAP - HALLWAY_ROOM.depth / 2],
      extent: HALLWAY_ROOM,
      neighbours: ['living', 'bathroom', 'bedroom', 'kitchen'],
      persistent: true,
    },
    {
      id: 'bathroom',
      kind: 'bathroom',
      origin: [-2.1, 0, -5.62],
      extent: BATHROOM_ROOM,
      neighbours: ['hallway', 'living'],
      persistent: true,
    },
    {
      id: 'bedroom',
      kind: 'bedroom',
      origin: [0.6, 0, -6.22],
      extent: BEDROOM_ROOM,
      neighbours: ['hallway', 'living'],
      persistent: true,
    },
    {
      id: 'kitchen',
      kind: 'kitchen',
      origin: KITCHEN_ORIGIN,
      extent: KITCHEN_ROOM,
      neighbours: ['hallway', 'living'],
      persistent: true,
    },
  ] as ZonePlan[],
};
