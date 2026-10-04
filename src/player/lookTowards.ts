import * as THREE from 'three';
import { angleTo } from '@/math/angles';
import { clamp, smooth } from '@/math/scalar';
import type { FirstPersonController } from './FirstPersonController';

const eye = new THREE.Vector3();
const dir = new THREE.Vector3();

/**
 * Turns the view gently to `target`, `lift` metres above it (negative: below), over `seconds`, the short way round
 * and eased at both ends: a conversation framing the face of whoever was clicked, as a film's dialogue shot does.
 * Only while nothing else turns the view (a panel is open, the pointer free). Returns the cancel.
 */
export function lookTowards(player: Pick<FirstPersonController, 'getLook' | 'setLook' | 'getEyePosition'>, target: THREE.Object3D, lift = 0, seconds = 0.35): () => void {
  player.getEyePosition(eye);
  target.getWorldPosition(dir);
  dir.y += lift;
  dir.sub(eye);
  const length = dir.length();
  if (length < 1e-6) return () => {};
  dir.divideScalar(length);
  const from = player.getLook();
  // Camera looks down -z: yaw maps (0,0,-1) to (-sin yaw, 0, -cos yaw), pitch lifts y by sin(pitch).
  const turn = angleTo(from.yaw, Math.atan2(-dir.x, -dir.z));
  const pitch = Math.asin(clamp(dir.y, -1, 1));
  const start = performance.now();
  let frame = 0;
  const step = (now: number): void => {
    const t = clamp((now - start) / (seconds * 1000), 0, 1);
    const e = smooth(t);
    player.setLook(from.yaw + turn * e, from.pitch + (pitch - from.pitch) * e);
    if (t < 1) frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  return () => cancelAnimationFrame(frame);
}
