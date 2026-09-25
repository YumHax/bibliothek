import type { Doorway, RoomOptions, Wall } from './Room';
import type { Placement } from './Placement';
import type { DecorEntry } from './props/decor';
import type { CushionOptions } from './props/Cushion';
import type { SortMode } from './shelving/sort';
import { BALCONY_DOOR } from './balcony/balconyPlan';

/*
 * THE ROOM PLAN: every position in the collection room, as data, in zone-local coordinates (the room
 * is centred on its zone's origin). `layout.ts` reads it and builds the zone; nothing here imports three.js at runtime. Axes: x right, y up, z towards the player's
 * spawn. Walls as seen from the spawn: back = -z (shelves, door), front = +z, left = -x (TV),
 * right = +x (projector picture). Metres, real-world scale.
 *
 * To move or add decoration edit `decor`; to add a kind of decoration see `props/decor.ts`.
 */

/** Every door of the flat is the same standard leaf. */
export const DOOR_LEAF = { width: 0.83, height: 2.04 };

/** The door to the hallway: back wall, in the shelf-free stretch left of the bookcases; this room hangs the leaf. */
export const FRONT_DOOR: Doorway = { wall: 'back', along: -1.5, ...DOOR_LEAF, to: 'hallway' };

/** The glazed door onto the balcony: front wall, where the right-hand loft window was; the balcony hangs it (it opens in). */
export const BALCONY_DOORWAY: Doorway = { wall: 'front', along: 2.0, ...BALCONY_DOOR, door: false, to: 'balcony' };

/**
 * The room shell everything else is laid out in: 6 x 6 m, 2.8 m under the ceiling, one door. The
 * back wall (hallway behind) and the right wall have no window and keep the light in.
 */
export const DEFAULT_ROOM: RoomOptions = { width: 6, depth: 6, height: 2.8, doorways: [FRONT_DOOR, BALCONY_DOORWAY], opaqueWalls: ['back', 'right'] };

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

  /**
   * Bookcases fill the back wall from this x (the left third stays shelf-free for the door and the cat), then the right
   * wall. One stands empty from the start: the collection begins with nothing in it and the room must still read as a collection room.
   */
  shelving: { backWallMinX: -1, sort: 'platform' as SortMode, minBookcases: 1 },

  /** The light switch by the door, on its hinge side (the leaf swings out into the hallway, the latch side is where the bookcases start). */
  lightSwitch: { wall: 'back', along: -2.05, y: 1.1 } as Placement,

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

  /**
   * Where the market's home goods for this room go once bought (`economy/homeGoods.ts`); nothing shows there before.
   * The lava lamp on the TV armchair's side table (top at 0.5 m), on its free side past the mug and the magazines:
   * on the sideboard it would stand in front of the projector picture (whose bottom edge is at 0.63 m).
   */
  homeGoods: { lamp: { at: { floor: [-0.98, 0.62] } as Placement, y: 0.5 } },

  /**
   * The feather wand won at the arcade (a prize that lives at home): lying on the projector rug, between the cushions and
   * the sideboard, raised by the rug's thickness (`lift`) so it lies on its pile instead of sinking into it.
   */
  featherWand: { at: { floor: [2.05, 0.3], rotationY: 0.5 } as Placement, lift: 0.012 },

  /**
   * The collector's book (`src/world/collector/`). The binder lies on the sideboard's top (0.5 m) in the gap between the
   * turntable (z -0.53..-0.11) and the records (z 0.23..0.54); the brass plaque, once earned (25 games), stands at the
   * sideboard's far end past the records, low enough to stay under the projector picture (from 0.63 m). The glass display
   * cabinet, once earned (50 games), stands against the front wall under the collection poster (x -2.11..-1.39, clear
   * of the yucca's pot and of the radiator from x -1.3), its top (1.12 m) under the poster's bottom edge (1.3 m).
   */
  collector: {
    book: { at: { wall: 'right', along: 0.06, y: 0.5, offset: 0.2 } as Placement, yaw: 0.1 },
    plaque: { wall: 'right', along: 0.68, y: 0.5, offset: 0.12 } as Placement,
    vitrine: { wall: 'front', along: -1.75, y: 0 } as Placement,
  },

  /**
   * A visiting friend's round (`src/world/visitors/`), floor points: just inside the door from the hallway, a hub in the
   * open floor by the bookcases every leg goes through, the spots they browse (facing `yaw`: 0 = +z, pi = the back wall's
   * shelves, pi/2 = the right wall's), and the armchairs they may sit in (`seat`: index in `seats`), each reached from
   * the hub `via` points that keep clear of the floor lamps, the cushions and the other chair.
   */
  visitor: {
    door: [-1.5, -2.45] as [number, number],
    hub: [-0.3, -1.6] as [number, number],
    browse: [
      { at: [-0.3, -2.15], yaw: Math.PI, kind: 'shelf' },
      { at: [1.1, -2.15], yaw: Math.PI, kind: 'shelf' },
      { at: [2.2, -1.7], yaw: Math.PI / 2, kind: 'shelf' },
      { at: [0.3, 2.3], yaw: 0, kind: 'window', via: [[-0.2, 0]] },
    ] as { at: [number, number]; yaw: number; kind: 'shelf' | 'window'; via?: [number, number][] }[],
    seats: [
      { seat: 0, via: [[-1.9, -1.4]] },
      { seat: 1, via: [[1.3, -1.3]] },
    ] as { seat: number; via: [number, number][] }[],
  },

  /** Everything else: plants, rug, pictures, lamps, tables. One line each; see `props/decor.ts` for the kinds. */
  decor: [
    // Around the TV armchair (at x -1.1): side table by its right armrest, floor lamp by its left one.
    { kind: 'sideTable', at: { floor: [-1.1, 0.72] } },
    { kind: 'floorLamp', at: { floor: [-1.1, -0.76] } },
    // Floor lamp beside the projector armchair (at x 0.5).
    { kind: 'floorLamp', at: { floor: [0.5, -0.76] }, options: { intensity: 5 } },
    // Rug between the TV and its armchair, long side along the wall.
    { kind: 'rug', at: { floor: [-1.55, 0], rotationY: Math.PI / 2 }, options: { width: 2.4, depth: 1.8 } },
    // Hi-fi speakers either side of the TV stand (1.4 m wide), facing into the room like the screen.
    { kind: 'speaker', at: { floor: [-2.72, -0.92], rotationY: Math.PI / 2 } },
    { kind: 'speaker', at: { floor: [-2.72, 0.92], rotationY: Math.PI / 2 } },
    // The projector corner: a rug between the projector armchair (front edge at x 0.8) and the sideboard,
    // two floor cushions thrown on it for whoever does not get the chair, and the sideboard under the picture.
    { kind: 'rug', at: { floor: [1.7, 0] }, options: { width: 1.5, depth: 1.7, field: 0x3e4a5c, border: 0xc9b98a, motif: 0x6e7b8c } },
    { kind: 'cushion', at: { floor: [1.45, 0.55], rotationY: 0.4 }, options: { width: 0.55, depth: 0.55, thickness: 0.13, color: 0xc9a552 } },
    { kind: 'cushion', at: { floor: [1.75, -0.5], rotationY: -0.7 }, options: { width: 0.55, depth: 0.55, thickness: 0.13, color: 0x8fa383 } },
    // Sideboard under the projector picture (whose bottom edge is at y 0.63), in the stretch the shelving keeps clear.
    { kind: 'sideboard', at: { wall: 'right', along: 0, y: 0 } },
    // Smoke detector on the ceiling over the door side of the room, clear of the pendant and the hung plants.
    { kind: 'smokeDetector', at: { ceiling: [-2.2, 1.0] } },
    // Floor plants: fig in the back-left corner, yucca in the front-left one, monstera beside the TV.
    { kind: 'plant', at: { corner: 'back-left', inset: 0.45 }, options: { kind: 'fig', pot: 'ceramic', seed: 3 } },
    { kind: 'plant', at: { corner: 'front-left', inset: 0.45 }, options: { kind: 'yucca', pot: 'terracotta', seed: 5 } },
    { kind: 'plant', at: { floor: [-2.5, -1.3] }, options: { kind: 'monstera', pot: 'ceramic', seed: 11 } },
    // Trailing plants hung from the ceiling: by the front wall between the radiator and the first window (the front-right
    // corner is the balcony door's swing now), and over the rug.
    { kind: 'plant', at: { ceiling: [-0.6, 2.3] }, options: { kind: 'hanging', seed: 13, scale: 0.8 } },
    { kind: 'plant', at: { ceiling: [-1.1, 0.95] }, options: { kind: 'hanging', seed: 17, scale: 0.75 } },
    // Small pots at the foot of the first front window and the front left window, just inside the curtains' travel
    // (the back left window's foot is the cat's bed and the monstera's pot).
    { kind: 'plant', at: { wall: 'front', along: -0.13, y: 0, offset: 0.32 }, options: { kind: 'small', pot: 'ceramic', seed: 8, collides: false } },
    { kind: 'plant', at: { wall: 'left', along: 1.4, y: 0, offset: 0.32 }, options: { kind: 'small', pot: 'ceramic', seed: 9, collides: false } },
    // Three small framed pictures on the left wall above the TV, between its two windows.
    { kind: 'pictureFrame', at: { wall: 'left', along: -0.5, y: 1.8 }, options: { motif: 'mountains', seed: 1 } },
    { kind: 'pictureFrame', at: { wall: 'left', along: 0, y: 1.8 }, options: { motif: 'sunset', seed: 2 } },
    { kind: 'pictureFrame', at: { wall: 'left', along: 0.5, y: 1.8 }, options: { motif: 'abstract', seed: 3 } },
    // Sockets: behind the TV stand (the set and the console plugged in, cables into the back of the
    // stand), by the sideboard (the turntable), and a free one under the light switch.
    { kind: 'wallSocket', at: { wall: 'left', along: 0.3, y: 0 }, options: { cables: [[0.25, 0.45, 0.15], [0.12, 0.3, 0.12]] } },
    { kind: 'wallSocket', at: { wall: 'right', along: 0.75, y: 0 }, options: { gangs: 1, cables: [[-0.3, 0.5, 0.05]] } },
    { kind: 'wallSocket', at: { wall: 'back', along: -2.05, y: 0 }, options: { gangs: 1 } },
    // A column radiator on the front wall under the posters, between the scratching post (x -1.79..-1.41) and the first
    // window's curtains (from x -0.6), a fleece cradle hooked over it for the cat.
    { kind: 'radiator', at: { wall: 'front', along: -1.0, y: 0 }, options: { width: 0.6, catCradle: true } },

    // --- The holidays (up only then, see `props/outdoors/season.ts`) ---
    // Christmas: the tree in front of the first window's right half (x 0.6..1.5, clear of the balcony door's swing in the
    // front-right corner and of a visitor at the window at x 0.3), and fairy lights along the top of the front wall.
    { kind: 'christmasTree', at: { floor: [1.05, 2.25] }, options: { height: 1.85, radius: 0.45, seed: 25 }, holiday: 'christmas' },
    { kind: 'fairyLights', at: { wall: 'front', along: 2.9, y: 0, offset: 0.04 }, options: { length: 5.8, height: 2.62, sag: 0.1, seed: 6 }, holiday: 'christmas' },
    // Halloween: two lit pumpkins at the foot of the first window, cobwebs in the top front-left and back-right corners.
    { kind: 'pumpkin', at: { floor: [0.95, 2.62], rotationY: 0.1 }, options: { radius: 0.13, seed: 31 }, holiday: 'halloween' },
    { kind: 'pumpkin', at: { floor: [1.3, 2.52], rotationY: -0.3 }, options: { radius: 0.085, seed: 7 }, holiday: 'halloween' },
    { kind: 'cobweb', at: { wall: 'front', along: -3.0, y: 2.8 }, options: { size: 0.5, spread: 'left', seed: 11 }, holiday: 'halloween' },
    { kind: 'cobweb', at: { wall: 'back', along: 3.0, y: 2.8 }, options: { size: 0.45, spread: 'left', seed: 12 }, holiday: 'halloween' },
    // New Year: gold and silver bunting across the room over the armchairs, balloons by the TV's front window, a banner over the posters.
    { kind: 'garland', at: { floor: [-2.8, 1.75] }, options: { style: 'bunting', length: 5.6, height: 2.6, sag: 0.3, colors: [0xd4a52a, 0xc4c7cc, 0x1a1a1f], seed: 9 }, holiday: 'newyear' },
    { kind: 'balloons', at: { floor: [-2.2, 1.35] }, options: { count: 5, seed: 17 }, holiday: 'newyear' },
    { kind: 'flyer', at: { wall: 'front', along: -1.62, y: 2.33 }, options: { style: 'cloth', title: 'HAPPY NEW YEAR', lines: [], width: 1.1, height: 0.26, paper: 0x1a1a1f, ink: 0xd4a52a, accent: 0xc4c7cc, seed: 3 }, holiday: 'newyear' },
  ] as DecorEntry[],
};
