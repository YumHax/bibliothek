import * as THREE from 'three';

/**
 * Two hits closer than this along the ray are one wall: the shells of two adjacent rooms stand
 * `WALL_GAP` apart, and a door leaf is hit on both its faces.
 */
const SAME_WALL = 0.15;
/** The ray stops this short of the source, so the wall a picture is projected on does not count. */
const SOURCE_MARGIN = 0.05;

/**
 * Another way than the straight line for a sound to get from a source to the listener (round
 * through the flat's front door and down the stairwell, `stairwell/flatHeard`): the walls along it,
 * counted with `walls` (the straight count between two points), or null where it does not apply.
 * Fractional counts are fine (a storey of stone well damps a little less than a wall).
 */
export type SoundRoute = (listener: THREE.Vector3, source: THREE.Vector3, walls: (a: THREE.Vector3, b: THREE.Vector3) => number) => number | null;

/**
 * How many walls stand between a listener and a sound source: a ray from one to the other
 * against the world's occluders, which are every loaded room's walls (the doorways are holes in
 * them) and the door leaves (a shut door counts as a wall, an open one lies against the wall of
 * the room it swung into). `proximityVolume` turns the count into an attenuation. A `SoundRoute`
 * that applies to the pair answers instead (the first one added that does).
 */
export class SoundOcclusion {
  private readonly raycaster = new THREE.Raycaster();
  private readonly direction = new THREE.Vector3();
  private readonly routes: SoundRoute[] = [];
  private readonly straight = (a: THREE.Vector3, b: THREE.Vector3): number => this.rayWalls(a, b);

  /** `occluders` is read on every query: the list changes as zones load and unload. */
  constructor(private readonly occluders: () => readonly THREE.Object3D[]) {}

  /** Adds a way round for the pairs it applies to; returns the removal. */
  addRoute(route: SoundRoute): () => void {
    this.routes.push(route);
    return () => {
      const i = this.routes.indexOf(route);
      if (i >= 0) this.routes.splice(i, 1);
    };
  }

  wallsBetween(listener: THREE.Vector3, source: THREE.Vector3): number {
    for (const route of this.routes) {
      const walls = route(listener, source, this.straight);
      if (walls !== null) return walls;
    }
    return this.rayWalls(listener, source);
  }

  private rayWalls(listener: THREE.Vector3, source: THREE.Vector3): number {
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
