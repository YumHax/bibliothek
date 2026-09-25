import * as THREE from 'three';
import type { FacadeSpec } from '../streetPlan';

/**
 * A facade's own frame, to build things in front of its painted wall: `s` metres along it from its
 * left end (seen from the street), `y` up from the pavement, `out` metres out towards the street.
 * `u` runs along the face, `n` is its outward normal (both zone-local, horizontal); `yaw` turns
 * an object whose +z should face the street and whose +x runs along the facade.
 */
export class FacadeFrame {
  readonly u: THREE.Vector2;
  readonly n: THREE.Vector2;
  readonly yaw: number;
  readonly length: number;

  constructor(readonly spec: FacadeSpec) {
    const [ax, az] = spec.from;
    const [bx, bz] = spec.to;
    this.length = Math.hypot(bx - ax, bz - az);
    this.u = new THREE.Vector2((bx - ax) / this.length, (bz - az) / this.length);
    this.n = new THREE.Vector2(-this.u.y, this.u.x);
    // An object's +z (0, 1) turned by yaw is (sin yaw, cos yaw): that must be n.
    this.yaw = Math.atan2(this.n.x, this.n.y);
  }

  /** The zone-local point `s` along, `y` up, `out` in front of the wall. */
  point(s: number, y: number, out = 0, target = new THREE.Vector3()): THREE.Vector3 {
    const [ax, az] = this.spec.from;
    return target.set(ax + this.u.x * s + this.n.x * out, y, az + this.u.y * s + this.n.y * out);
  }

  /** A matrix placing an object's origin at (s, y, out), its +x along the facade and its +z out to the street. */
  matrix(s: number, y: number, out = 0, target = new THREE.Matrix4()): THREE.Matrix4 {
    const p = this.point(s, y, out);
    return target.makeRotationY(this.yaw).setPosition(p);
  }
}
