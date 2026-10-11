import type * as THREE from 'three';

/*
 * What the view is framed on: a conversation's subject (the point their words come from and how far
 * above it their face is). `PostFx` focuses the depth of field on it, and the person framed takes a
 * discreet portrait light (`world/people/occlusion`). Also the frame's key: the scene luminance that
 * reads as middle grey after the eye's exposure, so a light added for the camera's sake (that portrait
 * fill) is as bright in a dark flat at night as in the street at noon.
 */

let subject: THREE.Object3D | null = null;
let subjectLift = 0;
let key = 0.18;

/** Frames `target`, `lift` metres above it (their face), until `releaseFrame`. */
export function frameSubject(target: THREE.Object3D, lift: number): void {
  subject = target;
  subjectLift = lift;
}

/** Nothing framed any more (the conversation ended). */
export function releaseFrame(): void {
  subject = null;
}

/** The framed subject, or null. */
export function framedSubject(): THREE.Object3D | null {
  return subject;
}

/** How far above the framed subject the face is (m). */
export function framedLift(): number {
  return subjectLift;
}

/** Set by `PostFx` each frame: the scene luminance the eye's exposure shows as middle grey. */
export function setFrameKey(luminance: number): void {
  key = luminance;
}

/** The scene luminance that reads as middle grey now (0.18 without the HDR pipeline). */
export function frameKey(): number {
  return key;
}
