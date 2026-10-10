import type { MemoryLine, MemoryShot } from '@/memories/memoryReel';

/*
 * THE KEYS (`MEMORIES` keys, docs/story.md "Mémé"), as data: two scenes, each in its own zone's local metres.
 * At Mémé's (`grandmaFlat`, see grandmaFlatPlan.ts): a Monday afternoon this year, Mémé at the table's back chair
 * with Félix's keys before her, then on her feet holding them out to the player (the camera). On our landing
 * (`stairwell`, see stairwell/stairwellPlan.ts: the landing's strip x -3.54..-1.5, z -1.76..-0.46, its floor at
 * local y 16.3; the flat's front door in the hallway's wall at x -3.6, its middle at z -1.11): the push in to the
 * door, the last line the opening's own. Numbers copied, never imported (another zone's plan).
 */

type Vec2 = [number, number];

/** Our landing's floor, local to the stairwell, and an eye over it (m). */
const LANDING = 16.3;
const EYE = LANDING + 1.62;

export const KEYS_MEMORY_PLAN = {
  /** At her table: the back chair (as `GRANDMA_FLAT_PLAN.memeDay.table`), the keys on the cloth before her. */
  seated: { at: [1.35, -0.92] as Vec2, yaw: 0, seat: 0.47 },
  keysOnTable: { at: [1.32, -0.48] as Vec2, yaw: 0.5 },
  /** On her feet by the table's door end, turned to the player; her hands out at this height, this far before her. */
  standing: { at: [0.02, -0.82] as Vec2, yaw: 0 },
  hands: { y: 1.02, ahead: 0.3, apart: 0.07 },
  /** She gets up in the black of the cut to the third shot. */
  standAt: 16.5,
  /** Her face on the keys, then up at the player. */
  lookUpAt: 19.2,
  shots: {
    flat: [
      // The room from the landing door: her at the table, the afternoon in the window, the keys before her.
      { from: 2.5, to: 9.5, camera: { from: [-1.65, 1.55, -1.55], to: [-1.25, 1.5, -1.3], lookFrom: [1.35, 0.92, -0.65], lookTo: [1.35, 0.9, -0.6] }, fov: 50, lens: { focus: 3.0, blur: 3 } },
      // The keys on the cloth, her hands either side.
      { from: 9.5, to: 16.5, camera: { from: [0.95, 1.12, 0.12], to: [1.05, 1.06, 0.02], lookFrom: [1.32, 0.78, -0.48], lookTo: [1.32, 0.77, -0.5] }, fov: 38, lens: { focus: 0.68, blur: 8 } },
      // The player's eyes: her on her feet, the keys held out.
      { from: 16.5, to: 24, camera: { from: [0.06, 1.64, 0.42], to: [0.05, 1.62, 0.2], lookFrom: [0.02, 1.08, -0.5], lookTo: [0.02, 1.42, -0.8] }, fov: 46, lens: { focus: 0.85, focusTo: 1.05, blur: 6 } },
    ] as MemoryShot[],
    landing: [
      // Our landing, the timer light on, the push in to the oxblood door.
      { from: 24, to: 31.5, camera: { from: [-1.72, EYE, -0.78], to: [-2.42, EYE - 0.02, -0.98], lookFrom: [-3.6, LANDING + 1.4, -1.11], lookTo: [-3.6, LANDING + 1.25, -1.11] }, fov: 50, lens: { focus: 1.9, focusTo: 1.2, blur: 4 } },
      // Close on the door, still: the lock at hand's height.
      { from: 31.5, to: 38.5, camera: { from: [-2.78, LANDING + 1.52, -0.84], to: [-2.88, LANDING + 1.48, -0.9], lookFrom: [-3.6, LANDING + 1.12, -1.28], lookTo: [-3.6, LANDING + 1.06, -1.32] }, fov: 40, lens: { focus: 0.85, blur: 7 } },
    ] as MemoryShot[],
  },
  lines: [
    { at: 0.8, seconds: 4.2, text: 'Félix gave me his keys years ago. “For the kid,” he said. “If anything happens.”' },
    { at: 5.4, seconds: 4.0, text: 'When it happened, Gaspard said not to bother you. He’d see to everything.' },
    { at: 9.8, seconds: 4.2, text: 'I kept them in my handbag. I thought there was time.' },
    { at: 14.4, seconds: 3.4, text: 'I didn’t ask. I should have asked.' },
    { at: 18.2, seconds: 2.8, text: 'I gave them to you on the Monday.' },
    { at: 21.2, seconds: 2.6, text: 'The sale was on the Sunday.' },
    { at: 25.4, seconds: 4.4, text: 'You stood on that landing a long time before you opened the door.' },
    { at: 30.4, seconds: 3.6, text: 'A day late. That’s all it was. One day.' },
    { at: 34.4, seconds: 3.8, text: 'By the time you got the keys…' },
  ] as MemoryLine[],
  /** Back in her room: by the table, turned to her. */
  after: { at: [0.6, 0.9] as Vec2 },
};
