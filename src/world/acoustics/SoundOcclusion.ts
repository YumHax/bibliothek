import * as THREE from 'three';

/**
 * Two hits closer than this along the ray are one wall: the shells of two adjacent rooms stand
 * `WALL_GAP` apart, and a door leaf is hit on both its faces.
 */
const SAME_WALL = 0.15;
/** The ray stops this short of the source, so the wall a picture is projected on does not count. */
const SOURCE_MARGIN = 0.05;

/**
 * How many walls stand between a listener and a sound source: a ray from one to the other
 * against the world's occluders, which are every loaded room's walls (the doorways are holes in
 * them) and the door leaves (a shut door counts as a wall, an open one lies against the wall of
 * the room it swung into). `proximityVolume` turns the count into an attenuation.
 */
export class SoundOcclusion {
  private readonly raycaster = new THREE.Raycaster();
  private readonly direction = new THREE.Vector3();

  /** `occluders` is read on every query: the list changes as zones load and unload. */
  constructor(private readonly occluders: () => readonly THREE.Object3D[]) {}

  wallsBetween(listener: THREE.Vector3, source: THREE.Vector3): number {
    this.direction.subVectors(source, listener);
    const length = this.direction.length();
    if (length <= SOURCE_MARGIN) return 0;
    this.raycaster.set(listener, this.direction.divideScalar(length));
    this.raycaster.near = 0;
    this.raycaster.far = length - SOURCE_MARGIN;
    const hits = this.raycaster.intersectObjects(this.occluders() as THREE.Object3D[], false); // nearest first
    let walls = 0;
    let last = -Infinity;
    for (const hit of hits) {
      if (hit.distance - last > SAME_WALL) walls++;
      last = hit.distance;
    }
    return walls;
  }
}
