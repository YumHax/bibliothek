import type { RoomOptions } from '../Room';

/*
 * THE CELLARS under the building, reached from the entrance hall's cellar door once the concierge has handed over the
 * key (`building/keys`): a small maze of vaulted brick passages on a grid of `CELL` m cells, zone-local metres, the
 * origin under the middle of the grid, +z towards the stairs up to the hall. Row 0 is the south row, column 0 the
 * west one. In `MAP`, rows from north (top) to south:
 *   S  the foot of the stairs up to the hall (the arrival), open
 *   .  a passage, open
 *   #  solid brick
 *   1..9  a storage box (a closed cell behind a slatted wooden front onto the passage `faces`)
 *
 *   col:  0 1 2 3 4 5 6 7 8
 *   r6    S . . . # 1 # 2 #
 *   r5    # # # . # . # . #
 *   r4    3 . . . . . . . 4
 *   r3    # . # # 5 # # . #
 *   r2    6 . . # . . . . 9
 *   r1    # . # # 7 # # # #
 *   r0    8 . . . . . . # #
 */

/** A grid cell's side (m). */
export const CELL = 1.6;
/** The grid, north row first (see above). */
export const MAP = ['S...#1#2#', '###.#.#.#', '3.......4', '#.##5##.#', '6..#....9', '#.##7####', '8......##'];
export const COLUMNS = 9;
export const ROWS = MAP.length;
/** Heights (m): where the vaults spring from the walls, and their crown over each cell's middle. */
export const SPRING = 2.0;
export const CROWN = 2.45;

/** The middle of cell (c, r) on the floor, zone-local. */
export function cellCentre(c: number, r: number): [x: number, z: number] {
  return [(c - (COLUMNS - 1) / 2) * CELL, (r - (ROWS - 1) / 2) * CELL];
}

/** What the map has at column `c`, row `r` (row 0 the south one); '#' off the grid. */
export function cellAt(c: number, r: number): string {
  if (c < 0 || c >= COLUMNS || r < 0 || r >= ROWS) return '#';
  return MAP[ROWS - 1 - r]![c]!;
}

/** Whether the player may walk cell (c, r). */
export function isOpen(c: number, r: number): boolean {
  const cell = cellAt(c, r);
  return cell === '.' || cell === 'S';
}

export type CellSide = 'north' | 'south' | 'east' | 'west';
export const CELL_SIDES: readonly CellSide[] = ['north', 'south', 'east', 'west'];
export const CELL_STEP: Record<CellSide, [dc: number, dr: number]> = { north: [0, 1], south: [0, -1], east: [1, 0], west: [-1, 0] };

/**
 * The sides of cell (c, r) that are brick (`CellarVaults` builds them, anything hung on a wall goes on one): not
 * towards an open cell from an open one, not a box's own slatted front, not the box front an open cell faces, not
 * the stairs' mouth (the S cell's north). The one answer to "is there a wall here", so nothing hangs in the air.
 */
export function brickSides(c: number, r: number): CellSide[] {
  const here = cellAt(c, r);
  const box = /\d/.test(here) ? CELLAR_PLAN.boxes.find((b) => String(b.n) === here) : undefined;
  return CELL_SIDES.filter((side) => {
    const [dc, dr] = CELL_STEP[side];
    if (isOpen(c, r) && isOpen(c + dc, r + dr)) return false;
    if (box && box.faces === side) return false;
    const faced = CELLAR_PLAN.boxes.find((b) => String(b.n) === cellAt(c + dc, r + dr));
    if (isOpen(c, r) && faced && CELL_STEP[faced.faces][0] === -dc && CELL_STEP[faced.faces][1] === -dr) return false;
    return !(here === 'S' && side === 'north');
  });
}

/**
 * A storage box: its number on the map, the side its slatted front is on (towards the open cell it faces), the name
 * on its tag, and what it holds: `ours` (the flat's, No 5: the key opens its padlock), `open` (abandoned, its door
 * hanging open), else padlocked. A box with `find` holds a carton with one game, once.
 */
export interface StorageBox {
  n: number;
  faces: 'north' | 'south' | 'east' | 'west';
  tag: string;
  state: 'ours' | 'open' | 'locked';
  find?: { line: string };
  /** What a click on its padlock gets when it stays shut. */
  locked?: string;
}

export const CELLAR_PLAN = {
  /** Set down at the foot of the stairs (the S cell), facing east down the first passage (yaw -π/2 looks +x). */
  arrival: { cell: [0, 6] as [number, number], yaw: -Math.PI / 2 },
  /** Back up in the entrance hall: in front of the cellar door (stairwell-local x, z), facing the stairs' way (yaw 0, -z). */
  hallReturn: { at: [-0.8, -1.2] as [number, number], yaw: 0 },
  /** The stairs up to the hall, through the S cell's north wall: their width, steps, the door at the top. */
  stairs: { width: 1.0, steps: 7, rise: 0.19, going: 0.27, label: 'The stairs up to the hall · go up' },
  boxes: [
    { n: 1, faces: 'south', tag: 'MOREAU', state: 'locked', locked: 'Padlocked. Through the slats: jam jars, a sledge, a wedding dress in plastic.' },
    { n: 2, faces: 'south', tag: '—', state: 'open', find: { line: 'An old tenant’s carton, left behind. Under a jumper, a game.' } },
    { n: 3, faces: 'east', tag: 'NGUYEN', state: 'locked', locked: 'Padlocked. Bikes, a pram, a box marked XMAS.' },
    { n: 4, faces: 'west', tag: 'HADDAD', state: 'locked', locked: 'Padlocked. Wine racks, neatly labelled. Of course.' },
    { n: 5, faces: 'north', tag: '5TH · YOU', state: 'ours', find: { line: 'Your box. The previous tenant left a carton: magazines, cables, and a game.' } },
    { n: 6, faces: 'east', tag: 'GIRARD', state: 'locked', locked: 'Padlocked. Fishing rods and a dartboard.' },
    { n: 7, faces: 'north', tag: 'DUBOIS', state: 'locked', locked: 'Padlocked. A freezer hums inside. A big one.' },
    { n: 8, faces: 'east', tag: 'LAMBERT', state: 'open', find: { line: 'The door hangs off its hinge. A carton marked GAMES, soft with damp. One survived.' } },
    { n: 9, faces: 'west', tag: 'ROSSI', state: 'locked', locked: 'Padlocked. Paint tins and a drum kit.' },
  ] as StorageBox[],
  /** Bare bulbs on the timer, in these cells (their wall button beside), and how long they stay lit (s). */
  bulbs: [[1, 6], [3, 4], [1, 2], [6, 4], [5, 2], [3, 0]] as [number, number][],
  timerS: 60,
  /** The boiler room: the dead end at (2, 2): the boiler on its east wall, the main fuse board on its north wall. */
  boiler: { cell: [2, 2] as [number, number] },
  /** Where the rat runs (cells, in order, back and forth), and how often it is seen (s between runs). */
  rat: { path: [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0]] as [number, number][], every: [20, 45] as [number, number] },
  /** Where water drips from the vault (cells). */
  drips: [[4, 0], [7, 4]] as [number, number][],
  /**
   * Named spots the treasure hunt may put a clue on (`huntHook`): `chalk`, a bare patch of brick on the east wall of
   * the dead end at (6, 0) (zone-local middle, the wall faces -x); `box5`, the floor of our box.
   */
  huntSpots: {
    chalk: { at: [4.0 - 0.01, 1.3, -4.8] as [number, number, number], yaw: -Math.PI / 2 },
    box5: { at: [0, 0, 0] as [number, number, number], yaw: 0 },
  },
  /** The torch the concierge's key hangs with: always on down here. */
  torch: { intensity: 7, angle: 0.5, penumbra: 0.55, distance: 10 },
};

/** The zone's box: the grid, the stairs' tunnel, the vaults. */
export const CELLAR_ROOM: RoomOptions = { width: COLUMNS * CELL, depth: ROWS * CELL + 4.6, height: 3.6 };
