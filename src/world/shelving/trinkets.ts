import * as THREE from 'three';
import { boxMesh, cylinderMesh } from '../meshUtils';
import { METAL, paint } from '../materials/palette';

/**
 * The collector's odds and ends a bookcase keeps in a row's spare room (`Shelf.dressRow`): a bookend against the last
 * box, a pile of loose cartridges, a handheld, a pad, a little figure. Each a group with its origin on the board at
 * its middle, its `width` (m, along the row) what it needs free; built from the shared box and cylinder geometries
 * and palette looks, so a hundred of them cost nothing to build.
 */
export interface Trinket {
  readonly object: THREE.Group;
  readonly width: number;
  /** Stands right against the row's last box (a bookend) rather than at the far end of the row. */
  readonly leans: boolean;
}

const GREY = paint(0xb4b2ab, 0.55);
const DARK = paint(0x2a2a2e, 0.5);
const RED = paint(0xb02a26, 0.45);
/** The bookend's steel and its foot's thickness; the pad's height and how far towards the front its buttons are (m). */
const BOOKEND_T = 0.004;
const BOOKEND_FOOT = 0.003;
const PAD_H = 0.016;
const PAD_BUTTONS_Z = 0.006;

type Make = (random: () => number) => Trinket;

const KINDS: readonly Make[] = [
  // A bent steel bookend holding the row up.
  () => {
    const g = new THREE.Group();
    g.add(boxMesh(BOOKEND_T, 0.15, 0.1, METAL.satinSteel(), { x: BOOKEND_T, y: 0.075 }));
    g.add(boxMesh(0.07, BOOKEND_FOOT, 0.1, METAL.satinSteel(), { x: 0.04, y: BOOKEND_FOOT / 2 }));
    return { object: g, width: 0.08, leans: true };
  },
  // Three loose cartridges, lying in a crooked pile, labels up.
  (random) => {
    const g = new THREE.Group();
    const labels = [0xd8302a, 0x2f5fa8, 0xe8c12b, 0x3a8a4a, 0x7a3a9a];
    for (let i = 0; i < 3; i++) {
      const cart = new THREE.Group();
      cart.add(boxMesh(0.12, 0.02, 0.134, GREY, { y: 0.01 }));
      cart.add(boxMesh(0.09, 0.0015, 0.07, paint(labels[Math.floor(random() * labels.length)]!, 0.6), { y: 0.02 + 0.00075, z: -0.02 }));
      cart.position.set((random() - 0.5) * 0.012, i * 0.0205, (random() - 0.5) * 0.012);
      cart.rotation.y = (random() - 0.5) * 0.5;
      g.add(cart);
    }
    return { object: g, width: 0.16, leans: false };
  },
  // A handheld lying face up: its screen's dark bezel, the green glass, the pad's cross and two buttons.
  (random) => {
    const g = new THREE.Group();
    g.add(boxMesh(0.09, 0.032, 0.148, paint(0xc7c3ba, 0.55), { y: 0.016 }));
    g.add(boxMesh(0.076, 0.0015, 0.062, paint(0x3f3f4a, 0.5), { y: 0.032 + 0.00075, z: -0.035 }));
    g.add(boxMesh(0.046, 0.0015, 0.04, paint(0x8fa860, 0.9), { y: 0.0335 + 0.00075, z: -0.035 }));
    g.add(boxMesh(0.02, 0.003, 0.007, DARK, { x: -0.022, y: 0.0335, z: 0.035 }));
    g.add(boxMesh(0.007, 0.003, 0.02, DARK, { x: -0.022, y: 0.0335, z: 0.035 }));
    for (const [x, z] of [
      [0.015, 0.038],
      [0.03, 0.03],
    ] as const)
      g.add(cylinderMesh(0.006, 0.003, paint(0x9a2f6a, 0.45), { x, y: 0.0335, z }));
    g.rotation.y = (random() - 0.5) * 0.6;
    return { object: g, width: 0.15, leans: false };
  },
  // A pad left lying, its cable coiled behind it.
  (random) => {
    const g = new THREE.Group();
    g.add(boxMesh(0.12, PAD_H, 0.05, GREY, { y: PAD_H / 2 }));
    g.add(boxMesh(0.024, 0.003, 0.008, DARK, { x: -0.036, y: 0.0175 }));
    g.add(boxMesh(0.008, 0.003, 0.024, DARK, { x: -0.036, y: 0.0175 }));
    for (const x of [0.024, 0.04]) g.add(cylinderMesh(0.0055, 0.003, RED, { x, y: 0.0175, z: PAD_BUTTONS_Z }));
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.0022, 6, 24), DARK);
    coil.rotation.x = Math.PI / 2;
    coil.position.set(0.01, 0.0025, -0.055);
    coil.castShadow = true;
    g.add(coil);
    g.rotation.y = (random() - 0.5) * 0.7;
    return { object: g, width: 0.15, leans: false };
  },
  // A little mushroom figure: a pale stem, a red cap with white spots.
  () => {
    const g = new THREE.Group();
    g.add(cylinderMesh(0.014, 0.03, paint(0xf0e6d0, 0.6), { y: 0.015 }, { radiusBottom: 0.017 }));
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), RED);
    cap.position.y = 0.028;
    cap.castShadow = true;
    g.add(cap);
    for (const [a, e] of [
      [0.3, 0.6],
      [2.4, 0.5],
      [4.2, 0.7],
      [1.4, 1.2],
    ] as const) {
      const spot = new THREE.Mesh(new THREE.CircleGeometry(0.007, 10), paint(0xfaf6ee, 0.6));
      const n = new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e));
      spot.position.set(n.x * 0.0302, 0.028 + n.y * 0.0302, n.z * 0.0302);
      spot.lookAt(spot.position.clone().add(n));
      g.add(spot);
    }
    return { object: g, width: 0.07, leans: false };
  },
];

/** The trinket `random` draws (one of `KINDS`), or none for about half the rows. */
export function drawTrinket(random: () => number): Trinket | null {
  if (random() < 0.45) return null;
  const make = KINDS[Math.floor(random() * KINDS.length)]!;
  const trinket = make(random);
  trinket.object.name = 'ShelfTrinket';
  // Moved along its row by `Shelf.dressRow` long after the zone froze its parts.
  trinket.object.userData.live = true;
  return trinket;
}
