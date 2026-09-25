/*
 * Arm poses of the `PersonModel`, as joint angles (radians). Each arm hangs along -y from its
 * shoulder pivot; the forearm hangs from the elbow pivot. Rotation about x swings the limb
 * (negative = forward), about z swings it sideways (positive moves the hand towards +x, so with
 * `side` = -1 for the left arm and +1 for the right, `side * k` is outwards and `-side * k`
 * inwards), about y turns a bent forearm across the body. Euler order is YXZ so a forearm can
 * bend (x) and then swing across (y).
 */

export type Pose = 'stand' | 'crossed' | 'hips' | 'think' | 'pockets' | 'play' | 'cheer';

export interface ArmAngles {
  ux: number;
  uz: number;
  lx: number;
  ly: number;
  lz: number;
}

export interface PoseAngles {
  left: ArmAngles;
  right: ArmAngles;
}

const HANG = (side: -1 | 1): ArmAngles => ({ ux: 0, uz: side * 0.08, lx: -0.25, ly: 0, lz: 0 });

export const POSES: Record<Pose, PoseAngles> = {
  stand: { left: HANG(-1), right: HANG(1) },
  // Arms crossed over the chest, right forearm in front of the left.
  crossed: {
    left: { ux: -0.5, uz: -0.15, lx: -1.45, ly: 1.15, lz: 0 },
    right: { ux: -0.68, uz: 0.15, lx: -1.5, ly: -1.15, lz: 0 },
  },
  // Hands on the hips, elbows out.
  hips: {
    left: { ux: 0.05, uz: -0.6, lx: -0.1, ly: 0, lz: 1.3 },
    right: { ux: 0.05, uz: 0.6, lx: -0.1, ly: 0, lz: -1.3 },
  },
  // Right hand at the chin, left arm across the belly holding the elbow.
  think: {
    left: { ux: -0.55, uz: -0.1, lx: -1.5, ly: 1.05, lz: 0 },
    right: { ux: -0.85, uz: 0.05, lx: -2.4, ly: -0.5, lz: 0 },
  },
  // Hands in the front pockets: forearms forward and in, to the hips.
  pockets: {
    left: { ux: 0.1, uz: -0.02, lx: -0.5, ly: 0, lz: 0.35 },
    right: { ux: 0.1, uz: 0.02, lx: -0.5, ly: 0, lz: -0.35 },
  },
  // Both hands forward at waist height, on a control panel: a joystick, a flipper button.
  play: {
    left: { ux: -0.55, uz: -0.05, lx: -0.95, ly: 0.35, lz: 0 },
    right: { ux: -0.55, uz: 0.05, lx: -0.95, ly: -0.35, lz: 0 },
  },
  // Both arms up over the head, a little out: a win.
  cheer: {
    left: { ux: -2.6, uz: -0.35, lx: -0.3, ly: 0, lz: 0 },
    right: { ux: -2.6, uz: 0.35, lx: -0.3, ly: 0, lz: 0 },
  },
};
