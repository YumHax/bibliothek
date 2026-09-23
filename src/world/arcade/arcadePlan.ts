import type { RoomOptions } from '../Room';
import type { Placement } from '../Placement';
import type { DecorEntry } from '../props/decor';
import type { TiledWainscotOptions } from '../props/TiledWainscot';
import type { BrowseSpot } from '../people/Shopper';
import type { ArcadeGameId } from './games';
import type { PinballOptions } from './Pinball';
import type { ClawMachineOptions } from './ClawMachine';
import type { ChangeMachineOptions } from './ChangeMachine';

/*
 * THE ARCADE PLAN: a dim hall reached by teleport from the flat's front door (see `worldPlan.ts`,
 * `travel`). Zone-local coordinates, origin at the centre of the floor. Walls as named from the
 * arrival spot: the exit door is on the front wall (+z), the cabinets stand shoulder to shoulder
 * along the back wall (-z) under the ARCADE neon, the prize counter against the right wall (+x)
 * with its attendant behind it, the pinball and the change machine against the left wall (-x),
 * the claw machine by the counter. A nineties arcade: black neon-confetti carpet, dark tiled
 * dado, aubergine walls, a black ceiling with neon tubes along the tops of the walls, the house
 * lights off. Someone is on the pinball, someone at the claw, and a kid wanders between them.
 */

export interface CabinetPlan {
  at: Placement;
  game: ArcadeGameId;
  color: number;
  glow: number;
}

/** Someone standing at a machine, playing it: their lines, their look. */
export interface PlayerPlan {
  lines: string[];
  seed: number;
}

/** 8 x 6 m under a 3 m ceiling, no windows, no doorways: the only way in or out is the teleport. */
export const ARCADE_ROOM: RoomOptions = {
  width: 8,
  depth: 6,
  height: 3,
  opaqueWalls: ['front', 'back', 'left', 'right'],
  finish: { floor: 'carpet', walls: 0x2b2438, ceiling: 0x120f18, trim: 0x15121c, moulding: false },
};

/** The cabinets stand this far off the back wall (half their depth plus a hair). */
const CABINET_OFF_WALL = 0.42;
/** x of the four cabinets, shoulder to shoulder (0.66 wide, a hand's width between). */
const CABINET_X = [-1.35, -0.45, 0.45, 1.35];
/** The exit door's leaf plus its architrave, left untiled. */
const DOOR_GAP = 0.83 + 2 * 0.07 + 0.04;

export const ARCADE_PLAN = {
  room: ARCADE_ROOM,

  /** Where the teleport sets the player down: just inside the exit door, facing the hall (-z). */
  arrival: { at: [0, 2.1] as [number, number], yaw: 0 },

  /** The way out, on the front wall; clicking it offers the other destinations. */
  exit: { wall: 'front', along: 0, y: 0 } as Placement,

  /** The house lights, off by default: an arcade lives on its screens' glow and its neon. */
  light: { ceiling: [0, 0.6] } as Placement,
  /** How much of the daylight ambient the hall keeps (no windows, but pitch black would be unplayable). */
  skylight: 0.3,

  /** Black glazed tiles to hip height round the hall, a magenta row on top; it stops either side of the exit door. */
  wainscot: {
    height: 0.95,
    tile: 0x17161f,
    grout: 0x2a2833,
    accent: 0x8a2f6f,
    variance: 0.02,
    roughness: 0.3,
    openings: [{ wall: 'front', along: 0, width: DOOR_GAP }],
  } as TiledWainscotOptions,

  /** Four cabinets in a row along the back wall, facing the hall, one game each. */
  cabinets: [
    { at: { wall: 'back', along: CABINET_X[0]!, y: 0, offset: CABINET_OFF_WALL }, game: 'breakout', color: 0x8f2f4f, glow: 0xffb3c6 },
    { at: { wall: 'back', along: CABINET_X[1]!, y: 0, offset: CABINET_OFF_WALL }, game: 'invaders', color: 0x2f4f8f, glow: 0x9ad6ff },
    { at: { wall: 'back', along: CABINET_X[2]!, y: 0, offset: CABINET_OFF_WALL }, game: 'stacker', color: 0x2f8f5f, glow: 0xa8ffcf },
    { at: { wall: 'back', along: CABINET_X[3]!, y: 0, offset: CABINET_OFF_WALL }, game: 'arrows', color: 0x8f6f2f, glow: 0xffe3a8 },
  ] as CabinetPlan[],

  /** The prize counter against the right wall, facing the hall (-x), pulled off the wall so the attendant can stand behind it (`wallBehind` keeps the sign on the wall). */
  counter: { at: { wall: 'right', along: 0.4, y: 0, offset: 0.97 } as Placement, wallBehind: 0.67 },

  /** The hall of fame on the left wall, over the pinball's end. */
  scoreBoard: { wall: 'left', along: 0.55, y: 1.7 } as Placement,

  /** The pinball against the left wall, its backbox to the wall, the player's end towards the hall. */
  pinball: {
    at: { wall: 'left', along: -1.0, y: 0, offset: 0.7 } as Placement,
    options: { title: 'METEOR ALLEY', color: 0x3a1f5c, accent: 0xff8a2a, seed: 3 } as PinballOptions,
    player: { seed: 7, lines: ["Don't. Talk. Multiball.", 'Ball three. Do not jinx it.', 'I had the high score on this once. For a day.'] } as PlayerPlan,
  },

  /** The claw machine on the right wall, past the counter. */
  claw: {
    at: { wall: 'right', along: 2.0, y: 0, offset: 0.42 } as Placement,
    options: { color: 0xd23a6a, seed: 4 } as ClawMachineOptions,
    player: { seed: 12, lines: ["It's rigged. I know it's rigged.", 'One more go and that bear is mine.', 'It opens right over the chute. Every time.'] } as PlayerPlan,
  },

  /** The dead change machine on the left wall by the way in. */
  changeMachine: {
    at: { wall: 'left', along: 1.9, y: 0, offset: 0.26 } as Placement,
    options: {} as ChangeMachineOptions,
  },

  /** The people: the attendant behind the counter, a player at each machine (placed by the builder in the machines' frames), a kid drifting between them. */
  crowd: {
    /** Where the attendant stands, counter-local (behind it, off-centre by the coin bowl), and where they look when nobody is about (the bowl). */
    attendant: {
      at: [0.25, -0.6] as [number, number],
      focus: [0.25, 1.05, 0.65] as [number, number, number],
      seed: 5,
      lines: [
        'Tickets for coins, that is the deal. The prizes are for show.',
        'The pinball tilts. The claw is a thief. The cabinets are honest.',
        'Sky Stack is the earner, if you have the eye for it.',
        'The change machine has been dead a month. Do not put a note in it.',
        'Beat the board and I will pretend to be impressed.',
        'Free play if you are broke. The house is soft like that.',
      ],
    },
    /** The kid: walks the middle of the hall, stops to watch over shoulders and read the board. */
    wanderers: 1,
    aisle: { x: [-2.4, 2.6] as [number, number], z: 0.7 },
    browseSpots: [
      { at: [-1.75, -1.0], yaw: -Math.PI / 2 }, // behind the pinball player
      { at: [2.2, 1.6], yaw: Math.PI / 2 }, // beside the claw player
      { at: [-3.0, 0.55], yaw: -Math.PI / 2 }, // reading the hall of fame
      { at: [0.45, -0.9], yaw: Math.PI }, // watching the cabinets from behind
    ] as BrowseSpot[],
  },

  decor: [
    // Neon: the hall's name over the cabinets, INSERT COIN over the way out, tubes along the tops of the walls.
    { kind: 'neonSign', at: { wall: 'back', along: 0, y: 2.5 }, options: { text: 'ARCADE', color: 0xff2fa0, width: 2.6, height: 0.55, intensity: 4, seed: 1 } },
    { kind: 'neonSign', at: { wall: 'front', along: 0, y: 2.55 }, options: { text: 'INSERT COIN', color: 0x33e0ff, width: 1.5, height: 0.34, intensity: 2.5, seed: 2 } },
    { kind: 'neonTube', at: { wall: 'left', along: 0, y: 2.9 }, options: { length: 5.6, color: 0xff2fa0, intensity: 3 } },
    { kind: 'neonTube', at: { wall: 'right', along: 0, y: 2.9 }, options: { length: 5.6, color: 0x33e0ff, intensity: 3 } },
    { kind: 'neonTube', at: { wall: 'back', along: 0, y: 2.92 }, options: { length: 7.6, color: 0xb05cff } },

    // Notices taped up round the hall.
    { kind: 'flyer', at: { wall: 'front', along: -1.7, y: 1.8 }, options: { title: 'TOURNAMENT', lines: ['saturday 8 pm', 'brick storm · star raid', 'winner takes the board'], accent: 0x8a2f6f, seed: 21 } },
    { kind: 'flyer', at: { wall: 'front', along: 2.0, y: 1.75 }, options: { title: 'NO REFUNDS', lines: ['tokens only', 'the machines eat coins', 'not us'], accent: 0xc8443a, seed: 22 } },
    { kind: 'flyer', at: { wall: 'right', along: -1.7, y: 1.75 }, options: { title: 'PLEASE', lines: ['do not rock', 'the machines', '(they rock back)'], accent: 0x2f6b8f, seed: 23 } },
    { kind: 'flyer', at: { wall: 'left', along: 2.6, y: 1.8 }, options: { title: 'HIGH SCORE?', lines: ['tell the counter', 'get on the board'], accent: 0xe6a83a, ink: 0x3a2a10, seed: 24 } },

    // A tired plant in each front corner, the way every arcade has one.
    { kind: 'plant', at: { corner: 'front-left', inset: 0.45 }, options: { kind: 'yucca', pot: 'ceramic', seed: 31 } },
    { kind: 'plant', at: { corner: 'back-right', inset: 0.5 }, options: { kind: 'fig', pot: 'ceramic', seed: 32 } },
  ] as DecorEntry[],
};
