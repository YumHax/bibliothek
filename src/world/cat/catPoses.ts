import type { CatPose } from './types';

/*
 * The cat's pose table: every posture as a record of joint angles, which `CatModel` blends
 * between (see its header for the rig and the sign of each angle). Pure data.
 */

/** Body-centre height when standing (root y). */
export const ROOT_STAND_Y = 0.17;

/** Every joint of the rig, radians except `rootY` (metres) and `eyes` (0 closed .. 1 open). */
export interface JointAngles {
  rootY: number;
  pitch: number;
  roll: number;
  neck: number;
  headPitch: number;
  headYaw: number;
  ears: number;
  eyes: number;
  tailBase: number;
  /** Extra pitch of every tail segment after the first (curls the tail up or down). */
  tailCurl: number;
  tailYaw: number;
  /** Extra yaw of every tail segment after the first (wraps the tail round the body). */
  tailWrap: number;
  flUpper: number;
  flLower: number;
  frUpper: number;
  frLower: number;
  hlUpper: number;
  hlLower: number;
  hrUpper: number;
  hrLower: number;
}

export type UpperKey = 'flUpper' | 'frUpper' | 'hlUpper' | 'hrUpper';
export type LowerKey = 'flLower' | 'frLower' | 'hlLower' | 'hrLower';

export const STAND: JointAngles = {
  rootY: ROOT_STAND_Y,
  pitch: 0,
  roll: 0,
  neck: 0,
  headPitch: 0,
  headYaw: 0,
  ears: 0.2,
  eyes: 1,
  tailBase: 0.8,
  tailCurl: 0.1,
  tailYaw: 0,
  tailWrap: 0,
  flUpper: 0,
  flLower: 0,
  frUpper: 0,
  frLower: 0,
  hlUpper: -0.25,
  hlLower: 0.5,
  hrUpper: -0.25,
  hrLower: 0.5,
};
export const JOINT_KEYS = Object.keys(STAND) as (keyof JointAngles)[];

function pose(overrides: Partial<JointAngles>): JointAngles {
  return { ...STAND, ...overrides };
}

/** Both legs of a pair. */
function front(upper: number, lower: number): Partial<JointAngles> {
  return { flUpper: upper, flLower: lower, frUpper: upper, frLower: lower };
}
function hind(upper: number, lower: number): Partial<JointAngles> {
  return { hlUpper: upper, hlLower: lower, hrUpper: upper, hrLower: lower };
}

// Body pitch is applied to the whole root, so a leg that must stay vertical in the world gets
// `-pitch`, and the tail's world elevation is `tailBase + pitch`.
const SIT: JointAngles = pose({
  rootY: 0.14,
  pitch: -0.55,
  neck: 0.45,
  ears: 0.15,
  tailBase: 0.45,
  tailCurl: 0,
  tailYaw: 0.6,
  tailWrap: 0.25,
  ...front(0.55, 0),
  ...hind(-0.17, -0.85),
});
const LIE: JointAngles = pose({
  rootY: 0.09,
  neck: 0.1,
  ears: 0.15,
  tailBase: -0.35,
  tailCurl: 0.07,
  tailYaw: 0.4,
  tailWrap: 0.2,
  ...front(-1.25, 0.35),
  ...hind(-1.3, 2.4),
});
export const POSES: Record<CatPose, JointAngles> = {
  stand: STAND,
  sit: SIT,
  lie: LIE,
  sleep: pose({
    rootY: 0.085,
    pitch: 0.05,
    roll: 0.25,
    neck: 0.8,
    headPitch: 0.4,
    headYaw: 0.9,
    ears: -0.1,
    eyes: 0,
    tailBase: -0.3,
    tailCurl: 0.05,
    tailYaw: 1.2,
    tailWrap: 0.3,
    ...front(-1.6, 2.2),
    ...hind(-1.5, 2.4),
  }),
  loaf: pose({
    rootY: 0.085,
    neck: 0.15,
    ears: 0.1,
    eyes: 0.5,
    tailBase: -0.35,
    tailCurl: 0.07,
    tailYaw: 1.0,
    tailWrap: 0.3,
    ...front(-1.2, 2.5),
    ...hind(-1.3, 2.4),
  }),
  stretch: pose({
    rootY: 0.125,
    pitch: 0.45,
    neck: 0.1,
    ears: 0.1,
    eyes: 0.6,
    tailBase: 0.15,
    tailCurl: 0.1,
    ...front(-1.54, 0.05),
    ...hind(-0.45, 0),
  }),
  groom: { ...SIT, neck: 1.1, headYaw: -0.25, eyes: 0.6, ears: 0.1, frUpper: -1.45, frLower: -0.5 },
  eat: pose({
    rootY: 0.15,
    pitch: 0.3,
    neck: 1.3,
    ears: 0.4,
    eyes: 0.8,
    tailBase: -0.1,
    tailCurl: 0.05,
    ...front(-0.4, 1.5),
    ...hind(-0.55, 0.4),
  }),
  drink: pose({
    rootY: 0.15,
    pitch: 0.3,
    neck: 1.15,
    ears: 0.3,
    eyes: 0.9,
    tailBase: -0.2,
    tailCurl: 0.05,
    ...front(-0.4, 1.5),
    ...hind(-0.55, 0.4),
  }),
  scratch: pose({
    rootY: 0.25,
    pitch: -1.05,
    neck: -0.2,
    ears: 0.3,
    eyes: 0.9,
    tailBase: 0.55,
    tailCurl: 0.25,
    ...front(-1.35, -0.3),
    ...hind(0.7, 0.5),
  }),
  crouch: pose({
    rootY: 0.115,
    pitch: 0.05,
    neck: -0.15,
    ears: 0.45,
    tailBase: -0.15,
    tailCurl: 0.02,
    ...front(-1.05, 1.95),
    ...hind(-1.1, 2.0),
  }),
  pounce: pose({
    rootY: 0.2,
    pitch: -0.25,
    neck: -0.1,
    ears: 0.4,
    tailBase: 0.3,
    tailCurl: 0,
    ...front(-1.4, -0.2),
    ...hind(0.9, 0.1),
  }),
};

/** Resting amplitude of the tail-tip sway per pose (radians at the tip). */
export const TAIL_SWAY: Record<CatPose, number> = {
  stand: 0.22,
  sit: 0.22,
  lie: 0.14,
  sleep: 0.03,
  loaf: 0.12,
  stretch: 0.1,
  groom: 0.14,
  eat: 0.2,
  drink: 0.2,
  scratch: 0.1,
  crouch: 0.08,
  pounce: 0.05,
};
