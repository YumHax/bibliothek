import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Prop } from '../../props/Prop';
import { METAL, paint } from '../../materials/palette';

const TYRE = paint(0x1a1a1c, 0.8);
const WHEEL_R = 0.33;

/** A tube from `a` to `b`, `r` thick. */
function tube(a: THREE.Vector3, b: THREE.Vector3, r: number): THREE.BufferGeometry {
  const length = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, length, 6);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  return g.translate(mid.x, mid.y, mid.z);
}

/**
 * A town bicycle stood against a wall: two wheels, a diamond frame in its colour, a saddle and the handlebar. One mesh
 * per material. Floor placement, the bike along local z (front wheel at +z), origin under its middle. Decoration.
 */
export class Bicycle extends Prop {
  /** `lean`: how far it leans on its stand towards +x (radians), against the wall. */
  constructor(color: number, lean = 0) {
    super();
    this.name = 'Bicycle';
    const body = new THREE.Group();
    body.rotation.z = lean;
    this.add(body);
    const front = new THREE.Vector3(0, WHEEL_R, 0.52);
    const back = new THREE.Vector3(0, WHEEL_R, -0.52);
    const wheels = [front, back].map((c) => new THREE.TorusGeometry(WHEEL_R, 0.02, 6, 24).rotateY(Math.PI / 2).translate(c.x, c.y, c.z));
    const hubs = [front, back].map((c) => new THREE.CylinderGeometry(0.02, 0.02, 0.08, 6).rotateZ(Math.PI / 2).translate(c.x, c.y, c.z));
    const crank = new THREE.Vector3(0, WHEEL_R - 0.02, -0.02);
    const seat = new THREE.Vector3(0, 0.82, -0.2);
    const head = new THREE.Vector3(0, 0.84, 0.38);
    const frame = [tube(crank, seat, 0.016), tube(seat, head, 0.015), tube(crank, head, 0.017), tube(back, crank, 0.012), tube(back, seat, 0.011), tube(head, front, 0.014)];
    const bar = new THREE.Vector3(0, 0.98, 0.33);
    const chrome = [tube(head, bar, 0.012), new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6).rotateZ(Math.PI / 2).translate(bar.x, bar.y, bar.z), ...hubs];
    const saddle = new THREE.BoxGeometry(0.14, 0.05, 0.26).translate(seat.x, seat.y + 0.07, seat.z - 0.02);
    const add = (parts: THREE.BufferGeometry[], material: THREE.Material): void => {
      const mesh = new THREE.Mesh(mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!, material);
      mesh.castShadow = false;
      body.add(mesh);
    };
    add([...wheels], TYRE);
    add(frame, paint(color, 0.45));
    add(chrome, METAL.chrome());
    add([saddle], paint(0x2a1e16, 0.6));
  }
}
