import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { OccupancyAware } from '../Furniture';
import { Prop } from '../props/Prop';

/** How often a waiting change looks again whether it can be made (s). */
const CHECK_EVERY = 0.25;
/** Past this angle off the view's axis (radians) a thing counts as out of sight when the viewer is no camera. */
const SIGHT_HALF_ANGLE = THREE.MathUtils.degToRad(55);

/**
 * A change the clock makes to something in the room (the bed made, the day's clothes on the chair)
 * that nobody should see happen: made at once while the player is in another room, else held
 * until the thing is out of the view's frustum (the player turned away) or the player has left.
 * Placed in the zone like a prop (it ticks and hears the zone's occupancy); `watched` is what must
 * be out of sight, `viewer` the camera.
 */
export class UnseenSwap extends Prop implements Updatable, OccupancyAware {
  readonly contactShadow = false;
  private pending: (() => void) | null = null;
  private occupied = false;
  private checkIn = 0;
  private readonly bounds = new THREE.Box3();
  private readonly sphere = new THREE.Sphere();
  private readonly frustum = new THREE.Frustum();
  private readonly viewProjection = new THREE.Matrix4();
  private readonly eye = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();

  constructor(
    private readonly viewer: THREE.Object3D,
    private readonly watched: THREE.Object3D,
  ) {
    super();
    this.name = 'UnseenSwap';
  }

  /** Makes `apply` now if nobody would see it, else as soon as nobody does (a later call replaces a waiting one). */
  defer(apply: () => void): void {
    this.pending = apply;
    this.tryApply();
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
    this.tryApply();
  }

  update(dt: number): void {
    if (!this.pending) return;
    this.checkIn -= dt;
    if (this.checkIn > 0) return;
    this.checkIn = CHECK_EVERY;
    this.tryApply();
  }

  private tryApply(): void {
    if (!this.pending || (this.occupied && this.inSight())) return;
    const apply = this.pending;
    this.pending = null;
    apply();
  }

  /** Whether the watched thing is in the view: its bounds against the camera's frustum (or a cone round its look, for a plain object). */
  private inSight(): boolean {
    if (!this.watched.parent) return false;
    this.bounds.setFromObject(this.watched).getBoundingSphere(this.sphere);
    const camera = this.viewer as THREE.PerspectiveCamera;
    if (camera.isPerspectiveCamera) {
      camera.updateMatrixWorld();
      this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      return this.frustum.setFromProjectionMatrix(this.viewProjection).intersectsSphere(this.sphere);
    }
    this.viewer.getWorldPosition(this.eye);
    this.viewer.getWorldDirection(this.forward).negate(); // an Object3D looks down its -z, like a camera
    const to = this.sphere.center.clone().sub(this.eye);
    const distance = to.length();
    if (distance <= this.sphere.radius) return true;
    return to.angleTo(this.forward) - Math.asin(Math.min(1, this.sphere.radius / distance)) < SIGHT_HALF_ANGLE;
  }
}
