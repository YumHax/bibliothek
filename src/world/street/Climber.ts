import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { lcg } from '@/random';
import { currentSeason } from '@/time/season';

/** Leaves per square metre where the climber is thickest, and a leaf's size (m). */
const LEAVES_PER_M2 = 70;
const LEAF = 0.07;
/** Ivy keeps its leaves; the dark greens, and the reds and ambers it shows at the edges in autumn. */
const GREENS = [0x2f4a22, 0x3b5a2a, 0x27401d, 0x4a6a30];
const AUTUMN = [0x7a2a1a, 0x9a4a1e, 0x6a3a1a];

/**
 * Ivy grown up a wall: a mat of leaves over a `width` x `height` patch, thick at the foot and thinning upwards in a
 * ragged edge (each column reaches its own height), a few bare stems showing where it is thin. One instanced mesh of
 * small leaf shapes, double-sided, tinted by instance and the season. Local frame: the wall's face is the XY plane at
 * z = 0, the leaves stand off it towards +z, the patch's foot is centred on the origin. Never collides.
 */
export class Climber extends THREE.Group implements Furniture {
  readonly contactShadow = false;
  readonly footprint = new THREE.Box3();

  constructor(width: number, height: number, seed: number) {
    super();
    this.name = 'Climber';
    const random = lcg(seed);
    // Each 20 cm column of wall: how high the ivy reaches there (a ragged top, rising and falling).
    const columns = Math.max(2, Math.ceil(width / 0.2));
    const reach: number[] = [];
    let h = height * (0.5 + 0.5 * random());
    for (let i = 0; i < columns; i++) {
      h = THREE.MathUtils.clamp(h + (random() - 0.5) * height * 0.25, height * 0.25, height);
      reach.push(h);
    }
    const reachAt = (u: number): number => {
      const f = (u / width + 0.5) * (columns - 1);
      const i = Math.min(columns - 2, Math.max(0, Math.floor(f)));
      return THREE.MathUtils.lerp(reach[i]!, reach[i + 1]!, f - i);
    };
    const autumn = currentSeason().name === 'autumn' ? currentSeason().depth : 0;
    const count = Math.round(width * height * LEAVES_PER_M2);
    const leaves = new THREE.InstancedMesh(leafGeometry(), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, side: THREE.DoubleSide }), count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const colour = new THREE.Color();
    let n = 0;
    for (let i = 0; i < count; i++) {
      const u = (random() - 0.5) * width;
      // Thicker low down: more leaves drawn near the foot.
      const v = Math.pow(random(), 1.4) * reachAt(u);
      const top = reachAt(u);
      if (v > top) continue;
      const k = 0.7 + random() * 0.6;
      e.set((random() - 0.5) * 0.9, (random() - 0.5) * 0.9, random() * Math.PI * 2);
      q.setFromEuler(e);
      s.set(k, k, k);
      p.set(u, v, 0.012 + random() * 0.05);
      leaves.setMatrixAt(n, m.compose(p, q, s));
      const edge = 1 - THREE.MathUtils.smoothstep(top - v, 0, 0.5);
      const turned = autumn > 0 && random() < autumn * (0.3 + 0.6 * edge);
      const palette = turned ? AUTUMN : GREENS;
      leaves.setColorAt(n, colour.set(palette[Math.floor(random() * palette.length)]!).multiplyScalar(0.8 + random() * 0.4));
      n++;
    }
    leaves.count = n;
    leaves.castShadow = true;
    leaves.receiveShadow = true;
    leaves.computeBoundingSphere();
    this.add(leaves);

    // A few woody stems climbing from the foot, seen between the leaves.
    const stem = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 });
    for (let i = 0; i < Math.max(2, Math.round(width / 0.6)); i++) {
      const u = (random() - 0.5) * width * 0.9;
      const points: THREE.Vector3[] = [];
      const top = reachAt(u) * (0.6 + 0.3 * random());
      for (let j = 0; j <= 6; j++) {
        const v = (j / 6) * top;
        points.push(new THREE.Vector3(u + Math.sin(j * 1.7 + i) * 0.08, v, 0.01));
      }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 12, 0.008, 4), stem);
      tube.castShadow = false;
      this.add(tube);
    }
  }
}

/** A leaf: a pointed, lobed blade, its stalk at the origin, in the XY plane. */
function leafGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const r = LEAF / 2;
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(-r * 1.1, r * 0.4, -r * 0.8, r * 1.2);
  shape.quadraticCurveTo(-r * 0.3, r * 1.4, 0, r * 2.1);
  shape.quadraticCurveTo(r * 0.3, r * 1.4, r * 0.8, r * 1.2);
  shape.quadraticCurveTo(r * 1.1, r * 0.4, 0, 0);
  return new THREE.ShapeGeometry(shape, 3);
}
