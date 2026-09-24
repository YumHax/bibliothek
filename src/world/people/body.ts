import * as THREE from 'three';
import { bump, capsuleBetween, limbGeometry, roundedBox, spline, weldNormals, type Keys, type LimbOptions } from './geometry';
import type { PersonLook } from './looks';

/*
 * Proportions at the reference height (everything is scaled to `look.height` afterwards) and the
 * shapes of the trunk, the limbs and the hands.
 *
 * The trunk is a grid of rings, each a superellipse whose half-width, depth in front and depth
 * behind follow `TRUNK` up the body: hips and seat, a waist, the ribcage and chest, shoulders
 * sloping up to the neck. Its UVs are laid out for `paintTorso`: seam at the back, u = 0.5 the
 * middle of the chest, v the height (0 at the crotch, 1 at the base of the neck).
 */

export const REFERENCE_HEIGHT = 1.72;
export const HIP_Y = 0.9;
export const THIGH_L = 0.42;
export const SHIN_L = 0.4;
/** Torso pivot (the waist) and the span of the trunk. */
export const TORSO_PIVOT_Y = 0.95;
export const TORSO_BOTTOM = 0.775;
export const TORSO_TOP = 1.49;
export const WAIST_Y = 0.97;
export const SHOULDER_Y = 1.385;
/** Shoulder pivot from the centre line, times the build. */
export const SHOULDER_X = 0.178;
export const UPPER_ARM_L = 0.3;
export const FOREARM_L = 0.27;
/** Centre of the skull, and the neck joint it nods and turns about (a little lower and further back). */
export const HEAD_Y = 1.61;
export const NECK_PIVOT = new THREE.Vector3(0, 1.55, -0.012);
/** Floor below the ankle joint. */
export const ANKLE_Y = 0.08;

/** Height, half-width, depth in front, depth behind. */
const TRUNK: ReadonlyArray<readonly [y: number, halfWidth: number, front: number, back: number]> = [
  [0.775, 0.05, 0.035, 0.04],
  [0.8, 0.13, 0.075, 0.09],
  [0.85, 0.165, 0.09, 0.11],
  [0.9, 0.172, 0.093, 0.115],
  [0.95, 0.163, 0.093, 0.102],
  [1.0, 0.149, 0.094, 0.09],
  [1.06, 0.145, 0.097, 0.087],
  [1.13, 0.15, 0.102, 0.09],
  [1.2, 0.156, 0.109, 0.096],
  [1.27, 0.162, 0.112, 0.1],
  [1.33, 0.17, 0.105, 0.1],
  [1.37, 0.178, 0.093, 0.095],
  [1.4, 0.172, 0.08, 0.085],
  [1.425, 0.15, 0.066, 0.072],
  [1.45, 0.11, 0.058, 0.062],
  [1.472, 0.07, 0.053, 0.056],
  [1.49, 0.058, 0.05, 0.052],
];
const HALF_WIDTH: Keys = TRUNK.map(([y, w]) => [y, w]);
const FRONT: Keys = TRUNK.map(([y, , f]) => [y, f]);
const BACK: Keys = TRUNK.map(([y, , , b]) => [y, b]);
/** Superellipse exponent of the trunk's rings: a little squarer than an ellipse. */
const RING = 2.4;

export interface TrunkSection {
  halfWidth: number;
  front: number;
  back: number;
}

/** The trunk's ring at height `y`, for this look's build and figure. */
export function trunkSection(y: number, look: PersonLook): TrunkSection {
  let halfWidth = spline(HALF_WIDTH, y);
  let front = spline(FRONT, y);
  let back = spline(BACK, y);
  if (look.figure === 'curvy') {
    halfWidth += 0.018 * bump(y, 0.9, 0.06) - 0.013 * bump(y, 1.04, 0.045) - 0.012 * bump(y, 1.37, 0.04);
    back += 0.012 * bump(y, 0.87, 0.05);
    front += 0.026 * bump(y, 1.235, 0.045);
  }
  // A broad build carries a belly.
  front += Math.max(0, look.build - 1) * 0.12 * bump(y, 1.06, 0.06);
  const depth = 0.75 + 0.25 * look.build;
  return { halfWidth: halfWidth * look.build, front: front * depth, back: back * depth };
}

/** The trunk in the torso's frame (origin at the waist pivot). */
export function trunkGeometry(look: PersonLook): THREE.BufferGeometry {
  const rows = 56;
  const cols = 48;
  const positions: number[] = [];
  const uvs: number[] = [];
  for (let i = 0; i <= rows; i++) {
    const y = THREE.MathUtils.lerp(TORSO_BOTTOM, TORSO_TOP, i / rows);
    const s = trunkSection(y, look);
    for (let j = 0; j <= cols; j++) {
      const theta = -Math.PI + (j / cols) * Math.PI * 2;
      const sin = Math.sin(theta);
      const cos = Math.cos(theta);
      const x = s.halfWidth * Math.sign(sin) * Math.abs(sin) ** (2 / RING);
      const z = (cos >= 0 ? s.front : s.back) * Math.sign(cos) * Math.abs(cos) ** (2 / RING);
      positions.push(x, y - TORSO_PIVOT_Y, z);
      uvs.push(j / cols, i / rows);
    }
  }
  const index: number[] = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j;
      const b = a + 1;
      const c = a + cols + 1;
      const d = c + 1;
      index.push(a, b, c, b, d, c);
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

/** Limb radii along their length (t = 0 at the joint), for girth 1, in metres. */
const LIMB = {
  thigh: [[0, 0.074], [0.15, 0.077], [0.45, 0.07], [0.8, 0.058], [1, 0.052]],
  shin: [[0, 0.05], [0.12, 0.052], [0.28, 0.056], [0.5, 0.047], [0.8, 0.036], [0.95, 0.033], [1, 0.032]],
  trouserShin: [[0, 0.06], [0.3, 0.059], [0.7, 0.055], [1, 0.056]],
  upperArm: [[0, 0.05], [0.3, 0.046], [0.55, 0.045], [0.85, 0.039], [1, 0.037]],
  forearm: [[0, 0.038], [0.18, 0.041], [0.5, 0.036], [0.85, 0.028], [1, 0.026]],
} satisfies Record<string, Keys>;

/** A limb from `LIMB`, thickened by `girth` and loosened by `ease` metres (cloth over it). */
export function limb(kind: keyof typeof LIMB, length: number, girth: number, ease = 0, options: LimbOptions = {}): THREE.BufferGeometry {
  return limbGeometry(
    length,
    LIMB[kind].map(([t, r]) => [t, r * girth + ease] as const),
    options,
  );
}

/**
 * A hand hanging from the wrist (origin) along -y, palm towards the body: the palm, four fingers
 * in two joints each curling gently in, and the thumb in front. `side` is +1 for the hand on +x.
 */
export function handGeometries(side: -1 | 1, size: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const palm = roundedBox(0.026 * size, 0.088 * size, 0.078 * size, 2.6, 5);
  palm.translate(-side * 0.002, -0.044 * size, 0);
  out.push(palm);
  const fingers: Array<[z: number, length: number, r: number]> = [
    [0.026, 0.074, 0.0088],
    [0.009, 0.08, 0.0088],
    [-0.008, 0.075, 0.0084],
    [-0.025, 0.061, 0.0076],
  ];
  const direction = (curl: number): THREE.Vector3 => new THREE.Vector3(-side * Math.sin(curl), -Math.cos(curl), 0);
  for (const [z, length, r] of fingers) {
    const base = new THREE.Vector3(0, -0.084 * size, z * size);
    const knuckle = base.clone().addScaledVector(direction(0.25), 0.55 * length * size);
    const tip = knuckle.clone().addScaledVector(direction(0.7), 0.45 * length * size - r);
    out.push(capsuleBetween(base, knuckle, r * size, 6), capsuleBetween(knuckle, tip, r * 0.92 * size, 6));
  }
  const thumbBase = new THREE.Vector3(-side * 0.006, -0.028 * size, 0.03 * size);
  const thumbJoint = thumbBase.clone().add(new THREE.Vector3(-side * 0.01, -0.028, 0.018).multiplyScalar(size));
  const thumbTip = thumbJoint.clone().add(new THREE.Vector3(-side * 0.012, -0.026, 0.006).multiplyScalar(size));
  out.push(capsuleBetween(thumbBase, thumbJoint, 0.0115 * size, 6), capsuleBetween(thumbJoint, thumbTip, 0.0095 * size, 6));
  return out;
}
