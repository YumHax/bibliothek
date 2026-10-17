import * as THREE from 'three';
import { gaussian, ramp } from '@/math/scalar';
import { at, capsuleBetween, Parts, radialSurface, spline, type Keys } from './geometry';
import { afterChunk, patchShader } from '../materials/shaderPatch';
import { QUALITY } from '@/graphics/quality';
import { faceTraitsOf, type Age, type FaceTraits, type PersonLook } from './looks';

/*
 * The head, in its own frame: origin at the centre of the skull (level with the ears), +z the
 * face, +y up. The shape is one sphere pushed out along each direction to `headRadius(d)`: a
 * squarish skull, a jaw that narrows to the chin, and the face sculpted on top of it (brow ridge,
 * eye sockets, cheekbones, the nose, lips, chin). Being radial, anything else (hair, beard, the
 * painted face) can ask where the skin is in any direction. Also here: ears, hats, glasses.
 */

/** What varies between faces (`faceShapeOf`). */
export interface FaceShape {
  jaw: number;
  nose: number;
  /** The face's own lines and asymmetries. */
  traits: FaceTraits;
  age: Age;
  /** Where the lips meet and where they end (`mouthLine`), shared by the skin's shape, the jaw and the painted lips. */
  mouth: MouthLine;
}

/**
 * The mouth's lines, in the face's angles (elevation `v` by azimuth `u`, +u towards +x): the
 * parting between the lips (`partingAt`: through the middle and the two corners, which need not be
 * level), the upper lip's border (`upperLipAt`: the cupid's bow) and the lower lip's (`lowerLipAt`).
 */
export interface MouthLine {
  middle: number;
  /** The parting's elevation at the -x and +x corners. */
  left: number;
  right: number;
  /** Azimuth of the corners either side of the middle. */
  half: number;
  /** The upper lip's border at the middle (the dip of the bow) and at its peaks (`BOW_PEAK` either side). */
  top: number;
  peak: number;
  /** The lower lip's border at the middle. */
  bottom: number;
}

/** Azimuth of the cupid's bow's two peaks. */
const BOW_PEAK = 0.055;

/** The head's shape for `look`: jaw and nose, the face's traits, its age (an elder's nose a little bigger, a child's smaller). */
export function faceShapeOf(look: PersonLook): FaceShape {
  const age = look.age ?? 'adult';
  const traits = faceTraitsOf(look);
  const shape = { jaw: look.jaw, nose: look.nose * (age === 'elder' ? 1.08 : age === 'child' ? 0.75 : 1), traits, age };
  return { ...shape, mouth: mouthLine(traits, age) };
}

/** How full the lips are: the face's own, thinner with age. */
function lipFullness(traits: FaceTraits, age: Age): number {
  return (0.75 + 0.25 * traits.lips) * (age === 'elder' ? 0.72 : 1);
}

/** A neutral mouth (the face's smile is a morph, `addFaceMorphs`), one corner a little lower by the face's asymmetry. */
function mouthLine(traits: FaceTraits, age: Age): MouthLine {
  const full = lipFullness(traits, age);
  const tilt = traits.corner * 0.016;
  const middle = -0.58;
  return { middle, left: -0.578 - Math.max(0, -tilt), right: -0.578 - Math.max(0, tilt), half: age === 'child' ? 0.235 : 0.26, top: middle + 0.058 * full, peak: middle + 0.075 * full, bottom: middle - 0.088 * full };
}

/** The parting's elevation at azimuth `u` (clamped to the corners): a parabola through the corners and the middle. */
export function partingAt(m: MouthLine, u: number): number {
  const t = THREE.MathUtils.clamp(u / m.half, -1, 1);
  return m.middle + ((m.left + m.right) / 2 - m.middle) * t * t + ((m.right - m.left) / 2) * t;
}

/** The upper lip's border at azimuth `u`: the bow's dip, its peaks, then down into the corners. */
export function upperLipAt(m: MouthLine, u: number): number {
  const au = Math.min(Math.abs(u), m.half);
  if (au <= BOW_PEAK) return m.top + (m.peak - m.top) * (au / BOW_PEAK);
  const s = (au - BOW_PEAK) / (m.half - BOW_PEAK);
  return m.peak + (partingAt(m, Math.sign(u) * m.half) - m.peak) * s * s;
}

/** The lower lip's border at azimuth `u`: full under the middle, rising into the corners. */
export function lowerLipAt(m: MouthLine, u: number): number {
  const s = Math.min(Math.abs(u), m.half) / m.half;
  return m.bottom + (partingAt(m, Math.sign(u) * m.half) - m.bottom) * s ** 2.5;
}

/** Skull half-sizes: width, height above and below the centre, depth to the face and to the back. */
const A = 0.077;
const B_UP = 0.113;
const B_DOWN = 0.118;
const C_FRONT = 0.092;
const C_BACK = 0.103;
/** A bell's squared reach (in its sigmas) past which it is taken as 0: e^-16, a ten-millionth (`headRadius`). */
const BELL_REACH = 32;
/** Superellipse exponent of the skull: a little squarer than an egg. */
const N = 2.3;
/** The nose's rise off the face along its length, by elevation angle (bridge high, tip at -0.3). */
const NOSE: Keys = [
  [-0.48, 0],
  [-0.42, 0.006],
  [-0.37, 0.022],
  [-0.31, 0.03],
  [-0.2, 0.024],
  [0, 0.015],
  [0.14, 0.008],
  [0.3, 0],
];

/** Where the eyes look out: the direction of the centre of the right-hand (+x) eye from the skull's centre (before the face's asymmetry, `eyeSurface`). */
const EYE_DIRECTION = new THREE.Vector3(0.037, 0.0145, 0.09).normalize();
const EYE_U = Math.atan2(EYE_DIRECTION.x, EYE_DIRECTION.z);
const EYE_V = Math.asin(EYE_DIRECTION.y);

/** How far up (radians of elevation) the eye on `side` (+1: +x) sits, by the face's asymmetry: up to two millimetres between the two. */
function eyeLift(side: number, shape: FaceShape): number {
  return shape.traits.eye * 0.01 * side;
}

/** The skin over the eye on `side` (+1: +x), where its ball sits: `EYE_DIRECTION` mirrored, lifted by the face's asymmetry. */
export function eyeSurface(side: -1 | 1, shape: FaceShape): THREE.Vector3 {
  const u = EYE_U * side;
  const v = EYE_V + eyeLift(side, shape);
  return headPoint(new THREE.Vector3(Math.cos(v) * Math.sin(u), Math.sin(v), Math.cos(v) * Math.cos(u)), shape);
}

/**
 * Distance from the head's centre to the skin in the unit direction `d`. The face is made in pairs
 * but never quite mirrored: one eye a little higher, the nose leaning, a corner of the mouth lower,
 * one side of the jaw fuller (`FaceTraits`); age adds bags under the eyes, jowls, hollow temples,
 * thinner lips; a child's face is rounder, its nose small and low at the bridge.
 */
export function headRadius(d: THREE.Vector3, shape: FaceShape): number {
  const { traits, age } = shape;
  const elder = age === 'elder' ? 1 : 0;
  const child = age === 'child' ? 1 : 0;
  const b = d.y > 0 ? B_UP : B_DOWN * traits.length;
  const c = d.z > 0 ? C_FRONT : C_BACK;
  let r = Math.pow(Math.abs(d.x / A) ** N + Math.abs(d.y / b) ** N + Math.abs(d.z / c) ** N, -1 / N);
  // The jaw: the sides come in below the cheekbones (one side a little fuller), the back of the skull
  // tucks into the neck, the underside rises from the chin to the throat.
  const s = d.x >= 0 ? 1 : -1;
  const low = ramp(d.y, 0.05, -0.7);
  const side = (d.x * d.x) / (d.x * d.x + d.z * d.z + 1e-6);
  r *= 1 - (0.09 - (shape.jaw - 1) * 0.25 - traits.jawSide * s * 0.012 - 0.025 * child) * low * side;
  const back = Math.max(0, -d.z);
  r *= 1 - 0.3 * low * back * back;
  // Behind the chin the underside tucks up into the throat and the neck.
  r *= 1 - 0.16 * ramp(d.y, -0.45, -0.85) * (1 - ramp(d.z, 0.2, 0.7));
  if (d.z <= 0) return r;

  // The face, in angles: `au` across (mirrored, so every feature is made in pairs), `fv` up.
  const fu = Math.atan2(d.x, d.z);
  const au = Math.abs(fu);
  const fv = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
  // The mouth and jaw sit back under the nose rather than jutting like a muzzle.
  r *= 1 - 0.1 * gaussian(fv, -0.55, 0.16) * d.z;
  // A feature's bell across and up: one exponential, none where it is under a ten-millionth of its height (most
  // of the face for most features: the head is thousands of directions, every person and their hair).
  const g = (u0: number, v0: number, su: number, sv: number): number => {
    const dv = (fv - v0) / sv;
    if (dv * dv > BELL_REACH) return 0;
    const du = (au - u0) / su;
    const e = du * du + dv * dv;
    return e > BELL_REACH ? 0 : Math.exp(-0.5 * e);
  };
  const lift = eyeLift(s, shape);
  r += 0.0045 * traits.brow * (1 - 0.6 * child) * g(0.3, 0.36 + lift, 0.3, 0.07); // brow ridge
  r -= 0.01 * g(0.34, 0.15 + lift, 0.17, 0.12); // eye sockets
  r -= (0.004 + 0.004 * elder) * g(0.95, 0.35, 0.18, 0.2); // convention-ok: sculpt amplitude in the head frame, not a surface layer; temples, hollow with age
  r += 0.005 * traits.cheek * (1 - 0.3 * elder) * g(0.5, -0.1, 0.2, 0.12); // cheekbones
  r += 0.004 * child * g(0.5, -0.28, 0.3, 0.18); // a child's round cheeks
  r += 0.008 * shape.jaw * (1 + 0.12 * traits.jawSide * s) * (1 - 0.5 * child - 0.35 * elder) * g(1.0, -0.72, 0.3, 0.16); // angle of the jaw
  r -= (0.0015 + 0.0025 * elder) * g(0.62, -0.5, 0.18, 0.15); // convention-ok: sculpt amplitude in the head frame, not a surface layer; below them
  if (elder) {
    r += 0.0016 * g(0.38, 0.065 + lift, 0.1, 0.03); // bags under the eyes
    r -= 0.0012 * g(0.34, 0.015 + lift, 0.12, 0.03); // the trough under them
    r += 0.0045 * g(0.5, -0.86, 0.13, 0.09); // jowls along the jaw
  }
  // The nose, leaning a little from the bridge to the tip; a child's bridge is low.
  const tip = traits.noseTilt * 0.022 * ramp(fv, 0.12, -0.32);
  const nu = fu - tip;
  const anu = Math.abs(nu);
  const noseWidth = 0.055 + 0.045 * ramp(fv, 0.16, -0.3);
  r += shape.nose * (1 - 0.45 * child * ramp(fv, -0.3, -0.05)) * spline(NOSE, fv) * gaussian(nu, 0, noseWidth);
  r += 0.008 * shape.nose * gaussian(anu, 0.17, 0.07) * gaussian(fv, -0.36, 0.06); // nostril wings
  r -= 0.0016 * shape.nose * gaussian(anu, 0.245, 0.025) * gaussian(fv, -0.34, 0.06); // the crease round each wing
  r -= 0.003 * shape.nose * gaussian(anu, 0.075, 0.028) * gaussian(fv, -0.39, 0.025); // the nostrils, under the tip
  // The philtrum: a groove from the nose to the lip between two faint ridges.
  const pu = Math.abs(fu - tip * 0.5);
  r += (0.0006 * gaussian(pu, 0.05, 0.016) - 0.0011 * gaussian(pu, 0, 0.026)) * gaussian(fv, -0.47, 0.03); // convention-ok: sculpt amplitude in the head frame, not a surface layer
  // The lips: their volume, then the vermilion standing a little proud of the skin with a fine
  // roll along the upper lip's border, on the same lines as the painted lips (`MouthLine`).
  const full = lipFullness(traits, age);
  r += 0.005 * full * g(0, -0.52, 0.24, 0.07); // upper lip
  r += 0.004 * full * g(0, -0.64, 0.2, 0.05); // lower lip
  const m = shape.mouth;
  if (au < m.half + 0.05 && fv < -0.42 && fv > -0.76) {
    const upper = upperLipAt(m, fu);
    const lower = lowerLipAt(m, fu);
    const within = ramp(fv, lower - 0.006, lower + 0.004) * ramp(fv, upper + 0.005, upper - 0.004) * ramp(au, m.half + 0.01, m.half - 0.035); // convention-ok: sculpt amplitude in the head frame, not a surface layer
    r += 0.0012 * full * within;
    r += 0.0005 * gaussian(fv, upper + 0.007, 0.006) * ramp(au, m.half, m.half - 0.06); // convention-ok: sculpt amplitude in the head frame, not a surface layer; the border's roll
  }
  r += 0.014 * (1 - 0.4 * child) * g(0, -0.88, 0.36, 0.15); // chin
  return r;
}

/** The skin surface in direction `d`, as a point in the head's frame. */
function headPoint(d: THREE.Vector3, shape: FaceShape): THREE.Vector3 {
  return d.clone().multiplyScalar(headRadius(d, shape));
}

/** The head's skin: fine enough for the nose, nostrils and the lips' border, UVs as `radialSurface` (the face at u = 0.5). */
export function headGeometry(shape: FaceShape): THREE.BufferGeometry {
  // Plain materials (low) have no pores or lines to resolve: the coarser grid the heads always had, a quarter fewer vertices to build and morph.
  const [across, up] = QUALITY.detailedMaterials ? [128, 96] : [112, 84];
  return radialSurface((d) => headRadius(d, shape), across, up, true);
}

/** How far the jaw drops fully open (radians about its hinge): about a centimetre at the lips, seen from across a room. */
const JAW_OPEN = 0.2;
/** The jaw's hinge, in front of the ears and a little below their middle (the head's frame). */
const JAW_HINGE_Y = -0.012;
const JAW_HINGE_Z = 0.005;
/** How far the lower lip rolls out as the jaw drops fully open (metres along the skin's normal). */
const LIP_ROLL = 0.0022;

/**
 * The morph target (for `addFaceMorphs`) that opens the mouth: everything below the line between
 * the painted lips turns down about the hinge, easing out up the cheeks and into the throat, so the
 * dark line between the lips stretches open, and the lower lip rolls out a little. Influence 0
 * closed .. 1 open (about 1.8 cm at the lips: a shout; speech uses about half). Not under a full
 * beard (its shell would stay put).
 */
function jawTarget(geometry: THREE.BufferGeometry, mouth: MouthLine): THREE.BufferAttribute {
  const position = geometry.getAttribute('position');
  const moved = new Float32Array(position.count * 3);
  const d = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const w = jawWeight(d.set(x, y, z).normalize(), mouth).w;
    const angle = JAW_OPEN * w;
    const cy = y - JAW_HINGE_Y;
    const cz = z - JAW_HINGE_Z;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // The lower lip, just under the parting and between the corners, rolls out over the teeth.
    const fv = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
    const roll = d.z > 0 ? LIP_ROLL * w * gaussian(fv, -0.63, 0.04) * ramp(Math.abs(Math.atan2(d.x, d.z)), 0.3, 0.12) : 0;
    moved[i * 3] = x + d.x * roll;
    moved[i * 3 + 1] = JAW_HINGE_Y + cy * cos - cz * sin + d.y * roll;
    moved[i * 3 + 2] = JAW_HINGE_Z + cy * sin + cz * cos + d.z * roll;
  }
  return new THREE.Float32BufferAttribute(moved, 3);
}

/**
 * How much of the jaw's turn the skin in direction `d` takes (`w`, 0 above the parting .. 1 below
 * it) and whether it is the lips' part of the parting (`lips`, 1 between the corners of the mouth).
 */
function jawWeight(d: THREE.Vector3, mouth: MouthLine): { w: number; lips: number } {
  const cu = mouth.half;
  const fu = Math.atan2(d.x, d.z);
  const au = Math.abs(fu);
  const fv = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
  // The parting: the painted line between the lips (`partingAt`), then up the cheek towards the hinge, softer there.
  const corner = fu >= 0 ? mouth.right : mouth.left;
  const line = au <= cu ? partingAt(mouth, fu) : corner + (-0.1 - corner) * ramp(au, cu, 1.45);
  const soft = 0.012 + 0.1 * ramp(au, cu, 1.2);
  const w = ramp(fv, line + soft * 0.4, line - soft) * ramp(au, 1.75, 1.4) * ramp(fv, -1.5, -1.15);
  // Lips: the parting between the corners, narrowing into them (the cut never reaches the cheek).
  const lips = ramp(au, cu * 0.95, cu * 0.6) * (d.z > 0 ? 1 : 0);
  return { w, lips };
}

/**
 * The mouth's opening, cut through the skin where the jaw stretches it (`mouthCut`: per vertex the
 * jaw's weight and the lips' share, see `mouthPatch`): open, the face shows what is behind the lips
 * (`addMouth`) instead of a stretched painted line.
 */
function addMouthCut(geometry: THREE.BufferGeometry, mouth: MouthLine): void {
  const position = geometry.getAttribute('position');
  const cut = new Float32Array(position.count * 2);
  const d = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    const { w, lips } = jawWeight(d.set(position.getX(i), position.getY(i), position.getZ(i)).normalize(), mouth);
    cut[i * 2] = w;
    cut[i * 2 + 1] = lips;
  }
  geometry.setAttribute('mouthCut', new THREE.Float32BufferAttribute(cut, 2));
}

/**
 * Cuts the open mouth out of the face's material: where the jaw's weight crosses the parting
 * (the band of skin the jaw stretches), between the corners, as wide as `open` (0..1, the jaw
 * morph's influence, set every frame) asks. Its uniform is returned to be driven.
 */
export function mouthPatch(material: THREE.Material): { value: number } {
  const open = { value: 0 };
  patchShader(material, 'mouthCut', (shader) => {
    shader.uniforms.mouthOpen = open;
    shader.vertexShader = `attribute vec2 mouthCut;\nvarying vec2 vMouthCut;\n${afterChunk(shader.vertexShader, 'begin_vertex', 'vMouthCut = mouthCut;')}`;
    shader.fragmentShader = `uniform float mouthOpen;\nvarying vec2 vMouthCut;\n${afterChunk(
      shader.fragmentShader,
      'clipping_planes_fragment',
      `{
        float gap = mouthOpen * vMouthCut.y;
        if (gap > 0.03 && abs(vMouthCut.x - 0.5) < 0.45 * gap) discard;
      }`,
    )}`;
  });
  return open;
}

/** The open mouth's drive: the cut through the skin (`mouthPatch`'s uniform) and the jaw's bone (`addMouth`), kept in step by `setMouthOpen`. */
export interface MouthOpen {
  readonly cut: { value: number };
  readonly jaw: THREE.Object3D | null;
  /** What is behind the lips (inside, teeth, tongue): not drawn while the cut is shut (five draws a face, most of the time). */
  readonly inside: readonly THREE.Material[];
}

/** The cut opens past this much of the jaw's influence (`mouthPatch`: `gap > 0.03`); below it nothing behind the lips shows. */
const CUT_FROM = 0.03;

/** Opens the mouth to `open` (the jaw morph's influence, 0..1): the cut through the skin and the lower teeth and tongue with it. */
export function setMouthOpen(mouth: MouthOpen, open: number): void {
  mouth.cut.value = open;
  if (mouth.jaw) mouth.jaw.rotation.x = JAW_OPEN * open;
  const shown = open > CUT_FROM;
  for (const material of mouth.inside) material.visible = shown;
}

/**
 * What the open mouth shows (the head's frame): a dark inside behind the lips and the upper teeth
 * just under the upper lip, and on the jaw's bone (returned, turned about the hinge as the jaw
 * morph is, `setMouthOpen`) the lower teeth just behind the upper ones, the tongue and the floor
 * of the mouth; all inside the skin while it is shut.
 */
export function addMouth(parts: Parts, shape: FaceShape, inside: THREE.Material, teeth: THREE.Material, tongue: THREE.Material): THREE.Group {
  const lips = headPoint(new THREE.Vector3(0, Math.sin(-0.58), Math.cos(-0.58)), shape);
  parts.add(new THREE.SphereGeometry(1, 16, 10), inside, at(0, lips.y - 0.004, lips.z - 0.029, [0, 0, 0], [0.023, 0.013, 0.025])); // convention-ok: anatomy inside the body, not a surface layer
  parts.add(new THREE.CylinderGeometry(0.028, 0.028, 0.007, 16, 1, true, -0.62, 1.24), teeth, at(0, lips.y + 0.0005, lips.z - 0.0315));
  const jaw = new THREE.Group();
  jaw.name = 'jaw';
  jaw.position.set(0, JAW_HINGE_Y, JAW_HINGE_Z);
  const y = lips.y - JAW_HINGE_Y;
  const z = lips.z - JAW_HINGE_Z;
  const lower = new Parts();
  lower.add(new THREE.SphereGeometry(1, 14, 8), inside, at(0, y - 0.008, z - 0.034, [0, 0, 0], [0.022, 0.012, 0.022])); // convention-ok: anatomy inside the body, not a surface layer
  lower.add(new THREE.CylinderGeometry(0.0255, 0.0255, 0.006, 16, 1, true, -0.58, 1.16), teeth, at(0, y - 0.0055, z - 0.0315)); // convention-ok: anatomy inside the body, not a surface layer
  lower.add(new THREE.SphereGeometry(1, 14, 8), tongue, at(0, y - 0.011, z - 0.038, [0, 0, 0], [0.018, 0.006, 0.026])); // convention-ok: anatomy inside the body, not a surface layer
  jaw.add(...lower.meshes(false));
  return jaw;
}

/** Which morph target of the face does what (-1: this face has none: nothing moves under a full beard's shell). */
export interface FaceMorphs {
  jaw: number;
  browsUp: number;
  frown: number;
  /** Each half of a smile: the corner and cheek on -x (`smileL`) and on +x (`smileR`). */
  smileL: number;
  smileR: number;
  pucker: number;
  /** Inner ends of the brows up, the mouth's corners down. */
  sad: number;
  /** Lips pressed thin together and rolled in (and the "m", "b", "p" of speech). */
  press: number;
  /** The nose wrinkled, its wings and the upper lip drawn up (distaste). */
  sneer: number;
  /** The cheeks blown out. */
  puff: number;
}

/**
 * Gives the head's skin (`headGeometry`) its expressions as morph targets, each a few millimetres
 * of the skin moved over the skull (the painted face moves with it: raised brows lift the painted
 * brows): the jaw (`jawTarget`), the brows raised (the inner ends more, the forehead with them),
 * the brows drawn down and together, each half of a smile (the mouth's corner up and back, the
 * cheek up and full: a half smile, a sceptical one, or both a little unevenly), the lips pushed
 * forward and in (an "oo"), sadness (the brows' inner ends up, the corners down), the lips pressed
 * together, the nose wrinkled and the cheeks puffed. A full beard keeps its lower face still (its
 * shell would not follow): the brows, the brows of sadness and the nose only.
 */
export function addFaceMorphs(geometry: THREE.BufferGeometry, look: PersonLook): FaceMorphs {
  const position = geometry.getAttribute('position');
  const targets: THREE.BufferAttribute[] = [];
  const morphs: FaceMorphs = { jaw: -1, browsUp: -1, frown: -1, smileL: -1, smileR: -1, pucker: -1, sad: -1, press: -1, sneer: -1, puff: -1 };
  const lower = look.beard !== 'full';
  if (lower) {
    morphs.jaw = targets.length;
    const mouth = faceShapeOf(look).mouth;
    targets.push(jawTarget(geometry, mouth));
    addMouthCut(geometry, mouth);
  }
  const d = new THREE.Vector3();
  const up = new THREE.Vector3();
  const across = new THREE.Vector3();
  const shift = new THREE.Vector3();
  // Per vertex, once for every target: its angles, its direction out of the skull, and the surface's own
  // directions there: up it (growing v) and across it (growing u).
  const count = position.count;
  const angles = new Float64Array(count * 2);
  const frame = new Float64Array(count * 9);
  for (let i = 0; i < count; i++) {
    d.set(position.getX(i), position.getY(i), position.getZ(i));
    const length = d.length();
    d.divideScalar(length || 1);
    const u = Math.atan2(d.x, d.z);
    const v = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
    angles[i * 2] = u;
    angles[i * 2 + 1] = v;
    const su = Math.sin(u);
    const cu = Math.cos(u);
    const sv = Math.sin(v);
    const f = i * 9;
    frame[f] = d.x;
    frame[f + 1] = d.y;
    frame[f + 2] = d.z;
    frame[f + 3] = -sv * su;
    frame[f + 4] = Math.cos(v);
    frame[f + 5] = -sv * cu;
    frame[f + 6] = cu;
    frame[f + 8] = -su;
  }
  const target = (move: (u: number, v: number, au: number, sign: number, out: THREE.Vector3) => void): number => {
    const moved = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      const u = angles[i * 2]!;
      const v = angles[i * 2 + 1]!;
      const f = i * 9;
      d.set(frame[f]!, frame[f + 1]!, frame[f + 2]!);
      up.set(frame[f + 3]!, frame[f + 4]!, frame[f + 5]!);
      across.set(frame[f + 6]!, frame[f + 7]!, frame[f + 8]!);
      shift.set(0, 0, 0);
      move(u, v, Math.abs(u), Math.sign(u) || 1, shift);
      moved[i * 3] = position.getX(i) + shift.x;
      moved[i * 3 + 1] = position.getY(i) + shift.y;
      moved[i * 3 + 2] = position.getZ(i) + shift.z;
    }
    targets.push(new THREE.Float32BufferAttribute(moved, 3));
    return targets.length - 1;
  };
  const brows = (au: number): number => ramp(au, 0.02, 0.12) * ramp(au, 0.8, 0.62);
  morphs.browsUp = target((_u, v, au, _s, out) => {
    const w = brows(au) * (gaussian(v, 0.36, 0.08) + 0.45 * gaussian(v, 0.52, 0.12) * ramp(au, 0.7, 0.4));
    out.addScaledVector(up, (0.0035 + 0.0022 * (1 - ramp(au, 0.12, 0.5))) * w); // convention-ok: sculpt amplitude in the head frame, not a surface layer
  });
  morphs.frown = target((_u, v, au, sign, out) => {
    const w = gaussian(v, 0.34, 0.075) * gaussian(au, 0.2, 0.16) * ramp(au, 0.02, 0.08);
    out.addScaledVector(up, -0.0028 * w).addScaledVector(across, -sign * 0.0016 * w).addScaledVector(d, 0.0008 * w); // convention-ok: sculpt amplitude in the head frame, not a surface layer
  });
  // Sadness: the brows' inner ends up and together (the outer ends stay), and with a mouth, its corners down.
  morphs.sad = target((_u, v, au, sign, out) => {
    const inner = gaussian(au, 0.16, 0.11) * ramp(au, 0.02, 0.07) * (gaussian(v, 0.36, 0.08) + 0.4 * gaussian(v, 0.48, 0.1));
    out.addScaledVector(up, 0.0034 * inner).addScaledVector(across, -sign * 0.0008 * inner);
    if (!lower) return;
    const corner = gaussian(au, 0.29, 0.09) * gaussian(v, -0.58, 0.08);
    out.addScaledVector(up, -0.0028 * corner).addScaledVector(d, -0.0006 * corner); // convention-ok: an expression's movement, not a surface layer
    // The chin bunches up a little under a trembling lower lip.
    out.addScaledVector(up, 0.0012 * gaussian(au, 0, 0.18) * gaussian(v, -0.82, 0.08));
  });
  // The nose wrinkled: its wings and sides drawn up, the inner brows a little down; with a mouth, the upper lip up.
  morphs.sneer = target((_u, v, au, _s, out) => {
    const wing = gaussian(au, 0.16, 0.08) * gaussian(v, -0.28, 0.12);
    out.addScaledVector(up, 0.0026 * wing).addScaledVector(d, 0.0006 * wing);
    const bridge = gaussian(au, 0.1, 0.08) * gaussian(v, 0.12, 0.08);
    out.addScaledVector(d, -0.0007 * bridge);
    out.addScaledVector(up, -0.0012 * gaussian(au, 0.18, 0.12) * gaussian(v, 0.34, 0.07)); // convention-ok: an expression's movement, not a surface layer
    if (lower) out.addScaledVector(up, 0.0016 * gaussian(au, 0.1, 0.12) * gaussian(v, -0.52, 0.05));
  });
  if (lower) {
    // Each half of a smile, from one corner over the middle (where nothing moves anyway) to the other.
    const smileHalf = (side: -1 | 1) =>
      target((u, v, au, sign, out) => {
        const half = side < 0 ? ramp(u, 0.06, -0.06) : ramp(u, -0.06, 0.06);
        const corner = half * gaussian(au, 0.28, 0.1) * gaussian(v, -0.56, 0.08);
        out.addScaledVector(up, 0.003 * corner).addScaledVector(across, sign * 0.0016 * corner).addScaledVector(d, -0.001 * corner); // convention-ok: sculpt amplitude in the head frame, not a surface layer
        const cheek = half * gaussian(au, 0.46, 0.16) * gaussian(v, -0.3, 0.13);
        out.addScaledVector(up, 0.0022 * cheek).addScaledVector(d, 0.0013 * cheek);
      });
    morphs.smileL = smileHalf(-1);
    morphs.smileR = smileHalf(1);
    morphs.pucker = target((_u, v, au, sign, out) => {
      const w = gaussian(v, -0.58, 0.065) * ramp(au, 0.42, 0.26);
      out.addScaledVector(across, -sign * 0.0045 * w * Math.min(1, au / 0.3)).addScaledVector(d, 0.0025 * w);
    });
    // Pressed lips: each lip drawn towards the parting and rolled in, thin; the corners tucked in.
    morphs.press = target((_u, v, au, _s, out) => {
      const w = gaussian(v, -0.58, 0.07) * ramp(au, 0.34, 0.2);
      out.addScaledVector(up, 0.045 * (-0.58 - v) * w).addScaledVector(d, -0.0014 * w); // convention-ok: an expression's movement, not a surface layer
      out.addScaledVector(d, -0.0008 * gaussian(au, 0.28, 0.06) * gaussian(v, -0.57, 0.05));
    });
    // Puffed cheeks: blown out round the mouth, the lips a little forward and together.
    morphs.puff = target((_u, v, au, _s, out) => {
      const cheek = gaussian(au, 0.52, 0.22) * gaussian(v, -0.46, 0.16);
      out.addScaledVector(d, 0.0065 * cheek);
      const lips = gaussian(v, -0.58, 0.07) * ramp(au, 0.36, 0.22);
      out.addScaledVector(d, 0.0012 * lips).addScaledVector(up, 0.02 * (-0.58 - v) * lips);
    });
  }
  geometry.morphAttributes.position = targets;
  return morphs;
}

/** Ears, flat against the sides with the bowl in a darker skin; left out under long hair. */
export function addEars(parts: Parts, look: PersonLook, shape: FaceShape, skin: THREE.Material, inner: THREE.Material): void {
  if (look.hairStyle === 'long') return;
  // Ears keep growing: an elder's are a little bigger, the lobe longer.
  const k = shape.age === 'elder' ? 1.12 : 1;
  const lobe = shape.age === 'elder' ? 1.25 : 1;
  for (const side of [-1, 1] as const) {
    const p = headPoint(new THREE.Vector3(side, 0, -0.12).normalize(), shape);
    const x = p.x - side * 0.005;
    parts.add(new THREE.SphereGeometry(1, 16, 12), skin, at(x, 0, p.z, [0, side * 0.3, side * -0.08], [0.009 * k, 0.029 * k, 0.017 * k]));
    parts.add(new THREE.SphereGeometry(1, 10, 8), inner, at(x + side * 0.0045 * k, 0.002, p.z + 0.002, [0, side * 0.3, 0], [0.004 * k, 0.017 * k, 0.009 * k])); // convention-ok: sculpt amplitude in the head frame, not a surface layer
    // The lobe.
    parts.add(new THREE.SphereGeometry(1, 10, 8), skin, at(x + side * 0.001, -0.024 * k - 0.002 * (lobe - 1) * 4, p.z + 0.004, [0, 0, 0], [0.007 * k, 0.009 * k * lobe, 0.008 * k])); // convention-ok: sculpt amplitude in the head frame, not a surface layer
  }
}

/** A peaked cap tipped back, or a beanie with a turned-up brim. */
export function addHat(parts: Parts, look: PersonLook): void {
  if (!look.hat) return;
  const cloth = new THREE.MeshStandardMaterial({ color: look.hatColor ?? 0x2f2f33, roughness: 0.92 });
  const tip = new THREE.Matrix4().makeRotationX(look.hat === 'cap' ? -0.18 : -0.12);
  const place = (m: THREE.Matrix4): THREE.Matrix4 => tip.clone().multiply(m);
  if (look.hat === 'cap') {
    parts.add(new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.47), cloth, place(at(0, 0.035, -0.004, [0, 0, 0], [0.091, 0.092, 0.11])));
    parts.add(new THREE.CylinderGeometry(1, 1, 0.005, 24, 1, false, -Math.PI / 2, Math.PI), cloth, place(at(0, 0.042, 0.08, [0.2, 0, 0], [0.075, 1, 0.07])));
    parts.add(new THREE.SphereGeometry(0.007, 8, 6), cloth, place(at(0, 0.127, -0.004)));
    return;
  }
  parts.add(new THREE.SphereGeometry(1, 32, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), cloth, place(at(0, 0.035, -0.004, [0, 0, 0], [0.093, 0.115, 0.109])));
  parts.add(new THREE.TorusGeometry(1, 0.14, 8, 36), cloth, place(at(0, 0.045, -0.004, [Math.PI / 2, 0, 0], [0.094, 0.11, 0.1])));
}

/** The lenses' glass: nearly clear, catching the room's reflections (the glint is what reads as glasses). */
function lensMaterial(): THREE.Material {
  return new THREE.MeshPhysicalMaterial({ color: 0xf4f8fa, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.16, clearcoat: 1, clearcoatRoughness: 0.04, depthWrite: false });
}

/** Thin frames: two rims in front of the eyes with their lenses, a bridge, and temples running back over the ears. */
export function addGlasses(parts: Parts, color: number, shape: FaceShape): void {
  const frame = new THREE.MeshStandardMaterial({ color, roughness: 0.3 });
  const glass = lensMaterial();
  const eye = headPoint(EYE_DIRECTION, shape);
  // They rest on the bridge of the nose.
  const z = Math.max(eye.z + 0.022, headPoint(new THREE.Vector3(0, 0.0145, 0.09).normalize(), shape).z + 0.004);
  const y = eye.y + 0.001;
  for (const side of [-1, 1] as const) {
    const cx = side * eye.x;
    parts.add(new THREE.TorusGeometry(0.019, 0.0021, 6, 24), frame, at(cx, y, z, [0, 0, 0], [1, 0.78, 1]));
    // A lens filling the rim, bowed a little forward.
    parts.add(new THREE.SphereGeometry(0.1, 20, 6, 0, Math.PI * 2, 0, 0.19), glass, at(cx, y, z - 0.098, [Math.PI / 2, 0, 0], [1, 1, 0.78]));
    const hinge = new THREE.Vector3(side * (eye.x + 0.019), y + 0.004, z - 0.002);
    const ear = headPoint(new THREE.Vector3(side, 0.05, -0.1).normalize(), shape);
    parts.add(capsuleBetween(hinge, new THREE.Vector3(ear.x + side * 0.004, y + 0.006, ear.z + 0.01), 0.0018, 5), frame);
  }
  parts.add(capsuleBetween(new THREE.Vector3(-eye.x + 0.019, y + 0.003, z + 0.001), new THREE.Vector3(eye.x - 0.019, y + 0.003, z + 0.001), 0.0018, 5), frame);
}
