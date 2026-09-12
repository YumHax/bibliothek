import type * as THREE from 'three';

/**
 * A static object placed in the room; `footprint` (local space) is registered as a collider, and
 * so is every box of `colliders` for things that cannot be one AABB (walls round a space).
 */
export interface Furniture extends THREE.Object3D {
  readonly footprint: THREE.Box3;
  readonly colliders?: readonly THREE.Box3[];
  /**
   * Called when the zone holding it is unloaded: release subscriptions, audio, timers. Geometries,
   * materials and textures are freed by the zone itself (`disposeTree`), so most props need nothing.
   */
  dispose?(): void;
}
