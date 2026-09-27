import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { boxMesh, type MeshPosition } from '../meshUtils';

/**
 * Base class for decoration. Props go through `Zone.place()` like any furniture so they are
 * ticked when Updatable and made clickable when Interactable, but they must never block the
 * player: the footprint is an *empty* Box3. `Box3.applyMatrix4` leaves an empty box empty and
 * `Box3.intersectsSphere` clamps against [+∞, -∞], giving an infinite distance, so the collider
 * registered by `place()` can never be hit.
 */
export class Prop extends THREE.Group implements Furniture {
  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }
}

/** `boxMesh` added straight to `parent`; the workhorse of every procedural prop. */
export function part(parent: THREE.Object3D, width: number, height: number, depth: number, material: THREE.Material, position: MeshPosition = {}): THREE.Mesh {
  const mesh = boxMesh(width, height, depth, material, position);
  parent.add(mesh);
  return mesh;
}

/**
 * A new matte material of the prop's own (`roughness` defaults to a plastic-like 0.6): for a
 * surface the prop changes at runtime. A look that never changes takes `paint()` from
 * `materials/palette`, one shared material per look for the page.
 */
export function matte(color: THREE.ColorRepresentation, roughness = 0.6): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness });
}

export { disposeTree, isShared, markShared } from '../materials/sharedResources';
