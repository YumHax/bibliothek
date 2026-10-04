import * as THREE from 'three';
import { dampFactor } from '@/math/damp';
import { random } from '@/random';

/** Body radius (m): a house fly is ~7 mm long. */
const SIZE = 0.0035;
/** How quickly it closes on where it is going (1/s), and the zig-zag of its buzzing flight (m). */
const FOLLOW = 5;
const BUZZ = 0.035;
/** With nowhere to be, it zips off upwards for this long, then is gone. */
const LEAVE_S = 0.5;

/**
 * The fly the cat chases (`flyStalk` / `flyPounce`): a dark speck with a faint blur of wings,
 * drifting towards the point the cat watches with a buzzing zig-zag, zipping off when the chase
 * is over. A child of the `Cat`; `update` takes the point in the cat's parent frame (the one its
 * `position` is in) and places itself in the cat's own.
 */
export class CatFly extends THREE.Group {
  private readonly at = new THREE.Vector3();
  private readonly wings: THREE.Mesh;
  private shown = false;
  private leaving = 0;
  private time = random() * 10;
  private readonly local = new THREE.Vector3();

  constructor() {
    super();
    this.name = 'CatFly';
    const body = new THREE.Mesh(new THREE.SphereGeometry(SIZE, 8, 6), new THREE.MeshBasicMaterial({ color: 0x14110f }));
    body.scale.set(0.8, 0.75, 1.3);
    this.wings = new THREE.Mesh(
      new THREE.SphereGeometry(SIZE * 1.4, 8, 4),
      new THREE.MeshBasicMaterial({ color: 0x9a9a9a, transparent: true, opacity: 0.25, depthWrite: false }),
    );
    this.wings.scale.set(1.6, 0.2, 0.9);
    this.wings.position.y = SIZE * 0.6;
    this.add(body, this.wings);
    this.visible = false;
  }

  /** `target`: where it flies (parent-frame point), or null when there is no chase. `cat` is its parent. */
  update(dt: number, target: THREE.Vector3 | null, cat: THREE.Object3D): void {
    this.time += dt;
    if (target) {
      if (!this.shown) {
        // Arrives from a little way off, not out of nothing at the point.
        this.at.copy(target).add(this.local.set(THREE.MathUtils.randFloatSpread(0.6), 0.3, THREE.MathUtils.randFloatSpread(0.6)));
        this.shown = true;
      }
      this.leaving = LEAVE_S;
      this.at.lerp(target, dampFactor(FOLLOW, dt));
    } else if (this.shown) {
      this.leaving -= dt;
      this.at.y += dt * 2;
      this.at.x += dt * 0.8;
      if (this.leaving <= 0) this.shown = false;
    }
    this.visible = this.shown;
    if (!this.shown) return;
    const t = this.time;
    this.local.set(
      this.at.x + Math.sin(t * 7.3) * BUZZ + Math.sin(t * 17.1) * BUZZ * 0.3,
      this.at.y + Math.sin(t * 9.7 + 1) * BUZZ * 0.6,
      this.at.z + Math.cos(t * 6.1) * BUZZ + Math.sin(t * 13.3) * BUZZ * 0.3,
    );
    // Into the cat's frame (the parent frame's point, less the cat's position, turned back by its yaw).
    this.local.sub(cat.position).applyAxisAngle(THREE.Object3D.DEFAULT_UP, -cat.rotation.y);
    this.position.copy(this.local);
    this.wings.rotation.z = Math.sin(t * 90) * 0.4;
  }
}
