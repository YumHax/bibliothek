import * as THREE from 'three';
import type { TriBuilder } from '../relief/TriBuilder';

/* Small shapes for the shopfronts' low-poly pieces (window displays, what stands on the pavement), merged into a `TriBuilder`. */

const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();

/** `m` then a move to (x, y, z), a turn (Euler 'YXZ': the yaw outermost) and a scale. */
export function at(m: THREE.Matrix4, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  tmpE.set(rx, ry, rz, 'YXZ');
  return m.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), tmpQ.setFromEuler(tmpE), new THREE.Vector3(sx, sy, sz)));
}

/** A cylinder (or a cone's frustum: `top` and `bottom` radii) standing on (x, y, z), `h` tall. */
export function cylinder(b: TriBuilder, m: THREE.Matrix4, x: number, y: number, z: number, top: number, bottom: number, h: number, color: string, segments = 12): void {
  const g = new THREE.CylinderGeometry(top, bottom, h, segments);
  b.geometry(at(m, x, y + h / 2, z), g, color);
  g.dispose();
}

/** An ellipsoid centred at (x, y, z), radii `rx`, `ry`, `rz`, turned `turn` about the vertical. */
export function ball(b: TriBuilder, m: THREE.Matrix4, x: number, y: number, z: number, rx: number, ry: number, rz: number, color: string, turn = 0): void {
  const g = new THREE.SphereGeometry(1, 8, 5);
  b.geometry(at(m, x, y, z, 0, turn, 0, rx, ry, rz), g, color);
  g.dispose();
}

