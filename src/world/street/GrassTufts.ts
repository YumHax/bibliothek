import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { lcg } from '@/random';
import { currentSeason } from '@/time/season';

/** A strip of ground the tufts grow along (`from` to `to`, street-local x, z), `width` across, at height `y`. */
export interface TuftStrip {
  from: readonly [number, number];
  to: readonly [number, number];
  width: number;
  y?: number;
}

/** Blades to a tuft, and its size (m). */
const BLADES = 7;
const HEIGHT = 0.16;
const SPREAD = 0.07;
/** The grass's greens by season: fresh in spring, dusty in summer, tawny in autumn, straw in winter. */
const GREENS = {
  spring: [0x5f9a3a, 0x7aae48, 0x4c8530],
  summer: [0x6a8f3a, 0x8a9a4a, 0x56782e],
  autumn: [0x7a8a3e, 0x9a8a4a, 0x6a6a34],
  winter: [0x8a8460, 0x9a9070, 0x6e6a4c],
} as const;

/**
 * Tufts of grass where a mower never reaches: along a lawn's curb, a hedge's foot, the edges of a park's paths, the
 * moss line at a wall's foot. One instanced mesh for every strip, a fan of thin blades per tuft (double-sided, lit,
 * no texture), each tuft turned, scaled and tinted from its own seed and the season. Never collides.
 */
export class GrassTufts extends THREE.InstancedMesh implements Furniture {
  readonly contactShadow = false;
  readonly footprint = new THREE.Box3();

  constructor(strips: readonly TuftStrip[], perMetre: number, seed: number) {
    const random = lcg(seed);
    const spots: { x: number; y: number; z: number }[] = [];
    for (const strip of strips) {
      const [x0, z0] = strip.from;
      const [x1, z1] = strip.to;
      const length = Math.hypot(x1 - x0, z1 - z0);
      const nx = -(z1 - z0) / (length || 1);
      const nz = (x1 - x0) / (length || 1);
      const count = Math.max(1, Math.round(length * perMetre));
      for (let i = 0; i < count; i++) {
        const t = random();
        const off = (random() - 0.5) * strip.width;
        spots.push({ x: x0 + (x1 - x0) * t + nx * off, y: strip.y ?? 0, z: z0 + (z1 - z0) * t + nz * off });
      }
    }
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide, vertexColors: true });
    super(tuftGeometry(), material, Math.max(spots.length, 1));
    this.name = 'GrassTufts';
    const greens = GREENS[currentSeason().name];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const colour = new THREE.Color();
    spots.forEach((spot, i) => {
      const k = 0.6 + random() * 0.8;
      q.setFromAxisAngle(UP, random() * Math.PI * 2);
      s.set(k, k * (0.7 + random() * 0.6), k);
      p.set(spot.x, spot.y, spot.z);
      this.setMatrixAt(i, m.compose(p, q, s));
      this.setColorAt(i, colour.set(greens[Math.floor(random() * greens.length)]!).multiplyScalar(0.85 + random() * 0.3));
    });
    this.count = spots.length;
    this.castShadow = false;
    this.receiveShadow = true;
    this.computeBoundingSphere();
  }
}

const UP = new THREE.Vector3(0, 1, 0);

/** One tuft: `BLADES` thin triangles fanned round its foot, leaning out, darker at the root (vertex colour). */
function tuftGeometry(): THREE.BufferGeometry {
  const random = lcg(97);
  const positions: number[] = [];
  const colours: number[] = [];
  for (let b = 0; b < BLADES; b++) {
    const a = (b / BLADES) * Math.PI * 2 + random() * 0.6;
    const lean = 0.35 + random() * 0.5;
    const h = HEIGHT * (0.6 + random() * 0.5);
    const r = SPREAD * random() * 0.5;
    const bx = Math.cos(a) * r;
    const bz = Math.sin(a) * r;
    const w = 0.008;
    const tx = bx + Math.cos(a) * h * lean * 0.5;
    const tz = bz + Math.sin(a) * h * lean * 0.5;
    // Across the blade: perpendicular to its lean.
    const cx = -Math.sin(a) * w;
    const cz = Math.cos(a) * w;
    positions.push(bx - cx, 0, bz - cz, bx + cx, 0, bz + cz, tx, h, tz);
    colours.push(0.55, 0.55, 0.5, 0.55, 0.55, 0.5, 1, 1, 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.computeVertexNormals();
  return geometry;
}
