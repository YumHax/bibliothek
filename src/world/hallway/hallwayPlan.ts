import type { RoomOptions } from '../Room';
import type { Placement } from '../Placement';
import type { DecorEntry } from '../props/decor';
import { DOOR_LEAF } from '../roomPlan';

/*
 * THE HALLWAY PLAN: the flat's corridor behind the collection room's door, in zone-local
 * coordinates (origin at the centre of its floor). Walls as named from the collection room's
 * spawn: front = +z (the collection room is through it), back = -z (bathroom and bedroom doors),
 * left = -x (the kitchen at the end), right = +x (the flat's front door: a teleport, it never swings).
 * The corridor is 4 m long and 1.3 m wide under a dropped 2.6 m ceiling.
 */

/** The doorway shared with the collection room; the collection room hangs the leaf. */
export const HALLWAY_LIVING_DOOR = { wall: 'front', along: -0.5, ...DOOR_LEAF, door: false, to: 'living' } as const;

export const HALLWAY_ROOM: RoomOptions = {
  width: 4,
  depth: 1.3,
  height: 2.6,
  // No windows: every wall keeps the light in.
  opaqueWalls: ['front', 'back', 'left', 'right'],
  doorways: [
    HALLWAY_LIVING_DOOR,
    // Across the corridor: the bathroom on the left (too small for a door to swing in: it hangs
    // its own, opening into the corridor) and the bedroom on the right (hung here, swinging in,
    // hinged away from the bedroom's corner).
    { wall: 'back', along: -1.1, ...DOOR_LEAF, door: false, to: 'bathroom' },
    { wall: 'back', along: 0.5, ...DOOR_LEAF, hinge: 'right', to: 'bedroom' },
    // The kitchen at the left end: hinged away from the kitchen's front corner.
    { wall: 'left', along: 0, ...DOOR_LEAF, hinge: 'right', to: 'kitchen' },
  ],
};

export const HALLWAY_PLAN = {
  room: HALLWAY_ROOM,

  /** The corridor's doors are painted off-white, like every interior door of the flat but the collection room's green one. */
  leafColor: 0xf1ede6,

  /** Flush ceiling light in the middle of the corridor. */
  light: { ceiling: [0, 0] } as Placement,
  /** Its switch on our wall, on the latch side of the collection room's door (the open leaf covers the hinge side, x -1.75..-0.9). */
  lightSwitch: { wall: 'front', along: 0.05, y: 1.1 } as Placement,

  /**
   * The console (mail, the key bowl, the reflecting mirror above) against the far wall by the entrance, the coat corner
   * facing it on our wall; the keys in its bowl must be in the pocket for the front door to let the player out.
   */
  console: { wall: 'back', along: 1.5, y: 0 } as Placement,
  coatRack: { wall: 'front', along: 1.25, y: 0 } as Placement,
  /** Games bought while out wait in a parcel on the floor under the console, until unpacked. */
  parcel: { wall: 'back', along: 1.45, y: 0, offset: 0.02 } as Placement,

  /** The flat's front door at the right end: it never swings, clicking it teleports (arcade, market). */
  entrance: { wall: 'right', along: 0, y: 0 } as Placement,
  /**
   * The coir mat inside it (the door's own plain mat is left off), long side along the door, where the flyers land
   * when the player comes home; clear of the console (z <= -0.4) and the shoe rack (z >= 0.39).
   */
  doormat: { at: { floor: [1.74, 0], rotationY: Math.PI / 2 } as Placement, width: 0.62, depth: 0.4 },
  /** Where the cat, out of the collection room, comes to sniff: the runner, the doormat by the front door. */
  catVisits: [
    [-0.6, 0],
    [1.0, 0.1],
  ] as [number, number][],
  /**
   * The stairwell behind the front door (someone on the stairs, the lift, a door on the landing): zone-local
   * [x, y, z] of the sound, 0.4 m out past the right wall, so the wall and the door muffle it like any sound next door.
   */
  stairwell: [2.4, 1.3, 0] as [number, number, number],
  /** Coming home: set down in front of the entrance, facing down the corridor (-x). */
  arrival: { at: [1.2, 0.08] as [number, number], yaw: Math.PI / 2 },

  /**
   * A runner down the middle: dark red border round a faded field. It stops short of the kitchen and bedroom doors'
   * mats (each 0.42 m into the corridor), which lie at the same height and would z-fight with it. The builder places it
   * (not `decor`): the kilim, once bought, takes its place.
   */
  runner: { at: { floor: [-0.675, 0] } as Placement, options: { width: 1.55, depth: 0.7, field: 0x9c6a5a, border: 0x6b2f2a, motif: 0x7a4a40 } },

  /** Where the market's home goods for the hallway (`economy/homeGoods.ts`) go once bought; nothing shows there before. */
  homeGoods: {
    /** The kilim replaces the runner on the same spot (never both: same height, they would z-fight); a little shorter, as its fringes reach past its ends. */
    rug: { at: { floor: [-0.675, 0] } as Placement, options: { width: 1.45, depth: 0.7, seed: 7 } },
    /** The framed shop poster on our wall in the corner by the front door, above the umbrellas, past the camel coat (x <= 1.67). */
    poster: { at: { wall: 'front', along: 1.83, y: 1.47 } as Placement, width: 0.26, height: 0.36 },
  },

  decor: [
    // Two framed pictures on our wall between the collection room's door and the coats (x 0..0.83; left of the door the
    // open leaf would cover them), clear of the light switch below.
    { kind: 'pictureFrame', at: { wall: 'front', along: 0.3, y: 1.5 }, options: { motif: 'abstract', seed: 4, width: 0.42, height: 0.32 } },
    { kind: 'pictureFrame', at: { wall: 'front', along: 0.68, y: 1.55 }, options: { motif: 'sunset', seed: 9, width: 0.24, height: 0.3, matWidth: 0.025 } },
    // A cork noticeboard on the far wall in the stretch between the kitchen door and the bathroom door (x -2..-1.585 with
    // its architrave); the bathroom's leaf opens into the corridor and lies over the wall right of its opening, so nothing hangs there.
    { kind: 'noticeboard', at: { wall: 'back', along: -1.79, y: 1.45 }, options: { width: 0.34, height: 0.44 } },
    // Two brass wall lights either side of the console's mirror (x 1.225..1.775); their spots lean out from the wall and
    // stop short of the far one, so they light neither the bedroom behind nor the collection room across.
    { kind: 'wallSconce', at: { wall: 'back', along: 1.13, y: 1.72 } },
    { kind: 'wallSconce', at: { wall: 'back', along: 1.87, y: 1.72 } },
    // By the front door on the right wall: the intercom in the strip beside it on the console's side (z -0.65..-0.485),
    // the fuse box over the door (its architrave tops out at 2.11 m).
    { kind: 'intercom', at: { wall: 'right', along: -0.57, y: 1.35 } },
    { kind: 'fuseBox', at: { wall: 'right', along: 0.15, y: 2.32 } },
    // An oak shoe rack under the coats (x 0.9..1.6; the coat rack is built without its own wire one), clear of the umbrellas.
    { kind: 'shoeRack', at: { wall: 'front', along: 1.25, y: 0 } },
    // Umbrellas in the corner by the front door, past the end of the coat rack (which ends at x 1.6).
    { kind: 'umbrellaStand', at: { corner: 'front-right', inset: 0.22 } },
    // Smoke detector on the corridor's ceiling, off the flush light.
    { kind: 'smokeDetector', at: { ceiling: [0.9, 0] } },
    // A low panel radiator on our wall under the pictures, between the collection room's door (its latch side at x -0.085)
    // and the shoe rack (from x 0.9); 0.13 m deep, clear of the bathroom leaf's swing on the far side.
    { kind: 'radiator', at: { wall: 'front', along: 0.45, y: 0 }, options: { style: 'panel', width: 0.6, height: 0.45, lift: 0.15 } },
  ] as DecorEntry[],
};
