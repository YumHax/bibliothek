import * as THREE from 'three';
import type { DisplaySlot, StallLike } from './stallTypes';
import { boxMesh, cylinderMesh } from '../meshUtils';
import { matte } from '../props/Prop';
import { wood as woodMaterial } from '@/world/materials/finishes';
import { centreOutRow, fitInRow, paintGingham, paintStallSign, tiledMaterial } from './stallPaint';

export interface RiserStallOptions {
  /** Text on the sign hanging from the pole's arm (a platform's name). */
  sign: string;
  /** Colour of the checked cloth. */
  cloth?: number;
  /** Colour of the sign's bands. */
  accent?: number;
  /** Unused (nothing random on it); kept so every stall style takes the same options. */
  seed?: number;
}

const WIDTH = 1.6;
const DEPTH = 0.7;
const TOP_HEIGHT = 0.76;
const TOP_THICKNESS = 0.03;
/** The cloth's top face: the risers stand on it. */
const CLOTH_Y = TOP_HEIGHT + 0.01;
/** Three wooden steps, the lowest at the front; each step's front face is the support of the row on the step below. */
const RISER_W = WIDTH - 0.1;
const RISER_FRONT = 0.25;
const STEP_DEPTH = 0.2;
const FIRST_RISE = 0.08;
const RISE = 0.15;
const STEPS = 3;
/** The backboard the top row leans on. */
const BACKBOARD_T = 0.02;
const BACKBOARD_H = 0.22;
const BOARD_TOP = CLOTH_Y + FIRST_RISE + (STEPS - 1) * RISE + BACKBOARD_H;
/** A shelf capping the backboard, clear over the top row's boxes. */
const CAP_T = 0.02;
const CAP_DEPTH = 0.14;
const CAP_Z = -DEPTH / 2 + CAP_DEPTH / 2;
/** Boxes stand almost upright on the steps. */
const BOX_ANGLE = 0.1;
const BOX_GAP = 0.05;
const END_MARGIN = 0.06;
/** The pole at the left end: an arm the sign hangs from, a clip-on lamp lower down over the table. */
const POLE_X = -WIDTH / 2 - 0.08;
const POLE_Z = -DEPTH / 2 + 0.05;
const POLE_H = 2.2;
const POLE_R = 0.018;
const ARM_Y = 2.05;
const LAMP_Y = 1.72;

const WOOD = woodMaterial(0x8b6a44, 0.6);
const RISER_WOOD = woodMaterial(0xa8804f, 0.7);
const IRON = matte(0x2a2623, 0.6);

/**
 * A trestle table under a checked cloth carrying three stepped wooden risers that climb towards
 * the back, so the stall shows its boxes in three rows, each standing almost upright against the
 * step behind it (the top row against a backboard). No awning: a tall pole at the left end holds
 * the sign on an arm and a clip-on lamp angled over the table (the bulb glows; no light). Local +z
 * faces the aisle. Collides (the table and the pole).
 */
export class RiserStall extends THREE.Group implements StallLike {
  readonly topHeight = TOP_HEIGHT;
  /** Behind the table. */
  readonly vendorAt: [number, number] = [0, -DEPTH / 2 - 0.4];
  /** The top of the pole. */
  readonly pennantAt = new THREE.Vector3(POLE_X, POLE_H, POLE_Z);

  /** Boxes `boxWidth` wide on one step. */
  static perRow(boxWidth: number): number {
    return fitInRow(RISER_W, boxWidth, BOX_GAP, END_MARGIN);
  }

  /** Height of step `i`'s top (0 = the front one). */
  private static stepTop(i: number): number {
    return CLOTH_Y + FIRST_RISE + i * RISE;
  }

  /** z of step `i`'s front face. */
  private static stepFront(i: number): number {
    return RISER_FRONT - i * STEP_DEPTH;
  }

  constructor(options: RiserStallOptions) {
    super();
    this.name = 'RiserStall';
    const clothColor = new THREE.Color(options.cloth ?? 0x2f4a6b);

    // Trestles and the top.
    for (const x of [-WIDTH / 2 + 0.18, WIDTH / 2 - 0.18]) {
      for (const [sz, tilt] of [[-1, 0.18], [1, -0.18]] as const) {
        const leg = boxMesh(0.035, TOP_HEIGHT - 0.06, 0.035, WOOD, { x, y: (TOP_HEIGHT - 0.06) / 2, z: sz * 0.24 });
        leg.rotation.x = tilt;
        this.add(leg);
      }
      this.add(boxMesh(0.04, 0.04, DEPTH * 0.9, WOOD, { x, y: TOP_HEIGHT - 0.05 }));
    }
    this.add(boxMesh(WIDTH, TOP_THICKNESS, DEPTH, WOOD, { y: TOP_HEIGHT - TOP_THICKNESS / 2 }));
    // The cloth over the top and hanging down the front.
    const check = paintGingham(clothColor);
    const clothTop = boxMesh(WIDTH + 0.04, 0.01, DEPTH + 0.02, tiledMaterial(check, (WIDTH + 0.04) / 0.5, (DEPTH + 0.02) / 0.5), { y: TOP_HEIGHT + 0.005 });
    clothTop.castShadow = false;
    const flapH = TOP_HEIGHT * 0.7;
    const flap = boxMesh(WIDTH + 0.04, flapH, 0.01, tiledMaterial(check, (WIDTH + 0.04) / 0.5, flapH / 0.5), { y: TOP_HEIGHT - flapH / 2, z: DEPTH / 2 + 0.012 });
    flap.castShadow = false;
    this.add(clothTop, flap);

    // The risers: each step a block from its front face to the backboard, stacked.
    const back = -DEPTH / 2 + BACKBOARD_T;
    for (let i = 0; i < STEPS; i++) {
      const bottom = i === 0 ? CLOTH_Y : RiserStall.stepTop(i - 1);
      const top = RiserStall.stepTop(i);
      const front = RiserStall.stepFront(i);
      this.add(boxMesh(RISER_W, top - bottom, front - back, RISER_WOOD, { y: (top + bottom) / 2, z: (front + back) / 2 }));
    }
    const boardTop = BOARD_TOP;
    this.add(boxMesh(RISER_W, boardTop - CLOTH_Y, BACKBOARD_T, RISER_WOOD, { y: (boardTop + CLOTH_Y) / 2, z: -DEPTH / 2 + BACKBOARD_T / 2 }));
    // A cap along the backboard's top, deep enough to stand something small on.
    this.add(boxMesh(RISER_W + 0.03, CAP_T, CAP_DEPTH, RISER_WOOD, { y: boardTop + CAP_T / 2, z: CAP_Z }));
    // Side cheeks tying the steps together.
    for (const sx of [-1, 1]) this.add(boxMesh(0.015, boardTop - CLOTH_Y, RISER_FRONT - back, RISER_WOOD, { x: sx * (RISER_W / 2 + 0.0075), y: (boardTop + CLOTH_Y) / 2, z: (RISER_FRONT + back) / 2 }));

    this.buildPole(options.sign, options.accent ?? clothColor.getHex());

    this.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) mesh.receiveShadow = true;
    });
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(POLE_X - POLE_R - 0.02, 0, -DEPTH / 2 - 0.01), new THREE.Vector3(WIDTH / 2 + 0.02, TOP_HEIGHT + 0.3, DEPTH / 2 + 0.02));
  }

  capacityFor(boxWidth: number): number {
    return STEPS * RiserStall.perRow(boxWidth);
  }

  /**
   * The top step first (the showpiece in the middle of it, the rest centre outwards), then the
   * middle one, then the front one: a thin stock still fills the rows seen best.
   */
  layout(boxWidth: number, count: number): DisplaySlot[] {
    const perRow = RiserStall.perRow(boxWidth);
    const pitch = boxWidth + BOX_GAP;
    const slots: DisplaySlot[] = [];
    let left = count;
    for (let i = STEPS - 1; i >= 0 && left > 0; i--) {
      const n = Math.min(left, perRow);
      left -= n;
      // Row i stands on step i and leans on the front of step i + 1 (the backboard for the top one).
      const support = i === STEPS - 1 ? -DEPTH / 2 + BACKBOARD_T : RiserStall.stepFront(i + 1);
      for (const x of centreOutRow(n, pitch)) slots.push({ position: new THREE.Vector3(x, RiserStall.stepTop(i) + 0.001, support), pose: 'lean', yaw: 0, angle: BOX_ANGLE });
    }
    return slots;
  }

  /** A spot on the cap along the backboard's top (stall-local), over the top row: for the radio or a small telly. */
  crateTop(x: number): THREE.Vector3 {
    return new THREE.Vector3(THREE.MathUtils.clamp(x, -RISER_W / 2 + 0.12, RISER_W / 2 - 0.12), BOARD_TOP + CAP_T, CAP_Z);
  }

  /** The pole, its arm and the sign hanging from it on two short chains, and the clip-on lamp. */
  private buildPole(text: string, accent: number): void {
    this.add(cylinderMesh(POLE_R, POLE_H, IRON, { x: POLE_X, y: POLE_H / 2, z: POLE_Z }, { segments: 10 }));
    this.add(cylinderMesh(0.028, 0.02, IRON, { x: POLE_X, y: POLE_H + 0.01, z: POLE_Z }, { segments: 10 }));
    const painted = paintStallSign(text, accent, { pxPerMetre: 1150 });
    const armLen = painted.width + 0.12;
    this.add(boxMesh(armLen, 0.025, 0.025, IRON, { x: POLE_X + armLen / 2, y: ARM_Y, z: POLE_Z }));
    const signX = POLE_X + 0.07 + painted.width / 2;
    const signTop = ARM_Y - 0.08;
    for (const dx of [-painted.width * 0.4, painted.width * 0.4]) {
      const chain = boxMesh(0.006, ARM_Y - signTop, 0.006, IRON, { x: signX + dx, y: (ARM_Y + signTop) / 2, z: POLE_Z });
      chain.castShadow = false;
      this.add(chain);
    }
    const edge = matte(0x3a2a1a, 0.7);
    const signMat = new THREE.MeshStandardMaterial({ map: painted.map, roughness: 0.8 });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(painted.width, painted.height, 0.012), [edge, edge, edge, edge, signMat, signMat]);
    sign.position.set(signX, signTop - painted.height / 2, POLE_Z);
    sign.castShadow = true;
    this.add(sign);

    // The clip-on lamp: a clamp on the pole, a short arm towards the table, a shade tipped down over the boxes.
    this.add(boxMesh(0.05, 0.05, 0.05, IRON, { x: POLE_X, y: LAMP_Y, z: POLE_Z }));
    const lamp = new THREE.Group();
    lamp.position.set(POLE_X + 0.12, LAMP_Y + 0.02, POLE_Z + 0.08);
    lamp.rotation.set(0.5, 0, -0.7);
    this.add(boxMesh(0.14, 0.012, 0.012, IRON, { x: POLE_X + 0.06, y: LAMP_Y + 0.01, z: POLE_Z + 0.04 }).rotateY(-0.6));
    const shadeMat = new THREE.MeshStandardMaterial({ color: 0x2f5a3a, roughness: 0.4, metalness: 0.5, side: THREE.DoubleSide });
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.08, 0.13, 16, 1, true), shadeMat);
    shade.castShadow = true;
    lamp.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 8), new THREE.MeshStandardMaterial({ color: 0xfff4d8, emissive: 0xffe0a0, emissiveIntensity: 2.2 }));
    bulb.position.y = -0.03;
    bulb.castShadow = false;
    lamp.add(bulb);
    this.add(lamp);
  }
}
