import * as THREE from 'three';
import type { FirstPersonController } from '@/player/FirstPersonController';
import type { GameBox } from '@/world/GameBox';

const eye = new THREE.Vector3();
const target = new THREE.Vector3();
const front = new THREE.Vector3();
const quat = new THREE.Quaternion();

/** Distance from the player's eye to the box, in metres. */
export function distanceTo(player: FirstPersonController, box: GameBox): number {
  box.getWorldPosition(target);
  return player.getEyePosition(eye).distanceTo(target);
}

/** Turns the player (yaw + pitch) so the crosshair points at the box's centre. */
export function faceBox(player: FirstPersonController, box: GameBox): void {
  player.lookAt(box.getWorldPosition(target));
}

/** Teleports the player `distance` metres in front of the box (along its front face normal), facing it. */
export function standInFrontOf(player: FirstPersonController, box: GameBox, distance = 2): void {
  box.getWorldPosition(target);
  box.getWorldQuaternion(quat);
  front.set(0, 0, 1).applyQuaternion(quat); // the cover is the +z face
  front.y = 0;
  if (front.lengthSq() < 1e-6) front.set(0, 0, 1);
  front.normalize();
  player.setPosition(target.x + front.x * distance, target.z + front.z * distance);
  faceBox(player, box);
}
