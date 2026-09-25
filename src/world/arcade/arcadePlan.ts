import type { RoomOptions } from '../Room';
import type { Placement } from '../Placement';
import type { DecorEntry } from '../props/decor';
import type { TiledWainscotOptions } from '../props/TiledWainscot';
import type { ArcadeGameId } from './games';
import type { PinballOptions } from './Pinball';
import type { ClawMachineOptions } from './ClawMachine';
import type { AlleyRollerOptions } from './AlleyRoller';
import type { HangoutSpot, NavNode } from './ArcadeCrowd';

/*
 * THE ARCADE PLAN: a dim hall reached by teleport from the flat's front door (see `worldPlan.ts`,
 * `travel`). Zone-local coordinates, origin at the centre of the floor: x from -6 (left) to 6,
 * z from -4 (back) to 4 (front, the way in). Walls as named from the arrival spot:
 *
 *   back   (-z)  six cabinets shoulder to shoulder under the ARCADE neon: LEXIPUNK (its game in
 *                the big frame), the four classics, PADDLE WARS (two players) at the right end
 *   centre       an island of two cabinets back to back (x 0, z -0.8..0.8), a mirror pillar either
 *                side of it (x +-1.9, z -0.2), the mirror ball over it; NEON SHERIFF (light gun)
 *                at x -3.4 and STEP BEAT (dance pad in front) at x 3.4, both facing the way in
 *   left   (-x)  the pinball (backbox to the wall, z -2.6), HOOP FEVER along the wall (hoop at the
 *                back, played from z 0.9), the hall of fame (z 1.7), the change machine (z 2.9)
 *   right  (+x)  the ball alley along the wall (target end at the back, played from z -1.2), the
 *                prize counter (z 0.65..2.15) with the attendant behind it
 *   front  (+z)  the exit door (x 0), the challenge board (x -1.6), the weekly league (x -3.2), the
 *                jukebox (x -4.6), the claw machine (x 2), the ticket wheel (x 3.6)
 *
 * A nineties arcade: black neon-confetti carpet with a neon border, dark tiled dado, aubergine
 * walls, a black ceiling with neon tubes along the tops of the walls, ducts and banners under it,
 * the house lights off. Regulars walk in, play whatever is free and leave (more of them in the
 * evening); a kid watches, and takes player two when the player sits at PADDLE WARS.
 */

export interface CabinetPlan {
  at: Placement;
  game: ArcadeGameId;
  color: number;
  glow: number;
  /** Where a watcher stands, when behind the player's shoulder would be in the way. */
  watchAt?: [x: number, z: number];
  /** Bolted on: the light gun, the dance pad. */
  attachment?: 'gun' | 'pad';
  /** A real light from the screen (the first cabinets have one; the newer ones make do with their glow pool). Default true. */
  glowLight?: boolean;
  /** Stickers, burns and scuffs, 0..1. */
  wear?: number;
}

/** A printed card on a machine that is not a cabinet (the cabinets carry their own): machine-local, facing +z. */
export interface CardPlan {
  at: [x: number, y: number, z: number];
  lines: string[];
}

/** 12 x 8 m under a 3 m ceiling, no windows, no doorways: the only way in or out is the teleport. */
export const ARCADE_ROOM: RoomOptions = {
  width: 12,
  depth: 8,
  height: 3,
  opaqueWalls: ['front', 'back', 'left', 'right'],
  finish: { floor: 'carpet', walls: 0x2b2438, ceiling: 0x120f18, trim: 0x15121c, moulding: false },
};

/** The cabinets stand this far off the back wall (half their depth plus a hair). */
const CABINET_OFF_WALL = 0.42;
/** x of the six cabinets along the back wall, shoulder to shoulder (0.66 wide, a hand's width between). */
const CABINET_X = [-2.25, -1.35, -0.45, 0.45, 1.35, 2.25];
/** The island's two cabinets, back to back: half a cabinet's depth either side of z 0. */
const ISLAND_Z = 0.4;
/** The light-gun and dance cabinets, facing the way in. */
const PAIR_X = 3.4;
const PAIR_Z = -0.9;
/** The exit door's leaf plus its architrave, left untiled. */
const DOOR_GAP = 0.83 + 2 * 0.07 + 0.04;

export const ARCADE_PLAN = {
  room: ARCADE_ROOM,

  /** Where the teleport sets the player down: just inside the exit door, facing the hall (-z). */
  arrival: { at: [0, 3.1] as [number, number], yaw: 0 },

  /** The way out, on the front wall; clicking it offers the other destinations. */
  exit: { wall: 'front', along: 0, y: 0 } as Placement,

  /** The house lights, off by default: an arcade lives on its screens' glow and its neon. */
  light: { ceiling: [0, 0.6] } as Placement,
  /** How much of the ambient the hall keeps (no windows, but pitch black would be unplayable). */
  skylight: 0.3,
  /** No windows, so no time of day: the ambient holds this daylight whatever the clock says. */
  daylight: 0.8,

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

  /** The cabinets: six along the back wall facing the hall, two back to back in the middle, the gun and the dance cabinets either side. One game each. */
  cabinets: [
    { at: { wall: 'back', along: CABINET_X[0]!, y: 0, offset: CABINET_OFF_WALL }, game: 'lexipunk', color: 0x3a1f5c, glow: 0xff2fa0, glowLight: false, wear: 0.1 },
    { at: { wall: 'back', along: CABINET_X[1]!, y: 0, offset: CABINET_OFF_WALL }, game: 'breakout', color: 0x8f2f4f, glow: 0xffb3c6, wear: 0.8 },
    { at: { wall: 'back', along: CABINET_X[2]!, y: 0, offset: CABINET_OFF_WALL }, game: 'invaders', color: 0x2f4f8f, glow: 0x9ad6ff, wear: 0.9 },
    { at: { wall: 'back', along: CABINET_X[3]!, y: 0, offset: CABINET_OFF_WALL }, game: 'stacker', color: 0x2f8f5f, glow: 0xa8ffcf, wear: 0.6 },
    { at: { wall: 'back', along: CABINET_X[4]!, y: 0, offset: CABINET_OFF_WALL }, game: 'arrows', color: 0x8f6f2f, glow: 0xffe3a8, wear: 0.7 },
    { at: { wall: 'back', along: CABINET_X[5]!, y: 0, offset: CABINET_OFF_WALL }, game: 'duel', color: 0x1f3f6f, glow: 0x63b3ff, glowLight: false, wear: 0.5, watchAt: [1.6, -2.3] },
    { at: { floor: [0, ISLAND_Z], rotationY: 0 }, game: 'snake', color: 0x1f6f5a, glow: 0x39ff9e, watchAt: [0.6, 1.8], wear: 0.3 },
    { at: { floor: [0, -ISLAND_Z], rotationY: Math.PI }, game: 'comets', color: 0x5a2f8f, glow: 0xd0a8ff, watchAt: [-0.6, -1.8], wear: 0.3 },
    { at: { floor: [-PAIR_X, PAIR_Z], rotationY: 0 }, game: 'sheriff', color: 0x5c1f1f, glow: 0xff8a3a, attachment: 'gun', glowLight: false, watchAt: [-2.5, 0.3], wear: 0.4 },
    { at: { floor: [PAIR_X, PAIR_Z], rotationY: 0 }, game: 'stepbeat', color: 0x2a1f5c, glow: 0xff7ad9, attachment: 'pad', glowLight: false, watchAt: [2.3, 0.8], wear: 0.4 },
  ] as CabinetPlan[],

  /** The dance pad's centre, in front of its cabinet (cabinet-local z). */
  padCentreZ: 1.0,

  /** The prize counter against the right wall, facing the hall (-x), pulled off the wall so the attendant can stand behind it (`wallBehind` keeps the sign on the wall). */
  counter: { at: { wall: 'right', along: 1.4, y: 0, offset: 0.97 } as Placement, wallBehind: 0.67 },

  /** The hall of fame on the left wall, past the hoops' end. */
  scoreBoard: { at: { wall: 'left', along: 1.7, y: 1.7 } as Placement, width: 1.5, height: 1.0 },
  /** Today's challenge by the way in, and the weekly league next to it. */
  challengeBoard: { wall: 'front', along: -1.6, y: 1.7 } as Placement,
  leagueBoard: { at: { wall: 'front', along: -3.2, y: 1.65 } as Placement, width: 1.1, height: 0.9 },

  /** The pinball against the left wall, its backbox to the wall, the player's end towards the hall. */
  pinball: {
    at: { wall: 'left', along: -2.6, y: 0, offset: 0.7 } as Placement,
    options: { title: 'METEOR ALLEY', color: 0x3a1f5c, accent: 0xff8a2a, seed: 3 } as PinballOptions,
    card: { at: [0.14, 0.79, 0.652], lines: ['HOLD SPACE · PLUNGER', 'A / D · FLIPPERS', 'LIGHT THE LANES'] } as CardPlan,
    medalsAt: [-0.15, 0.79, 0.652] as [number, number, number],
  },

  /** HOOP FEVER along the left wall, the hoop at the back, played from its front end (towards the way in). */
  hoops: {
    at: { floor: [-5.45, -0.4], rotationY: 0 } as Placement,
    options: { title: 'HOOP FEVER', color: 0x1f4fa8 },
    watchAt: [-4.3, 1.4] as [number, number],
    card: { at: [0.1, 0.62, 0.952], lines: ['LOOK TO AIM', 'HOLD SPACE · LET GO', '30 SECONDS'] } as CardPlan,
    medalsAt: [-0.25, 0.62, 0.952] as [number, number, number],
  },

  /** The claw machine on the front wall, right of the door. */
  claw: {
    at: { wall: 'front', along: 2.0, y: 0, offset: 0.42 } as Placement,
    options: { color: 0xd23a6a, seed: 4 } as ClawMachineOptions,
    card: { at: [0.2, 0.62, 0.377], lines: ['WASD · STEER', 'SPACE · DROP', '15 SECONDS'] } as CardPlan,
  },

  /** The ticket wheel on the front wall, right of the claw. */
  wheel: {
    at: { wall: 'front', along: 3.6, y: 0 } as Placement,
    title: 'TICKET WHEEL',
    color: 0x2a0f24,
    watchAt: [2.6, 2.7] as [number, number],
    card: { at: [0.12, 0.55, 0.752], lines: ['SPACE · SPIN', 'PAYS THE SLICE', 'JACKPOT GROWS'] } as CardPlan,
  },

  /** The ball alley along the right wall, its rings at the back, played from its front end. The kid watches from the aisle side. */
  alley: {
    at: { floor: [5.5, -2.5], rotationY: 0 } as Placement,
    options: { title: 'ALLEY ROLL', color: 0xb8202a } as AlleyRollerOptions,
    watchAt: [4.6, -0.6] as [number, number],
    card: { at: [-0.18, 0.5, 1.152], lines: ['A / D · AIM', 'HOLD SPACE · LET GO', 'NINE BALLS'] } as CardPlan,
    medalsAt: [0, 1.5, -1.125] as [number, number, number],
  },

  /** The change machine on the left wall by the way in (it works, some days). */
  changeMachine: { wall: 'left', along: 2.9, y: 0, offset: 0.26 } as Placement,

  /** The jukebox against the front wall, left of the boards. */
  jukebox: { at: { wall: 'front', along: -4.6, y: 0, offset: 0.3 } as Placement, color: 0x5a1a14, startStation: 0 },

  /** The people: the attendant behind the counter, regulars coming and going, a kid who watches. */
  crowd: {
    /** Where the attendant stands, counter-local (behind it, off-centre by the coin bowl), and where they look when nobody is about (the bowl). */
    attendant: {
      at: [0.25, -0.6] as [number, number],
      focus: [0.25, 1.05, 0.65] as [number, number, number],
      seed: 5,
      lines: [
        'Tickets for prizes, or for coins. Your call.',
        'The pinball is honest. The claw is a thief. The cabinets are somewhere in between.',
        'The change machine works about one day in four. Do not ask me which.',
        'Beat the board and I will pretend to be impressed.',
        'Free play if you are broke. The house is soft like that.',
        'The alley pays for the corner pockets. Everybody goes for the corner pockets.',
        'The wheel is pure luck. So is life. Spin it.',
        'Come back every day. The streak pays. I do not make the rules. I do, actually.',
        'Medals on every machine. Bronze, silver, gold. Collect them all, apparently.',
      ],
    },
    /** Regulars: how many there are, their initials on the board, and how many may be in at once by the hour of the day. */
    regulars: {
      count: 4,
      seeds: [7, 12, 19, 31],
      names: ['VIC', 'JIN', 'ROX', 'ZED'],
      /** From this hour on, at most this many regulars inside: quiet mornings, a full house in the evening. */
      byHour: [[0, 1], [9, 1], [13, 2], [17, 3], [23, 2]] as [hour: number, max: number][],
    },
    /** Things a regular says when clicked. */
    regularLines: ["Don't talk to me mid-run.", 'I come here every Thursday. Is it Thursday?', 'Watch the fourth wave. It speeds up.', 'The pinball left flipper is soft. Everyone knows.', 'My initials are on three boards. Four by tonight.', 'The hoop moves after ten. Nobody tells you that.'],
    /** What a regular says when their score lands on the hall of fame. */
    boardLines: ['On the board!', 'Top five, baby!', 'Write that down.', 'Still got it.'],
    kid: {
      seed: 23,
      lines: ["I'm watching. Don't mind me.", 'My mum works here. Kind of.', 'Sky Stack is my favourite. I never get past row nine.', "Beat the ACE on the board and I'll tell everyone.", 'Paddle Wars? I am player two. Always.'],
    },
    /** The hall's walkable graph: straight, clear lines between these points. */
    nav: [
      { id: 'door', at: [0, 3.6], links: ['entry'] },
      { id: 'entry', at: [0, 2.7], links: ['door', 'frontLeft', 'frontRight', 'islandFront'] },
      { id: 'islandFront', at: [0, 1.6], links: ['entry', 'islandLeft', 'islandRight'] },
      { id: 'frontLeft', at: [-2.2, 2.3], links: ['entry', 'leftCentre', 'leftMid', 'islandLeft'] },
      { id: 'frontRight', at: [2.2, 2.3], links: ['entry', 'rightCentre', 'rightMid', 'islandRight'] },
      { id: 'leftCentre', at: [-3.4, 0.7], links: ['frontLeft', 'leftMid'] },
      { id: 'leftMid', at: [-4.2, 1.2], links: ['frontLeft', 'leftCentre', 'leftBack'] },
      { id: 'leftBack', at: [-4.2, -1.9], links: ['leftMid', 'backLeft'] },
      { id: 'islandLeft', at: [-1.15, 0.5], links: ['frontLeft', 'islandFront', 'islandBackLeft'] },
      { id: 'islandRight', at: [1.15, 0.5], links: ['frontRight', 'islandFront', 'islandBackRight'] },
      { id: 'islandBackLeft', at: [-1.15, -1.7], links: ['islandLeft', 'backLeft'] },
      { id: 'islandBackRight', at: [1.15, -1.7], links: ['islandRight', 'backRight'] },
      { id: 'backLeft', at: [-2.6, -2.3], links: ['leftBack', 'islandBackLeft', 'backCentre'] },
      { id: 'backCentre', at: [0, -2.3], links: ['backLeft', 'backRight'] },
      { id: 'backRight', at: [2.6, -2.3], links: ['backCentre', 'islandBackRight', 'rightBack'] },
      { id: 'rightBack', at: [4.4, -1.6], links: ['backRight', 'rightMid'] },
      { id: 'rightMid', at: [4.3, 0.3], links: ['rightBack', 'rightCentre', 'frontRight'] },
      { id: 'rightCentre', at: [3.4, 1.1], links: ['rightMid', 'frontRight'] },
    ] as NavNode[],
    door: 'door',
    /** Where the kid stands about: reading the hall of fame, at the counter, by the claw, near the island, at the league board. */
    hangouts: [
      { at: [-4.9, 1.7], yaw: -Math.PI / 2, look: [-5.95, 1.7, 1.7] },
      { at: [4.2, 1.4], yaw: Math.PI / 2, look: [5.0, 1.1, 1.4] },
      { at: [1.5, 2.6], yaw: Math.PI * 0.75, look: [2.0, 1.2, 3.58] },
      { at: [-0.9, 2.1], yaw: Math.PI, look: [0, 1.4, 0.8] },
      { at: [-3.2, 3.0], yaw: 0, look: [-3.2, 1.65, 3.95] },
    ] as HangoutSpot[],
  },

  decor: [
    // Neon: the hall's name over the cabinets, INSERT COIN over the way out, tubes along the tops of the walls.
    { kind: 'neonSign', at: { wall: 'back', along: 0, y: 2.5 }, options: { text: 'ARCADE', color: 0xff2fa0, width: 2.6, height: 0.55, intensity: 4, seed: 1 } },
    { kind: 'neonSign', at: { wall: 'front', along: 0, y: 2.55 }, options: { text: 'INSERT COIN', color: 0x33e0ff, width: 1.5, height: 0.34, intensity: 2.5, seed: 2 } },
    { kind: 'neonTube', at: { wall: 'left', along: 0, y: 2.9 }, options: { length: 7.6, color: 0xff2fa0, intensity: 3 } },
    { kind: 'neonTube', at: { wall: 'right', along: 0, y: 2.9 }, options: { length: 7.6, color: 0x33e0ff, intensity: 3 } },
    { kind: 'neonTube', at: { wall: 'back', along: 0, y: 2.92 }, options: { length: 11.6, color: 0xb05cff } },

    // The floor: a neon border woven into the carpet round the hall.
    { kind: 'carpetBorder', at: { floor: [0, 0] }, options: { width: 12, depth: 8, band: 0.22, inset: 0.1 } },
    // Two mirrored columns either side of the island.
    { kind: 'mirrorPillar', at: { floor: [-1.9, -0.2] }, options: { size: 0.5, height: 3, neon: 0xff2fa0 } },
    { kind: 'mirrorPillar', at: { floor: [1.9, -0.2] }, options: { size: 0.5, height: 3, neon: 0x33e0ff } },

    // The ceiling: a mirror ball over the island, banners across the hall, ducts along the sides.
    { kind: 'mirrorBall', at: { ceiling: [0, 0] }, options: { radius: 0.18, drop: 0.5, seed: 7 } },
    { kind: 'hangingBanner', at: { ceiling: [0, 2.1] }, options: { title: 'NEW! STEP BEAT', line: 'and NEON SHERIFF · either side of the island', width: 2.0, height: 0.45, drop: 0.3, color: 0x10263a, ink: 0x39ff9e, accent: 0x33e0ff } },
    { kind: 'hangingBanner', at: { ceiling: [0, -2.0] }, options: { title: 'BEAT THE BOARD', line: 'your initials on the hall of fame', width: 2.0, height: 0.45, drop: 0.35, color: 0x2a0f24, ink: 0xffd23a, accent: 0xff2fa0 } },
    { kind: 'hangingBanner', at: { ceiling: [-3.4, 1.6], rotationY: Math.PI / 2 }, options: { title: 'HOOP FEVER', line: 'thirty seconds · the hoop moves', width: 1.5, height: 0.4, drop: 0.3, color: 0x1a1030, ink: 0xff8a3a, accent: 0xffd23a } },
    { kind: 'duct', at: { ceiling: [-3.0, 0], rotationY: Math.PI / 2 }, options: { length: 7.6, radius: 0.15, drop: 0.3 } },
    { kind: 'duct', at: { ceiling: [3.0, -1.4], rotationY: Math.PI / 2 }, options: { length: 4.0, radius: 0.12, drop: 0.28 } },

    // Notices taped up round the hall.
    { kind: 'flyer', at: { wall: 'front', along: 1.1, y: 1.75 }, options: { title: 'NO REFUNDS', lines: ['tokens only', 'the machines eat coins', 'not us'], accent: 0xc8443a, seed: 22 } },
    { kind: 'flyer', at: { wall: 'right', along: -0.9, y: 1.8 }, options: { title: 'PLEASE', lines: ['do not rock', 'the machines', '(they rock back)'], accent: 0x2f6b8f, seed: 23 } },
    { kind: 'flyer', at: { wall: 'right', along: 0.1, y: 1.75 }, options: { title: 'HIGH SCORE?', lines: ['sign the board', 'with your initials'], accent: 0xe6a83a, ink: 0x3a2a10, seed: 24 } },
    { kind: 'flyer', at: { wall: 'front', along: -0.85, y: 1.7 }, options: { title: 'DAILY', lines: ['one challenge a day', 'see the board', 'beat it, bank it'], accent: 0x8a2f6f, seed: 21 } },
    { kind: 'flyer', at: { wall: 'back', along: -3.6, y: 1.6 }, options: { title: 'MEDALS', lines: ['bronze · silver · gold', 'on every machine', 'tickets for each'], accent: 0xe0995a, seed: 25 } },
    { kind: 'flyer', at: { wall: 'back', along: 3.6, y: 1.6 }, options: { title: 'LEAGUE', lines: ['most tickets this week', 'wins the pennant', 'see the board'], accent: 0x33e0ff, seed: 26 } },

    // A tired plant in each front corner, the way every arcade has one.
    { kind: 'plant', at: { corner: 'front-left', inset: 0.45 }, options: { kind: 'yucca', pot: 'ceramic', seed: 31 } },
    { kind: 'plant', at: { corner: 'front-right', inset: 0.45 }, options: { kind: 'fig', pot: 'ceramic', seed: 32 } },
  ] as DecorEntry[],
};

/** Cabinets whose game can play itself (not LexiPunk, which runs in its frame): what a regular may take and a day may break. */
export const DEMO_CABINETS: readonly string[] = ARCADE_PLAN.cabinets.map((c) => c.game).filter((g) => g !== 'lexipunk');

/** The games that pay tickets and keep a table (every cabinet but LexiPunk, the pinball, the alley, the hoops): what a daily challenge may be set on. */
export const TICKET_GAMES: readonly string[] = [...DEMO_CABINETS, 'pinball', 'alley', 'hoops'];
