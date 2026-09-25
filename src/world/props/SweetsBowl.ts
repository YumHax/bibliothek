import * as THREE from 'three';
import { seededRandom } from '@/covers/generated/canvasUtils';
import { markShared, Prop } from './Prop';

export interface SweetsBowlOptions {
  /** Rim radius, metres. Default 0.1. */
  radius?: number;
  /** The bowl's colour (an orange Halloween bowl by default). */
  color?: number;
  seed?: number;
}

const WRAPPER = markShared(new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.2 }));
const WRAPPERS = [0xff8a1a, 0x7a3aa8, 0x2a2a2a, 0x3ac85a, 0xffd23a, 0xd23a3a];

/**
 * A bowl of wrapped sweets for the trick-or-treaters, standing on its foot at local y = 0 (a
 * wall placement's `y` puts it on a console top): a turned bowl and a heap of twisted wrappers,
 * one instanced mesh. Decoration: never collides, casts nothing.
 */
export class SweetsBowl extends Prop {
  constructor(options: SweetsBowlOptions = {}) {
    super();
    this.name = 'SweetsBowl';
    const radius = options.radius ?? 0.1;
    const depth = radius * 0.55;
    const random = seededRandom(options.seed ?? 5);
    const profile = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(radius * 0.35, 0),
      new THREE.Vector2(radius * 0.4, depth * 0.12),
      new THREE.Vector2(radius * 0.8, depth * 0.45),
      new THREE.Vector2(radius, depth),
      new THREE.Vector2(radius * 0.95, depth),
      new THREE.Vector2(radius * 0.76, depth * 0.5),
      new THREE.Vector2(0, depth * 0.18),
    ];
    const bowl = new THREE.Mesh(new THREE.LatheGeometry(profile, 24), new THREE.MeshStandardMaterial({ color: options.color ?? 0xe0701c, roughness: 0.35, side: THREE.DoubleSide }));
    bowl.castShadow = false;
    this.add(bowl);

    // A heap of sweets: each a small wrapped lozenge, piled higher in the middle, twisted every which way.
    const count = 22;
    const sweet = new THREE.CapsuleGeometry(0.009, 0.018, 3, 6);
    sweet.rotateZ(Math.PI / 2);
    const sweets = new THREE.InstancedMesh(sweet, WRAPPER, count);
    sweets.castShadow = false;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const r = Math.sqrt(random()) * radius * 0.78;
      const a = random() * Math.PI * 2;
      const heap = 1 - r / radius;
      p.set(Math.cos(a) * r, depth * 0.35 + heap * depth * 0.9 + random() * 0.01, Math.sin(a) * r);
      e.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
      m.compose(p, q.setFromEuler(e), s);
      sweets.setMatrixAt(i, m);
      sweets.setColorAt(i, c.setHex(WRAPPERS[Math.floor(random() * WRAPPERS.length)]!));
    }
    sweets.instanceMatrix.needsUpdate = true;
    if (sweets.instanceColor) sweets.instanceColor.needsUpdate = true;
    this.add(sweets);
  }
}
