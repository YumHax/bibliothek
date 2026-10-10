/*
 * THE OPENING, as data (docs/story.md "The opening"): the film's clock in seconds from the click, every shot's camera
 * (world metres; the collection room's zone sits at the world's origin, so these are its own coordinates: back wall
 * -z with the bookcases, the TV on the left wall -x, the windows on the front +z), the words and when they show. The
 * director (`IntroCutscene`) only plays it; a shot moved or a line rewritten is an edit here.
 */

type Vec3 = readonly [x: number, y: number, z: number];

/** A camera move: from `from` to `to` (eased over the shot), looking from `lookFrom` to `lookTo`. */
export interface IntroShot {
  /** When it starts and ends on the film's clock (s). */
  from: number;
  to: number;
  camera: { from: Vec3; to: Vec3; lookFrom: Vec3; lookTo: Vec3 };
  /** Vertical field of view (degrees). */
  fov: number;
  /** Depth of field: the distance in focus (m; pulled to `focusTo` over the shot when given) and the blur beyond it (pixels; 0 sharp). */
  lens: { focus: number; focusTo?: number; blur: number };
}

/** A line of the narration: when it shows (s) and for how long. */
interface IntroLine {
  at: number;
  seconds: number;
  text: string;
}

/** The uncle, as the words name him. */
const UNCLE = 'Félix';

/** The film's beats on its clock (s). */
export const BEATS = {
  /** The cinema bars close in over the black. */
  bars: 0.4,
  /** Out of the black into the dream. */
  dreamIn: 5,
  /** The sale: the first thing goes, the last one gone. */
  saleFrom: 31.2,
  saleTo: 37.6,
  /** Into the black after the sale, and out of it on the morning. */
  dreamOut: 40,
  morningIn: 46,
  /** The eye opens (lying), then sits up. */
  sitUpFrom: 47.2,
  sitUpTo: 50.6,
  /** The title, then "Get up". */
  title: 50.8,
  getUp: 52.6,
} as const;

/** A dip to black between two shots of the dream (s, each way). */
export const CUT_DIP = 0.35;
/**
 * The sale: how long a staged piece takes to shrink away and how far it rises meanwhile (m), how long a row of boxes
 * takes to fade (s), and how long an unbought bookcase waits after its last row started fading (s).
 */
export const VANISH = { piece: 0.85, rise: 0.12, row: 0.7, afterRows: 0.45 } as const;

export const SHOTS: readonly IntroShot[] = [
  // The room: a slow dolly in from the front, between the yucca and the hanging fern, past the armchair and the lamps
  // to the bookcases at the back (clear of the plants' leaves by 20 cm or more all the way).
  {
    from: BEATS.dreamIn,
    to: 14,
    camera: { from: [-1.55, 1.52, 2.45], to: [-1.3, 1.4, 1.85], lookFrom: [1.0, 1.15, -2.7], lookTo: [1.3, 1.0, -2.6] },
    fov: 55,
    lens: { focus: 4.6, blur: 3 },
  },
  // The shelves: close along the back wall, the boxes in focus, the room behind them soft.
  {
    from: 14,
    to: 22,
    camera: { from: [-0.45, 1.28, -1.78], to: [1.95, 1.12, -1.78], lookFrom: [0.15, 1.08, -2.8], lookTo: [2.55, 0.95, -2.8] },
    fov: 42,
    // A pull: the first boxes sharp, then the focus slides to the row the camera is heading for.
    lens: { focus: 0.95, focusTo: 1.3, blur: 7 },
  },
  // The corner: across the room to the TV, the first armchair in the way.
  {
    from: 22,
    to: 29,
    camera: { from: [1.65, 1.28, 1.95], to: [0.95, 1.16, 1.3], lookFrom: [-2.6, 0.95, -0.25], lookTo: [-2.6, 0.9, 0.05] },
    fov: 50,
    lens: { focus: 3.6, blur: 4 },
  },
  // The sale: wide and nearly still, the whole room in view while it empties.
  {
    from: 29,
    to: BEATS.dreamOut,
    camera: { from: [2.25, 1.88, 2.6], to: [2.05, 1.8, 2.4], lookFrom: [-0.15, 0.98, -2.3], lookTo: [-0.25, 0.92, -2.2] },
    fov: 62,
    lens: { focus: 3.8, blur: 2 },
  },
];

/** The morning: lying on the mattress, then sitting up (the pose is the bed's, `wakeUp`). */
export const MORNING = {
  /** Lying: the eye this far below and behind the sitting-up one (m), looking this far up (radians). */
  lyingDrop: 0.36,
  lyingBack: 0.3,
  lyingPitch: 1.2,
  /** Sitting up: a little down at the room, turned a touch towards the door. */
  sittingPitch: -0.06,
  sittingTurn: 0.22,
  fov: 58,
  /** The eyes opening: blurred up close, then clear. */
  lens: { blurred: { focus: 0.3, blur: 9 }, clear: { focus: 3, blur: 0 } },
} as const;

/** The narration, on the bottom bar. */
export const LINES: readonly IntroLine[] = [
  { at: 1.1, seconds: 3.6, text: `My uncle ${UNCLE} collected video games for forty years.` },
  { at: 7.2, seconds: 4.4, text: 'Every shelf full. Every lamp lit.' },
  { at: 15.4, seconds: 4.8, text: 'He left it all to me.' },
  { at: 23.4, seconds: 4.8, text: 'By the time I got the keys…' },
  { at: 30.2, seconds: 5, text: '…the family had sold the lot.' },
  { at: 41.4, seconds: 4.1, text: 'One game was left. It had fallen behind the bookcase.' },
];

/** The title over the morning, and the button that ends the film. */
export const TITLE = {
  name: 'Bibliothek',
  line: `${UNCLE}'s flat, bare walls. Start again, one box at a time.`,
  getUp: 'Get up',
} as const;
