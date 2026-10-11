import * as THREE from 'three';

/*
 * Where a hand goes when someone touches themselves (`touches` in a gesture): the chin on the
 * knuckles, fingers along the cheek, a rub of the nose, a scratch at the nape, the hands joined in
 * front; and where a pose keeps a hand (`POSE_SPOTS`): a phone at the ear, arms folded, a hand
 * under the other's elbow. Each spot is a point on a bone (the skull's frame for the face and the
 * neck, the pelvis's for the hands joined, the torso's for the arms folded), given for the +x hand in
 * the rig's reference metres (x mirrored for the other: a spot across the body has x < 0), a little
 * off the skin so the palm lies on it; where the elbow goes (the IK's pole) and how the hand is held
 * there. On the torso the depth is an average trunk's: a fuller one moves the spot forward (`forward`).
 * The point is read off the bone as it stood last frame: the arm's springs smooth the lag.
 */

export type TouchSpot = 'chin' | 'cheek' | 'nose' | 'nape' | 'clasp' | 'lips' | 'ear' | 'foldOver' | 'foldUnder' | 'elbowHold';

interface Spot {
  bone: 'skull' | 'pelvis' | 'torso';
  /** The palm's middle, in the bone's frame (reference metres), for the +x hand. */
  at: readonly [number, number, number];
  /** The direction a rub moves the hand (the bone's frame; x mirrored for the other hand). */
  rub: readonly [number, number, number];
  /** Where the elbow goes (`solveArm`'s pole: the shoulder's parent's frame, x outwards). */
  pole: THREE.Vector3;
  /** The hand there: wrist flex, forearm twist, curl (as `ArmAngles`). */
  wf: number;
  tw: number;
  curl: number;
}

export const TOUCH_SPOTS: Record<TouchSpot, Spot> = {
  chin: { bone: 'skull', at: [0.014, -0.142, 0.072], rub: [1, 0, 0], pole: new THREE.Vector3(0.35, -1, 0.35), wf: 0.35, tw: 0.2, curl: 0.65 },
  cheek: { bone: 'skull', at: [0.094, -0.05, 0.058], rub: [0, 1, 0], pole: new THREE.Vector3(0.7, -1, 0.15), wf: 0.15, tw: 0.35, curl: -0.1 },
  nose: { bone: 'skull', at: [0.012, -0.062, 0.148], rub: [1, 0, 0], pole: new THREE.Vector3(0.45, -1, 0.25), wf: 0.25, tw: 0.2, curl: 0.45 },
  nape: { bone: 'skull', at: [0.03, -0.1, -0.122], rub: [1, 0.3, 0], pole: new THREE.Vector3(1, 0.45, 0.25), wf: -0.15, tw: 0.2, curl: 0.35 },
  clasp: { bone: 'pelvis', at: [0.013, -0.05, 0.16], rub: [0, 1, 0], pole: new THREE.Vector3(0.8, -1, -0.35), wf: 0.15, tw: 0.45, curl: 0.45 },
  /** Just in front of the mouth: a cup to the lips, a cigarette's draw (the hand curled round what it holds). */
  lips: { bone: 'skull', at: [0.035, -0.112, 0.168], rub: [0, 1, 0], pole: new THREE.Vector3(0.5, -1, 0.2), wf: 0.1, tw: 0.55, curl: 0.6 },
  /** A phone to the ear: the palm by the jaw (the phone from the ear to the mouth), the elbow forward and out (the ear is too near the shoulder for it to hang). */
  ear: { bone: 'skull', at: [0.125, -0.085, 0.03], rub: [0, 1, 0], pole: new THREE.Vector3(0.6, -0.6, 0.8), wf: 0.2, tw: 0.4, curl: 0.55 },
  /** Arms folded (the torso's frame, from the waist): the forearm in front, its hand over the other arm above the elbow. */
  foldOver: { bone: 'torso', at: [-0.155, 0.25, 0.14], rub: [0, 1, 0], pole: new THREE.Vector3(0.35, -1, 0.55), wf: 0.2, tw: 0.3, curl: 0.45 },
  /** Arms folded: the forearm behind and lower, its hand tucked under the other arm against the ribs. */
  foldUnder: { bone: 'torso', at: [-0.115, 0.21, 0.11], rub: [0, 1, 0], pole: new THREE.Vector3(0.35, -1, 0.45), wf: 0.1, tw: 0.2, curl: 0.35 },
  /** Across the waist, the hand cupping the other arm's elbow (thinking, the chin on the other hand). */
  elbowHold: { bone: 'torso', at: [-0.12, 0.17, 0.16], rub: [0, 1, 0], pole: new THREE.Vector3(0.35, -1, 0.4), wf: 0.2, tw: 0.6, curl: 0.5 },
};

/**
 * The world point the `side` hand (-1 the -x hand, 1 the +x) goes to on `spot`, rubbed `rub` metres across it, into
 * `out`; a spot on the torso comes `forward` metres further out (what this trunk has over an average one).
 */
export function touchPoint(bones: { skull: THREE.Object3D; pelvis: THREE.Object3D; torso: THREE.Object3D }, spot: TouchSpot, side: -1 | 1, rub: number, out: THREE.Vector3, forward = 0): THREE.Vector3 {
  const s = TOUCH_SPOTS[spot];
  const bone = bones[s.bone];
  bone.updateWorldMatrix(true, false);
  out.set(side * (s.at[0] + s.rub[0] * rub), s.at[1] + s.rub[1] * rub, s.at[2] + s.rub[2] * rub + (s.bone === 'torso' ? forward : 0));
  return bone.localToWorld(out);
}
