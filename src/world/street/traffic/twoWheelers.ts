import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LampSet, block, plain, spokes, trimPart, tube, tyre } from '../carModel';
import { LAMP_ROLE } from './lampMaterial';

/*
 * The motorised two-wheelers' shapes (`Motorbikes`), nose to +x, wheels on y = 0, centred across:
 * a step-through scooter and a small motorbike, each as the street's cars are (`carModel`): the
 * painted body, everything dark (tyres with spoked rims turning about their axles, seat, bars,
 * engine, the rider's visor) with vertex colours, the lamps with their roles; and the rider sitting
 * on it, legs to the footboard or the pegs, hands on the bars, a helmet.
 */

export type TwoWheelerModel = 'scooter' | 'moto';

/** Sizes: wheel radius, the axles (x), overall length; where the rider's hip, feet and hands are; the courier box's middle. */
export const TWO_WHEELERS = {
  scooter: { wheelRadius: 0.2, axles: [-0.6, 0.65], length: 1.8, hip: [-0.32, 0.82], foot: [0.16, 0.36], hands: [0.55, 1.05], box: [-0.66, 1.02] },
  moto: { wheelRadius: 0.31, axles: [-0.72, 0.72], length: 2.1, hip: [-0.22, 0.97], foot: [0.04, 0.42], hands: [0.5, 1.07], box: [-0.7, 1.15] },
} as const satisfies Record<TwoWheelerModel, { wheelRadius: number; axles: readonly number[]; length: number; hip: readonly [number, number]; foot: readonly [number, number]; hands: readonly [number, number]; box: readonly [number, number] }>;

/** A two-wheeler's parts, one geometry per material (instanced across the street's riders). */
export interface TwoWheelerGeometries {
  body: THREE.BufferGeometry;
  trim: THREE.BufferGeometry;
  lamps: THREE.BufferGeometry;
  rider: THREE.BufferGeometry;
  helmet: THREE.BufferGeometry;
}

const DARK = new THREE.Color(0x18191b);
const SEAT = new THREE.Color(0x111214);
const ENGINE = new THREE.Color(0x3a3c40);
const CHROME = new THREE.Color(0x9aa0a6);
const VISOR = new THREE.Color(0x0b0c0e);
const WHITE = new THREE.Color(1, 0.95, 0.85);
const RED = new THREE.Color(0.9, 0.05, 0.04);
const AMBER = new THREE.Color(1, 0.55, 0.05);
const PLATE = new THREE.Color(0.9, 0.72, 0.12);
const THIGH = 0.45;
const SHIN = 0.46;

/** Both wheels: a tyre each with its rims on both faces, turning about its axle. */
function wheels(radius: number, axles: readonly number[], width: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  for (const x of axles) {
    const one = tyre(radius, width).translate(x, radius, 0);
    parts.push(trimPart(one, DARK, [x, radius]));
    for (const side of [1, -1] as const) parts.push(trimPart(spokes(radius, width, side).translate(x, radius, 0), CHROME, [x, radius]));
  }
  return parts;
}

/** Where the knee is for a hip and a foot a thigh and a shin apart: bent forwards (towards +x). */
export function knee(hip: readonly [number, number], foot: readonly [number, number], upper = THIGH, lower = SHIN): [number, number] {
  const dx = foot[0] - hip[0];
  const dy = foot[1] - hip[1];
  const d = THREE.MathUtils.clamp(Math.hypot(dx, dy), 0.1, upper + lower - 0.005);
  const base = Math.atan2(dy, dx);
  const bend = Math.acos(THREE.MathUtils.clamp((upper * upper + d * d - lower * lower) / (2 * upper * d), -1, 1));
  const k1: [number, number] = [hip[0] + Math.cos(base + bend) * upper, hip[1] + Math.sin(base + bend) * upper];
  const k2: [number, number] = [hip[0] + Math.cos(base - bend) * upper, hip[1] + Math.sin(base - bend) * upper];
  return k1[0] > k2[0] ? k1 : k2;
}

/** A box from `a` to `b` in the bike's plane, `thick` along it and `wide` across, at depth z. */
function limb(a: readonly [number, number], b: readonly [number, number], thick: number, wide: number, z = 0): THREE.BufferGeometry {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const g = new THREE.BoxGeometry(thick, Math.hypot(dx, dy), wide);
  g.rotateZ(Math.atan2(dy, dx) - Math.PI / 2);
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z);
  return plain(g);
}

/** The rider (clothes: torso, arms, legs) and their helmet, sat on `model`. */
function rider(model: TwoWheelerModel): { body: THREE.BufferGeometry; helmet: THREE.BufferGeometry; shoulder: [number, number] } {
  const { hip, foot, hands } = TWO_WHEELERS[model];
  const shoulder: [number, number] = [hip[0] + (model === 'moto' ? 0.22 : 0.08), hip[1] + 0.52];
  const parts: THREE.BufferGeometry[] = [limb(hip, shoulder, 0.24, 0.38)];
  for (const z of [-0.12, 0.12]) {
    const k = knee(hip, foot);
    parts.push(limb(hip, k, 0.15, 0.14, z), limb(k, [foot[0], foot[1]], 0.12, 0.12, z), limb(shoulder, hands, 0.09, 0.09, z * 1.6));
  }
  const body = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  const helmet = plain(new THREE.SphereGeometry(0.15, 12, 9).scale(1.05, 1, 0.95).translate(shoulder[0] + 0.04, shoulder[1] + 0.24, 0));
  return { body, helmet, shoulder };
}

export function twoWheelerGeometries(model: TwoWheelerModel): TwoWheelerGeometries {
  const spec = TWO_WHEELERS[model];
  const r = spec.wheelRadius;
  const [rear, front] = spec.axles;
  const { body: riderBody, helmet, shoulder } = rider(model);
  const visor = trimPart(block(0.05, 0.08, 0.2, shoulder[0] + 0.18, shoulder[1] + 0.24, 0), VISOR);
  const lamps = new LampSet();
  let body: THREE.BufferGeometry;
  let trim: THREE.BufferGeometry[];
  if (model === 'scooter') {
    body = mergeGeometries([
      block(0.75, 0.38, 0.38, -0.42, 0.52, 0),
      block(0.62, 0.07, 0.3, 0.12, 0.3, 0),
      block(0.1, 0.62, 0.42, 0.5, 0.64, 0),
      block(0.36, 0.06, 0.15, front + 0.02, r * 2 + 0.06, 0),
      block(0.16, 0.14, 0.26, 0.56, 1.0, 0),
    ])!;
    trim = [
      ...wheels(r, spec.axles, 0.11),
      trimPart(block(0.56, 0.09, 0.3, -0.38, 0.75, 0), SEAT),
      trimPart(block(0.05, 0.05, 0.64, spec.hands[0], spec.hands[1], 0), DARK),
      trimPart(tube([front, r], [0.56, 0.98], 0.025), DARK),
      visor,
    ];
    lamps.add(0.65, 1.0, 0, 1, WHITE, 0.14, 0.1).add(-0.8, 0.62, 0, -1, RED, 0.14, 0.06);
    lamps.add(-0.81, 0.5, 0, -1, PLATE, 0.18, 0.1, LAMP_ROLE.plate);
    for (const [side, role] of [[-1, LAMP_ROLE.left], [1, LAMP_ROLE.right]] as const) {
      lamps.add(0.65, 1.0, side * 0.17, 1, AMBER, 0.05, 0.05, role).add(-0.8, 0.64, side * 0.16, -1, AMBER, 0.05, 0.05, role);
    }
  } else {
    body = mergeGeometries([
      block(0.46, 0.2, 0.32, 0.2, 0.88, 0),
      block(0.42, 0.12, 0.22, -0.62, 0.86, 0),
      block(0.32, 0.05, 0.15, front, r * 2 + 0.06, 0),
      block(0.14, 0.2, 0.22, 0.62, 0.98, 0),
    ])!;
    trim = [
      ...wheels(r, spec.axles, 0.13),
      trimPart(block(0.5, 0.32, 0.3, 0.04, 0.5, 0), ENGINE),
      trimPart(block(0.56, 0.08, 0.3, -0.28, 0.94, 0), SEAT),
      trimPart(block(0.05, 0.05, 0.72, spec.hands[0], spec.hands[1], 0), DARK),
      trimPart(block(0.72, 0.08, 0.08, -0.36, 0.38, 0.2), CHROME),
      trimPart(tube([rear, r], [0.0, 0.5], 0.03, 0.1), DARK),
      ...[-0.08, 0.08].map((z) => trimPart(tube([front, r], [0.56, 0.98], 0.022, z), CHROME)),
      visor,
    ];
    lamps.add(0.7, 0.98, 0, 1, WHITE, 0.15, 0.14).add(-0.84, 0.88, 0, -1, RED, 0.14, 0.06);
    lamps.add(-0.84, 0.72, 0, -1, PLATE, 0.2, 0.12, LAMP_ROLE.plate);
    for (const [side, role] of [[-1, LAMP_ROLE.left], [1, LAMP_ROLE.right]] as const) {
      lamps.add(0.68, 0.96, side * 0.16, 1, AMBER, 0.05, 0.05, role).add(-0.84, 0.86, side * 0.14, -1, AMBER, 0.05, 0.05, role);
    }
  }
  const trimmed = mergeGeometries(trim)!;
  for (const t of trim) t.dispose();
  return { body, trim: trimmed, lamps: lamps.build(), rider: riderBody, helmet };
}

/** The courier's box on the rear rack, centred at (x, y). */
export function courierBox(model: TwoWheelerModel): THREE.BufferGeometry {
  const [x, y] = TWO_WHEELERS[model].box;
  return block(0.42, 0.38, 0.42, x, y, 0);
}
