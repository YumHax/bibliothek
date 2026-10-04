import type { RoomOptions } from '../Room';
import { STAIRWELL_PLAN, STOREYS, landingY } from '../stairwell/stairwellPlan';

/*
 * THE ATTIC: the building's sixth floor under the slate mansard (our building's roof, `facadeStyle`
 * seed 11: a dressed-stone front with a mansard), the old maids' rooms (chambres de bonne). No stair
 * reaches it any more (the service stair is blocked by a wardrobe); the old lift does, for whoever
 * presses its panel's buttons in the right order. Zone-local metres, origin on the attic's floor
 * under the middle of the zone's box, x as the flat's, z towards Front Street (+z). It stands where
 * it would: over the flat, one storey above our landing, its lift right over the stairwell's.
 *
 *   z  -4 ┌──────────────┬─────────────────────────────────────┬─────────┐
 *         │              │  rooms 1 · 2 (service stair, the WC) │  shaft  │ (courtyard side)
 *     -2.23  collector's ├──door────door──────door──────────────┴──gate──┤
 *         │    room      ║ corridor          ladder ↑ hatch     ║   car   │
 *     -0.83  (x -4.8 ..  ├──door────door──────door──────door────────────┤
 *         │    -1.6)     │  rooms 4 · 5 · 6 · 7                 │         │ (street side)
 *   z   4 └──────────────┴──────────────────────────────────────────────┘
 *       x -4.8          -1.6                                    3.55     4.8
 */

/** The attic's floor: one storey over our landing (the stairwell's `landingY(-1)`, world). */
const FLOOR_Y = STAIRWELL_PLAN.origin[1] + landingY(-1);
/** The stairwell's lift car, its middle in world x / z: the attic's car stands right over it. */
const CAR_WORLD: [number, number] = [STAIRWELL_PLAN.origin[0] + (STAIRWELL_PLAN.car.x0 + STAIRWELL_PLAN.car.x1) / 2, STAIRWELL_PLAN.origin[2] + (STAIRWELL_PLAN.car.z0 + STAIRWELL_PLAN.car.z1) / 2];
/** The car in the attic's frame (its size the stairwell's), and so where the attic stands. */
const CAR_W = STAIRWELL_PLAN.car.x1 - STAIRWELL_PLAN.car.x0;
const CAR_D = STAIRWELL_PLAN.car.z1 - STAIRWELL_PLAN.car.z0;
const CAR_LOCAL: [number, number] = [4.15, -2.23 - CAR_D / 2];

/** The zone's box: the whole floor under the mansard. */
export const ATTIC_ROOM: RoomOptions = { width: 9.6, depth: 8, height: 2.5 };

/** Rectangles on the floor (local x0, x1, z0, z1). */
export interface AtticRect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** A maid's room door on the corridor: its number, where (x), which wall (`back`: courtyard side, facing +z), what a knock gets. */
export interface AtticDoorPlan {
  n: number;
  x: number;
  side: 'back' | 'front';
  /** The hover caption's name after the number ("No 6 · the student"). */
  who?: string;
  /** What a knock gets, in turn. */
  knock: string[];
  /** The student's music is heard behind it (`MusicUpstairs`, the bass the flat hears through its ceiling). */
  music?: boolean;
}

export const ATTIC_PLAN = {
  /** World position of the zone's origin (see `worldPlan.ts`). */
  origin: [CAR_WORLD[0] - CAR_LOCAL[0], FLOOR_Y, CAR_WORLD[1] - CAR_LOCAL[1]] as [number, number, number],
  /** Ceiling over the corridor, and the collector's room's (taller, under the slope). */
  corridorHeight: 2.4,
  roomHeight: 2.5,
  /** The corridor from the lift's gate west to the collector's room. */
  corridor: { x0: -1.6, x1: 4.8, z0: -2.23, z1: -0.83 } as AtticRect,
  /** The lift at the corridor's east end: its car (the stairwell's size), the cage round it, the gate on the corridor's edge. */
  car: { x0: CAR_LOCAL[0] - CAR_W / 2, x1: CAR_LOCAL[0] + CAR_W / 2, z0: CAR_LOCAL[1] - CAR_D / 2, z1: CAR_LOCAL[1] + CAR_D / 2, height: STAIRWELL_PLAN.car.height },
  /** The collector's room at the west end, through its doorway in the corridor's end wall. */
  collectorRoom: { x0: -4.8, x1: -1.6, z0: -4, z1: 4 } as AtticRect,
  doorway: { z: -1.53, width: 0.85, height: 2.04 },
  /** The mansard's steep slope over the collector's room's street wall: from `foot` (m up the wall) to the ceiling, `run` m in. */
  slope: { foot: 1.0, run: 1.0 },
  /** Roof windows in that slope (local x of their middle; size along x, along the slope). */
  skylights: [{ x: -3.9, width: 0.7, length: 0.75 }, { x: -2.5, width: 0.7, length: 0.75 }],
  /** The maids' rooms along the corridor, numbered as the concierge's old ledger has them. */
  doors: [
    { n: 1, x: -0.7, side: 'back', knock: ['Nothing. The keyhole is full of dust.', 'A draught under the door, cold as a cellar.'] },
    { n: 2, x: 1.0, side: 'back', who: 'the old WC', knock: ['The shared WC, from when the maids lived up here. Out of order since 1974, a card says.', 'A cistern drips somewhere behind it.'] },
    { n: 4, x: -0.7, side: 'front', knock: ['Silence. A name card on the door, faded past reading.', 'Pigeons, on the other side of it. Lots of pigeons.'] },
    { n: 5, x: 1.0, side: 'front', knock: ['Locked. Someone has written TEMP. KEEP OUT in pencil.', 'Nobody. A radio crackles faintly, tuned to nothing.'] },
    { n: 6, x: 2.65, side: 'front', who: 'the student', music: true, knock: ['The music stops. “Is that the landlord?” It starts again, louder.', 'A muffled “Not now, I’m mixing!”', '“Are you the one with all the old games downstairs? Cool. Busy, though.”'] },
    { n: 7, x: 4.25, side: 'front', knock: ['Nobody. Under the door, a strip of daylight and a smell of paint.'] },
  ] as AtticDoorPlan[],
  /** The old service stair down, its door behind a wardrobe on the courtyard side. */
  serviceStair: { x: 2.65, label: 'A wardrobe against the old service stair’s door', line: 'Somebody shoved a wardrobe against the service stair years ago. It will not budge, and it is full of something heavy.' },
  /** The roof hatch in the corridor's ceiling, its steel ladder fixed to the street-side wall under it. */
  hatch: { x: 1.83, z: -1.2, width: 0.6, depth: 0.6 },
  /** The bulbs over the corridor (x), a real light at the first, its colour and strength; the collector's room's lamp. */
  bulbs: [0.2, 3.1],
  corridorLight: { x: 1.6, intensity: 2.2, distance: 6.5 },
  roomLight: { at: [-3.2, 0.6] as [number, number], intensity: 3.2, distance: 7 },
  /**
   * The lift's code, pressed on the car's panel by the floors' names (`STAIRWELL_PLAN.floorNames`) one after
   * the other, each within `gap` seconds of the last: the car then climbs past our landing to the attic.
   * Scratched into the car's back panel, half under the mirror (and told round the building as a rumour).
   */
  liftCode: { floors: ['4th', '2nd', '5th', '2nd', '1st', 'G'], gap: 6 },
  /** The ride up past our landing before the view goes dark (m, m/s). */
  climb: { rise: 0.5, speed: 0.28 },
  /** Where one stands in the car on arriving (car-local offset from its middle, towards the gate) and the way one faces (the gate, +z). */
  arrival: { towardGate: 0.15, yaw: Math.PI },
  /** The collector: who he was, his initials on his cabinet's table, the scores he left there (best first). */
  collector: {
    name: 'Albert Vasseur',
    initials: 'ALV',
    scores: [3000, 2600, 2100, 1700, 1300],
  },
  /** His cabinet, against the room's west wall (local x, z; it faces +x into the room). */
  cabinet: { at: [-4.33, 1.4] as [number, number], color: 0x1c2a22, glow: 0x7dffb0 },
  /** What beating his best on it brings, once: his own boxed copy, left in the coin box. */
  prize: { platform: 'nes' as const, title: 'Stadium Events', libretroName: 'Stadium Events (USA)', where: 'Albert Vasseur’s cabinet, in the attic' },
  /** His desk under the skylights with his notebook, the chest under the slope with its four-wheel combination lock. */
  desk: { at: [-3.2, 3.05] as [number, number] },
  chest: {
    at: [-2.2, -3.55] as [number, number],
    /** The combination; the treasure hunt (src/building/hunt) leads to it. */
    code: '1991',
    /** What is in it: a game sealed since he locked it. The hunt may set its own (see docs/zones.md "The attic"). */
    game: { platform: 'snes' as const, title: 'Super Mario World', libretroName: 'Super Mario World (USA)', where: 'Albert Vasseur’s chest, sealed since 1991' },
  },
  /** The sheeted furniture: an armchair and a sofa under dust sheets, a trunk, shelves of dusty boxes (local x, z, yaw). */
  sheeted: [
    { kind: 'armchair', at: [-2.4, 1.6], yaw: -2.4 },
    { kind: 'sofa', at: [-4.25, -1.6], yaw: Math.PI / 2 },
  ] as { kind: 'armchair' | 'sofa'; at: [number, number]; yaw: number }[],
  shelf: { at: [-1.83, -3.0] as [number, number], yaw: -Math.PI / 2, rows: 4, width: 1.6 },
  /** His framed magazine covers on the partition, facing into his room (local z of their middles). */
  covers: [-0.4, 0.7, 2.0],
  /** The old ledger page he kept: read on his desk. */
  notebook: [
    'A. VASSEUR — HIGH SCORES & OTHER THINGS',
    '',
    '12 March 1989. The prototype came in a crate marked SPARE PARTS. Nobody at the factory will miss it. I call it STARFALL.',
    '2 June 1990. 3000. Nobody will ever beat that. Nobody will ever SEE it: the lift is the only way up now, and only I know how to ask it.',
    '24 December 1991. Put the last of the good ones in the chest. Same number as the year. Easy to remember, hard to guess.',
    '',
    'If you are reading this, you found the buttons. Play a round for me.',
  ],
};

/** The floor index of a name on the panel (`STAIRWELL_PLAN.floorNames`), or -1. */
function floorIndex(name: string): number {
  return STAIRWELL_PLAN.floorNames.indexOf(name);
}

/** The lift's code as the floors it presses (0 = our landing … `STOREYS` = the ground floor). */
export const LIFT_CODE: readonly number[] = ATTIC_PLAN.liftCode.floors.map(floorIndex).filter((k) => k >= 0 && k <= STOREYS);
