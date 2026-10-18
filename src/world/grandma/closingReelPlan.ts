import type { MemoryLine, MemoryShot } from '@/memories/memoryReel';

/*
 * THE CLOSING REEL (docs/story.md "The end"), as data: three scenes in the collection room (`living`, whose zone sits
 * at the world's origin: the opening's shots, `intro/introPlan.ts`, are its own coordinates, copied here): the flat as
 * the player has made it, the dream of it as Félix had it, then the flat again, wide and still, under the credits.
 */

type Vec2 = [number, number];

export const CLOSING_PLAN = {
  shots: {
    now: [
      // The room as it is: the opening's slow dolly in from the window corner, past the armchair to the bookcases.
      { from: 2.5, to: 10, camera: { from: [-1.55, 1.52, 2.45], to: [-1.3, 1.4, 1.85], lookFrom: [1.0, 1.15, -2.7], lookTo: [1.3, 1.0, -2.6] }, fov: 55, lens: { focus: 4.6, blur: 3 } },
      // Close along the back wall: the boxes the player put there, in focus.
      { from: 10, to: 17, camera: { from: [-0.45, 1.28, -1.78], to: [1.95, 1.12, -1.78], lookFrom: [0.15, 1.08, -2.8], lookTo: [2.55, 0.95, -2.8] }, fov: 42, lens: { focus: 0.95, focusTo: 1.3, blur: 7 } },
    ] as MemoryShot[],
    dream: [
      // His flat as he had it: across the room to the TV, the first armchair in the way.
      { from: 17, to: 24, camera: { from: [1.65, 1.28, 1.95], to: [0.95, 1.16, 1.3], lookFrom: [-2.6, 0.95, -0.25], lookTo: [-2.6, 0.9, 0.05] }, fov: 50, lens: { focus: 3.6, blur: 4 } },
      // Wide and nearly still: every shelf full, every lamp lit.
      { from: 24, to: 31, camera: { from: [2.25, 1.88, 2.6], to: [2.05, 1.8, 2.4], lookFrom: [-0.15, 0.98, -2.3], lookTo: [-0.25, 0.92, -2.2] }, fov: 62, lens: { focus: 3.8, blur: 2 } },
    ] as MemoryShot[],
    again: [
      // The same wide shot on the room as it is now, slower: the credits go over it.
      { from: 31, to: 60, camera: { from: [2.05, 1.8, 2.4], to: [1.85, 1.74, 2.2], lookFrom: [-0.25, 0.92, -2.2], lookTo: [-0.3, 0.9, -2.15] }, fov: 62, lens: { focus: 3.8, blur: 1 } },
    ] as MemoryShot[],
  },
  /** The narration, the player's own voice as in the opening. */
  lines: [
    { at: 0.8, seconds: 4.0, text: 'My uncle Félix collected video games for forty years.' },
    { at: 5.4, seconds: 4.2, text: 'I got there a day late. So I started again, one box at a time.' },
    { at: 11.2, seconds: 4.4, text: 'Every box on these shelves, I carried up those stairs.' },
    { at: 18.4, seconds: 4.2, text: 'Some nights I still see it the way he had it.' },
    { at: 25.4, seconds: 4.0, text: 'Every shelf full. Every lamp lit.' },
    { at: 32.2, seconds: 4.2, text: 'It isn’t his flat any more.' },
    { at: 36.8, seconds: 4.4, text: 'It’s mine. He’d have liked that. Mostly.' },
  ] as MemoryLine[],
  /** The credits after the narration, one line every `creditGap` seconds from `creditsAt`. */
  creditsAt: 41.8,
  creditGap: 2.6,
  creditSeconds: 2.4,
  /** Where the player stands after, in the middle of the room, turned to the shelves (yaw 0 looks along -z). */
  after: { at: [0.3, 0.9] as Vec2, yaw: 0 },
} as const;
