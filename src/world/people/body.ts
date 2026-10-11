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
const SHOULDER_X = 0.178;
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

/**
 * The person's own proportions (`look.lines`) in reference metres: the thigh and the shin (their
 * sum minus the reference's, `legRise`, lifts everything above the hips), how much higher the
 * head sits on a longer neck (`neckRise`), and where the shoulder joint is (`shoulderX` from the
 * centre line, `shoulderY` over the floor before the rises). The whole person is then scaled so
 * the height stays `look.height`.
 */
export interface Proportions {
  thigh: number;
  shin: number;
  legRise: number;
  neckRise: number;
  shoulderX: number;
  shoulderY: number;
}

export function proportionsOf(look: PersonLook): Proportions {
  const lines = look.lines;
  const legs = lines?.legs ?? 1;
  const thigh = THIGH_L * legs;
  const shin = SHIN_L * legs;
  return {
    thigh,
    shin,
    legRise: thigh + shin - THIGH_L - SHIN_L,
    neckRise: ((lines?.neck ?? 1) - 1) * 0.035,
    shoulderX: SHOULDER_X * look.build * (lines?.shoulders ?? 1),
    shoulderY: SHOULDER_Y + (lines?.slope ?? 0) * 0.006,
  };
}

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
export const RING = 2.4;

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
  // The person's own shoulders: wider or narrower at the joints, square (a flatter line out from the neck) or sloping.
  const lines = look.lines;
  if (lines) {
    halfWidth *= 1 + (lines.shoulders - 1) * gaussian(y, 1.38, 0.045);
    halfWidth += lines.slope * 0.01 * gaussian(y, 1.44, 0.018);
  }
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
  // A jacket (or a coat) stands off the body: a little ease from the hips to the collar.
  const layered = look.top === 'jacket' || look.coat === true;
  for (let i = 0; i <= rows; i++) {
    const y = THREE.MathUtils.lerp(TORSO_BOTTOM, TORSO_TOP, i / rows);
    const s = trunkSection(y, look);
    if (layered) {
      const ease = 0.008 * ramp(y, 0.9, 0.97) * ramp(y, 1.47, 1.42);
      s.halfWidth += ease;
      s.front += ease;
      s.back += ease;
    }
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

/**
 * A whole limb in one surface (shoulder to wrist, hip to ankle): the `LIMB` profiles end to end,
 * each over its own length, thickened by `girth` and loosened by its own ease (cloth over it).
 * One lathe with rows about every two centimetres, so it can bend smoothly at the elbow or the
 * knee (`motion/limbSkin`) instead of two pieces meeting there.
 */
export function limbChain(segments: ReadonlyArray<readonly [kind: keyof typeof LIMB, length: number, ease?: number]>, girth: number, options: LimbOptions = {}): THREE.BufferGeometry {
  const total = segments.reduce((sum, [, length]) => sum + length, 0);
  const keys: [number, number][] = [];
  let start = 0;
  for (const [i, [kind, length, ease = 0]] of segments.entries()) {
    for (const [t, r] of LIMB[kind]) {
      // The joint between two segments takes the mean of both ends (no step in the surface).
      if (i > 0 && t === 0) {
        const last = keys[keys.length - 1]!;
        last[1] = (last[1] + r * girth + ease) / 2;
        continue;
      }
      keys.push([(start + t * length) / total, r * girth + ease]);
    }
    start += length;
  }
  return limbGeometry(total, keys, { rows: Math.ceil(total / 0.02), radial: 18, ...options });
}

/**
 * How a hand is held: each finger's three joints (radians of curl towards the palm: at the
 * knuckle, the middle joint and the last one, each from the one before), how far the fingers fan
 * apart, how much further the outer fingers curl than the index (`cascade`, times `CASCADE`), the
 * thumb's end.
 */
interface HandShape {
  knuckle: number;
  middle: number;
  last: number;
  spread: number;
  cascade: number;
  /** The thumb's middle joint and tip, from its base (times the size), palm side negative across `side`. */
  thumb: [joint: [number, number, number], tip: [number, number, number]];
}

/**
 * At rest, the fingers gently in, the little finger most (a resting hand's cascade); a fist (the
 * thumb across the fingers); a hand open flat and spread (a wave, a ball held).
 */
const RELAXED: HandShape = { knuckle: 0.22, middle: 0.42, last: 0.26, spread: 0, cascade: 1, thumb: [[0.01, -0.028, 0.018], [0.012, -0.026, 0.006]] };
const FIST: HandShape = { knuckle: 1.45, middle: 1.3, last: 0.75, spread: -0.1, cascade: 0.1, thumb: [[0.017, -0.026, 0.004], [0.016, -0.012, -0.018]] };
const OPEN: HandShape = { knuckle: 0.04, middle: 0.06, last: 0.03, spread: 0.55, cascade: 0.3, thumb: [[0.006, -0.022, 0.028], [0.004, -0.022, 0.02]] };
/** Each finger's extra curl at the knuckle in a cascade, index to little finger (the middle joint takes 0.6 of it). */
const CASCADE = [0, 0.1, 0.22, 0.36] as const;
/** Index to little finger: across the palm (z), length beyond the knuckle, radius, and how far up the palm the knuckle sits. */
const FINGERS: ReadonlyArray<readonly [z: number, length: number, r: number, knuckleY: number]> = [
  [0.026, 0.074, 0.0088, -0.083],
  [0.009, 0.08, 0.0088, -0.085],
  [-0.008, 0.075, 0.0084, -0.083],
  [-0.025, 0.061, 0.0076, -0.078],
];
/** The finger's three bones, as shares of its length. */
const PHALANGES = [0.45, 0.3, 0.25] as const;
/** The palm: thickness, length (wrist to knuckles) and width (index to little finger). */
const PALM = [0.026, 0.088, 0.078] as const;

/** One piece of the hand and the share of it that is nail, knuckle and palm skin (`handRegion`, per vertex). */
interface HandPiece {
  geometry: THREE.BufferGeometry;
  region: Float32Array;
}

/**
 * A hand hanging from the wrist (origin) along -y, palm towards the body: the palm (narrowing to
 * the wrist, the pad under the thumb, the heel of the hand, a hollow in the middle, the knuckles'
 * ridge on the back), four fingers in three bones each, and the thumb in front; `shape` says how
 * they are held. `side` is +1 for the hand on +x. Every shape has the same vertices in the same
 * order (morph targets of each other). Each piece says where its nails, knuckles and palm skin are.
 */
function handPieces(side: -1 | 1, size: number, shape: HandShape): HandPiece[] {
  const out: HandPiece[] = [];
  out.push(palmPiece(side, size));
  const direction = (curl: number, fan: number): THREE.Vector3 => new THREE.Vector3(-side * Math.sin(curl), -Math.cos(curl), fan).normalize();
  FINGERS.forEach(([z, length, r, knuckleY], i) => {
    const fan = (z - 0.0005) * 10 * shape.spread;
    const extra = shape.cascade * CASCADE[i]!;
    const angles = [shape.knuckle + extra];
    angles.push(angles[0]! + shape.middle + 0.6 * extra, angles[0]! + shape.middle + 0.6 * extra + shape.last);
    const joints = [new THREE.Vector3(0, knuckleY * size, z * size)];
    for (let k = 0; k < 3; k++) {
      const reach = PHALANGES[k]! * length - (k === 2 ? 0.8 * r : 0);
      joints.push(joints[k]!.clone().addScaledVector(direction(angles[k]!, fan), reach * size));
    }
    const radii = [r, r * 0.93, r * 0.86];
    for (let k = 0; k < 3; k++) {
      const back = new THREE.Vector3(side * Math.cos(angles[k]!), -Math.sin(angles[k]!), 0);
      out.push(segmentPiece(joints[k]!, joints[k + 1]!, radii[k]! * size, back, k));
    }
  });
  const [joint, end] = shape.thumb;
  const thumbBase = new THREE.Vector3(-side * 0.006, -0.028 * size, 0.03 * size);
  const thumbJoint = thumbBase.clone().add(new THREE.Vector3(-side * joint[0], joint[1], joint[2]).multiplyScalar(size));
  const thumbTip = thumbJoint.clone().add(new THREE.Vector3(-side * end[0], end[1], end[2]).multiplyScalar(size));
  // The thumbnail faces out and forward, away from the palm.
  const thumbBack = new THREE.Vector3(side * 0.55, 0, 0.84);
  out.push(segmentPiece(thumbBase, thumbJoint, 0.0125 * size, thumbBack, 1), segmentPiece(thumbJoint, thumbTip, 0.0098 * size, thumbBack, 2));
  return out;
}

/**
 * The palm: a rounded block shaped like one. It narrows to the wrist; the pad under the thumb and
 * the heel of the hand stand out on the palm side, the middle is hollowed a little, pads sit under
 * the fingers, and the knuckles make a ridge on the back. Its back is knuckle skin there, its front palm skin.
 */
function palmPiece(side: -1 | 1, size: number): HandPiece {
  const [thick, long, wide] = PALM;
  const geometry = roundedBox(thick, long, wide, 2.6, 6);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const region = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    let x = position.getX(i);
    const y = position.getY(i);
    let z = position.getZ(i);
    // 0 at the wrist, 1 at the knuckles; how far round to the palm (-side x) or the back.
    const t = (long / 2 - y) / long;
    const palmSide = Math.max(0, (-side * x) / (thick / 2));
    const backSide = Math.max(0, (side * x) / (thick / 2));
    z *= 0.8 + 0.2 * ramp(t, 0, 0.45);
    const thenar = gaussian(z, 0.021, 0.013) * gaussian(t, 0.32, 0.2);
    const heel = gaussian(z, -0.026, 0.012) * gaussian(t, 0.4, 0.25);
    const hollow = gaussian(z, 0, 0.018) * gaussian(t, 0.55, 0.16);
    const pads = gaussian(t, 0.93, 0.05);
    let ridge = 0;
    for (const [fz] of FINGERS) ridge += gaussian(z, fz, 0.006);
    ridge *= gaussian(t, 0.96, 0.06);
    x += -side * palmSide * (0.006 * thenar + 0.003 * heel + 0.0012 * pads - 0.002 * hollow) + side * backSide * 0.0016 * ridge; // convention-ok: sculpting the palm, not a layer
    z += 0.003 * thenar * palmSide;
    position.setXYZ(i, x * size, y * size, z * size);
    region[i * 3 + 1] = backSide * Math.min(1, 0.4 * ridge + 0.5 * gaussian(t, 0.95, 0.08));
    region[i * 3 + 2] = ramp(palmSide, 0.2, 0.75);
  }
  geometry.translate(-side * 0.002 * size, (-long / 2) * size, 0);
  geometry.computeVertexNormals();
  return { geometry, region };
}

/**
 * One bone of a finger or the thumb (`k`: 0 nearest the palm .. 2 the tip), a capsule from `a` to
 * `b`; `back` is the back of the finger there (away from the palm). The tip's back carries the nail,
 * the joints' backs are knuckle skin, the front palm skin.
 */
function segmentPiece(a: THREE.Vector3, b: THREE.Vector3, r: number, back: THREE.Vector3, k: number): HandPiece {
  const geometry = capsuleBetween(a, b, r, 8);
  const position = geometry.getAttribute('position');
  const region = new Float32Array(position.count * 3);
  const axis = b.clone().sub(a);
  const length2 = Math.max(axis.lengthSq(), 1e-10);
  const out = back.clone().addScaledVector(axis, -back.dot(axis) / length2).normalize();
  const p = new THREE.Vector3();
  const off = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i).sub(a);
    const s = p.dot(axis) / length2;
    off.copy(p).addScaledVector(axis, -THREE.MathUtils.clamp(s, 0, 1));
    const awayFromPalm = off.lengthSq() > 1e-12 ? off.normalize().dot(out) : 0;
    const onBack = ramp(awayFromPalm, 0.3, 0.8);
    const nail = k === 2 ? ramp(awayFromPalm, 0.5, 0.78) * ramp(s, 0.18, 0.4) * ramp(s, 1.12, 0.98) : 0;
    const joints = k === 0 ? gaussian(s, 1, 0.14) : k === 1 ? gaussian(s, 0, 0.14) + 0.6 * gaussian(s, 1, 0.14) : 0.6 * gaussian(s, 0, 0.14);
    region[i * 3] = nail;
    region[i * 3 + 1] = onBack * Math.min(1, joints) * (1 - nail);
    region[i * 3 + 2] = 0.8 * ramp(awayFromPalm, -0.3, -0.8);
  }
  return { geometry, region };
}

/**
 * The hand as one geometry (wrist at the origin) with two morph targets: 0 a fist, 1 open and
 * spread. `PersonModel` curls it (`curl` > 0 towards the fist, < 0 towards open). `handRegion`
 * (nail, knuckle, palm skin per vertex) tints it in its material (`handSkin`).
 */
export function handGeometry(side: -1 | 1, size: number): THREE.BufferGeometry {
  const merge = (shape: HandShape, withRegion: boolean): THREE.BufferGeometry => {
    const pieces = handPieces(side, size, shape).map(({ geometry, region }) => {
      const clean = new THREE.BufferGeometry();
      clean.setAttribute('position', geometry.getAttribute('position'));
      clean.setAttribute('normal', geometry.getAttribute('normal') ?? (geometry.computeVertexNormals(), geometry.getAttribute('normal')));
      if (withRegion) clean.setAttribute('handRegion', new THREE.Float32BufferAttribute(region, 3));
      clean.setIndex(geometry.getIndex());
      return clean;
    });
    return mergeGeometries(pieces, false)!;
  };
  const base = merge(RELAXED, true);
  const fist = merge(FIST, false);
  const open = merge(OPEN, false);
  base.morphAttributes.position = [fist.getAttribute('position'), open.getAttribute('position')];
  base.morphAttributes.normal = [fist.getAttribute('normal'), open.getAttribute('normal')];
  base.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(base.getAttribute('position').count * 2), 2));
  return base;
}
