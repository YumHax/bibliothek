import * as THREE from 'three';
import { at, bump, capsuleBetween, Parts, radialSurface, ramp, spline, type Keys } from './geometry';
import type { PersonLook } from './looks';

/*
 * The head, in its own frame: origin at the centre of the skull (level with the ears), +z the
 * face, +y up. The shape is one sphere pushed out along each direction to `headRadius(d)`: a
 * squarish skull, a jaw that narrows to the chin, and the face sculpted on top of it (brow ridge,
 * eye sockets, cheekbones, the nose, lips, chin). Being radial, anything else (hair, beard, the
 * painted face) can ask where the skin is in any direction. Also here: ears, hats, glasses.
 */

/** What varies between faces. */
export interface FaceShape {
  jaw: number;
  nose: number;
}

/** Skull half-sizes: width, height above and below the centre, depth to the face and to the back. */
const A = 0.077;
const B_UP = 0.113;
const B_DOWN = 0.118;
const C_FRONT = 0.092;
const C_BACK = 0.103;
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

/** Where the eyes look out: the direction of the centre of the right-hand (+x) eye from the skull's centre. */
export const EYE_DIRECTION = new THREE.Vector3(0.037, 0.0145, 0.09).normalize();

/** Distance from the head's centre to the skin in the unit direction `d`. */
export function headRadius(d: THREE.Vector3, shape: FaceShape): number {
  const b = d.y > 0 ? B_UP : B_DOWN;
  const c = d.z > 0 ? C_FRONT : C_BACK;
  let r = Math.pow(Math.abs(d.x / A) ** N + Math.abs(d.y / b) ** N + Math.abs(d.z / c) ** N, -1 / N);
  // The jaw: the sides come in below the cheekbones, the back of the skull tucks into the neck,
  // the underside rises from the chin to the throat.
  const low = ramp(d.y, 0.05, -0.7);
  const side = (d.x * d.x) / (d.x * d.x + d.z * d.z + 1e-6);
  r *= 1 - (0.09 - (shape.jaw - 1) * 0.25) * low * side;
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
  r *= 1 - 0.1 * bump(fv, -0.55, 0.16) * d.z;
  const g = (u0: number, v0: number, su: number, sv: number): number => bump(au, u0, su) * bump(fv, v0, sv);
  r += 0.0045 * g(0.3, 0.36, 0.3, 0.07); // brow ridge
  r -= 0.01 * g(0.34, 0.15, 0.17, 0.12); // eye sockets
  r -= 0.004 * g(0.95, 0.35, 0.18, 0.2); // temples
  r += 0.005 * g(0.5, -0.1, 0.2, 0.12); // cheekbones
  r += 0.008 * g(1.0, -0.72, 0.3, 0.16) * shape.jaw; // angle of the jaw
  r -= 0.0015 * g(0.62, -0.5, 0.18, 0.15); // below them
  const noseWidth = 0.055 + 0.045 * ramp(fv, 0.16, -0.3);
  r += shape.nose * spline(NOSE, fv) * bump(fu, 0, noseWidth);
  r += 0.008 * shape.nose * g(0.17, -0.36, 0.07, 0.06); // nostril wings
  r += 0.005 * g(0, -0.52, 0.24, 0.07); // upper lip
  r += 0.004 * g(0, -0.64, 0.2, 0.05); // lower lip
  r += 0.014 * g(0, -0.88, 0.36, 0.15); // chin
  return r;
}

/** The skin surface in direction `d`, as a point in the head's frame. */
export function headPoint(d: THREE.Vector3, shape: FaceShape): THREE.Vector3 {
  return d.clone().multiplyScalar(headRadius(d, shape));
}

/** The head's skin: fine enough for the nose and lips, UVs as `radialSurface` (the face at u = 0.5). */
export function headGeometry(shape: FaceShape): THREE.BufferGeometry {
  return radialSurface((d) => headRadius(d, shape), 112, 84, true);
}

/** How far the jaw drops fully open (radians about its hinge): a few millimetres at the lips. */
const JAW_OPEN = 0.04;
/** The jaw's hinge, in front of the ears and a little below their middle (the head's frame). */
const JAW_HINGE_Y = -0.012;
const JAW_HINGE_Z = 0.005;

/**
 * The morph target (for `addFaceMorphs`) that opens the mouth: everything below the
 * line between the painted lips (following the `smile`, see `faceTexture`) turns down about the
 * hinge, easing out up the cheeks and into the throat, so the dark line between the lips stretches
 * open. Influence 0 closed .. 1 open. Not under a full beard (its shell would stay put).
 */
function jawTarget(geometry: THREE.BufferGeometry, smile: boolean): THREE.BufferAttribute {
  const position = geometry.getAttribute('position');
  const moved = new Float32Array(position.count * 3);
  const d = new THREE.Vector3();
  const corner = smile ? -0.55 : -0.578;
  const middle = smile ? -0.595 : -0.58;
  const cu = smile ? 0.28 : 0.26;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    d.set(x, y, z).normalize();
    const au = Math.abs(Math.atan2(d.x, d.z));
    const fv = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
    // The parting: the painted line between the lips, then up the cheek towards the hinge, softer there.
    const line = au <= cu ? middle + (corner - middle) * (au / cu) ** 2 : corner + (-0.1 - corner) * ramp(au, cu, 1.45);
    const soft = 0.012 + 0.1 * ramp(au, cu, 1.2);
    const w = ramp(fv, line + soft * 0.4, line - soft) * ramp(au, 1.75, 1.4) * ramp(fv, -1.5, -1.15);
    const angle = JAW_OPEN * w;
    const cy = y - JAW_HINGE_Y;
    const cz = z - JAW_HINGE_Z;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    moved[i * 3] = x;
    moved[i * 3 + 1] = JAW_HINGE_Y + cy * cos - cz * sin;
    moved[i * 3 + 2] = JAW_HINGE_Z + cy * sin + cz * cos;
  }
  return new THREE.Float32BufferAttribute(moved, 3);
}

/** Which morph target of the face does what (-1: this face has none: nothing moves under a full beard's shell). */
export interface FaceMorphs {
  jaw: number;
  browsUp: number;
  frown: number;
  smile: number;
  pucker: number;
}

/**
 * Gives the head's skin (`headGeometry`) its expressions as morph targets, each a few millimetres
 * of the skin moved over the skull (the painted face moves with it: raised brows lift the painted
 * brows): the jaw (`jawTarget`), the brows raised (the inner ends more, the forehead with them),
 * the brows drawn down and together, a smile (the mouth's corners up and back, the cheeks up and
 * full) and the lips pushed forward and in (an "oo", for speech). A full beard keeps its lower face
 * still (its shell would not follow): the brows only.
 */
export function addFaceMorphs(geometry: THREE.BufferGeometry, look: PersonLook): FaceMorphs {
  const position = geometry.getAttribute('position');
  const targets: THREE.BufferAttribute[] = [];
  const morphs: FaceMorphs = { jaw: -1, browsUp: -1, frown: -1, smile: -1, pucker: -1 };
  const lower = look.beard !== 'full';
  if (lower) {
    morphs.jaw = targets.length;
    targets.push(jawTarget(geometry, look.smile));
  }
  const d = new THREE.Vector3();
  const up = new THREE.Vector3();
  const across = new THREE.Vector3();
  const shift = new THREE.Vector3();
  const target = (move: (u: number, v: number, au: number, sign: number, out: THREE.Vector3) => void): number => {
    const moved = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      d.set(position.getX(i), position.getY(i), position.getZ(i));
      const length = d.length();
      d.divideScalar(length || 1);
      const u = Math.atan2(d.x, d.z);
      const v = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
      // The surface's own directions there: up it (growing v) and across it (growing u), and out of it (d).
      up.set(-Math.sin(v) * Math.sin(u), Math.cos(v), -Math.sin(v) * Math.cos(u));
      across.set(Math.cos(u), 0, -Math.sin(u));
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
    const w = brows(au) * (bump(v, 0.36, 0.08) + 0.45 * bump(v, 0.52, 0.12) * ramp(au, 0.7, 0.4));
    out.addScaledVector(up, (0.0035 + 0.0022 * (1 - ramp(au, 0.12, 0.5))) * w);
  });
  morphs.frown = target((_u, v, au, sign, out) => {
    const w = bump(v, 0.34, 0.075) * bump(au, 0.2, 0.16) * ramp(au, 0.02, 0.08);
    out.addScaledVector(up, -0.0028 * w).addScaledVector(across, -sign * 0.0016 * w).addScaledVector(d, 0.0008 * w);
  });
  if (lower) {
    morphs.smile = target((_u, v, au, sign, out) => {
      const corner = bump(au, 0.28, 0.1) * bump(v, -0.56, 0.08);
      out.addScaledVector(up, 0.003 * corner).addScaledVector(across, sign * 0.0016 * corner).addScaledVector(d, -0.001 * corner);
      const cheek = bump(au, 0.46, 0.16) * bump(v, -0.3, 0.13);
      out.addScaledVector(up, 0.0022 * cheek).addScaledVector(d, 0.0013 * cheek);
    });
    morphs.pucker = target((_u, v, au, sign, out) => {
      const w = bump(v, -0.58, 0.065) * ramp(au, 0.42, 0.26);
      out.addScaledVector(across, -sign * 0.0045 * w * Math.min(1, au / 0.3)).addScaledVector(d, 0.0025 * w);
    });
  }
  geometry.morphAttributes.position = targets;
  return morphs;
}

/** Ears, flat against the sides with the bowl in a darker skin; left out under long hair. */
export function addEars(parts: Parts, look: PersonLook, shape: FaceShape, skin: THREE.Material, inner: THREE.Material): void {
  if (look.hairStyle === 'long') return;
  for (const side of [-1, 1] as const) {
    const p = headPoint(new THREE.Vector3(side, 0, -0.12).normalize(), shape);
    const x = p.x - side * 0.005;
    parts.add(new THREE.SphereGeometry(1, 16, 12), skin, at(x, 0, p.z, [0, side * 0.3, side * -0.08], [0.009, 0.029, 0.017]));
    parts.add(new THREE.SphereGeometry(1, 10, 8), inner, at(x + side * 0.0045, 0.002, p.z + 0.002, [0, side * 0.3, 0], [0.004, 0.017, 0.009]));
    // The lobe.
    parts.add(new THREE.SphereGeometry(1, 10, 8), skin, at(x + side * 0.001, -0.024, p.z + 0.004, [0, 0, 0], [0.007, 0.009, 0.008]));
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

/** Thin frames: two rims in front of the eyes, a bridge, and temples running back over the ears. */
export function addGlasses(parts: Parts, color: number, shape: FaceShape): void {
  const frame = new THREE.MeshStandardMaterial({ color, roughness: 0.3 });
  const eye = headPoint(EYE_DIRECTION, shape);
  // They rest on the bridge of the nose.
  const z = Math.max(eye.z + 0.022, headPoint(new THREE.Vector3(0, 0.0145, 0.09).normalize(), shape).z + 0.004);
  const y = eye.y + 0.001;
  for (const side of [-1, 1] as const) {
    const cx = side * eye.x;
    parts.add(new THREE.TorusGeometry(0.019, 0.0021, 6, 24), frame, at(cx, y, z, [0, 0, 0], [1, 0.78, 1]));
    const hinge = new THREE.Vector3(side * (eye.x + 0.019), y + 0.004, z - 0.002);
    const ear = headPoint(new THREE.Vector3(side, 0.05, -0.1).normalize(), shape);
    parts.add(capsuleBetween(hinge, new THREE.Vector3(ear.x + side * 0.004, y + 0.006, ear.z + 0.01), 0.0018, 5), frame);
  }
  parts.add(capsuleBetween(new THREE.Vector3(-eye.x + 0.019, y + 0.003, z + 0.001), new THREE.Vector3(eye.x - 0.019, y + 0.003, z + 0.001), 0.0018, 5), frame);
}
