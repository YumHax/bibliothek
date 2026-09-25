import type { RoomOptions } from '../Room';
import type { Placement } from '../Placement';
import type { DecorEntry } from '../props/decor';
import type { NightstandItem } from '../props/Nightstand';
import { DOOR_LEAF } from '../roomPlan';

/*
 * THE BEDROOM PLAN, zone-local coordinates (origin at the centre of its floor). Walls as named
 * from the collection room's spawn: front = +z (the hallway is through it), back = -z, left = -x
 * (the bathroom is behind it), right = +x. 3.4 x 3.6 m, 2.8 m under the ceiling.
 * World: x from -1.1 to 2.3, z from -8.02 to -4.42; the door to the hallway is at world x -0.5.
 *
 * The door (front wall, x -1.1) swings in, hinged at x -0.685, and ends flat along the front wall
 * towards +x: nothing stands in x -1.5..0.1, z 1.0..1.8. The bed has its head to the back wall
 * with a nightstand each side, the wardrobe is on the left wall, a chair by the right wall (a reading corner), the
 * dresser on the front wall right of the door, a small TV on it facing the bed. The right wall is
 * the neighbour's side (the collection room's right wall is blind for the same reason, the flat's
 * entrance is at x 1); the back wall looks into the courtyard, which the outdoors panorama does not
 * paint, so its one window is obscured glass that only lets the daylight in. Between the back-left
 * corner and the wardrobe stands room for a bookcase the player buys (a kit leans there until then).
 */

export const BEDROOM_ROOM: RoomOptions = {
  width: 3.4,
  depth: 3.6,
  height: 2.8,
  // Every wall keeps the light in (the hallway and the bathroom are behind the front and left walls). The
  // back wall's one window is frosted glass with no sun light of its own (daylight comes in as the room's
  // sky ambient, which casts no shadow), so its caster shuts nothing out.
  opaqueWalls: ['front', 'back', 'left', 'right'],
  doorways: [{ wall: 'front', along: -1.1, ...DOOR_LEAF, door: false, to: 'hallway' }],
  // Its own paint: a dusty blue-grey, calmer than the flat's off-white.
  finish: { walls: 0xc3ced5 },
};

export const BEDROOM_PLAN = {
  room: BEDROOM_ROOM,
  /** The fixture of the room's ceiling light (the `Room` puts its point light at the centre of the ceiling). */
  pendant: { ceiling: [0, 0] } as Placement,
  /** Its switch inside the door, on the short stretch of front wall between the opening and the left corner (x -1.7..-1.515). */
  lightSwitch: { wall: 'front', along: -1.6, y: 1.1 } as Placement,

  /**
   * The double bed, head to the back wall, right of centre: between its left side (x -0.4) and
   * the wardrobe's doors (x -1.15) stays a passage wide enough for the player (0.3 m radius).
   */
  bed: { wall: 'back', along: 0.4, y: 0 } as Placement,
  /** Hours the bed stays as slept in (the night and the morning after); from noon on it is made. */
  bedUnmade: { from: 0, until: 12 },
  /** A nightstand either side of the bed (1.6 wide, so its edges are at x -0.4 and 1.2), each with a lamp on it. */
  nightstands: [
    { wall: 'back', along: -0.68, y: 0 },
    { wall: 'back', along: 1.47, y: 0 },
  ] as Placement[],
  /** What lies in each nightstand's drawer, in the order of `nightstands`: the sleeper's side (left) keeps the handheld. */
  nightstandDrawers: [
    ['handheld', 'book', 'glasses'],
    ['book', 'glasses'],
  ] as NightstandItem[][],
  /**
   * On the sleeper's nightstand a phone on charge, left of the lamp (stand-local [x, z] on the top,
   * the stand 0.45 x 0.4 from z 0.02 at the wall), its cable run back to the wall; on the other one
   * a night light, right of the lamp. Both glow faintly after dark, with no light of their own.
   */
  // `cableRun` takes the cable from the phone's bottom edge (z 0.225) past the stand's back edge, to drop at z 0.01.
  phone: { stand: 0, at: [-0.12, 0.3] as [number, number], yaw: 0.06, cableRun: 0.2 },
  nightLight: { stand: 1, at: [0.15, 0.13] as [number, number] },
  /**
   * A game from the collection left on the sleeper's nightstand (the handheld is in its drawer), on the bed side of the
   * lamp (base r 0.06 at [0, 0.18]) and across from the phone: stand-local [x, z] on the top, and its turn.
   */
  strayBox: { stand: 0, at: [0.115, 0.32] as [number, number], yaw: Math.PI / 2 + 0.15 },
  /**
   * The neighbours heard through the party wall (the right wall): where their muffled voices come from, just in front of
   * the wall at head height beside the bed. It is inside the room so the wall is not counted twice; the voice is muffled itself.
   */
  neighbours: { wall: 'right', along: -0.2, y: 1.4, offset: 0.03 } as Placement,

  /** The wardrobe on the left wall, short of the door's swing. */
  wardrobe: { at: { wall: 'left', along: 0.3, y: 0 } as Placement, depth: 0.55 },
  /** The chest of drawers on the front wall, right of where the open door ends, short of the chair (its tray makes way for the TV). */
  dresser: { at: { wall: 'front', along: 0.6, y: 0 } as Placement, width: 0.8 },
  /** A portable CRT on the dresser, left of its books, watched from the bed: `along` is from the dresser's middle. */
  tv: { along: -0.12, screenWidth: 0.4 },
  /** The obscured window over the left nightstand, high enough to clear its lamp. */
  window: { at: { wall: 'back', along: -0.9, y: 1.6 } as Placement, width: 0.7, height: 0.9 },
  /**
   * The bookcase slot on the left wall, between the fig in the corner and the wardrobe (z -0.3):
   * 0.98 m wide, standing 0.01 m off the wall (its origin is its centre, 0.15 m deep). Bought
   * bookcases hold the games the collection room has no room left for.
   */
  bookcase: { at: { wall: 'left', along: -0.82, y: 0, offset: 0.16 } as Placement, width: 0.98 },
  /** The kit leaning where the bookcase will stand, until it is bought. */
  bookcaseKit: { wall: 'left', along: -0.82, y: 0 } as Placement,
  /** Where the cat comes to look round: the rug at the foot of the bed, the passage by the wardrobe. */
  catVisits: [
    [0.4, 0.65],
    [-0.8, -0.8],
  ] as [number, number][],
  /** A chair in the front-right corner by the bare right wall, turned towards the bed, clothes over it. */
  chair: { floor: [1.36, 1.36], rotationY: -Math.PI * 0.75 } as Placement,
  /**
   * The reading corner: a round side table by the right wall in front of the chair (x 1.17..1.67,
   * z 0.47..0.97, short of the chair and clear under the prize shelf), and on it a reading lamp,
   * table-local [x, z], turned (yaw) so its shade leans out towards the chair.
   */
  readingCorner: {
    table: { floor: [1.42, 0.72] } as Placement,
    tableRadius: 0.25,
    lamp: { at: [-0.08, 0.15] as [number, number], yaw: -0.1 },
  },
  /** The prize shelf: two boards on the bare right wall between the mirror and the chair (z 0.1..0.9), what the arcade paid out on it. */
  prizeShelf: { at: { wall: 'right', along: 0.5, y: 1.25 } as Placement, width: 0.8 },
  /** The arcade's poster once won (a prize that lives at home): framed on the right wall above the radiator, beside the mirror. */
  arcadePoster: { at: { wall: 'right', along: -0.8, y: 1.5 } as Placement, width: 0.44, height: 0.62 },
  /** The arcade's mood lamp once won: on the dresser's pile of books (dresser-local x, height above its top). */
  moodLamp: { along: 0.23, above: 0.06 },

  decor: [
    // A rug at the foot of the bed, between it and the door's swing.
    { kind: 'rug', at: { floor: [0.4, 0.65] }, options: { width: 1.6, depth: 0.7, field: 0xb9a68a, border: 0x6e5a48, motif: 0x8c7358 } },
    // A wide landscape over the headboard, a small one over the dresser.
    { kind: 'pictureFrame', at: { wall: 'back', along: 0.4, y: 1.7 }, options: { motif: 'mountains', seed: 7, width: 0.9, height: 0.5, matWidth: 0.05 } },
    { kind: 'pictureFrame', at: { wall: 'front', along: 0.6, y: 1.55 }, options: { motif: 'sunset', seed: 12, width: 0.42, height: 0.32 } },
    // A small fig tucked in the back-left corner, between the left nightstand and the bookcase slot.
    { kind: 'plant', at: { corner: 'back-left', inset: 0.26 }, options: { kind: 'fig', pot: 'terracotta', seed: 21, scale: 0.7 } },
    // A full-length mirror leaning on the bare right wall beside the foot of the bed (z -0.45..0.05), between the
    // radiator and the chair, short of the prize shelf (from z 0.1).
    { kind: 'leaningMirror', at: { wall: 'right', along: -0.2, y: 0 } },
    // A slim panel radiator on the right wall between the right nightstand and the mirror (z -1.09..-0.51 with its
    // pipes), clear of the nightstand's drawer, which slides out to z -1.12. The strip between the bed and this wall
    // (0.47 m) is too narrow to walk anyway: that side's lamp and drawer are reached from the foot of the bed.
    { kind: 'radiator', at: { wall: 'right', along: -0.8, y: 0 }, options: { style: 'panel', width: 0.45, height: 0.5 } },
  ] as DecorEntry[],
};
