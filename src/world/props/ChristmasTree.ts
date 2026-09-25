import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';
import { seededRandom } from '@/covers/generated/canvasUtils';
import { boxMesh, cylinderMesh } from '../meshUtils';
import { markShared, matte } from './Prop';

export interface ChristmasTreeOptions {
  /** Height to the tip, metres (the star sits on it). Default 1.8. */
  height?: number;
  /** Radius of the lowest boughs. Default 0.5. */
  radius?: number;
  /** Bauble colours, cycled. */
  baubles?: number[];
  /** Fairy-light colours; they twinkle. */
  lights?: number[];
  /** Presents under it. Default 3. */
  presents?: number;
  seed?: number;
}

const NEEDLES = markShared(new THREE.MeshStandardMaterial({ color: 0x1f4a2a, roughness: 0.85, flatShading: true }));
const TRUNK = markShared(matte(0x5a3a22, 0.9));
const POT = markShared(matte(0x8a1f1f, 0.5));
const BAUBLE = markShared(new THREE.MeshStandardMaterial({ roughness: 0.2, metalness: 0.6 }));
const STAR = markShared(new THREE.MeshBasicMaterial({ color: 0xffe07a, toneMapped: false }));
const RIBBON = markShared(matte(0xf1e1b4, 0.6));
const BAUBLE_COLORS = [0xc8243a, 0xd4a52a, 0x2a5ac8, 0xe8e8f0];
const LIGHT_COLORS = [0xffc46e, 0xff4a3a, 0x3aff6a, 0x4a8aff, 0xffe07a];
const PRESENT_COLORS = [0xc8243a, 0x2a6a3a, 0x2a4a9a, 0xd4a52a];
/** Seconds between two twinkles of the lights. */
const TWINKLE_SECONDS = 0.45;

/**
 * THE CHRISTMAS TREE in the living room: a fir of stacked cones in a red pot, hung with baubles
 * and a spiral of fairy lights that twinkle, a star on top and presents underneath. The lights are
 * unlit spheres that change brightness (no real light: the light count never changes, see
 * docs/zones.md); a small `PointLight` would cost every pixel of the flat. Collides at the pot and
 * the lowest boughs. Standing on its base at local y = 0.
 */
export class ChristmasTree extends THREE.Group implements Furniture, Updatable {
  readonly footprint: THREE.Box3;
  private readonly bulbs: THREE.InstancedMesh;
  private readonly bulbColors: THREE.Color[];
  private readonly random: () => number;
  private clock = 0;

  constructor(options: ChristmasTreeOptions = {}) {
    super();
    this.name = 'ChristmasTree';
    const height = options.height ?? 1.8;
    const radius = options.radius ?? 0.5;
    this.random = seededRandom(options.seed ?? 25);
    const potH = 0.24;
    this.add(cylinderMesh(0.17, potH, POT, { y: potH / 2 }, { radiusBottom: 0.13, segments: 14 }));
    this.add(cylinderMesh(0.04, 0.3, TRUNK, { y: potH + 0.1 }, { segments: 7 }));

    // Five tiers, each a cone overlapping the one below, narrowing to the tip.
    const bottom = potH + 0.12;
    const tiers = 5;
    const span = height - bottom;
    const coneAt: { y: number; r: number; h: number }[] = [];
    for (let i = 0; i < tiers; i++) {
      const t = i / tiers;
      const r = radius * (1 - t * 0.78);
      const h = (span / tiers) * 1.7;
      const y = bottom + t * span * 0.86 + h / 2;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 11, 1, true), NEEDLES);
      cone.position.y = y;
      cone.rotation.y = i * 0.7;
      cone.castShadow = true;
      this.add(cone);
      coneAt.push({ y, r, h });
    }
    // Where a point on the boughs' surface is, at height `y` (between the tiers' skirts): for the baubles and the lights.
    const surfaceR = (y: number): number => {
      let r = 0;
      for (const c of coneAt) {
        const f = (c.y + c.h / 2 - y) / c.h;
        if (f >= 0 && f <= 1) r = Math.max(r, c.r * f);
      }
      return r;
    };

    // Baubles on the outer boughs.
    const baubleColors = options.baubles ?? BAUBLE_COLORS;
    const baubleCount = 24;
    const baubles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.032, 10, 8), BAUBLE, baubleCount);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    const c = new THREE.Color();
    for (let i = 0; i < baubleCount; i++) {
      const y = bottom + 0.1 + this.random() * (span * 0.8);
      const a = this.random() * Math.PI * 2;
      const r = surfaceR(y) + 0.015;
      m.compose(p.set(Math.cos(a) * r, y - 0.03, Math.sin(a) * r), q, s);
      baubles.setMatrixAt(i, m);
      baubles.setColorAt(i, c.setHex(baubleColors[i % baubleColors.length]!));
    }
    baubles.castShadow = false;
    this.add(baubles);

    // The fairy lights: a spiral from the bottom tier to the top, a bulb every few centimetres.
    const lightColors = options.lights ?? LIGHT_COLORS;
    const bulbCount = 60;
    this.bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.012, 6, 5), new THREE.MeshBasicMaterial({ toneMapped: false }), bulbCount);
    this.bulbColors = [];
    for (let i = 0; i < bulbCount; i++) {
      const t = i / bulbCount;
      const y = bottom + 0.05 + t * span * 0.85;
      const a = t * Math.PI * 2 * 5.5;
      const r = surfaceR(y) + 0.01;
      m.compose(p.set(Math.cos(a) * r, y, Math.sin(a) * r), q, s);
      this.bulbs.setMatrixAt(i, m);
      const color = new THREE.Color(lightColors[i % lightColors.length]!);
      this.bulbColors.push(color);
      this.bulbs.setColorAt(i, color);
    }
    this.bulbs.castShadow = false;
    this.add(this.bulbs);

    // The star on the tip, facing the room both ways.
    const star = new THREE.Mesh(new THREE.ExtrudeGeometry(starShape(0.075, 0.032), { depth: 0.015, bevelEnabled: false }), STAR);
    star.position.set(0, height + 0.02, -0.0075);
    this.add(star);

    // Presents under the lowest boughs.
    const presents = options.presents ?? 3;
    for (let i = 0; i < presents; i++) {
      const w = 0.16 + this.random() * 0.12;
      const h = 0.1 + this.random() * 0.1;
      const a = (i / presents) * Math.PI * 1.2 + 0.4;
      const r = radius * 0.72;
      const box = new THREE.Group();
      box.add(boxMesh(w, h, w * 0.85, matte(PRESENT_COLORS[i % PRESENT_COLORS.length]!, 0.55), { y: h / 2 }));
      box.add(boxMesh(w + 0.004, h + 0.004, 0.02, RIBBON, { y: h / 2 }));
      box.add(boxMesh(0.02, h + 0.004, w * 0.85 + 0.004, RIBBON, { y: h / 2 }));
      box.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      box.rotation.y = this.random() * Math.PI;
      this.add(box);
    }
    this.footprint = new THREE.Box3(new THREE.Vector3(-radius * 0.8, 0, -radius * 0.8), new THREE.Vector3(radius * 0.8, height, radius * 0.8));
  }

  update(dt: number): void {
    this.clock += dt;
    if (this.clock < TWINKLE_SECONDS) return;
    this.clock = 0;
    // A few bulbs dim, the rest come back up: a slow twinkle rather than a disco.
    const c = new THREE.Color();
    for (let i = 0; i < this.bulbColors.length; i++) {
      const level = this.random() < 0.25 ? 0.35 : 1.25;
      this.bulbs.setColorAt(i, c.copy(this.bulbColors[i]!).multiplyScalar(level));
    }
    if (this.bulbs.instanceColor) this.bulbs.instanceColor.needsUpdate = true;
  }
}

/** A five-pointed star in the xy plane, points `outer` from the centre, the notches `inner`. */
function starShape(outer: number, inner: number): THREE.Shape {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  return shape;
}
