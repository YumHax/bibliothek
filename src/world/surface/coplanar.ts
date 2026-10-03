import * as THREE from 'three';
import { gapAt } from './layers';

/**
 * Faces of one merged mesh that lie in (nearly) the same plane, face the same way, overlap and show
 * something different there (another colour, another bit of texture): z-fighting no polygon offset can
 * settle, since they share one material. The street's builders (`TriBuilder`, `QuadBuilder`) run this on
 * every build under `?debug` and warn, so a sill flush with its wall or a trim on a trim shows up without
 * opening the `bibliothek.zfight()` console. `zfight` uses the same geometry (`planeAxes`,
 * `clipTriangle`, `sampleAt`).
 */
export interface CoplanarOverlap {
  /** Where the overlap is (its middle, in the mesh's own frame). */
  at: THREE.Vector3Tuple;
  /** The way both faces face (rounded). */
  normal: THREE.Vector3Tuple;
  /** Distance between the two planes (m). */
  gap: number;
  /** Overlapping area (m²). */
  area: number;
}

export interface CoplanarOptions {
  /**
   * How far the mesh is seen from (m), default 40: two faces closer than `gapAt` there fight, unless their overlap is
   * too thin to show at that distance (`visibleTo`: then judged as far as it still shows).
   */
  distance?: number;
  /** Smallest overlap worth reporting (m²). Default 4 cm². */
  minArea?: number;
  /** Stop after this many overlaps. Default 50. */
  limit?: number;
  /** Two values of the attribute closer than this are the same (colour channels, uvs). Default 0.02. */
  same?: number;
}

export type P2 = [number, number];

interface FlatTri {
  /** First corner's index in the attribute arrays (three corners per triangle, or through the index). */
  corners: [number, number, number];
  axis: THREE.Vector3;
  u: THREE.Vector3;
  v: THREE.Vector3;
  d: number;
  p: [P2, P2, P2];
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
}

/**
 * The overlaps in one geometry's triangles (`position`, optionally `index`), compared on `attribute`
 * (vertex colours, uvs: what makes two overlapping faces look different). Without `attribute` every
 * overlap counts.
 */
export function coplanarOverlaps(position: THREE.BufferAttribute, index: THREE.BufferAttribute | null, attribute: THREE.BufferAttribute | null, options: CoplanarOptions = {}): CoplanarOverlap[] {
  const { distance = 40, minArea = 4e-4, limit = 50, same = 0.02 } = options;
  const tolerance = gapAt(distance);
  const buckets = new Map<string, FlatTri[]>();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const count = index ? index.count : position.count;
  for (let i = 0; i + 2 < count; i += 3) {
    const corners: [number, number, number] = index ? [index.getX(i), index.getX(i + 1), index.getX(i + 2)] : [i, i + 1, i + 2];
    a.fromBufferAttribute(position, corners[0]);
    b.fromBufferAttribute(position, corners[1]);
    c.fromBufferAttribute(position, corners[2]);
    const n = e1.subVectors(b, a).cross(e2.subVectors(c, a));
    if (n.lengthSq() < 1e-12) continue;
    n.normalize();
    const nx = round(n.x);
    const ny = round(n.y);
    const nz = round(n.z);
    const axis = new THREE.Vector3(nx, ny, nz).normalize();
    const d = axis.dot(a);
    const [u, v] = planeAxes(axis);
    const p = [a, b, c].map((q): P2 => [u.dot(q), v.dot(q)]) as [P2, P2, P2];
    const tri: FlatTri = {
      corners,
      axis,
      u,
      v,
      d,
      p,
      minU: Math.min(p[0][0], p[1][0], p[2][0]),
      maxU: Math.max(p[0][0], p[1][0], p[2][0]),
      minV: Math.min(p[0][1], p[1][1], p[2][1]),
      maxV: Math.max(p[0][1], p[1][1], p[2][1]),
    };
    const key = `${nx},${ny},${nz}|${Math.floor(d / tolerance)}`;
    let list = buckets.get(key);
    if (!list) buckets.set(key, (list = []));
    list.push(tri);
  }

  const found: CoplanarOverlap[] = [];
  const at = new THREE.Vector3();
  const differ = (s: FlatTri, t: FlatTri, q: P2): boolean => {
    if (!attribute) return true;
    for (let k = 0; k < attribute.itemSize; k++) {
      if (Math.abs(sampleAt(attribute, s.corners, s.p, q, k) - sampleAt(attribute, t.corners, t.p, q, k)) > same) return true;
    }
    return false;
  };
  const test = (s: FlatTri, t: FlatTri): void => {
    if (found.length >= limit) return;
    if (s.maxV <= t.minV || t.maxV <= s.minV) return;
    const gap = Math.abs(s.d - t.d);
    if (gap > tolerance) return;
    const polygon = clipTriangle(s.p, t.p);
    const area = polygonArea(polygon);
    if (area < minArea) return;
    if (gap > 0 && gap >= gapAt(Math.min(distance, visibleTo(polygon, area)))) return;
    const q = centroid(polygon);
    if (!differ(s, t, q)) return;
    at.copy(s.axis).multiplyScalar(s.d).addScaledVector(s.u, q[0]).addScaledVector(s.v, q[1]);
    if (pressed(buckets, tolerance, at, s.axis, [s, t])) return;
    found.push({ at: [round3(at.x), round3(at.y), round3(at.z)], normal: [s.axis.x, s.axis.y, s.axis.z].map(round) as THREE.Vector3Tuple, gap, area });
  };
  const sweep = (list: FlatTri[], other: FlatTri[] | null): void => {
    const items = other ? [...list.map((t) => ({ t, side: 0 })), ...other.map((t) => ({ t, side: 1 }))] : list.map((t) => ({ t, side: 0 }));
    items.sort((x, y) => x.t.minU - y.t.minU);
    let active: typeof items = [];
    for (const item of items) {
      active = active.filter((o) => o.t.maxU > item.t.minU);
      for (const o of active) if (!other || o.side !== item.side) test(o.t, item.t);
      active.push(item);
    }
  };
  for (const [key, list] of buckets) {
    if (found.length >= limit) break;
    sweep(list, null);
    const [n, bin] = key.split('|') as [string, string];
    const next = buckets.get(`${n}|${Number(bin) + 1}`);
    if (next) sweep(list, next);
  }
  return found;
}

/** Under `?debug` / `?stats`, like `bibliothek.zfight()`: the builders check what they build. */
const CHECKING = typeof location !== 'undefined' && /[?&](debug|stats)\b/.test(location.search);

/**
 * `?debug` / `?stats` only: warns for `geometry` (a builder's output) about its overlapping coplanar
 * faces that differ, naming where it was built (from the stack). Nothing otherwise.
 */
export function warnCoplanar(geometry: THREE.BufferGeometry, attribute: 'color' | 'uv'): void {
  if (!CHECKING) return;
  const position = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!position || position.count === 0) return;
  const found = coplanarOverlaps(position, geometry.index, (geometry.getAttribute(attribute) as THREE.BufferAttribute | undefined) ?? null);
  if (!found.length) return;
  const where = new Error().stack?.split('\n')[3]?.trim() ?? '';
  const first = found[0]!;
  console.warn(
    `[zfight] ${found.length}${found.length >= 50 ? '+' : ''} coplanar overlap${found.length === 1 ? '' : 's'} in one built mesh (${where}): first at ${first.at.join(', ')}, ${(first.gap * 1000).toFixed(1)} mm apart, ${(first.area * 1e4).toFixed(0)} cm². Give the nearer face a real gap of gapAt(distance) (surface/layers).`,
    found,
  );
}

function round(x: number): number {
  return Math.round(x * 100) / 100;
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

/** A triangle laid in its plane (`d` along its bucket's normal, its corners in the plane's axes), as both checks bucket them. */
export interface PlaneTri {
  axis: THREE.Vector3;
  u: THREE.Vector3;
  v: THREE.Vector3;
  d: number;
  p: [P2, P2, P2];
}

/**
 * Whether `point`, on faces facing `normal`, is pressed against a face of `buckets` facing the other way in the same
 * plane (within `tolerance`): two solids touching there (a cushion's bottom on the seat's top), neither face seen.
 * `buckets` keyed as both checks key them: the rounded normal, then the plane's bin of `tolerance`. `reach`: how far
 * apart the two planes may be and still touch (default `tolerance`).
 */
export function pressed(buckets: ReadonlyMap<string, readonly PlaneTri[]>, tolerance: number, point: THREE.Vector3, normal: THREE.Vector3, faces: readonly PlaneTri[] = [], reach = tolerance): boolean {
  const back = new THREE.Vector3(-round(normal.x), -round(normal.y), -round(normal.z));
  const key = `${back.x},${back.y},${back.z}`;
  back.normalize();
  const d = back.dot(point);
  const [u, v] = planeAxes(back);
  const q: P2 = [u.dot(point), v.dot(point)];
  const within = Math.max(reach, tolerance);
  // Within `within` either way: a face resting on another solid, or sunk into it.
  const first = Math.floor((d - within) / tolerance) - 1;
  const last = Math.floor((d + within) / tolerance) + 1;
  for (let b = first; b <= last; b++) {
    for (const tri of buckets.get(`${key}|${b}`) ?? []) {
      // Not the back of one of `faces` (a sheet's two sides, a double-sided material): that is the same surface.
      if (Math.abs(tri.d - d) <= within && insideTriangle(q, tri.p) && !faces.some((f) => twins(f, tri))) return true;
    }
  }
  return false;
}

/** Whether `a` and `b` have the same three corners (a sheet's front and back). */
function twins(a: PlaneTri, b: PlaneTri): boolean {
  const corner = new THREE.Vector3();
  return a.p.every(([pu, pv]) => {
    corner.copy(a.axis).multiplyScalar(a.d).addScaledVector(a.u, pu).addScaledVector(a.v, pv);
    const [qu, qv] = [b.u.dot(corner), b.v.dot(corner)];
    return b.p.some(([bu, bv]) => Math.abs(bu - qu) < 1e-4 && Math.abs(bv - qv) < 1e-4);
  });
}

/** Whether `q` lies in the triangle `p` (either winding, edges included). */
function insideTriangle(q: P2, p: readonly [P2, P2, P2]): boolean {
  const a = cross(p[0], p[1], q);
  const b = cross(p[1], p[2], q);
  const c = cross(p[2], p[0], q);
  return (a >= -1e-9 && b >= -1e-9 && c >= -1e-9) || (a <= 1e-9 && b <= 1e-9 && c <= 1e-9);
}

/** Pixels per radian of view on a 1440-pixel-tall frame at the camera's 70° (the finest the game is played at). */
const PIXELS_PER_RADIAN = 1440 / ((70 * Math.PI) / 180);
/** An overlap narrower on screen than this flickers too little to see (a pixel, shared by MSAA). */
const MIN_PIXELS = 1.5;

/**
 * How far away (m) an overlap (`polygon`, of `area`) still shows `MIN_PIXELS` across: its width (twice its area over
 * its perimeter: a strip's width, half a square's side) seen at that distance. Past it, a fight is a sub-pixel shimmer.
 */
export function visibleTo(polygon: readonly P2[], area: number): number {
  let perimeter = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x1, y1] = polygon[i]!;
    const [x2, y2] = polygon[(i + 1) % polygon.length]!;
    perimeter += Math.hypot(x2 - x1, y2 - y1);
  }
  return perimeter > 0 ? ((2 * area) / perimeter) * (PIXELS_PER_RADIAN / MIN_PIXELS) : 0;
}

/** Two unit axes spanning the plane of normal `n`. */
export function planeAxes(n: THREE.Vector3): [THREE.Vector3, THREE.Vector3] {
  const helper = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(helper, n).normalize();
  const v = new THREE.Vector3().crossVectors(n, u);
  return [u, v];
}

/** `subject` clipped by triangle `by` (Sutherland-Hodgman: by each of its edges): their 2D intersection. */
export function clipTriangle(subject: P2[], by: P2[]): P2[] {
  let polygon = subject;
  const orientation = Math.sign(cross(by[0]!, by[1]!, by[2]!)) || 1;
  for (let i = 0; i < 3 && polygon.length > 0; i++) {
    const p = by[i]!;
    const q = by[(i + 1) % 3]!;
    const inside = (r: P2): boolean => cross(p, q, r) * orientation > 0;
    const next: P2[] = [];
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
  return polygon;
}

export function polygonArea(polygon: P2[]): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x1, y1] = polygon[i]!;
    const [x2, y2] = polygon[(i + 1) % polygon.length]!;
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

export function centroid(polygon: P2[]): P2 {
  let x = 0;
  let y = 0;
  for (const [px, py] of polygon) {
    x += px;
    y += py;
  }
  return [x / polygon.length, y / polygon.length];
}

/** `attribute`'s component `k` across a triangle (its `corners`' indices, `p` its corners in the plane), at the in-plane point `q` (barycentric). */
export function sampleAt(attribute: THREE.BufferAttribute, corners: readonly [number, number, number], p: readonly [P2, P2, P2], q: P2, k: number): number {
  const [p0, p1, p2] = p;
  const area = cross(p0, p1, p2);
  if (Math.abs(area) < 1e-12) return attribute.getComponent(corners[0], k);
  const w0 = cross(p1, p2, q) / area;
  const w1 = cross(p2, p0, q) / area;
  const w2 = 1 - w0 - w1;
  return w0 * attribute.getComponent(corners[0], k) + w1 * attribute.getComponent(corners[1], k) + w2 * attribute.getComponent(corners[2], k);
}

function cross(o: P2, a: P2, b: P2): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function intersect(a: P2, b: P2, p: P2, q: P2): P2 {
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
