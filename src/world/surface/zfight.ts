import * as THREE from 'three';

/**
 * Dev-time z-fighting finder (`?debug` / `?stats`: `bibliothek.zfight()` in the console, and a
 * `[zfight]` line each time a zone is built). Walks a subtree's drawn meshes, puts every triangle
 * in world space, and reports pairs from different meshes (or different materials of one mesh)
 * that face the same way in (nearly) the same plane and overlap: what flickers in play.
 *
 * "Nearly": closer than a few depth steps at `viewDistance`, a step being about
 * `z² / (near · 2²⁴)` metres at distance `z` (24-bit depth). Pairs whose materials have different
 * polygon offsets are taken as settled (a `surface/layers` layer over its surface), and so are
 * pairs where either side draws nothing (a hitbox).
 */
export interface ZFightPair {
  a: string;
  b: string;
  /** Distance between the two planes (mm). */
  gapMm: number;
  /** Overlapping area (cm²). */
  areaCm2: number;
  /** Where the overlap is, in world space. */
  at: string;
}

export interface ZFightOptions {
  /** Distance the pairs are judged at (m): the farther, the wider the gap that still fights. Default 10. */
  viewDistance?: number;
  /** The camera's near plane (m). Default 0.1. */
  near?: number;
  /** Smallest overlap worth reporting (m²). Default 1 cm². */
  minArea?: number;
  /** Stop after this many triangles (a whole street is millions). Default 3 million. */
  maxTriangles?: number;
}

interface Tri {
  /** Index of the mesh in `owners`, and the material this triangle is drawn with. */
  owner: number;
  material: THREE.Material;
  /** World centre. */
  centre: THREE.Vector3;
  /** Plane distance along the bucket's normal. */
  d: number;
  /** 2D projection on the plane (u, v per vertex) and its bounds. */
  p: [number, number][];
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
}

const DEPTH_STEPS = 4;

export function findZFighting(root: THREE.Object3D, options: ZFightOptions = {}): ZFightPair[] {
  const { viewDistance = 10, near = 0.1, minArea = 1e-4, maxTriangles = 3_000_000 } = options;
  const step = (viewDistance * viewDistance) / (near * 2 ** 24);
  const tolerance = Math.max(2e-5, DEPTH_STEPS * step);
  root.updateWorldMatrix(true, true);

  const owners: THREE.Object3D[] = [];
  const buckets = new Map<string, Tri[]>();
  let triangles = 0;
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const vc = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const instance = new THREE.Matrix4();
  const world = new THREE.Matrix4();

  const addTriangle = (owner: number, material: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, doubleSided: boolean): void => {
    e1.subVectors(b, a);
    e2.subVectors(c, a);
    normal.crossVectors(e1, e2);
    const area = normal.length() / 2;
    if (area < 1e-7) return;
    normal.normalize();
    for (const sign of doubleSided ? [1, -1] : [1]) {
      const nx = round(normal.x * sign);
      const ny = round(normal.y * sign);
      const nz = round(normal.z * sign);
      const n = new THREE.Vector3(nx, ny, nz).normalize();
      const d = n.dot(a);
      const bin = Math.floor(d / tolerance);
      const [u, v] = planeAxes(n);
      const p = [a, b, c].map((q): [number, number] => [u.dot(q), v.dot(q)]);
      const tri: Tri = {
        owner,
        material,
        centre: a.clone().add(b).add(c).divideScalar(3),
        d,
        p,
        minU: Math.min(p[0]![0], p[1]![0], p[2]![0]),
        maxU: Math.max(p[0]![0], p[1]![0], p[2]![0]),
        minV: Math.min(p[0]![1], p[1]![1], p[2]![1]),
        maxV: Math.max(p[0]![1], p[1]![1], p[2]![1]),
      };
      const key = `${nx},${ny},${nz}|${bin}`;
      let list = buckets.get(key);
      if (!list) buckets.set(key, (list = []));
      list.push(tri);
    }
  };

  root.traverseVisible((obj) => {
    if (triangles > maxTriangles) return;
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || (obj as THREE.SkinnedMesh).isSkinnedMesh) return;
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!position) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const owner = owners.push(obj) - 1;
    const index = geometry.index;
    const count = index ? index.count : position.count;
    const groups = geometry.groups.length > 0 && Array.isArray(mesh.material) ? geometry.groups : [{ start: 0, count, materialIndex: 0 }];
    const instanced = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh) : null;
    const copies = instanced ? instanced.count : 1;
    for (let k = 0; k < copies; k++) {
      if (instanced) {
        instanced.getMatrixAt(k, instance);
        world.multiplyMatrices(mesh.matrixWorld, instance);
      } else {
        world.copy(mesh.matrixWorld);
      }
      for (const group of groups) {
        const material = materials[group.materialIndex ?? 0];
        if (!material || !material.visible || !material.colorWrite || !material.depthTest) continue;
        const doubleSided = material.side === THREE.DoubleSide;
        const end = Math.min(count, group.start + group.count);
        for (let i = group.start; i + 2 < end; i += 3) {
          const i0 = index ? index.getX(i) : i;
          const i1 = index ? index.getX(i + 1) : i + 1;
          const i2 = index ? index.getX(i + 2) : i + 2;
          va.fromBufferAttribute(position, i0).applyMatrix4(world);
          vb.fromBufferAttribute(position, i1).applyMatrix4(world);
          vc.fromBufferAttribute(position, i2).applyMatrix4(world);
          addTriangle(owner, material, va, vb, vc, doubleSided);
          triangles++;
        }
      }
    }
  });

  const found = new Map<string, ZFightPair>();
  const test = (s: Tri, t: Tri): void => {
    if (s.owner === t.owner && s.material === t.material) return;
    if (s.maxV <= t.minV || t.maxV <= s.minV) return;
    const gap = Math.abs(s.d - t.d);
    if (gap > tolerance) return;
    if (settledByOffset(s.material, t.material)) return;
    const overlap = overlapArea(s.p, t.p);
    if (overlap < minArea) return;
    const key = `${Math.min(s.owner, t.owner)}|${Math.max(s.owner, t.owner)}|${s.material.id}|${t.material.id}`;
    const previous = found.get(key);
    const areaCm2 = overlap * 1e4;
    if (previous) {
      previous.areaCm2 += areaCm2;
      return;
    }
    const c = s.centre;
    found.set(key, { a: pathOf(owners[s.owner]!, root), b: pathOf(owners[t.owner]!, root), gapMm: gap * 1000, areaCm2, at: `${c.x.toFixed(2)}, ${c.y.toFixed(3)}, ${c.z.toFixed(2)}` });
  };
  /** Sweep and prune along u: only triangles whose u ranges overlap are tested (a merged facade has thousands in one plane). */
  const sweep = (list: Tri[], other: Tri[] | null): void => {
    const items = other ? [...list.map((t) => ({ t, side: 0 })), ...other.map((t) => ({ t, side: 1 }))] : list.map((t) => ({ t, side: 0 }));
    items.sort((x, y) => x.t.minU - y.t.minU);
    let active: typeof items = [];
    for (const item of items) {
      active = active.filter((a) => a.t.maxU > item.t.minU);
      for (const a of active) if (!other || a.side !== item.side) test(a.t, item.t);
      active.push(item);
    }
  };
  for (const [key, list] of buckets) {
    sweep(list, null);
    const [n, bin] = key.split('|') as [string, string];
    const next = buckets.get(`${n}|${Number(bin) + 1}`);
    if (next) sweep(list, next);
  }
  const pairs = [...found.values()].sort((x, y) => y.areaCm2 - x.areaCm2);
  for (const pair of pairs) {
    pair.gapMm = Number(pair.gapMm.toFixed(3));
    pair.areaCm2 = Number(pair.areaCm2.toFixed(1));
  }
  if (triangles > maxTriangles) console.warn(`[zfight] stopped after ${maxTriangles} triangles`);
  return pairs;
}

function round(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Two unit axes spanning the plane of normal `n`. */
function planeAxes(n: THREE.Vector3): [THREE.Vector3, THREE.Vector3] {
  const helper = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(helper, n).normalize();
  const v = new THREE.Vector3().crossVectors(n, u);
  return [u, v];
}

function settledByOffset(a: THREE.Material, b: THREE.Material): boolean {
  const offset = (m: THREE.Material): number => (m.polygonOffset ? m.polygonOffsetUnits + m.polygonOffsetFactor * 1000 : 0);
  return offset(a) !== offset(b);
}

/** Area of the intersection of two 2D triangles (Sutherland-Hodgman: clip one by the other's edges). */
function overlapArea(subject: [number, number][], clip: [number, number][]): number {
  let polygon = subject;
  const orientation = Math.sign(cross(clip[0]!, clip[1]!, clip[2]!)) || 1;
  for (let i = 0; i < 3 && polygon.length > 0; i++) {
    const p = clip[i]!;
    const q = clip[(i + 1) % 3]!;
    const inside = (r: [number, number]): boolean => cross(p, q, r) * orientation > 0;
    const next: [number, number][] = [];
    for (let j = 0; j < polygon.length; j++) {
      const cur = polygon[j]!;
      const prev = polygon[(j + polygon.length - 1) % polygon.length]!;
      const curIn = inside(cur);
      const prevIn = inside(prev);
      if (curIn !== prevIn) next.push(intersect(prev, cur, p, q));
      if (curIn) next.push(cur);
    }
    polygon = next;
  }
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x1, y1] = polygon[i]!;
    const [x2, y2] = polygon[(i + 1) % polygon.length]!;
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

function cross(o: [number, number], a: [number, number], b: [number, number]): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function intersect(a: [number, number], b: [number, number], p: [number, number], q: [number, number]): [number, number] {
  const a1 = b[1] - a[1];
  const b1 = a[0] - b[0];
  const c1 = a1 * a[0] + b1 * a[1];
  const a2 = q[1] - p[1];
  const b2 = p[0] - q[0];
  const c2 = a2 * p[0] + b2 * p[1];
  const det = a1 * b2 - a2 * b1;
  if (Math.abs(det) < 1e-12) return a;
  return [(b2 * c1 - b1 * c2) / det, (a1 * c2 - a2 * c1) / det];
}

/** A readable path from `root` down to `obj`: names where set, class names otherwise. */
function pathOf(obj: THREE.Object3D, root: THREE.Object3D): string {
  const parts: string[] = [];
  for (let o: THREE.Object3D | null = obj; o && o !== root; o = o.parent) {
    if (o.name) parts.push(o.name);
    else if (o.constructor.name !== 'Mesh' && o.constructor.name !== 'Group' && o.constructor.name !== 'Object3D') parts.push(o.constructor.name);
  }
  const mesh = obj as THREE.Mesh;
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const colour = (material as THREE.MeshStandardMaterial | undefined)?.color?.getHexString();
  return `${parts.reverse().join(' > ') || 'Mesh'}${colour ? ` #${colour}` : ''} (${mesh.geometry?.type ?? '?'})`;
}
