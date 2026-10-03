import type { RoomOptions } from '../Room';
import type { Placement } from '../Placement';
import type { DecorEntry } from '../props/decor';
import { ANNEX_DOORWAY, DOOR_LEAF } from '../roomPlan';

/*
 * MRS ROUX'S TWO ROOMS, joined to the flat once she has moved out (`building/rouxMove`): the room on the street behind
 * the collection room's right wall (`annex`) and the study behind it (`annexStudy`), against the stairwell. Zone-local
 * coordinates, each origin at the centre of its floor. World:
 *
 *   z  3.0 ┌──── front wall: two French windows on Front Street (world x 4.3 and 6.9) ────┐
 *          │                                                                              │
 *   opening│  the new room   x 3.06 .. 7.96, z -0.66 .. 3.0   (4.9 x 3.66)                 │ the next building
 *   (z 2.3)│                                                                              │
 *  -0.66   └─ door (x 4.0) ───────────────────────────────────────────────────────────────┘
 *  -0.72   ┌──────────────────────────────────────────────────────────────────────────────┐
 *          │  the study      x 3.06 .. 7.96, z -3.0 .. -0.72  (4.9 x 2.28)                │
 *  -3.0    └────────────────────────────────── her old front door (x 6.9) ───────────────┘
 *                                our landing and the stairs behind (the stairwell, z < -3.06)
 *
 * The collection room's right wall (world x 3) and the new room's left wall keep `WALL_GAP` between them; the opening
 * is `ANNEX_DOORWAY` (no leaf either side). The windows stand where the building's front has always painted them
 * (`BALCONY_PLAN.front`, the street's `ours` facade). Both rooms are bare to start: the bookcases come with the flat.
 */

/** World x of the rooms' left (the collection room's side) and right walls; the new room's front and back, the study's back. */
const WEST = 3.06;
const EAST = 7.96;
const WIDTH = EAST - WEST;
const FRONT = 3.0;
const ROOM_BACK = -0.66;
const STUDY_FRONT = -0.72;
const STUDY_BACK = -3.0;

/** World origins of the two zones (`worldPlan.ts`). */
export const ANNEX_ORIGIN: [number, number, number] = [(WEST + EAST) / 2, 0, (FRONT + ROOM_BACK) / 2];
export const STUDY_ORIGIN: [number, number, number] = [(WEST + EAST) / 2, 0, (STUDY_FRONT + STUDY_BACK) / 2];

/** The door between the two rooms: world x, on the new room's back wall; the new room hangs it, it swings into the study. */
const STUDY_DOOR_X = 4.0;

/** The opening knocked through, in the new room's frame (its left wall; `along` is local z). */
export const ANNEX_OPENING = { wall: 'left' as const, along: ANNEX_DOORWAY.along - ANNEX_ORIGIN[2], width: ANNEX_DOORWAY.width, height: ANNEX_DOORWAY.height };

export const ANNEX_ROOM: RoomOptions = {
  width: WIDTH,
  depth: FRONT - ROOM_BACK,
  height: 2.8,
  // The opening's portal is registered by the builder (shut till the works are done); the study's door is ours.
  doorways: [
    { ...ANNEX_OPENING, door: false },
    { wall: 'back', along: STUDY_DOOR_X - ANNEX_ORIGIN[0], ...DOOR_LEAF, hinge: 'right', to: 'annexStudy' },
  ],
  // The collection room, the study and the next building are behind the walls without windows.
  opaqueWalls: ['back', 'left', 'right'],
  // Her paint, a faded old rose over the plaster: the player's to live with.
  finish: { walls: 0xe9ddd6 },
};

export const STUDY_ROOM: RoomOptions = {
  width: WIDTH,
  depth: STUDY_FRONT - STUDY_BACK,
  height: 2.8,
  doorways: [{ wall: 'front', along: STUDY_DOOR_X - STUDY_ORIGIN[0], ...DOOR_LEAF, door: false, to: 'annex' }],
  opaqueWalls: ['front', 'back', 'left', 'right'],
  finish: { walls: 0xdcd6c4 },
};

/** Where a bookcase stands (against a wall, its back 1 cm off it: the shelving's 0.3 m depth). */
const BOOKCASE_OFFSET = 0.16;
const BOOKCASE_WIDTH = 1.2;

/** The new room's four bookcases: two on the back wall right of the study's door, two on the right wall. */
const ROOM_SHELVING: Placement[] = [
  { wall: 'back', along: 0.62, y: 0, offset: BOOKCASE_OFFSET },
  { wall: 'back', along: 1.84, y: 0, offset: BOOKCASE_OFFSET },
  { wall: 'right', along: -0.9, y: 0, offset: BOOKCASE_OFFSET },
  { wall: 'right', along: 0.32, y: 0, offset: BOOKCASE_OFFSET },
];

/** The study's two bookcases, on its back wall left of her old front door. */
const STUDY_SHELVING: Placement[] = [
  { wall: 'back', along: -1.84, y: 0, offset: BOOKCASE_OFFSET },
  { wall: 'back', along: -0.62, y: 0, offset: BOOKCASE_OFFSET },
];

export const ANNEX_PLAN = {
  room: ANNEX_ROOM,
  /** Her pendant, kept: the room's ceiling light, its switch by the opening (inside, on the left wall's back stretch). */
  pendant: { ceiling: [0, 0] } as Placement,
  lightSwitch: { wall: 'left', along: 0.4, y: 1.1 } as Placement,
  /** The two French windows on Front Street (front wall, local x), the size of the collection room's. */
  windows: { size: { width: 1.2, height: 2.4 }, along: [4.3 - ANNEX_ORIGIN[0], 6.9 - ANNEX_ORIGIN[0]] },
  /**
   * The bookcases the flat gains (`build/bookcases.bookcasesIn`'s `annex`): two on the back wall right of the study's
   * door, two on the right wall; then the study's two (`STUDY_PLAN.shelving`). Width 1.2, like the collection room's.
   */
  shelving: {
    width: BOOKCASE_WIDTH,
    here: ROOM_SHELVING,
    /** Every annex slot, the study's after these (the count `bookcasesIn` caps the annex at). */
    slots: [...ROOM_SHELVING, ...STUDY_SHELVING],
  },
  /** The marble fireplace on the party wall (left), behind the opening; her note and a photo on its mantel. */
  fireplace: { wall: 'left', along: -0.55, y: 0 } as Placement,
  /** On the mantel (fireplace-local x, from its middle): the framed photo, her note. */
  mantel: { photo: -0.38, note: 0.2 },
  /** Where the cat comes to look round. */
  catVisits: [
    [0.6, 0.6],
    [-1.2, 0.9],
  ] as [number, number][],
  decor: [
    // A cast-iron column radiator on the right wall, past the bookcases; a socket under each window's side.
    { kind: 'radiator', at: { wall: 'right', along: 1.42, y: 0 }, options: { style: 'column', width: 0.7 } },
    { kind: 'wallSocket', at: { wall: 'front', along: 0.1, y: 0 }, options: { gangs: 1 } },
    { kind: 'smokeDetector', at: { ceiling: [1.2, -0.9] } },
    // The one picture she left on its nail, over where her sideboard stood for forty years.
    { kind: 'pictureFrame', at: { wall: 'back', along: -0.2, y: 1.55 }, options: { width: 0.34, height: 0.44, motif: 'botanical', seed: 7 } },
  ] as DecorEntry[],
};

export const STUDY_PLAN = {
  room: STUDY_ROOM,
  /** A flush light (the study is low on room for a pendant over a desk), its switch inside the door, on the latch side. */
  ceilingLight: { ceiling: [0, 0] } as Placement,
  lightSwitch: { wall: 'front', along: STUDY_DOOR_X - STUDY_ORIGIN[0] - 0.6, y: 1.1 } as Placement,
  shelving: { width: BOOKCASE_WIDTH, here: STUDY_SHELVING },
  /** Her old front door onto our landing (world x 6.9, `STAIRWELL_PLAN.ourNeighbourX`), seen from inside: it stays locked. */
  oldDoor: { wall: 'back', along: 6.9 - STUDY_ORIGIN[0], y: 0 } as Placement,
  /** Its paint, the colour the landing knows it by (`STAIRWELL_PLAN.doors[0][0]`). */
  oldDoorColor: 0x3a4a5a,
  catVisits: [[0.2, 0.2]] as [number, number][],
  decor: [
    { kind: 'radiator', at: { wall: 'right', along: 0.1, y: 0 }, options: { style: 'panel', width: 0.6, height: 0.5 } },
    { kind: 'wallSocket', at: { wall: 'back', along: 0.4, y: 0 }, options: { gangs: 1 } },
  ] as DecorEntry[],
};

/**
 * On our landing (stairwell-local, see `stairwellPlan.ts`): the agency's sign on her door, its height on the leaf (over
 * the peephole at 1.5 m); the removal men's boxes along the east wall south of her door on moving day.
 */
export const ROUX_LANDING = {
  sign: { y: 1.78 },
  boxes: { x: 2.8, z: -1.0 },
};
