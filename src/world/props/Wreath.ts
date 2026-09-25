import * as THREE from 'three';
import { seededRandom } from '@/covers/generated/canvasUtils';
import { markShared, matte, Prop } from './Prop';

export interface WreathOptions {
  /** Outer radius, metres. Default 0.19. */
  radius?: number;
  seed?: number;
}

const FIR = markShared(new THREE.MeshStandardMaterial({ color: 0x1f4a2a, roughness: 0.85, flatShading: true }));
const BERRY = markShared(new THREE.MeshStandardMaterial({ color: 0xb01a1a, roughness: 0.3 }));
const BOW = markShared(matte(0xc8243a, 0.45));

/**
 * A Christmas wreath for a door (hung on its leaf, `Door.attachToLeaf`) or a wall: a ring of fir
 * sprigs with red berries and a red bow at the bottom. Its back at local z = 0, facing +z.
 * Decoration: never collides, casts nothing.
 */
export class Wreath extends Prop {
  constructor(options: WreathOptions = {}) {
    super();
    this.name = 'Wreath';
    const radius = options.radius ?? 0.19;
    const tube = radius * 0.24;
    const ring = radius - tube;
    const random = seededRandom(options.seed ?? 9);
    const base = new THREE.Mesh(new THREE.TorusGeometry(ring, tube, 7, 22), FIR);
    base.position.z = tube;
    base.castShadow = false;
    this.add(base);
    // Sprigs sticking out of the ring, and berries in clusters of three.
    const sprigs = new THREE.InstancedMesh(new THREE.ConeGeometry(tube * 0.55, tube * 2.2, 5), FIR, 36);
    const berries = new THREE.InstancedMesh(new THREE.SphereGeometry(tube * 0.22, 6, 5), BERRY, 18);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2 + random() * 0.1;
      const r = ring + (random() - 0.5) * tube * 1.4;
      e.set((random() - 0.5) * 1.2, 0, a - Math.PI / 2 + (random() - 0.5) * 0.8);
      m.compose(p.set(Math.cos(a) * r, Math.sin(a) * r, tube * (1 + random() * 0.6)), q.setFromEuler(e), s);
      sprigs.setMatrixAt(i, m);
    }
    for (let i = 0; i < 18; i++) {
      const cluster = Math.floor(i / 3);
      const a = (cluster / 6) * Math.PI * 2 + 0.3 + (i % 3) * 0.06;
      m.compose(p.set(Math.cos(a) * ring, Math.sin(a) * ring + (i % 3) * 0.008, tube * 1.9), q.identity(), s);
      berries.setMatrixAt(i, m);
    }
    sprigs.castShadow = berries.castShadow = false;
    this.add(sprigs, berries);
    // The bow at the bottom: two loops and two tails.
    for (const sx of [-1, 1]) {
      const loop = new THREE.Mesh(new THREE.TorusGeometry(tube * 0.9, tube * 0.28, 5, 10), BOW);
      loop.position.set(sx * tube * 0.9, -ring, tube * 2.1);
      loop.scale.y = 0.6;
      const tail = new THREE.Mesh(new THREE.BoxGeometry(tube * 0.5, tube * 2.6, 0.006), BOW);
      tail.position.set(sx * tube * 0.55, -ring - tube * 1.4, tube * 2);
      tail.rotation.z = sx * 0.25;
      this.add(loop, tail);
    }
  }
}
