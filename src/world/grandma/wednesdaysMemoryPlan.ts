import type { MemoryLine, MemoryShot } from '@/memories/memoryReel';

/*
 * WEDNESDAYS AT FÉLIX'S (`MEMORIES` wednesdays, docs/story.md "Mémé"), filmed in Félix's flat as the opening shows it
 * (the collection room, `living`), in its own zone-local metres (`roomPlan`: origin at the middle of the floor, 6 x 6 m;
 * the bookcases along the back wall z -3, the CRT on its stand against the left wall at x -2.7 facing +x, the TV
 * armchair at x -1.1 facing it, the rug between them; numbers copied, never imported). About 1998: the player at nine
 * on a floor cushion in front of the set, Félix in the armchair behind with a game's manual, the curtains drawn
 * against the glare. Shots, people and beats on the film's clock (s).
 */

type Vec2 = [x: number, z: number];
type Vec3 = [x: number, y: number, z: number];

/** The screen of the set (its middle), where the child's eyes go. */
const SCREEN: Vec3 = [-2.45, 0.85, 0];

export const WEDNESDAYS_MEMORY_PLAN = {
  screen: SCREEN,
  /** The child on a floor cushion on the rug, half a metre from the set, facing it (-x). */
  child: { at: [-1.95, 0.3] as Vec2, yaw: -Math.PI / 2, seat: 0.2 },
  cushion: { width: 0.55, depth: 0.5, thickness: 0.2, color: 0x8f3b3b },
  /** Félix in the TV armchair (`roomPlan` seats[0]), the manual in his hands, and where his eyes go while he reads. */
  felix: { at: [-1.1, 0] as Vec2, yaw: -Math.PI / 2, seat: 0.45, book: [-1.42, 0.78, 0] as Vec3 },
  /** Seated heads (m over the floor): the child's on the cushion, Félix's in the armchair. */
  childHead: 0.72,
  felixHead: 1.12,

  /** The beats: the cartridge blown into (twice), the game on; Félix over the manual, then pointing the way, a clap, a nod. */
  blowAt: 10.6,
  blowAgainAt: 12.1,
  playFrom: 13.4,
  felixGlassesAt: 18.2,
  felixLooksUpAt: 20,
  felixPointAt: 20.8,
  childTurnsAt: 24.2,
  childPumpAt: 24.6,
  felixClapAt: 25.2,
  felixNodAt: 27.4,

  shots: [
    // The room from the front-right corner: the shelves full along the back, the set in the corner, the two of them.
    { from: 2.5, to: 9.5, camera: { from: [1.9, 1.55, 2.1], to: [1.6, 1.5, 1.8], lookFrom: [-1.2, 0.9, -0.9], lookTo: [-1.15, 0.85, -0.8] }, fov: 55, lens: { focus: 3.9, blur: 3 } },
    // The child from beside the set, blowing into the cartridge.
    { from: 9.5, to: 16.5, camera: { from: [-2.3, 0.82, 0.88], to: [-2.26, 0.8, 0.8], lookFrom: [-1.96, 0.7, 0.3], lookTo: [-1.97, 0.68, 0.32] }, fov: 44, lens: { focus: 0.65, blur: 6 } },
    // Félix in his armchair over the manual, low from the set's side.
    { from: 16.5, to: 23.5, camera: { from: [-2.2, 0.95, -0.55], to: [-2.15, 0.95, -0.45], lookFrom: [-1.1, 1.08, 0], lookTo: [-1.12, 1.1, 0.02] }, fov: 44, lens: { focus: 1.2, focusTo: 1.15, blur: 5 } },
    // The two of them from behind his armchair, the set ahead, a slow pull back.
    { from: 23.5, to: 30.5, camera: { from: [0.1, 1.42, 0.75], to: [0.4, 1.5, 0.98], lookFrom: [-2.4, 0.8, 0.12], lookTo: [-2.4, 0.82, 0.1] }, fov: 50, lens: { focus: 2.6, blur: 4 } },
  ] as MemoryShot[],

  lines: [
    { at: 0.8, seconds: 3.8, text: 'No school on Wednesdays, so you spent them at Félix’s.' },
    { at: 5.0, seconds: 4.0, text: 'He drew the curtains so the sun wouldn’t get on the screen.' },
    { at: 9.8, seconds: 4.0, text: 'When a game wouldn’t start, you blew in it. He said it did nothing.' },
    { at: 14.2, seconds: 2.8, text: 'He blew in them too, when you weren’t looking.' },
    { at: 17.4, seconds: 4.2, text: 'He read you the manuals out loud, like bedtime stories.' },
    { at: 22.0, seconds: 3.8, text: 'Every time you got past a hard bit, you turned round to check he’d seen.' },
    { at: 26.2, seconds: 3.8, text: 'He always had. Not once did he miss it.' },
  ] as MemoryLine[],

  /** Back at Mémé's: standing by her table (`grandmaFlatPlan`, as after Christmas), turned to her. */
  after: { at: [0.6, 0.9] as Vec2 },
};
