import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { gaussian, ramp } from '@/math/scalar';
import { capsuleBetween, limbGeometry, roundedBox, spline, weldNormals, type Keys, type LimbOptions } from './geometry';
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
/**
 * The bones the body bends at, over the floor: the pelvis turns about the hip joints' line (the hip
 * joints themselves sit on it, `rig.ts`), the lower back above the waist, the chest at the ribs (the
 * trunk bends between them, `SpineSkin`).
 */
export const PELVIS_Y = 0.9;
export const LUMBAR_Y = 1.0;
export const CHEST_Y = 1.2;
/** Where a collarbone turns (the top of the breastbone, a little to its side), from the centre line. */
export const CLAVICLE = { x: 0.03, y: SHOULDER_Y + 0.025, z: 0.025 } as const;
/** The shoe, from the ankle joint: the heel's back edge and the ball of the foot (where it rolls), ahead (+z). */
export const HEEL_Z = -0.06;
export const BALL_Z = 0.14;

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

interface TrunkSection {
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
    halfWidth += 0.018 * gaussian(y, 0.9, 0.06) - 0.013 * gaussian(y, 1.04, 0.045) - 0.012 * gaussian(y, 1.37, 0.04);
    back += 0.012 * gaussian(y, 0.87, 0.05);
    front += 0.026 * gaussian(y, 1.235, 0.045);
  }
  // A broad build carries a belly.
  front += Math.max(0, look.build - 1) * 0.12 * gaussian(y, 1.06, 0.06);
  const depth = 0.75 + 0.25 * look.build;
  return { halfWidth: halfWidth * look.build, front: front * depth, back: back * depth };
}

/** The trunk in the torso's frame (origin at the waist pivot). */
export function trunkGeometry(look: PersonLook): THREE.BufferGeometry {
  const rows = 56;
  const cols = 48;
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
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
      const shade = 1 - trunkOcclusion(y, sin, cos, look);
      colors.push(shade, shade, shade);
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
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  weldNormals(geometry);
  return geometry;
}

/**
 * The light the trunk's own shape keeps from itself (0 none .. 1 black), baked into its vertex
 * colours: the armpits under the arms, the crotch between the legs, the collar at the neck, the
 * fold under a full bust. At a ring's angle given by `sin` (the sides at +-1) and `cos` (the front at 1).
 */
function trunkOcclusion(y: number, sin: number, cos: number, look: PersonLook): number {
  const side = Math.abs(sin);
  const armpit = 0.34 * gaussian(y, 1.3, 0.045) * ramp(side, 0.78, 0.98);
  const underArm = 0.14 * ramp(y, 1.12, 1.3) * ramp(y, 1.4, 1.34) * ramp(side, 0.86, 1);
  const crotch = 0.3 * ramp(y, 0.86, 0.775) * (0.6 + 0.4 * ramp(side, 0.6, 0));
  const collar = 0.14 * ramp(y, 1.445, 1.49);
  const bust = look.figure === 'curvy' ? 0.14 * gaussian(y, 1.175, 0.022) * ramp(cos, 0.35, 0.8) : 0;
  return Math.min(0.6, armpit + underArm + crotch + collar + bust);
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

/** How a hand is held: each finger's two joints (radians of curl towards the palm), how far the fingers fan apart, the thumb's end. */
interface HandShape {
  knuckle: number;
  tip: number;
  spread: number;
  /** The thumb's middle joint and tip, from its base (times the size), palm side negative across `side`. */
  thumb: [joint: [number, number, number], tip: [number, number, number]];
}

/** At rest, the fingers gently in; a fist (the thumb across the fingers); a hand open flat and spread (a wave, a ball held). */
const RELAXED: HandShape = { knuckle: 0.25, tip: 0.7, spread: 0, thumb: [[0.01, -0.028, 0.018], [0.012, -0.026, 0.006]] };
const FIST: HandShape = { knuckle: 1.45, tip: 2.75, spread: -0.1, thumb: [[0.017, -0.026, 0.004], [0.016, -0.012, -0.018]] };
const OPEN: HandShape = { knuckle: 0.04, tip: 0.1, spread: 0.55, thumb: [[0.006, -0.022, 0.028], [0.004, -0.022, 0.02]] };

/**
 * A hand hanging from the wrist (origin) along -y, palm towards the body: the palm, four fingers
 * in two joints each, and the thumb in front; `shape` says how they are held. `side` is +1 for the
 * hand on +x. Every shape has the same vertices in the same order (morph targets of each other).
 */
function handGeometries(side: -1 | 1, size: number, shape: HandShape): THREE.BufferGeometry[] {
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
  const direction = (curl: number, fan: number): THREE.Vector3 => new THREE.Vector3(-side * Math.sin(curl), -Math.cos(curl), fan).normalize();
  for (const [z, length, r] of fingers) {
    const fan = (z - 0.0005) * 10 * shape.spread;
    const base = new THREE.Vector3(0, -0.084 * size, z * size);
    const knuckle = base.clone().addScaledVector(direction(shape.knuckle, fan), 0.55 * length * size);
    const tip = knuckle.clone().addScaledVector(direction(shape.tip, fan), 0.45 * length * size - r);
    out.push(capsuleBetween(base, knuckle, r * size, 6), capsuleBetween(knuckle, tip, r * 0.92 * size, 6));
  }
  const [joint, end] = shape.thumb;
  const thumbBase = new THREE.Vector3(-side * 0.006, -0.028 * size, 0.03 * size);
  const thumbJoint = thumbBase.clone().add(new THREE.Vector3(-side * joint[0], joint[1], joint[2]).multiplyScalar(size));
  const thumbTip = thumbJoint.clone().add(new THREE.Vector3(-side * end[0], end[1], end[2]).multiplyScalar(size));
  out.push(capsuleBetween(thumbBase, thumbJoint, 0.0115 * size, 6), capsuleBetween(thumbJoint, thumbTip, 0.0095 * size, 6));
  return out;
}

/**
 * The hand as one geometry (wrist at the origin) with two morph targets: 0 a fist, 1 open and
 * spread. `PersonModel` curls it (`curl` > 0 towards the fist, < 0 towards open).
 */
export function handGeometry(side: -1 | 1, size: number): THREE.BufferGeometry {
  const merge = (shape: HandShape): THREE.BufferGeometry => {
    const pieces = handGeometries(side, size, shape).map((g) => {
      const clean = new THREE.BufferGeometry();
      clean.setAttribute('position', g.getAttribute('position'));
      clean.setAttribute('normal', g.getAttribute('normal') ?? (g.computeVertexNormals(), g.getAttribute('normal')));
      clean.setIndex(g.getIndex());
      return clean;
    });
    return mergeGeometries(pieces, false)!;
  };
  const base = merge(RELAXED);
  const fist = merge(FIST);
  const open = merge(OPEN);
  base.morphAttributes.position = [fist.getAttribute('position'), open.getAttribute('position')];
  base.morphAttributes.normal = [fist.getAttribute('normal'), open.getAttribute('normal')];
  base.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(base.getAttribute('position').count * 2), 2));
  return base;
}
