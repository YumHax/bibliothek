import * as THREE from 'three';

/*
 * A start at something close (a car braking hard just short of the player): whoever saw it asks for a flinch at a
 * world point (`flinchFrom`), and the controller takes it on its next frame (`takeFlinch`), jolting the eye back from
 * it a moment. Nothing else is kept: a second fright before the first is taken replaces it.
 */
let pending: THREE.Vector3 | null = null;

/** A flinch away from `point` (world), on the controller's next frame. */
export function flinchFrom(point: THREE.Vector3): void {
  (pending ??= new THREE.Vector3()).copy(point);
}

/** The point of the flinch asked for since the last frame (copied into `out`), or null. */
export function takeFlinch(out: THREE.Vector3): THREE.Vector3 | null {
  if (!pending) return null;
  out.copy(pending);
  pending = null;
  return out;
}
