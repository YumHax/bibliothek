import type { MemoryLine, MemoryShot } from '@/memories/memoryReel';

/*
 * THREE LETTERS (`MEMORIES` arcade, docs/story.md "Mémé"), filmed in the arcade on Front Street as it stands, in its
 * own zone-local metres (`arcade/arcadePlan`: origin at the middle of the floor, the back wall at z -4 with the six
 * cabinets along it, their fronts at about z -3.16, the island at x 0 between z -0.8 and 0.8; numbers copied, never
 * imported). A Saturday afternoon about 2003: the player at fourteen at the space-invaders cabinet (x -0.45), Félix
 * behind their shoulder, two kids watching, a lad on the next cabinet. Shots, people and beats on the film's clock (s).
 */

type Vec2 = [x: number, z: number];

/** The cabinet's screen, where the eyes go (its middle, `cabinetModel` SCREEN_Y). */
const SCREEN: [number, number, number] = [-0.45, 1.36, -3.5];

export const ARCADE_MEMORY_PLAN = {
  screen: SCREEN,
  /** The player at the controls (a regular's spot, 0.6 in front of the panel), facing the screen (-z). */
  teen: { at: [-0.45, -2.98] as Vec2, yaw: Math.PI },
  /** Félix behind their right shoulder, turned to the screen. */
  felix: { at: [-0.02, -2.32] as Vec2, yaw: Math.atan2(-0.43, -1.18) },
  /** The kids watching from the left, and the lad on the next cabinet (the stacker, x 0.45), seeds for their looks. */
  watchers: [
    { at: [-1.15, -2.35] as Vec2, yaw: Math.atan2(0.7, -1.15), seed: 2031, pose: 'pockets' as const },
    { at: [-1.5, -2.75] as Vec2, yaw: Math.atan2(1.05, -0.75), seed: 2032, pose: 'crossed' as const },
  ],
  neighbour: { at: [0.45, -2.98] as Vec2, yaw: Math.PI, seed: 2033, screen: [0.45, 1.36, -3.5] as [number, number, number] },

  /** The beats: the record (a hop, Félix's clap and fist), the initials typed in, Félix pointing at them, a last fist. */
  recordAt: 16.6,
  felixClapAt: 17.1,
  watcherClapAt: 17.5,
  felixPumpAt: 18.6,
  initialsFrom: 19.4,
  felixPointAt: 21.2,
  neighbourLookAt: 17.3,
  felixNudgeAt: 24.6,
  teenPumpAt: 26.4,

  shots: [
    // The hall: from the way in, past the island, to the cabinets along the back wall.
    { from: 2.5, to: 9.5, camera: { from: [1.6, 1.7, 1.6], to: [1.25, 1.65, 1.25], lookFrom: [-0.3, 1.2, -3.2], lookTo: [-0.4, 1.2, -3.3] }, fov: 55, lens: { focus: 4.8, blur: 2 } },
    // The player's face in the screen's glow, from between the two cabinets.
    { from: 9.5, to: 16.2, camera: { from: [0.04, 1.47, -3.12], to: [0.0, 1.44, -3.05], lookFrom: [-0.45, 1.5, -2.98], lookTo: [-0.45, 1.48, -2.98] }, fov: 44, lens: { focus: 0.6, blur: 6 } },
    // Over Félix's shoulder: the player, the screen, the score going past his.
    { from: 16.2, to: 23.4, camera: { from: [0.55, 1.78, -1.6], to: [0.45, 1.72, -1.75], lookFrom: [-0.45, 1.3, -3.45], lookTo: [-0.45, 1.3, -3.5] }, fov: 48, lens: { focus: 1.9, focusTo: 2.3, blur: 4 } },
    // Félix, beaming.
    { from: 23.4, to: 30.5, camera: { from: [-0.78, 1.55, -2.62], to: [-0.72, 1.55, -2.52], lookFrom: [-0.03, 1.62, -2.33], lookTo: [-0.03, 1.6, -2.33] }, fov: 42, lens: { focus: 0.8, blur: 6 } },
  ] as MemoryShot[],

  lines: [
    { at: 0.8, seconds: 3.6, text: 'You were fourteen. Every Saturday he took you to the arcade on Front Street.' },
    { at: 5.0, seconds: 3.8, text: 'He said it was to get you out of the house. It was to get him out of his.' },
    { at: 9.8, seconds: 4.0, text: 'That machine with the little spaceships. His score had been on it for years.' },
    { at: 14.4, seconds: 2.8, text: 'And then, one Saturday…' },
    { at: 17.6, seconds: 3.8, text: 'You beat it. Three letters at the top of the screen.' },
    { at: 22.0, seconds: 4.4, text: 'He rang me that night. ‘Mum, the kid beat my score.’ Like it was his own.' },
    { at: 26.8, seconds: 3.4, text: 'He stood behind you the whole time. He never could keep quiet.' },
  ] as MemoryLine[],
};
