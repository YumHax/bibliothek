import * as THREE from 'three';

/** Somewhere colliders can be registered and taken out again (the world, or a zone's scoped view of it). */
export interface ColliderSet {
  add(box: THREE.Box3): void;
  remove(box: THREE.Box3): void;
}

/** Something that answers "is this sphere touching a collider?" (what the cat and the player ask). */
export interface CollisionProbe {
  intersectsSphere(point: THREE.Vector3, radius: number): boolean;
}

/** Both faces: what furniture that moves (the door leaf) and creatures (the cat) are handed. */
export interface Collisions extends ColliderSet, CollisionProbe {}

/**
 * World geometry the player must not walk through, expressed as AABBs. Boxes can be taken out
 * again so furniture that gets rebuilt (the shelving) leaves no ghost collider behind.
 */
export class CollisionWorld implements Collisions {
  private readonly boxes = new Set<THREE.Box3>();
  private readonly sphere = new THREE.Sphere();

  add(box: THREE.Box3): void {
    this.boxes.add(box);
  }

  remove(box: THREE.Box3): void {
    this.boxes.delete(box);
  }

  /** True if a sphere of `radius` centred on `point` touches any registered box. */
  intersectsSphere(point: THREE.Vector3, radius: number): boolean {
    this.sphere.set(point, radius);
    for (const box of this.boxes) if (box.intersectsSphere(this.sphere)) return true;
    return false;
  }
}
