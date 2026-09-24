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
  const frame = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.2 });
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
