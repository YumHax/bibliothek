import type { RoomOptions } from '../Room';
import type { Placement } from '../Placement';
import type { DecorEntry } from '../props/decor';
import { DOOR_LEAF } from '../roomPlan';

/*
 * THE HALLWAY PLAN: the flat's corridor behind the collection room's door, in zone-local
 * coordinates (origin at the centre of its floor). Walls as named from the collection room's
 * spawn: front = +z (the collection room is through it), back = -z (bathroom and bedroom doors),
 * left = -x (the kitchen at the end), right = +x (the flat's front door, onto the landing and the stairs).
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
    // The flat's front door at the right end, onto our landing (the stairwell): the builder hangs
    // it (`FrontDoor`, locked without the keys) and adds its portal, so no `door` and no `to` here.
    { wall: 'right', along: 0, ...DOOR_LEAF, door: false },
  ],
};

export const HALLWAY_PLAN = {
  room: HALLWAY_ROOM,

  /** The corridor's doors are painted off-white, like every interior door of the flat but the collection room's green one. */
  leafColor: 0xf1ede6,
  /** The front door's leaf, oxblood like the building's other flats' (its landing side is what the neighbours see). */
  frontDoorColor: 0x5a2420,

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
  /**
   * On the console (console-local [x, y, z] of the item's underside, and its turn): the journal's notebook at its
   * left end, left of the key bowl (x -0.4..-0.27, the pencil tucked under the bowl's rim); the first day's to-do
   * card standing behind the pile of letters, in front of the mirror.
   */
  journal: { at: [-0.335, 0.82, 0.13] as [number, number, number], yaw: 0.06 },
  toDoNote: { at: [0.07, 0.82, 0.055] as [number, number, number], yaw: -0.12 },
  /** The first day's "KEYS!" on the front door's leaf, inside: metres from the hinge edge, height. */
  keysNote: { along: 0.52, y: 1.48, lines: ['KEYS!', 'in the bowl', '← console'] },
  /** At Christmas, a wreath on the front door's landing side, centred on the leaf at eye height (metres from the hinge edge). */
  wreath: { along: 0.415, y: 1.5 },
  /** Games bought while out wait in a parcel on the floor under the console, until unpacked. */
  parcel: { wall: 'back', along: 1.45, y: 0, offset: 0.02 } as Placement,

  /** The flat's front door at the right end, onto our landing (the stairwell zone): it swings out onto the landing. */
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
   * A friend's way in (`src/world/visitors/`), zone-local floor points: the top of the stairs they come up (and go back
   * down), where they wait on the landing after ringing (past the right wall, clear of the leaf's swing out onto it), just
   * inside the front door, and on the latch side of the collection room's door (clear of its leaf, which swings out into
   * the corridor on the x -1.9 side; they open it if it is shut) on their way to the shelves. They walk it back to leave.
   */
  visitor: {
    stairs: [4.3, 0.05] as [number, number],
    landing: [3.4, 0.05] as [number, number],
    inside: [1.1, 0] as [number, number],
    livingDoor: [0, -0.1] as [number, number],
  },

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

    // Halloween: a small bowl of sweets on the console for the trick-or-treaters, in the gap between the letters
    // (console-local x -0.03..0.19) and the plant at its end (from 0.29); a cobweb in the top corner over the umbrellas.
    { kind: 'sweetsBowl', at: { wall: 'back', along: 1.74, y: 0.82, offset: 0.14 }, options: { radius: 0.05, seed: 3 }, holiday: 'halloween' },
    { kind: 'cobweb', at: { wall: 'front', along: 2.0, y: 2.6 }, options: { size: 0.4, spread: 'right', seed: 4 }, holiday: 'halloween' },
    // Christmas: a string of fairy lights along our wall under the ceiling, from the collection room's door to the coats.
    { kind: 'fairyLights', at: { wall: 'front', along: -0.05, y: 0, offset: 0.03 }, options: { length: 1.9, height: 2.45, sag: 0.12, colors: [0xffc46e], seed: 5 }, holiday: 'christmas' },
  ] as DecorEntry[],
};
