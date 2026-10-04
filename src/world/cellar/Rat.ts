import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { OccupancyAware } from '../Furniture';
import { paint } from '../materials/palette';
import { cylinderMesh } from '../meshUtils';
import { Prop } from '../props/Prop';
import { CELLAR_PLAN as plan, cellCentre } from './cellarPlan';
import { playSqueak } from './cellarSounds';
import { random } from '@/random';
import { loudness } from '@/audio/hearing';

/** How fast it scurries (m/s), how close to the wall it keeps (m off the passage's middle). */
const SPEED = 1.6;
const OFFSET = 0.55;

/**
 * The cellars' rat: now and then (`CELLAR_PLAN.rat.every` s) it scurries along its passage by the wall, one way or the
 * other, squeaking if the player is near, and is gone. A grey body, a pink tail, three meshes; hidden between runs.
 * Zone-local, never collides.
 */
export class Rat extends Prop implements Updatable, OccupancyAware {
  readonly contactShadow = false;
  private readonly body = new THREE.Group();
  private readonly path: THREE.Vector3[];
  private wait: number;
  private run: { from: THREE.Vector3; to: THREE.Vector3; t: number; length: number } | null = null;
  private occupied = false;
  private readonly eye = new THREE.Vector3();

  constructor(private readonly viewer: THREE.Object3D) {
    super();
    this.name = 'Rat';
    this.path = plan.rat.path.map(([c, r]) => {
      const [x, z] = cellCentre(c, r);
      return new THREE.Vector3(x, 0, z - OFFSET);
    });
    const fur = paint(0x4a4440, 0.95);
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), fur);
    torso.scale.set(1, 0.75, 2);
    torso.position.y = 0.04;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), fur);
    head.scale.set(1, 0.9, 1.4);
    head.position.set(0, 0.04, 0.1);
    const tail = cylinderMesh(0.006, 0.18, paint(0xc89a90, 0.7), { y: 0.02, z: -0.17 }, { radiusBottom: 0.003, segments: 5 });
    tail.rotation.x = Math.PI / 2 - 0.15;
    for (const mesh of [torso, head, tail]) {
      mesh.castShadow = false;
      this.body.add(mesh);
    }
    this.body.visible = false;
    this.add(this.body);
    this.wait = this.nextWait();
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
  }

  update(dt: number): void {
    if (!this.occupied) return;
    if (!this.run) {
      this.wait -= dt;
      if (this.wait > 0) return;
      const forward = random() < 0.5;
      const from = forward ? this.path[0]! : this.path[this.path.length - 1]!;
      const to = forward ? this.path[this.path.length - 1]! : this.path[0]!;
      this.run = { from, to, t: 0, length: from.distanceTo(to) };
      this.body.visible = true;
      this.body.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
      this.viewer.getWorldPosition(this.eye);
      this.worldToLocal(this.eye);
      const d = this.eye.distanceTo(from);
      playSqueak(0.12 * loudness(d, { shape: 'inverseSquare', referenceDistance: Math.sqrt(5), maxDistance: Infinity }));
    }
    const run = this.run;
    run.t += (dt * SPEED) / run.length;
    // A scurry: quick, with little stops.
    const s = Math.min(1, run.t + 0.02 * Math.sin(run.t * 60));
    this.body.position.lerpVectors(run.from, run.to, s);
    this.body.position.y = 0.004 * Math.abs(Math.sin(run.t * 90));
    if (run.t >= 1) {
      this.run = null;
      this.body.visible = false;
      this.wait = this.nextWait();
    }
  }

  private nextWait(): number {
    const [a, b] = plan.rat.every;
    return a + random() * (b - a);
  }
}
