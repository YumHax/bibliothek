import type { RoomOptions } from '../Room';
import type { Placement } from '../Placement';
import type { DecorEntry } from '../props/decor';
import type { MemoryLine, MemoryShot } from '@/memories/memoryReel';
import type { FamilyPhoto } from './familyPhotos';
import type { TableLayout } from './SundayTable';
import { GRANDMA_DAY } from '@/grandma/grandma';

/*
 * MÉMÉ'S FLAT, zone-local (origin at the centre of its floor; front = +z, the window on Linden Avenue; back = -z, the
 * landing door). Her living-dining room across town, at the end of bus line 38 (docs/story.md "Mémé"): the sitting
 * corner on the left (her armchair and the visitor's facing the old set on the sideboard), the dining table on the
 * right with the photo album on it. 5.6 x 4.6 m, 2.6 m high. Reached by the bus from Front Street, left by the landing
 * door (the bus back). The memories are filmed here too: `christmas` lays out the Christmas the player was six.
 */

type Vec2 = [number, number];
type Vec3 = [number, number, number];

export const GRANDMA_FLAT_ROOM: RoomOptions = {
  width: 5.6,
  depth: 4.6,
  height: 2.6,
  // The window's wall lets the daylight in; the rest is party walls and the landing.
  opaqueWalls: ['back', 'left', 'right'],
  finish: { walls: 0xe9dcc0, ceiling: 0xf5efe2, trim: 0xd2c4a6 },
};

export const GRANDMA_FLAT_PLAN = {
  room: GRANDMA_FLAT_ROOM,
  /** Off the bus and up the stairs: just inside the landing door, looking into the room. */
  arrival: { at: [-2.0, -1.6] as Vec2, yaw: Math.PI },
  /** The landing door, back down to the bus stop. */
  exit: { wall: 'back', along: -2.0, y: 0 } as Placement,
  pendant: { ceiling: [0.2, 0.1] } as Placement,
  lightSwitch: { wall: 'back', along: -1.3, y: 1.1 } as Placement,
  /** One window on the avenue, its curtains half drawn (no sun of its own: no shadow map; the view is Linden Avenue's, `LindenView`). */
  window: { wall: 'front' as const, along: 0.9, width: 1.3, height: 1.45 },
  /** The longcase clock against the back wall, between the light switch and the china cabinet. */
  clock: { wall: 'back', along: -0.75, y: 0 } as Placement,

  /** The old set on the sideboard against the left wall, facing the armchairs. */
  sideboard: { at: { wall: 'left', along: 0.6, y: 0 } as Placement, width: 1.3 },
  /** Her armchair (she sits in it) and the visitor's, both turned to the set. */
  armchair: { at: [-1.05, 1.25] as Vec2, yaw: -1.95 },
  visitorChair: { at: [-1.25, -0.35] as Vec2, yaw: -0.95 },
  /** Seat height of an armchair's cushion, for whoever sits in it. */
  seatHeight: 0.45,
  /** Where her eyes rest when nobody talks to her: the set. */
  gaze: [-2.58, 0.75, 0.6] as Vec3,
  /**
   * Her day (`world/grandma/meme`, `GRANDMA_DAY`): mornings on the table's back chair (the third of `chairs`) over
   * the paper, its seat's height and her eyes on the table; evenings in the armchair, eyes on her knitting in her lap.
   */
  memeDay: {
    table: { at: [1.35, -0.92] as Vec2, yaw: 0, seat: 0.47, gaze: [1.35, 0.76, -0.5] as Vec3 },
    knitting: [-1.33, 0.55, 1.14] as Vec3,
  },

  /** The dining table, its long side along x, and its chairs. */
  table: { at: { floor: [1.35, -0.15], rotationY: 0 } as Placement, width: 1.4, depth: 0.85 },
  chairs: [
    { floor: [0.42, -0.15], rotationY: Math.PI / 2 },
    { floor: [2.28, -0.15], rotationY: -Math.PI / 2 },
    { floor: [1.35, -0.92], rotationY: 0 },
  ] as Placement[],
  /** The photo album on the table, table-local [x, z] on its top, and its turn. */
  album: { at: [-0.2, 0.12] as Vec2, yaw: 0.35 },

  decor: [
    { kind: 'rug', at: { floor: [-1.6, 0.45] }, options: { width: 2.0, depth: 1.6, field: 0x8a3a32, border: 0xe0d0a8, motif: 0x2e4a5a } },
    { kind: 'doormat', at: { floor: [-2.0, -1.98] }, options: { width: 0.8, depth: 0.45, seed: 14 } },
    { kind: 'radiator', at: { wall: 'front', along: 0.9, y: 0 }, options: { style: 'column', width: 0.9 } },
    { kind: 'wallCalendar', at: { wall: 'right', along: -0.9, y: 1.5 }, options: { seed: 21 } },
    { kind: 'smokeDetector', at: { ceiling: [-1.2, -1.2] } },
    { kind: 'wallSocket', at: { wall: 'right', along: 0.8, y: 0 }, options: { gangs: 2 } },
    { kind: 'plant', at: { corner: 'front-right', inset: 0.56 }, options: { kind: 'monstera', pot: 'ceramic', seed: 45 } },
    // Over the kitchenette's dresser, her jars and mugs.
    { kind: 'wallShelf', at: { wall: 'back', along: 1.55, y: 1.32 }, options: { width: 0.8, tiers: 2, items: 'mixed', seed: 9 } },
  ] as DecorEntry[],
  /** The decor of the room today that a memory puts aside (`furnishGrandmaDecor`'s `modern`): what 1995 did not have. */
  modernKinds: ['smokeDetector', 'wallCalendar', 'wallSocket'] as DecorEntry['kind'][],

  /**
   * Her things (`furnishGrandmaDecor`): the longcase clock (`clock`) and the china cabinet along the back wall, the
   * kitchenette in its right-hand corner (the dresser, the cooker and its kettle), the telephone table by the door, the
   * family's photos on the walls and the sideboard, the tea on the side table, the footstool and the magazine rack by
   * the front wall, the canary by the window, the cloth on the dining table and Sunday's lunch on it, the loose boards.
   */
  dressing: {
    chinaCabinet: { at: { wall: 'back', along: 0.35, y: 0 } as Placement, width: 1.0 },
    dresser: { at: { wall: 'back', along: 1.55, y: 0 } as Placement, width: 0.8 },
    cooker: { wall: 'back', along: 2.42, y: 0 } as Placement,
    phoneTable: { wall: 'left', along: -1.0, y: 0 } as Placement,
    sideTable: { at: { floor: [-0.3, 1.7] } as Placement, radius: 0.26 },
    footstool: { floor: [-0.85, 1.98], rotationY: 0.1 } as Placement,
    magazineRack: { floor: [-1.45, 1.98], rotationY: 0.1 } as Placement,
    /** The canary's stand, its cage hung towards the room. */
    birdCage: { floor: [2.3, 1.0], rotationY: Math.PI } as Placement,
    /** On the sideboard, its frame ([x along it, z out from the wall], a photo's turn): the set on its runner, a photo, the sweets, a figurine. */
    onSideboard: { tv: [-0.05, 0.22] as Vec2, photo: [0.42, 0.2, -0.3] as Vec3, sweets: [-0.5, 0.24] as Vec2, figurine: [0.58, 0.3] as Vec2 },
    /** On the china cabinet's cornice, its frame. */
    onCabinet: { dog: [-0.3, 0.17] as Vec2, vase: [0.3, 0.17] as Vec2 },
    /** The family on the walls: the wedding, Félix as a boy, the seaside, Félix and Mémé, the player's school portrait, Félix at twenty. */
    photos: [
      { photo: 'wedding', at: { wall: 'left', along: 0.1, y: 1.6 }, width: 0.32, height: 0.42, frame: 0x6a4a2a },
      { photo: 'felixBoy', at: { wall: 'left', along: 0.6, y: 1.74 }, width: 0.3, height: 0.24, frame: 0x2a2018 },
      { photo: 'seaside', at: { wall: 'left', along: 1.08, y: 1.58 }, width: 0.36, height: 0.28, frame: 0xb89a5a },
      { photo: 'felixAndMeme', at: { wall: 'left', along: -1.0, y: 1.45 }, width: 0.26, height: 0.34, frame: 0xc8b088 },
      { photo: 'school', at: { wall: 'right', along: 0.1, y: 1.6 }, width: 0.3, height: 0.38, frame: 0xb89a5a },
      { photo: 'felixYoung', at: { wall: 'right', along: 0.65, y: 1.55 }, width: 0.42, height: 0.32, frame: 0x6a4a2a },
    ] as { photo: FamilyPhoto; at: Placement; width: number; height: number; frame: number }[],
    /** On the dining table's cloth, table-local: Mémé's place at the back chair, the visitor's at the right end. */
    lunch: {
      places: [
        { at: [0.05, -0.24], toward: 'z', side: -1 },
        { at: [0.52, -0.02], toward: 'x', side: 1 },
      ],
      pot: [0.2, 0.2],
      bread: [-0.45, -0.25],
      fruit: [0.25, 0.1],
    } as TableLayout,
    /** The loose boards, [x, z, radius] (off the memories' camera moves). */
    creaks: [
      [-1.7, -1.0, 0.22],
      [0.35, -1.55, 0.2],
      [1.2, 1.25, 0.25],
      [0.1, 1.5, 0.2],
    ] as [number, number, number][],
    /**
     * Her hours (the clock's): the set on from when she leaves the table for her armchair (`GRANDMA_DAY.table`) through
     * the evening's knitting (the quiz shows), the kettle on for a visitor by day, the canary awake.
     */
    tvHours: [GRANDMA_DAY.table, 22] as [number, number],
    kettleHours: [8, 18] as [number, number],
    canaryHours: [7, 20] as [number, number],
  },

  /**
   * The Christmas the player was six (`MEMORIES` christmas95): the tree in the corner, Mémé in her armchair, Félix
   * in the visitor's, the child on the rug with the new console. Shots and words on the film's clock (s).
   */
  christmas: {
    tree: { at: { floor: [-2.25, 1.8] } as Placement, height: 1.6, radius: 0.45 },
    child: { at: [-1.85, 0.35] as Vec2, yaw: 2.43 },
    /** The parcel torn out of its sports pages on the rug before the child, and the red cloth of the table that night. */
    parcel: { at: [-1.6, 0.06] as Vec2, yaw: 0.6 },
    cloth: 0x9a2630,
    /** The child's beats: the present opened (a hop), then playing, eyes down. */
    cheerAt: 11,
    playFrom: 12.6,
    /** Félix's: pretending not to know, then caught out. */
    felixShrugAt: 19,
    felixScratchAt: 23.4,
    childPumpAt: 20.4,
    /** Mémé's: a clap for the present, a nod at the end. */
    clapAt: 11.6,
    nodAt: 26.5,
    shots: [
      // The room: wide from the dining table, the tree and the sitting corner, the snow in the window on the right.
      { from: 2.5, to: 9.5, camera: { from: [2.1, 1.55, -1.3], to: [1.7, 1.5, -0.95], lookFrom: [-0.75, 0.95, 2.0], lookTo: [-0.85, 0.9, 1.7] }, fov: 55, lens: { focus: 3.8, blur: 3 } },
      // The present: closer on the child by the tree.
      { from: 9.5, to: 16.5, camera: { from: [-0.55, 1.15, 0.55], to: [-0.8, 1.1, 0.7], lookFrom: [-1.85, 0.95, 0.35], lookTo: [-1.9, 0.85, 0.4] }, fov: 46, lens: { focus: 1.2, blur: 6 } },
      // The two of them: over Félix's shoulder from the door side, the child playing.
      { from: 16.5, to: 24, camera: { from: [-0.2, 1.05, -1.45], to: [-0.4, 1.0, -1.2], lookFrom: [-1.75, 0.85, 0.45], lookTo: [-1.8, 0.8, 0.4] }, fov: 48, lens: { focus: 1.9, focusTo: 2.2, blur: 5 } },
      // Mémé watching them.
      { from: 24, to: 31, camera: { from: [0.45, 1.25, 0.2], to: [0.25, 1.2, 0.35], lookFrom: [-1.05, 1.05, 1.25], lookTo: [-1.1, 1.0, 1.2] }, fov: 44, lens: { focus: 1.6, blur: 5 } },
    ] as MemoryShot[],
    lines: [
      { at: 0.8, seconds: 3.6, text: 'You were six. Félix came for Christmas with a parcel bigger than you.' },
      { at: 5.0, seconds: 4.0, text: 'He’d wrapped it in the sports pages.' },
      { at: 9.8, seconds: 4.4, text: 'You tore into it before the soup. A Game Boy.' },
      { at: 14.6, seconds: 2.6, text: 'Not a word out of you all evening.' },
      { at: 17.4, seconds: 4.4, text: 'He pretended he didn’t know how to play, so you could show him.' },
      { at: 22.2, seconds: 4.2, text: 'He knew. He’d stayed up all night learning, so he could lose to you.' },
      { at: 26.0, seconds: 3.8, text: 'I never saw him so happy. Not even with his own games.' },
    ] as MemoryLine[],
    /** Back in the room: standing by the table, turned to her. */
    after: { at: [0.6, 0.9] as Vec2 },
  },

  /**
   * The row (`MEMORIES` row): a Sunday supper in 1999 gone cold on the table, Mémé on the back chair between her sons,
   * Gaspard at the door end, Félix at the window end (he stands up), the child of ten in her armchair with the Game
   * Boy, listening. Shots and words on the film's clock (s).
   */
  row: {
    /** On the table's chairs (`chairs`: Gaspard on the first, Félix on the second, Mémé on the back one), this high. */
    seat: 0.47,
    gaspard: { at: [0.42, -0.15] as Vec2, yaw: Math.PI / 2 },
    felix: { at: [2.28, -0.15] as Vec2, yaw: -Math.PI / 2 },
    meme: { at: [1.35, -0.92] as Vec2, yaw: 0 },
    /** Félix on his feet beside his chair, turned to his brother. */
    felixStands: { at: [2.42, 0.32] as Vec2, yaw: -1.8 },
    gaspardPointAt: 10.4,
    gaspardRubAt: 13.2,
    felixStandAt: 15,
    felixPointAt: 19.8,
    childLooksUpAt: 23.2,
    childBackAt: 26.4,
    memeSighAt: 28.6,
    shots: [
      // The table across the room, from behind the armchair: the three of them in the lamplight.
      { from: 2.5, to: 9, camera: { from: [-0.55, 1.55, 1.55], to: [-0.25, 1.5, 1.35], lookFrom: [1.35, 0.95, -0.3], lookTo: [1.35, 0.95, -0.36] }, fov: 52, lens: { focus: 2.5, blur: 3 } },
      // Gaspard, from his brother's end.
      { from: 9, to: 15, camera: { from: [2.05, 1.28, 0.45], to: [1.9, 1.25, 0.36], lookFrom: [0.42, 1.12, -0.15], lookTo: [0.42, 1.1, -0.15] }, fov: 42, lens: { focus: 1.65, blur: 6 } },
      // Félix on his feet, from Gaspard's end.
      { from: 15, to: 21, camera: { from: [0.72, 1.3, 0.6], to: [0.86, 1.34, 0.55], lookFrom: [2.4, 1.35, 0.25], lookTo: [2.42, 1.5, 0.3] }, fov: 44, lens: { focus: 1.7, blur: 5 } },
      // The child in the armchair, the Game Boy up, eyes lifting to the table.
      { from: 21, to: 27, camera: { from: [-0.35, 1.0, 0.55], to: [-0.45, 0.98, 0.66], lookFrom: [-1.05, 0.85, 1.22], lookTo: [-1.05, 0.88, 1.24] }, fov: 44, lens: { focus: 0.95, blur: 6 } },
      // Mémé between them, eyes on her plate.
      { from: 27, to: 33.5, camera: { from: [1.35, 1.32, 0.98], to: [1.35, 1.26, 0.82], lookFrom: [1.35, 1.05, -0.92], lookTo: [1.35, 1.0, -0.9] }, fov: 40, lens: { focus: 1.8, blur: 6 } },
    ] as MemoryShot[],
    lines: [
      { at: 0.8, seconds: 3.6, text: 'You were ten. A Sunday supper, the four of us.' },
      { at: 4.8, seconds: 4.0, text: 'Gaspard had been to the bank that week. He’d been doing sums.' },
      { at: 9.4, seconds: 5.0, text: '“Your cartridges are money asleep, Félix. Sell them while they’re worth something.”' },
      { at: 15.2, seconds: 3.8, text: 'Félix never raised his voice. He just stood up.' },
      { at: 19.6, seconds: 3.6, text: '“They’re not money. They’re for the kid.”' },
      { at: 23.8, seconds: 3.8, text: 'You didn’t look up from your game. But you heard. I saw you hear.' },
      { at: 28.4, seconds: 4.4, text: 'Gaspard never forgot that night. He waited. He was always good at waiting.' },
    ] as MemoryLine[],
    /** Back in the room: by the table, turned to her. */
    after: { at: [0.6, 0.9] as Vec2 },
  },
};
