import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { cylinderMesh } from '../meshUtils';
import { part } from '../props/Prop';
import { paint, standard, timber } from '../materials/palette';
import { SEAM } from '../props/joinery';
import { Doily, DOILY_THICKNESS } from './Doily';

const W = 0.42;
const D = 0.32;
const H = 0.68;
const TOP = 0.022;
const OFF_WALL = 0.02;
const SHELF = 0.22;
const SHELF_T = 0.016;
const PHONE = { w: 0.2, h: 0.08, d: 0.22 };

/**
 * The telephone table by Mémé's door (`furnishGrandmaDecor`): a little walnut table with a shelf for the directory, a
 * lace doily on top and her rotary telephone on it, the receiver on its cradle, the curly cord. Origin on the floor at
 * the wall, front towards +z; `wall` placement with `y: 0`. Collides.
 */
export class PhoneTable extends THREE.Group implements Furniture {
  readonly footprint = new THREE.Box3(new THREE.Vector3(-W / 2, 0, 0), new THREE.Vector3(W / 2, H, OFF_WALL + D));

  constructor() {
    super();
    this.name = 'PhoneTable';
    const wood = timber(0x5a3a22, 0.5);
    const z = OFF_WALL + D / 2;
    part(this, W, TOP, D, wood, { y: H - TOP / 2, z });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.add(cylinderMesh(0.016, H - TOP - SEAM, wood, { x: sx * (W / 2 - 0.035), y: (H - TOP - SEAM) / 2, z: z + sz * (D / 2 - 0.035) }, { radiusBottom: 0.011, segments: 10 }));
    part(this, W - 0.05, SHELF_T, D - 0.05, wood, { y: SHELF, z });
    // The directory on the shelf.
    part(this, 0.22, 0.05, 0.28, paint(0xd8c04a, 0.8), { y: SHELF + SHELF_T / 2 + SEAM + 0.025, z });
    // The doily, and the telephone on it.
    const doily = new Doily(0.14);
    doily.position.set(0, H + SEAM, z);
    this.add(doily);
    const phone = new THREE.Group();
    phone.position.set(0, H + SEAM + DOILY_THICKNESS, z);
    phone.rotation.y = -0.2;
    this.add(phone);
    const bakelite = standard({ color: 0x1a1816, roughness: 0.2, metalness: 0 });
    // The body: a sloping block, the dial on its front slope, the cradle's two horns on top, the receiver across them.
    part(phone, PHONE.w, PHONE.h, PHONE.d, bakelite, { y: PHONE.h / 2 });
    const dial = cylinderMesh(0.055, 0.012, paint(0xe8e2d4, 0.4), { y: PHONE.h + 0.01, z: PHONE.d * 0.22 }, { segments: 24 });
    dial.rotation.x = 0.5;
    phone.add(dial);
    for (const s of [-1, 1]) part(phone, 0.025, 0.04, 0.03, bakelite, { x: s * 0.07, y: PHONE.h + 0.02, z: -PHONE.d * 0.18 });
    const receiver = cylinderMesh(0.017, 0.21, bakelite, { y: PHONE.h + 0.05, z: -PHONE.d * 0.18 }, { segments: 12 });
    receiver.rotation.z = Math.PI / 2;
    phone.add(receiver);
    for (const s of [-1, 1]) phone.add(cylinderMesh(0.028, 0.035, bakelite, { x: s * 0.1, y: PHONE.h + 0.045, z: -PHONE.d * 0.18 }, { segments: 14 }));
    // The cord, in a coil down the side to the wall.
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.004, 6, 14), bakelite);
    coil.position.set(-PHONE.w / 2 - 0.02, PHONE.h * 0.4, -PHONE.d * 0.3);
    coil.rotation.y = Math.PI / 2;
    phone.add(coil);
  }
}
