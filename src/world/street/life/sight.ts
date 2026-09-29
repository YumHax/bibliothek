import * as THREE from 'three';

const eye = new THREE.Vector3();
const facing = new THREE.Vector3();
const toPoint = new THREE.Vector3();

/**
 * Whether the player cannot see a thing at world `point` change: further than `far`, or well
 * outside the view (more than ~75° off where the camera looks) and further than `near`. What
 * appears or goes (the busker packing up, the trader, the snowman) switches only then, so nothing
 * pops in front of the player.
 */
export function outOfSight(viewer: THREE.Object3D, point: THREE.Vector3, far = 22, near = 4): boolean {
  viewer.getWorldPosition(eye);
  toPoint.copy(point).sub(eye);
  const distance = toPoint.length();
  if (distance > far) return true;
  if (distance < near) return false;
  viewer.getWorldDirection(facing);
  return toPoint.dot(facing) / distance < 0.25;
}
