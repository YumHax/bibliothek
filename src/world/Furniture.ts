import type * as THREE from 'three';

/** A static object placed in the room; `footprint` (local space) is registered as a collider. */
export interface Furniture extends THREE.Object3D {
  readonly footprint: THREE.Box3;
}
