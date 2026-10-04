import * as THREE from 'three';

const world = new THREE.Vector3();

/**
 * Where `object` is on the screen, `lift` metres above it (negative: below), in CSS pixels from the window's top
 * left; null when it is behind the camera. What a panel placed beside someone in the room reads (the conversation).
 */
export function screenPoint(camera: THREE.Camera, object: THREE.Object3D, lift = 0): { x: number; y: number } | null {
  object.getWorldPosition(world);
  world.y += lift;
  world.project(camera);
  if (world.z > 1 || world.z < -1) return null;
  return { x: ((world.x + 1) / 2) * window.innerWidth, y: ((1 - world.y) / 2) * window.innerHeight };
}
