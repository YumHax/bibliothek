import * as THREE from 'three';
import { seededRandom } from '@/covers/generated/canvasUtils';
import { markShared, Prop } from './Prop';

export interface CobwebOptions {
  /** How far the web reaches out of its corner along the wall and down it, metres. Default 0.45. */
  size?: number;
  /** Which way it spreads from the origin: 'left' (towards local -x, a corner on the right) or 'right'. Default 'left'. */
  spread?: 'left' | 'right';
  seed?: number;
}

const SILK = markShared(new THREE.LineBasicMaterial({ color: 0xe8e8ee, transparent: true, opacity: 0.45, depthWrite: false }));

/**
 * A Halloween cobweb in the top corner of a wall: spokes fanning out of the corner (the origin,
 * where the wall meets the ceiling and the next wall) and threads strung between them, sagging a
 * little, flat against the wall (wall-hung: +z into the room). Line segments, no light, nothing
 * collides; the corner is where the plan puts the origin.
 */
export class Cobweb extends Prop {
  constructor(options: CobwebOptions = {}) {
    super();
    this.name = 'Cobweb';
    const size = options.size ?? 0.45;
    const sx = options.spread === 'right' ? 1 : -1;
    const random = seededRandom(options.seed ?? 13);
    const spokes = 6;
    // Spoke directions from the corner: from along the ceiling (0) to straight down the wall (pi/2).
    const dirs = Array.from({ length: spokes }, (_, i) => {
      const a = (i / (spokes - 1)) * (Math.PI / 2) + (random() - 0.5) * 0.08;
      const reach = size * (0.8 + random() * 0.3);
      return { x: Math.cos(a) * sx, y: -Math.sin(a), reach };
    });
    const points: number[] = [];
    const z = 0.004;
    for (const d of dirs) points.push(0, 0, z, d.x * d.reach, d.y * d.reach, z);
    // Rings of thread from spoke to spoke, sagging towards the corner between them.
    for (let ring = 1; ring <= 6; ring++) {
      const r = (ring / 6.5) * size;
      for (let i = 0; i < spokes - 1; i++) {
        const a = dirs[i]!;
        const b = dirs[i + 1]!;
        const ra = Math.min(r, a.reach);
        const rb = Math.min(r, b.reach);
        const mx = ((a.x * ra + b.x * rb) / 2) * 0.9;
        const my = ((a.y * ra + b.y * rb) / 2) * 0.9;
        points.push(a.x * ra, a.y * ra, z, mx, my, z, mx, my, z, b.x * rb, b.y * rb, z);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    this.add(new THREE.LineSegments(geometry, SILK));
  }
}
