import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/*
 * Geometry helpers for the people: a smooth curve through key values, tapered limbs with rounded
 * ends, capsules between two points, rounded boxes, a unit sphere pushed out to a radius function,
 * normals welded across seams, and `Parts`, which merges everything a bone carries into one mesh
 * per material so a person costs a couple of dozen draw calls rather than a hundred.
 */

export type Keys = ReadonlyArray<readonly [x: number, y: number]>;

/** A smooth curve through `keys` (sorted by x): cubic Hermite with finite-difference tangents, flat outside the range. */
export function spline(keys: Keys, x: number): number {
  const n = keys.length;
  if (x <= keys[0]![0]) return keys[0]![1];
  if (x >= keys[n - 1]![0]) return keys[n - 1]![1];
  let i = 1;
  while (keys[i]![0] < x) i++;
  const [x1, y1] = keys[i - 1]!;
  const [x2, y2] = keys[i]!;
  const span = x2 - x1;
  const before = keys[i - 2];
  const after = keys[i + 1];
  const m1 = (before ? (y2 - before[1]) / (x2 - before[0]) : (y2 - y1) / span) * span;
  const m2 = (after ? (after[1] - y1) / (after[0] - x1) : (y2 - y1) / span) * span;
  const t = (x - x1) / span;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y1 + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * y2 + (t3 - t2) * m2;
}

/** 0 at `from`, 1 at `to`, smooth in between; `from` may be above `to`. */
export function ramp(x: number, from: number, to: number): number {
  const t = THREE.MathUtils.clamp((x - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
}

/** A bell of height 1 at `centre`, `width` being the standard deviation. */
export function bump(x: number, centre: number, width: number): number {
  const d = (x - centre) / width;
  return Math.exp(-0.5 * d * d);
}

export interface LimbOptions {
  /** Height of the rounded ends as a fraction of their radius: 1 is a hemisphere, 0 a flat disc (a hem). */
  top?: number;
  bottom?: number;
  radial?: number;
  rows?: number;
}

/**
 * A limb hanging from its joint along -y: a lathe whose radius follows `radius` (t = 0 at the joint,
 * 1 at the far end, in metres), closed by rounded ends so neighbouring segments overlap cleanly at
 * the knee or elbow.
 */
export function limbGeometry(length: number, radius: Keys, options: LimbOptions = {}): THREE.BufferGeometry {
  const { top = 1, bottom = 1, radial = 16, rows = 12 } = options;
  const rTop = spline(radius, 0);
  const rBottom = spline(radius, 1);
  const cap = 5;
  const points: THREE.Vector2[] = [];
  for (let k = 0; k <= cap; k++) {
    const a = -Math.PI / 2 + (k / cap) * (Math.PI / 2);
    points.push(new THREE.Vector2(Math.max(1e-4, rBottom * Math.cos(a)), -length + bottom * rBottom * Math.sin(a) - (k === 0 && bottom === 0 ? 1e-4 : 0)));
  }
  for (let i = rows - 1; i >= 1; i--) {
    const t = i / rows;
    points.push(new THREE.Vector2(spline(radius, t), -t * length));
  }
  for (let k = 0; k <= cap; k++) {
    const a = (k / cap) * (Math.PI / 2);
    points.push(new THREE.Vector2(Math.max(1e-4, rTop * Math.cos(a)), top * rTop * Math.sin(a) + (k === cap && top === 0 ? 1e-4 : 0)));
  }
  return new THREE.LatheGeometry(points, radial);
}

const UP = new THREE.Vector3(0, 1, 0);

/** A capsule of radius `r` whose end centres are `a` and `b`. */
export function capsuleBetween(a: THREE.Vector3, b: THREE.Vector3, r: number, radial = 8): THREE.BufferGeometry {
  const dir = b.clone().sub(a);
  const length = dir.length();
  const geometry = new THREE.CapsuleGeometry(r, Math.max(1e-4, length), 3, radial);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()));
  geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return geometry;
}

/** A box pulled onto a superellipsoid: flat faces, rounded edges and corners (higher `roundness` = squarer). */
export function roundedBox(width: number, height: number, depth: number, roundness = 3, segments = 6): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(width, height, depth, segments, segments, segments);
  box.deleteAttribute('normal');
  box.deleteAttribute('uv');
  const geometry = mergeVertices(box);
  box.dispose();
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    const nx = p.x / (width / 2);
    const ny = p.y / (height / 2);
    const nz = p.z / (depth / 2);
    const norm = Math.pow(Math.abs(nx) ** roundness + Math.abs(ny) ** roundness + Math.abs(nz) ** roundness, 1 / roundness);
    const s = norm > 0 ? 1 / norm : 1;
    position.setXYZ(i, p.x * s, p.y * s, p.z * s);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A sphere of `widthSegments` x `heightSegments` pushed out along each direction to `radius(d)`.
 * With `focus` the grid is denser towards the front and the equator (where a face is) and sparser
 * at the back and the poles; either way the UVs stay linear in angle: u = 0.5 + azimuth / 2pi (the front, +z, at 0.5,
 * u growing towards +x, the seam at the back) and v = 1 - polar angle / pi (1 at the top).
 */
export function radialSurface(radius: (d: THREE.Vector3) => number, widthSegments: number, heightSegments: number, focus = false): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const d = new THREE.Vector3();
  for (let i = 0; i <= heightSegments; i++) {
    const t = i / heightSegments;
    const theta = Math.PI * t + (focus ? 0.25 * Math.sin(2 * Math.PI * t) : 0);
    for (let j = 0; j <= widthSegments; j++) {
      const s = (2 * j) / widthSegments - 1;
      const azimuth = Math.PI * s * (focus ? 0.45 + 0.55 * s * s : 1);
      d.set(Math.sin(theta) * Math.sin(azimuth), Math.cos(theta), Math.sin(theta) * Math.cos(azimuth));
      const r = radius(d);
      positions.push(d.x * r, d.y * r, d.z * r);
      uvs.push(0.5 + azimuth / (2 * Math.PI), 1 - theta / Math.PI);
    }
  }
  const index: number[] = [];
  for (let i = 0; i < heightSegments; i++) {
    for (let j = 0; j < widthSegments; j++) {
      const a = i * (widthSegments + 1) + j;
      const b = a + 1;
      const c = a + widthSegments + 1;
      index.push(a, c, b, b, c, c + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  weldNormals(geometry);
  return geometry;
}

/** Averages the normals of vertices sharing a position, so a lathe or sphere seam does not show as a crease. */
export function weldNormals(geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal') as THREE.BufferAttribute;
  const groups = new Map<string, number[]>();
  for (let i = 0; i < position.count; i++) {
    const key = `${Math.round(position.getX(i) * 1e5)},${Math.round(position.getY(i) * 1e5)},${Math.round(position.getZ(i) * 1e5)}`;
    const group = groups.get(key);
    if (group) group.push(i);
    else groups.set(key, [i]);
  }
  const sum = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    sum.set(0, 0, 0);
    for (const i of group) sum.add(n.fromBufferAttribute(normal, i));
    if (sum.lengthSq() === 0) continue;
    sum.normalize();
    for (const i of group) normal.setXYZ(i, sum.x, sum.y, sum.z);
  }
  normal.needsUpdate = true;
}

/** Keeps only the triangles for which `keep(a, b, c)` (vertex indices) is true. */
export function filterTriangles(geometry: THREE.BufferGeometry, keep: (a: number, b: number, c: number) => boolean): void {
  const index = geometry.getIndex();
  if (!index) return;
  const kept: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    const b = index.getX(i + 1);
    const c = index.getX(i + 2);
    if (keep(a, b, c)) kept.push(a, b, c);
  }
  geometry.setIndex(kept);
}

/** A transform for `Parts.add`: position, Euler rotation (XYZ) and scale. */
export function at(x: number, y: number, z: number, rotation: [number, number, number] = [0, 0, 0], scale: number | [number, number, number] = 1): THREE.Matrix4 {
  const s = typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : new THREE.Vector3(...scale);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), s);
}

/** Collects the pieces a bone carries and merges them into one shadowed mesh per material. Never pass a mirroring (negative) scale. */
export class Parts {
  private readonly pieces = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(geometry: THREE.BufferGeometry, material: THREE.Material, matrix?: THREE.Matrix4): this {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', geometry.getAttribute('position').clone());
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    g.setAttribute('normal', geometry.getAttribute('normal').clone());
    const uv = geometry.getAttribute('uv');
    g.setAttribute('uv', uv ? uv.clone() : new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 2), 2));
    const color = geometry.getAttribute('color');
    if (color) g.setAttribute('color', color.clone());
    const index = geometry.getIndex();
    if (index) g.setIndex(index.clone());
    if (matrix) g.applyMatrix4(matrix);
    geometry.dispose();
    const list = this.pieces.get(material);
    if (list) list.push(g);
    else this.pieces.set(material, [g]);
    return this;
  }

  meshes(shadows = true): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [material, list] of this.pieces) {
      const mixed = list.some((g) => g.getIndex()) && list.some((g) => !g.getIndex());
      const ready = mixed ? list.map((g) => (g.getIndex() ? g.toNonIndexed() : g)) : list;
      const merged = ready.length === 1 ? ready[0]! : mergeGeometries(ready, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = shadows;
      mesh.receiveShadow = shadows;
      out.push(mesh);
    }
    this.pieces.clear();
    return out;
  }
}
