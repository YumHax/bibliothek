import * as THREE from 'three';
import { markShared } from './materials/sharedResources';

/**
 * Profiled mouldings for a room's shell: a skirting board with an ogee top and a crown cove, each a
 * profile swept along a straight run. A run's local frame: x along it (centred), y up from its
 * bottom (the floor for the skirting, the ceiling for the cove, which hangs below y = 0), z out from
 * the wall into the room. The faces against the wall and against the floor or ceiling are left out
 * (never seen, and they would share the wall's plane). An end in a room's corner is mitred (the run
 * along the next wall meets it on the diagonal), an end at a doorway is capped.
 */
export type MouldingKind = 'skirting' | 'cove';
export type RunEnd = 'mitre' | 'cap';

/** A profile: points (out from the wall, up), from the wall down at the floor/ceiling round to the wall again. */
type Profile = readonly (readonly [number, number])[];

/** Profiles of the skirting (8 cm tall, 2 cm proud) and the cove (7 cm by 7 cm). */
export const SKIRTING = { height: 0.08, depth: 0.02 } as const;
export const COVE = { size: 0.07 } as const;

/** Joints sharper than this (radians) keep a crease; softer ones are shaded smooth. */
const CREASE = THREE.MathUtils.degToRad(35);
const CURVE_STEPS = 8;

function skirtingProfile(): Profile {
  const { height: h, depth: d } = SKIRTING;
  const points: [number, number][] = [
    [0, 0],
    [d, 0],
    [d, h * 0.62],
  ];
  // The ogee: an S from the face back to the top's narrow edge.
  for (let i = 1; i <= CURVE_STEPS; i++) {
    const t = i / CURVE_STEPS;
    points.push([d - d * 0.55 * (0.5 - 0.5 * Math.cos(Math.PI * t)), h * 0.62 + h * 0.3 * t]);
  }
  points.push([d * 0.45, h], [0, h]);
  return points;
}

function coveProfile(): Profile {
  const s = COVE.size;
  const lip = s * 0.08;
  const points: [number, number][] = [
    [0, -s],
    [lip, -s],
    [lip, -s + lip],
  ];
  // The hollow quarter round, centred out in the room below the ceiling.
  const r = s - 2 * lip;
  const cx = lip + r;
  const cy = -s + lip;
  for (let i = 1; i <= CURVE_STEPS * 2; i++) {
    const a = (i / (CURVE_STEPS * 2)) * (Math.PI / 2);
    points.push([cx - r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  points.push([s, -lip], [s, 0], [0, 0]);
  return points;
}

const PROFILES: Record<MouldingKind, () => Profile> = { skirting: skirtingProfile, cove: coveProfile };

const cache = new Map<string, THREE.BufferGeometry>();

/**
 * The geometry of a run of `kind` moulding `length` long (measured along the wall), its ends as
 * given (`low` at -x, `high` at +x). Cached per shape and marked shared: never edit it in place.
 */
export function mouldingGeometry(kind: MouldingKind, length: number, low: RunEnd, high: RunEnd): THREE.BufferGeometry {
  const key = `${kind}|${length}|${low}|${high}`;
  let geometry = cache.get(key);
  if (!geometry) {
    geometry = markShared(sweep(PROFILES[kind](), length, low, high));
    cache.set(key, geometry);
  }
  return geometry;
}

/**
 * The profile swept along x. The profile's first and last segments lie on the floor (or ceiling)
 * and the wall: those two are skipped. Each other segment is a quad with its own two edges, shaded
 * smooth across soft joints; the ends are mitred (x pulled in by the depth, for an inside corner)
 * or capped with the profile's outline.
 */
function sweep(profile: Profile, length: number, low: RunEnd, high: RunEnd): THREE.BufferGeometry {
  const xAt = (end: RunEnd, sign: number, depth: number): number => sign * (length / 2 - (end === 'mitre' ? depth : 0));
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  // Segment normals in the (out, up) plane: the profile runs so that (dy, -dx) points out of the solid.
  const segments = profile.length - 1;
  const segmentNormal = (i: number): THREE.Vector2 => {
    const [x0, y0] = profile[i]!;
    const [x1, y1] = profile[i + 1]!;
    return new THREE.Vector2(y1 - y0, -(x1 - x0)).normalize();
  };
  const faceNormals = Array.from({ length: segments }, (_, i) => segmentNormal(i));
  // Skip the segment on the floor/ceiling (first for the skirting, lying at y = 0 or the cove's
  // last, along the ceiling) and the one against the wall: whichever lie on x = 0 or y = 0.
  const hidden = (i: number): boolean => {
    const [x0, y0] = profile[i]!;
    const [x1, y1] = profile[i + 1]!;
    return (x0 === 0 && x1 === 0) || (y0 === 0 && y1 === 0);
  };
  const jointNormal = (i: number, joint: number): THREE.Vector2 => {
    // `joint` is the index of the profile point; the neighbour segment is i - 1 or i + 1.
    const own = faceNormals[i]!;
    const other = joint === i ? i - 1 : i + 1;
    if (other < 0 || other >= segments || hidden(other)) return own;
    const neighbour = faceNormals[other]!;
    return own.angleTo(neighbour) < CREASE ? own.clone().add(neighbour).normalize() : own;
  };
  let along = 0;
  for (let i = 0; i < segments; i++) {
    const [x0, y0] = profile[i]!;
    const [x1, y1] = profile[i + 1]!;
    const run = Math.hypot(x1 - x0, y1 - y0);
    if (hidden(i)) {
      along += run;
      continue;
    }
    const base = positions.length / 3;
    const n0 = jointNormal(i, i);
    const n1 = jointNormal(i, i + 1);
    for (const [depth, height, n, v] of [
      [x0, y0, n0, along],
      [x1, y1, n1, along + run],
    ] as const) {
      positions.push(xAt(low, -1, depth), height, depth, xAt(high, 1, depth), height, depth);
      normals.push(0, n.y, n.x, 0, n.y, n.x);
      uvs.push(0, v, length, v);
    }
    along += run;
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }
  // Caps: the profile's outline, triangulated, at each capped end.
  const outline = profile.map(([x, y]) => new THREE.Vector2(x, y));
  const triangles = THREE.ShapeUtils.triangulateShape(outline, []);
  for (const [end, sign] of [
    [low, -1],
    [high, 1],
  ] as const) {
    if (end !== 'cap') continue;
    const base = positions.length / 3;
    for (const p of outline) {
      positions.push(sign * (length / 2), p.y, p.x);
      normals.push(sign, 0, 0);
      uvs.push(p.x, p.y);
    }
    for (const [a, b, c] of triangles) {
      // Wound to face out along x (+x at the high end, -x at the low one), whatever way round the triangulation went.
      const pa = outline[a!]!;
      const pb = outline[b!]!;
      const pc = outline[c!]!;
      const facing = (pb.y - pa.y) * (pc.x - pa.x) - (pb.x - pa.x) * (pc.y - pa.y);
      if (facing * sign > 0) indices.push(base + a!, base + b!, base + c!);
      else indices.push(base + a!, base + c!, base + b!);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}
