import type { Doorway, RoomOptions, Wall } from './Room';
import type { Placement } from './Placement';
import type { DecorEntry } from './props/decor';
import type { CushionOptions } from './props/Cushion';
import type { SortMode } from './shelving/sort';

/*
 * THE ROOM PLAN: every position in the collection room, as data, in zone-local coordinates (the room
 * is centred on its zone's origin). `layout.ts` reads it and builds the zone; nothing here imports three.js at runtime. Axes: x right, y up, z towards the player's
 * spawn. Walls as seen from the spawn: back = -z (shelves, door), front = +z, left = -x (TV),
 * right = +x (projector picture). Metres, real-world scale.
 *
 * To move or add decoration edit `decor`; to add a kind of decoration see `props/decor.ts`.
 */

/** The flat's front door: back wall, in the shelf-free stretch left of the bookcases, a standard 83 cm leaf. */
export const FRONT_DOOR: Doorway = { wall: 'back', along: -1.5, width: 0.83, height: 2.04 };

/** The room shell everything else is laid out in: 6 x 6 m, 2.8 m under the ceiling, one door. */
export const DEFAULT_ROOM: RoomOptions = { width: 6, depth: 6, height: 2.8, doorways: [FRONT_DOOR] };

export interface WindowPlan {
  wall: Wall;
  along: number;
}

export interface SeatPlan {
  at: Placement;
  cushion: CushionOptions;
}

export const ROOM_PLAN = {
  room: DEFAULT_ROOM,

  /** Bookcases fill the back wall from this x (the left third stays shelf-free for the door and the cat), then the right wall. */
  shelving: { backWallMinX: -1, sort: 'platform' as SortMode },

  /** The projector picture on the right wall: width and centre height; shelving keeps `margin` of bare wall each side. */
  projectorPicture: { width: 2.2, centreY: 1.45, margin: 0.1 },

  /** CRT on its console stand against the left wall, screen facing +x. */
  tv: { floor: [-2.7, 0], rotationY: Math.PI / 2 } as Placement,
  /** Ceiling projector a metre left of centre, throwing +x. */
  projector: { ceiling: [-1, 0], rotationY: Math.PI / 2 } as Placement,

  /** Armchairs (`Seat`), in front of the TV and in front of the projector wall. */
  seats: [
    { at: { floor: [-1.1, 0], rotationY: -Math.PI / 2 }, cushion: { color: 0x8fa383, tilt: 0.25 } },
    { at: { floor: [0.5, 0], rotationY: Math.PI / 2 }, cushion: { color: 0xc8785a, tilt: 0.2 } },
  ] as SeatPlan[],

  /** Floor-to-ceiling loft windows: two on the front wall, two on the left wall either side of the TV. */
  windows: {
    size: { width: 1.2, height: 2.4 },
    list: [
      { wall: 'front', along: 0.3 },
      { wall: 'front', along: 2.0 },
      { wall: 'left', along: -1.8 },
      { wall: 'left', along: 1.8 },
    ] as WindowPlan[],
  },

  /** Two posters on the front wall left of the windows: the collection summary and the first platform. */
  posters: {
    size: { width: 0.5, height: 0.7 },
    collection: { wall: 'front', along: -2.0, y: 1.65 } as Placement,
    platform: { wall: 'front', along: -1.25, y: 1.65 } as Placement,
  },

  /** The wall clock hangs this far above the first doorway (or here when the room has no door). */
  clock: { aboveDoor: 0.41, fallback: { wall: 'back', along: -1.85, y: 2.32 } as Placement },

  /** The pendant fixture of the room's ceiling light. */
  pendant: { ceiling: [0, 0] } as Placement,

  /** Everything else: plants, rug, pictures, lamps, tables. One line each; see `props/decor.ts` for the kinds. */
  decor: [
    // Around the TV armchair (at x -1.1): side table by its right armrest, floor lamp by its left one.
    { kind: 'sideTable', at: { floor: [-1.1, 0.72] } },
    { kind: 'floorLamp', at: { floor: [-1.1, -0.76] } },
    // Floor lamp beside the projector armchair (at x 0.5).
    { kind: 'floorLamp', at: { floor: [0.5, -0.76] }, options: { intensity: 5 } },
    // Rug between the TV and its armchair, long side along the wall.
    { kind: 'rug', at: { floor: [-1.55, 0], rotationY: Math.PI / 2 }, options: { width: 2.4, depth: 1.8 } },
    // Floor plants: fig in the back-left corner, yucca in the front-left one, monstera beside the TV.
    { kind: 'plant', at: { corner: 'back-left', inset: 0.45 }, options: { kind: 'fig', pot: 'ceramic', seed: 3 } },
    { kind: 'plant', at: { corner: 'front-left', inset: 0.45 }, options: { kind: 'yucca', pot: 'terracotta', seed: 5 } },
    { kind: 'plant', at: { floor: [-2.5, -1.3] }, options: { kind: 'monstera', pot: 'ceramic', seed: 11 } },
    // Trailing plants hung from the ceiling: front-right corner and over the rug.
    { kind: 'plant', at: { corner: 'front-right', inset: 0.5, hung: true }, options: { kind: 'hanging', seed: 13, scale: 0.8 } },
    { kind: 'plant', at: { ceiling: [-1.1, 0.95] }, options: { kind: 'hanging', seed: 17, scale: 0.75 } },
    // Small pots at the foot of the first front window and the back left window, just inside the curtains' travel.
    { kind: 'plant', at: { wall: 'front', along: -0.13, y: 0, offset: 0.32 }, options: { kind: 'small', pot: 'ceramic', seed: 8, collides: false } },
    { kind: 'plant', at: { wall: 'left', along: -1.44, y: 0, offset: 0.32 }, options: { kind: 'small', pot: 'ceramic', seed: 9, collides: false } },
    // Three small framed pictures on the left wall above the TV, between its two windows.
    { kind: 'pictureFrame', at: { wall: 'left', along: -0.5, y: 1.8 }, options: { motif: 'mountains', seed: 1 } },
    { kind: 'pictureFrame', at: { wall: 'left', along: 0, y: 1.8 }, options: { motif: 'sunset', seed: 2 } },
    { kind: 'pictureFrame', at: { wall: 'left', along: 0.5, y: 1.8 }, options: { motif: 'abstract', seed: 3 } },
  ] as DecorEntry[],
};
