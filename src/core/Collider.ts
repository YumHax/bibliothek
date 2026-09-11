import * as THREE from 'three';

/**
 * World geometry the player must not walk through, expressed as AABBs. Boxes can be taken out
 * again so furniture that gets rebuilt (the shelving) leaves no ghost collider behind.
 */
export class CollisionWorld {
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
