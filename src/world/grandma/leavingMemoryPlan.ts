import type { MemoryLine, MemoryShot } from '@/memories/memoryReel';

/*
 * THE LAST WEDNESDAY (`MEMORIES` leaving, docs/story.md "Mémé"), filmed in Félix's flat as the opening shows it (the
 * collection room, `living`), in its own zone-local metres (`roomPlan`: origin at the middle of the floor, 6 x 6 m;
 * the bookcases along the back wall z -3 from x -1, the door to the hall at x -1.5 on it, the TV armchair at x -1.1,
 * a loft window on the front wall at x 0.3; numbers copied, never imported). About 2007: the player at eighteen, off
 * to study, comes to say goodbye; Félix at his shelves, boxes he has pulled out on the floor, the suitcase by the
 * door. He makes a promise; then, alone, he watches the bus go from the window. Shots, people and beats on the
 * film's clock (s).
 */

type Vec2 = [x: number, z: number];
type Vec3 = [x: number, y: number, z: number];

/** Standing heads (m over the floor), where the two of them look at each other. */
const FELIX_HEAD = 1.62;
const PLAYER_HEAD = 1.64;
const FELIX: Vec2 = [1.0, -2.1];
const PLAYER: Vec2 = [-0.9, -1.7];

export const LEAVING_MEMORY_PLAN = {
  /** Félix at the back wall's shelves, first turned to them, then to the player. */
  felix: { at: FELIX, yaw: Math.PI, shelves: [1.05, 1.3, -2.8] as Vec3, head: FELIX_HEAD },
  /** The player between the door and him, a backpack on, turned to him. */
  player: { at: PLAYER, yaw: Math.atan2(FELIX[0] - PLAYER[0], FELIX[1] - PLAYER[1]), head: PLAYER_HEAD },
  /** Félix alone at the front window, looking down at the street where the bus goes. */
  window: { at: [0.3, 2.45] as Vec2, yaw: 0, street: [0.9, 0.4, 6.0] as Vec3 },
  /** The player's suitcase lying by the door. */
  suitcase: { at: [-1.95, -1.95] as Vec2, yaw: 0.3, color: 0x2f3f52 },
  /** The boxes he pulled off the shelves to show them, on the floor (clear of the lamps, the seats and the walkway). */
  crates: [
    { at: [0.8, -1.3] as Vec2, yaw: 0.2, stack: 2, label: 'TO SORT', seed: 71 },
    { at: [2.1, -1.5] as Vec2, yaw: -0.35, stack: 1, label: 'MD', seed: 72 },
    { at: [-1.65, 1.95] as Vec2, yaw: 0.4, stack: 1, label: 'GB', seed: 73 },
  ],

  /** The beats: Félix turns to them, points (yours), the player rubs their neck then nods (the promise); his glasses, a sigh, a nod; at the window, a small wave. */
  felixTurnsAt: 9.9,
  felixPointAt: 11,
  playerShyAt: 13,
  playerNodAt: 14.8,
  felixGlassesAt: 18,
  felixSighAt: 20.6,
  felixNodAt: 22.4,
  /** The cut to the window (the player gone, Félix at the glass): the third shot's end. */
  windowFrom: 24,
  felixWaveAt: 26.2,
  felixLastSighAt: 29.5,

  shots: [
    // The room at dusk from the TV corner: the boxes out on the floor, Félix at his shelves, the player by the door.
    { from: 2.5, to: 9.5, camera: { from: [-2.15, 1.6, 1.45], to: [-1.9, 1.55, 1.2], lookFrom: [1.1, 1.1, -2.2], lookTo: [0.95, 1.05, -2.1] }, fov: 55, lens: { focus: 3.6, blur: 3 } },
    // The two of them, side on: the promise.
    { from: 9.5, to: 17, camera: { from: [-0.1, 1.5, -0.45], to: [0.0, 1.48, -0.62], lookFrom: [0.05, 1.45, -1.95], lookTo: [0.08, 1.42, -1.95] }, fov: 46, lens: { focus: 1.45, blur: 5 } },
    // Félix, close.
    { from: 17, to: 24, camera: { from: [0.2, 1.6, -1.3], to: [0.32, 1.6, -1.42], lookFrom: [1.0, FELIX_HEAD - 0.04, -2.1], lookTo: [1.0, FELIX_HEAD - 0.04, -2.1] }, fov: 40, lens: { focus: 1.1, blur: 6 } },
    // Alone at the window, from behind him in the room.
    { from: 24, to: 32, camera: { from: [-0.55, 1.55, 0.75], to: [-0.42, 1.5, 1.0], lookFrom: [0.32, 1.4, 2.95], lookTo: [0.3, 1.38, 2.95] }, fov: 50, lens: { focus: 1.9, focusTo: 1.75, blur: 4 } },
  ] as MemoryShot[],

  lines: [
    { at: 0.8, seconds: 3.8, text: 'The last Wednesday before you went off to study. You were eighteen.' },
    { at: 5.0, seconds: 4.0, text: 'He’d pulled half the boxes off the shelves to show you. Again.' },
    { at: 10.0, seconds: 4.2, text: 'He said: when you’re settled, half of these are yours.' },
    { at: 14.6, seconds: 3.6, text: 'You promised to come back every holiday.' },
    { at: 18.6, seconds: 4.4, text: 'He slipped a cartridge in your bag for the train. He never told me which.' },
    { at: 24.8, seconds: 3.8, text: 'He didn’t go down to the stop. He hated goodbyes.' },
    { at: 28.8, seconds: 3.0, text: 'He watched you go from up there instead.' },
  ] as MemoryLine[],

  /** Back at Mémé's: standing by her table (`grandmaFlatPlan`, as after Christmas), turned to her. */
  after: { at: [0.6, 0.9] as Vec2 },
};
