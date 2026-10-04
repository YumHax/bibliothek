import * as THREE from 'three';
import type { Furniture } from '../../Furniture';
import { part } from '../../props/Prop';
import { INSET } from '../../props/joinery';
import { paint, timber } from '../../materials/palette';
import { LeafBatch, LEAF_GREENS, headGeometry, stem } from './greenery';
import { lcg, pick } from '@/random';

export interface ClimbingTrellisOptions {
  /** Width of the trellis and its trough, and the trellis's height. Default 1.2 x 2.3. */
  width?: number;
  height?: number;
  /** Climbing vines. Default 5. */
  vines?: number;
  seed?: number;
}

const TROUGH = { depth: 0.26, height: 0.34 };
const SLAT = paint(0xe8e2d4, 0.6);
const SOIL = paint(0x2e2119, 1);
/** Jasmine's white and a climbing rose's pink. */
const BLOSSOM: readonly number[] = [0xf6f2ea, 0xf6f2ea, 0xf0a0b8];

/**
 * A white trellis against the wall with a jasmine climbing it out of a wooden trough: diagonal slats in a diamond
 * lattice, a few vines wandering up it slat to slat with small dark leaves and white and pink blossom. Static: the
 * slats are plain paint and merge, the leaves are baked (`LeafBatch`). Wall-hung with `y: 0`: origin on the floor at
 * the wall, +z into the room. Collides as its trough.
 */
export class ClimbingTrellis extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;

  constructor(options: ClimbingTrellisOptions = {}) {
    super();
    this.name = 'ClimbingTrellis';
    const W = options.width ?? 1.2;
    const H = options.height ?? 2.3;
    const random = lcg(options.seed ?? 5);
    const wood = timber(0x7a5a3a, 0.8);

    // The trough: front, back, ends and the soil.
    const { depth: D, height: T } = TROUGH;
    part(this, W, T, 0.025, wood, { y: T / 2, z: D - 0.0125 });
    part(this, W, T, 0.025, wood, { y: T / 2, z: 0.0125 });
    for (const x of [-W / 2 + 0.0125, W / 2 - 0.0125]) part(this, 0.025, T, D - 0.05, wood, { x, y: T / 2, z: D / 2 });
    part(this, W - 0.05, 0.02, D - 0.05, SOIL, { y: T - 0.04, z: D / 2 });

    // The lattice, standing out of the back of the trough: diagonal slats both ways, a frame round it.
    const z = 0.035;
    const bottom = T - 0.05;
    const tall = H - bottom;
    const step = 0.2;
    const slat = 0.022;
    const clip = new THREE.Box2(new THREE.Vector2(-W / 2, bottom), new THREE.Vector2(W / 2, H));
    for (const dir of [1, -1]) {
      for (let c = -tall; c < W + tall; c += step) {
        // A slat from the bottom edge (or the side) up at 45 degrees, clipped to the frame.
        const a = new THREE.Vector2(-W / 2 + c, bottom);
        const b = a.clone().add(new THREE.Vector2(dir * tall * 2, tall * 2));
        const seg = clipSegment(a, b, clip);
        if (!seg) continue;
        const [p, q] = seg;
        const length = p.distanceTo(q);
        if (length < 0.05) continue;
        const mesh = part(this, slat, length, 0.012, SLAT, { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, z: z + (dir > 0 ? 0 : 0.012) });
        mesh.rotation.z = -dir * Math.PI / 4;
      }
    }
    // The posts stand an `INSET` in from the trough's ends (flush, their outer faces would lie in the end boards').
    for (const x of [-W / 2 + 0.015 + INSET, W / 2 - 0.015 - INSET]) part(this, 0.03, tall, 0.03, SLAT, { x, y: bottom + tall / 2, z: z + 0.006 });
    part(this, W, 0.03, 0.03, SLAT, { y: H - 0.015, z: z + 0.006 });

    // The vines: up from the soil, wandering from side to side, leaves in pairs, blossom in clusters.
    const leaves = new LeafBatch();
    const head = headGeometry();
    const vine = paint(0x5a4a2a, 0.8);
    const vines = options.vines ?? 5;
    for (let v = 0; v < vines; v++) {
      let p = new THREE.Vector3(-W / 2 + 0.12 + (v / Math.max(1, vines - 1)) * (W - 0.24), T - 0.04, 0.12);
      const top = bottom + tall * (0.65 + random() * 0.33);
      while (p.y < top) {
        const next = new THREE.Vector3(THREE.MathUtils.clamp(p.x + (random() - 0.5) * 0.2, -W / 2 + 0.05, W / 2 - 0.05), p.y + 0.08 + random() * 0.05, z + 0.03 + random() * 0.02);
        stem(this, p, next, vine, 0.006);
        for (const side of [1, -1]) {
          if (random() < 0.25) continue;
          leaves.leaf(pick(random, LEAF_GREENS.deep), next, new THREE.Vector3(side, 0.4, 0.5 + random() * 0.5), 0.04 + random() * 0.02, 0.022, random() * Math.PI, 0.3);
        }
        if (random() < 0.3 && next.y > bottom + 0.4) {
          const bloom = paint(pick(random, BLOSSOM), 0.6);
          for (let i = 0; i < 4; i++) {
            const m = new THREE.Mesh(head, bloom);
            m.position.set(next.x + (random() - 0.5) * 0.05, next.y + (random() - 0.5) * 0.05, next.z + 0.02 + random() * 0.02);
            m.scale.setScalar(0.009 + random() * 0.005);
            this.add(m);
          }
        }
        p = next;
      }
    }
    leaves.addTo(this);
    this.footprint = new THREE.Box3(new THREE.Vector3(-W / 2, 0, 0), new THREE.Vector3(W / 2, H, D));
  }
}

/** The part of segment a-b inside `box` (Liang-Barsky), or null. */
function clipSegment(a: THREE.Vector2, b: THREE.Vector2, box: THREE.Box2): [THREE.Vector2, THREE.Vector2] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - box.min.x], [dx, box.max.x - a.x], [-dy, a.y - box.min.y], [dy, box.max.y - a.y]] as const) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return [new THREE.Vector2(a.x + t0 * dx, a.y + t0 * dy), new THREE.Vector2(a.x + t1 * dx, a.y + t1 * dy)];
}
