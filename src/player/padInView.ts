import * as THREE from 'three';
import { closeUpCamera } from './closeUp';
import { smooth } from '@/math/scalar';

/** Where the pad is held in the lower view (camera space, metres): low, a little left of the middle, in reach. */
const HELD = new THREE.Vector3(-0.02, -0.17, -0.34);
/** Tipped towards the eye, its buttons up to the player. */
const TILT = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.05, 0, 0));
/** The lift from the stand into the hands (s). */
const LIFT_S = 0.35;

const camPos = new THREE.Vector3();
const camQuat = new THREE.Quaternion();
const goal = new THREE.Vector3();
const goalQuat = new THREE.Quaternion();

/*
 * The console's pad picked up to play a program on the TV (`game/ProgramPlay`): a copy of it (shared geometries and
 * materials, never edited) rises from the stand into the lower view and stays there with every look; the pad on the
 * stand and its cable are hidden meanwhile. The camera comes from the close-up rig (`setCloseUpRig`).
 */

/** Lifts `pad` into view (`cable` hidden with it). Returns the putting down, or null without a camera or a scene. */
export function padInView(pad: THREE.Object3D, cable: THREE.Object3D | null): (() => void) | null {
  const camera = closeUpCamera();
  let scene: THREE.Object3D = pad;
  while (scene.parent) scene = scene.parent;
  if (!camera || scene === pad) return null;
  const copy = pad.clone(true);
  copy.traverse((obj) => {
    obj.castShadow = false;
    obj.receiveShadow = false;
  });
  pad.updateWorldMatrix(true, false);
  const fromPos = new THREE.Vector3();
  const fromQuat = new THREE.Quaternion();
  pad.matrixWorld.decompose(fromPos, fromQuat, new THREE.Vector3());
  copy.position.copy(fromPos);
  copy.quaternion.copy(fromQuat);
  scene.add(copy);
  pad.visible = false;
  if (cable) cable.visible = false;
  const began = performance.now();
  let frame = 0;
  const follow = (): void => {
    camera.updateWorldMatrix(true, false);
    camera.getWorldPosition(camPos);
    camera.getWorldQuaternion(camQuat);
    goal.copy(HELD).applyQuaternion(camQuat).add(camPos);
    goalQuat.copy(camQuat).multiply(TILT);
    const k = Math.min(1, (performance.now() - began) / 1000 / LIFT_S);
    const eased = smooth(k);
    copy.position.lerpVectors(fromPos, goal, eased);
    copy.quaternion.slerpQuaternions(fromQuat, goalQuat, eased);
    frame = requestAnimationFrame(follow);
  };
  follow();
  return () => {
    cancelAnimationFrame(frame);
    copy.removeFromParent();
    pad.visible = true;
    if (cable) cable.visible = true;
  };
}
