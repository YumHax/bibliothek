import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { cylinderMesh } from '../meshUtils';
import { part, matte } from './Prop';
import { CERAMIC, CHROME, WHITE_PLASTIC } from './bathroomMaterials';

export interface ToiletOptions {
  /** A roll holder on the wall beside it (local +x) and a brush on the floor on the other side. Default true. */
  accessories?: boolean;
}

/** The cistern against the wall; its lid is a shelf for whatever the plan puts there (see `CISTERN_TOP`). */
const CISTERN_W = 0.4;
export const CISTERN_DEPTH = 0.18;
const CISTERN_BOTTOM = 0.42;
const CISTERN_H = 0.4;
/** Height of the cistern lid's top face: `y` of a plant placed on it. */
export const CISTERN_TOP = CISTERN_BOTTOM + CISTERN_H + 0.03;
/** Where the pan's oval stands and how tall it is. */
const PAN_Z = 0.34;
const PAN_H = 0.39;
/** Local x of the roll holder and of the brush (the pan is 0.36 wide). */
const ROLL_X = 0.36;
const BRUSH_X = -0.32;
/** What the collider covers: brush to roll holder, wall to the front of the pan. */
const FOOTPRINT = { minX: -0.4, maxX: 0.26, depth: 0.6 };

const DARK = matte(0x3a3a3c, 0.6);
const PAPER = matte(0xf7f5f0, 0.95);

/**
 * A close-coupled WC: an oval pan on a pedestal, its seat and lid down, the cistern on the wall
 * behind it with a chrome flush button on the lid; a roll holder on the wall to one side and a
 * brush on the floor on the other. Wall-hung with `y: 0`: origin on the floor at the wall,
 * +z into the room. Collides over the whole thing.
 */
export class Toilet extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;

  constructor(options: ToiletOptions = {}) {
    super();
    this.name = 'Toilet';
    this.buildCistern();
    this.buildPan();
    if (options.accessories ?? true) this.buildAccessories();
    this.footprint = new THREE.Box3(new THREE.Vector3(FOOTPRINT.minX, 0, 0), new THREE.Vector3(FOOTPRINT.maxX, CISTERN_TOP, FOOTPRINT.depth));
  }

  private buildCistern(): void {
    const z = CISTERN_DEPTH / 2;
    part(this, CISTERN_W, CISTERN_H, CISTERN_DEPTH, CERAMIC, { y: CISTERN_BOTTOM + CISTERN_H / 2, z });
    part(this, CISTERN_W + 0.02, 0.03, CISTERN_DEPTH + 0.02, CERAMIC, { y: CISTERN_TOP - 0.015, z: z + 0.01 });
    // Dual flush button, off-centre so there is room for a plant on the lid.
    this.add(cylinderMesh(0.02, 0.006, CHROME, { x: 0.1, y: CISTERN_TOP + 0.003, z }, { segments: 16 }));
  }

  /** An oval pedestal (a cylinder stretched along z), the block joining it to the cistern, seat and lid. */
  private buildPan(): void {
    const pan = cylinderMesh(0.17, PAN_H, CERAMIC, { y: PAN_H / 2, z: PAN_Z }, { radiusBottom: 0.12, segments: 24 });
    pan.scale.z = 1.4;
    this.add(pan);
    part(this, 0.3, PAN_H - 0.02, 0.24, CERAMIC, { y: (PAN_H - 0.02) / 2, z: CISTERN_DEPTH + 0.1 });
    const seat = cylinderMesh(0.19, 0.02, WHITE_PLASTIC, { y: PAN_H + 0.01, z: PAN_Z }, { segments: 24 });
    seat.scale.z = 1.3;
    const lid = cylinderMesh(0.19, 0.014, WHITE_PLASTIC, { y: PAN_H + 0.027, z: PAN_Z - 0.005 }, { segments: 24 });
    lid.scale.z = 1.32;
    this.add(seat, lid);
    // The hinge blocks where the lid meets the cistern.
    for (const dx of [-0.07, 0.07]) part(this, 0.03, 0.02, 0.04, WHITE_PLASTIC, { x: dx, y: PAN_H + 0.02, z: CISTERN_DEPTH + 0.02 });
  }

  /** Chrome roll holder with a roll on it; a brush standing in its pot. */
  private buildAccessories(): void {
    const rollY = 0.7;
    part(this, 0.04, 0.05, 0.008, CHROME, { x: ROLL_X, y: rollY, z: 0.004 });
    const arm = cylinderMesh(0.005, 0.1, CHROME, { x: ROLL_X, y: rollY, z: 0.05 }, { segments: 8 });
    arm.rotation.x = Math.PI / 2;
    const axle = cylinderMesh(0.005, 0.13, CHROME, { x: ROLL_X + 0.06, y: rollY, z: 0.1 }, { segments: 8 });
    axle.rotation.z = Math.PI / 2;
    const roll = cylinderMesh(0.055, 0.1, PAPER, { x: ROLL_X + 0.065, y: rollY, z: 0.1 }, { segments: 18 });
    roll.rotation.z = Math.PI / 2;
    this.add(arm, axle, roll);
    // A loose end of paper hanging off the roll.
    const tail = part(this, 0.1, 0.12, 0.003, PAPER, { x: ROLL_X + 0.065, y: rollY - 0.09, z: 0.156 });
    tail.castShadow = false;

    const brushZ = 0.14;
    this.add(cylinderMesh(0.045, 0.13, DARK, { x: BRUSH_X, y: 0.065, z: brushZ }, { radiusBottom: 0.04, segments: 16 }));
    this.add(cylinderMesh(0.007, 0.3, CHROME, { x: BRUSH_X, y: 0.27, z: brushZ }, { segments: 8 }));
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), DARK);
    knob.position.set(BRUSH_X, 0.43, brushZ);
    this.add(knob);
  }
}
