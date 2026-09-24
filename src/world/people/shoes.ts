import * as THREE from 'three';
import { at, limbGeometry, Parts, roundedBox, spline, type Keys } from './geometry';
import { ANKLE_Y } from './body';
import type { PersonLook } from './looks';

/*
 * Shoes, in the ankle's frame (origin at the ankle joint, the floor ANKLE_Y below, toes to +z).
 * Each is a sphere moulded into a last: flat underneath, a rounded heel, high at the collar, the
 * instep sloping down to a low toe box; on a sole of the same outline a little wider. Sneakers add
 * a white sole and laces, boots a shaft up the shin, loafers are cut low.
 */

/** Height of the upper above the sole, by t from heel (0) to toe (1). */
const SHOE_TOP: Keys = [
  [0, 0.085],
  [0.2, 0.1],
  [0.45, 0.083],
  [0.7, 0.052],
  [0.9, 0.04],
  [1, 0.036],
];
/** Half-width by t: narrow heel, broad at the ball of the foot. */
const SHOE_WIDTH: Keys = [
  [0, 0.04],
  [0.35, 0.043],
  [0.72, 0.052],
  [1, 0.05],
];
const LENGTH = 0.27;
/** Where the shoe's middle is, ahead of the ankle. */
const CENTRE_Z = 0.07;
const SOLE = 0.022;

export function addShoe(parts: Parts, look: PersonLook, girth: number): void {
  const width = 0.9 + 0.1 * girth;
  const upper = new THREE.MeshStandardMaterial({ color: look.shoeColor, roughness: look.shoes === 'boot' ? 0.45 : look.shoes === 'loafer' ? 0.35 : 0.7 });
  const sole = new THREE.MeshStandardMaterial({ color: look.shoes === 'sneaker' ? 0xe8e4dc : 0x24201c, roughness: 0.85 });
  const height = look.shoes === 'loafer' ? 0.72 : 1;
  const floor = -ANKLE_Y;
  parts.add(last(LENGTH + 0.006, width * 1.08, () => SOLE / 2, SOLE / 2), sole, at(0, floor + SOLE / 2, CENTRE_Z));
  parts.add(last(LENGTH, width, (t) => spline(SHOE_TOP, t) * height, 0.01), upper, at(0, floor + SOLE, CENTRE_Z));
  if (look.shoes === 'sneaker') {
    // Laces across the instep, following its slope.
    const t0 = 0.42;
    const t1 = 0.62;
    const topAt = (t: number): THREE.Vector2 => {
      const n = t * 2 - 1;
      return new THREE.Vector2(CENTRE_Z + (n * LENGTH) / 2, floor + SOLE + Math.sqrt(1 - n * n) * spline(SHOE_TOP, t));
    };
    const a = topAt(t0);
    const b = topAt(t1);
    const slope = Math.atan2(a.y - b.y, b.x - a.x);
    parts.add(roundedBox(0.03, 0.004, a.distanceTo(b), 3, 3), new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.9 }), at(0, (a.y + b.y) / 2 + 0.001, (a.x + b.x) / 2, [slope, 0, 0]));
  }
  if (look.shoes === 'boot') {
    parts.add(limbGeometry(0.15, [[0, 0.05 * girth + 0.004], [1, 0.053 * girth + 0.004]], { top: 0, bottom: 0, radial: 16, rows: 3 }), upper, at(0, 0.11, 0));
  }
}

/**
 * A unit sphere stretched along z to `length`, `halfWidth(t)` wide, with its upper half raised to
 * `top(t)` and its lower half squashed to `bottom`: the outline of a foot, flat below.
 */
function last(length: number, widthScale: number, top: (t: number) => number, bottom: number): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(1, 28, 16);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const t = (z + 1) / 2;
    position.setXYZ(i, x * spline(SHOE_WIDTH, t) * widthScale, y > 0 ? y * top(t) : y * bottom, (z * length) / 2);
  }
  geometry.computeVertexNormals();
  return geometry;
}
