import type * as THREE from 'three';

/** Whether `object` is drawn in `scene` now: its every ancestor visible, up to the scene itself (a room unloaded is not). */
export function inScene(object: THREE.Object3D, scene: THREE.Object3D): boolean {
  let at: THREE.Object3D | null = object;
  while (at) {
    if (at === scene) return true;
    if (!at.visible) return false;
    at = at.parent;
  }
  return false;
}
