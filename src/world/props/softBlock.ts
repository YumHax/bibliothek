import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MeshPosition } from '../meshUtils';
import { markShared } from '../materials/sharedResources';
import { lcg } from '@/random';

/** How a soft block is stuffed. */
interface SoftShape {
  /**
   * Exponent of the superellipsoid the box is pulled onto: 2 is a pebble (a duvet's roll, a rolled towel), 3 a stuffed
   * cushion, 6 a mattress (flat faces, rounded edges), 10 almost a box. Default 4.
   */
  round?: number;
  /** How much thinner it gets towards its rim (0: as thick at the edge as in the middle; 0.5 a pillow). Default 0.25. */
  pinch?: number;
  /** Amplitude (m) of the gentle lumps of the top (a duvet's down, a sweater's folds). Default 0. */
  lumps?: number;
  /** Which lumps. */
  seed?: number;
}

const geometries = new Map<string, THREE.BufferGeometry>();

/**
 * The geometry of a soft block `width` x `height` x `depth` centred on the origin: a box with enough segments to bend,
 * welded so its normals are shared across the edges (no crease anywhere), pulled onto a superellipsoid, pinched towards
 * its rim and, with `lumps`, its top dimpled. UVs are a box projection in metres (a weave tiles at its real size).
 * One per shape for the page (shared): never edit it in place.
 */
export function softBlockGeometry(width: number, height: number, depth: number, shape: SoftShape = {}): THREE.BufferGeometry {
  const { round = 4, pinch = 0.25, lumps = 0, seed = 1 } = shape;
  const key = `${width}|${height}|${depth}|${round}|${pinch}|${lumps}|${seed}`;
  let geometry = geometries.get(key);
  if (!geometry) {
    geometry = markShared(build(width, height, depth, round, pinch, lumps, seed));
    geometries.set(key, geometry);
  }
  return geometry;
}

function build(width: number, height: number, depth: number, round: number, pinch: number, lumps: number, seed: number): THREE.BufferGeometry {
  // Segments by size: about one per 6 cm across, never fewer than the curve needs.
  const seg = (size: number, min: number): number => Math.max(min, Math.min(16, Math.ceil(size / 0.06)));
  const box = new THREE.BoxGeometry(width, height, depth, seg(width, 6), seg(height, 3), seg(depth, 6));
  box.deleteAttribute('normal');
  box.deleteAttribute('uv');
  const geometry = mergeVertices(box);
  box.dispose();

  const random = lcg(seed * 2654435761);
  // A few soft bumps scattered over the top, each a smooth hill (no noise texture, no shimmer).
  const bumps = lumps > 0 ? Array.from({ length: 5 }, () => ({ x: (random() - 0.5) * width, z: (random() - 0.5) * depth, r: 0.12 + random() * 0.2, a: (random() - 0.35) * lumps })) : [];

  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const uv = new Float32Array(position.count * 2);
  const p = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    const nx = p.x / (width / 2);
    const ny = p.y / (height / 2);
    const nz = p.z / (depth / 2);
    // The box face this vertex was on, for the uv projection (before it is moved).
    const ax = Math.abs(nx);
    const ay = Math.abs(ny);
    const az = Math.abs(nz);
    if (ay >= ax && ay >= az) uv.set([p.x, p.z], i * 2);
    else if (ax >= az) uv.set([p.z, p.y], i * 2);
    else uv.set([p.x, p.y], i * 2);

    // Radial squeeze onto |x|^n + |y|^n + |z|^n = 1: face centres stay, corners and edges come in.
    const norm = Math.pow(ax ** round + ay ** round + az ** round, 1 / round);
    const scale = norm > 0 ? 1 / norm : 1;
    const rim = Math.min(1, Math.hypot(nx, nz) / Math.SQRT2);
    const puff = 1 - pinch * rim * rim;
    let y = p.y * scale * puff;
    if (ny > 0) for (const b of bumps) y += b.a * ny * Math.exp(-((p.x - b.x) ** 2 + (p.z - b.z) ** 2) / (b.r * b.r));
    position.setXYZ(i, p.x * scale, y, p.z * scale);
  }
  position.needsUpdate = true;
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * `part()` for soft things (bedding, cushions, clothes, a mattress): a soft block at `position` (its centre), casting and
 * receiving shadows, added to `parent`.
 */
export function softPart(parent: THREE.Object3D, width: number, height: number, depth: number, material: THREE.Material, position: MeshPosition = {}, shape: SoftShape = {}): THREE.Mesh {
  const mesh = new THREE.Mesh(softBlockGeometry(width, height, depth, shape), material);
  mesh.position.set(position.x ?? 0, position.y ?? 0, position.z ?? 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
