import * as THREE from 'three';
import { ANKLE_Y, BALL_Z, FOREARM_L, HEEL_Z, SHIN_L, THIGH_L, UPPER_ARM_L } from '../body';

/*
 * Two-bone inverse kinematics for the rig (reference metres, before the person's scale):
 *
 * - a leg puts its ankle on a point (the pelvis's frame), the knee bending forward and a little out;
 *   the foot is then turned to lie at a pitch and a heading of its own whatever the leg does, so a
 *   planted foot stays flat on the floor while the hips move over it;
 * - a foot that rolls turns about its heel (toes up, a heel strike) or the ball of the foot (heel
 *   up, pushing off), which is where its ankle has to be (`ankleOver`);
 * - an arm puts the middle of its palm on a world point, the elbow falling out, down and behind.
 */

const V = new THREE.Vector3();
const W = new THREE.Vector3();
const Q = new THREE.Quaternion();
const Q2 = new THREE.Quaternion();
const E = new THREE.Euler();
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);

/**
 * Aims the leg whose hip joint is `hip` (its position the joint, in the pelvis's frame) so the
 * ankle reaches `target` (the pelvis's frame): the thigh's turn, the knee's bend, the knee turned
 * out by `kneeOut` (radians about the leg's line, signed by side). Out of reach, the leg is straight
 * towards it; returns by how much it falls short (0 when it reaches).
 */
export function solveLeg(hip: THREE.Object3D, knee: THREE.Object3D, target: THREE.Vector3, kneeOut: number): number {
  const d = V.copy(target).sub(hip.position);
  const reach = THIGH_L + SHIN_L - 0.002;
  const length = d.length();
  const D = THREE.MathUtils.clamp(length, 0.15, reach);
  const u = d.normalize();
  const interior = Math.acos(THREE.MathUtils.clamp((THIGH_L * THIGH_L + SHIN_L * SHIN_L - D * D) / (2 * THIGH_L * SHIN_L), -1, 1));
  const forward = Math.acos(THREE.MathUtils.clamp((THIGH_L * THIGH_L + D * D - SHIN_L * SHIN_L) / (2 * THIGH_L * D), -1, 1));
  // -y onto the leg's line (sideways first, then forward or back), turned out about that line, then the thigh forward of it.
  Q.setFromEuler(E.set(Math.atan2(-u.z, -u.y), 0, Math.asin(THREE.MathUtils.clamp(u.x, -1, 1)), 'XYZ'));
  Q2.setFromAxisAngle(u, kneeOut);
  hip.quaternion.copy(Q2).multiply(Q).multiply(Q2.setFromAxisAngle(X, -forward));
  knee.rotation.set(Math.PI - interior, 0, 0);
  return Math.max(0, length - reach);
}

/**
 * Turns the ankle so the foot lies at `pitch` (radians, toes down positive) and `yaw` (its heading
 * in the root's frame) whatever the pelvis (`pelvis`, its turn in the root's frame), hip and knee do.
 */
export function orientFoot(ankle: THREE.Object3D, pelvis: THREE.Quaternion, hip: THREE.Object3D, knee: THREE.Object3D, pitch: number, yaw: number): void {
  Q.copy(pelvis).multiply(hip.quaternion).multiply(knee.quaternion).invert();
  Q2.setFromEuler(E.set(pitch, yaw, 0, 'YXZ'));
  ankle.quaternion.copy(Q).multiply(Q2);
}

/**
 * Where the ankle is (the root's frame) for a foot whose flat position is `flat` (the ankle's, the
 * foot flat on the floor), rolled to `pitch` about its heel (toes up) or its ball (heel up), heading `yaw`.
 */
export function ankleOver(flat: THREE.Vector3, pitch: number, yaw: number, out: THREE.Vector3): THREE.Vector3 {
  const pivot = V.set(0, -ANKLE_Y, pitch < 0 ? HEEL_Z : BALL_Z);
  Q.setFromAxisAngle(Y, yaw);
  const back = W.copy(pivot).negate().applyAxisAngle(X, pitch).applyQuaternion(Q);
  return out.copy(flat).add(pivot.applyQuaternion(Q)).add(back);
}

export interface ArmSolution {
  ux: number;
  uz: number;
  lx: number;
  ly: number;
}

const IK_TARGET = new THREE.Vector3();
const IK_DIR = new THREE.Vector3();
const IK_POLE = new THREE.Vector3();
const IK_UPPER = new THREE.Vector3();
const IK_FORE = new THREE.Vector3();
const IK_TURN = new THREE.Quaternion();
const IK_EULER = new THREE.Euler();

/**
 * The joint angles that put the middle of an arm's palm (`palm` metres past the wrist, the wrist
 * held straight) on `world`: two bones solved by the law of cosines in the plane of shoulder, hand
 * and a pole (`pole`, the shoulder's parent's frame, x signed by side; default out, down and behind,
 * where elbows go), then turned into the rig's angles: the shoulder's swing (x) and spread (z) from
 * the upper arm's direction, the elbow's bend (x) and turn (y) from the forearm's in the upper arm's
 * frame. Out of reach, the arm points straight at it.
 */
export function solveArm(shoulder: THREE.Object3D, side: -1 | 1, world: THREE.Vector3, palm: number, out: ArmSolution, pole?: THREE.Vector3): ArmSolution {
  const parent = shoulder.parent!;
  parent.updateWorldMatrix(true, false);
  const t = parent.worldToLocal(IK_TARGET.copy(world)).sub(shoulder.position);
  const l1 = UPPER_ARM_L;
  const l2 = FOREARM_L + palm;
  const d = THREE.MathUtils.clamp(t.length(), Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.002);
  const dir = IK_DIR.copy(t).normalize();
  const a = Math.acos(THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const p = pole ? IK_POLE.set(side * Math.abs(pole.x), pole.y, pole.z) : IK_POLE.set(side * 0.8, -1, -0.5);
  p.addScaledVector(dir, -p.dot(dir)).normalize();
  const upper = IK_UPPER.copy(dir).multiplyScalar(Math.cos(a)).addScaledVector(p, Math.sin(a));
  // Forearm: from the elbow to the hand's point.
  const fore = IK_FORE.copy(dir).multiplyScalar(d).addScaledVector(upper, -l1).normalize();
  // The upper arm hangs along -y: rotated by (ux, 0, uz) in YXZ order it points (sin uz, -cos uz cos ux, -cos uz sin ux).
  const uz = Math.asin(THREE.MathUtils.clamp(upper.x, -1, 1));
  const ux = Math.atan2(-upper.z, -upper.y);
  fore.applyQuaternion(IK_TURN.setFromEuler(IK_EULER.set(ux, 0, uz, 'YXZ')).invert());
  // The forearm hangs along -y from the elbow: (lx, ly, 0) in YXZ order points (-sin lx sin ly, -cos lx, -sin lx cos ly).
  const lx = -Math.acos(THREE.MathUtils.clamp(-fore.y, -1, 1));
  const ly = -Math.sin(lx) > 1e-4 ? Math.atan2(fore.x, fore.z) : 0;
  out.ux = ux;
  out.uz = uz;
  out.lx = lx;
  out.ly = ly;
  return out;
}
