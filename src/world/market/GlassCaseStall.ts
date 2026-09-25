import * as THREE from 'three';
import type { DisplaySlot, StallLike } from './stallTypes';
import { boxMesh, cylinderMesh } from '../meshUtils';
import { matte } from '../props/Prop';
import { fabric, wood as woodMaterial } from '@/world/materials/finishes';
import { centreOutRow, fitInRow, paintStallSign, unclickable } from './stallPaint';

export interface GlassCaseStallOptions {
  /** Text on the little sign on its post (a platform's name). */
  sign: string;
  /** Colour of the velvet lining. */
  cloth?: number;
  /** Colour of the sign's bands. */
  accent?: number;
  /** Unused by the case itself (nothing random on it); kept so every stall style takes the same options. */
  seed?: number;
}

const WIDTH = 1.5;
const DEPTH = 0.55;
/** The glass top, at counter height. */
const TOP = 1.0;
const PLINTH_H = 0.08;
/** Top of the closed wooden base, where the glass box starts. */
const BODY_TOP = 0.53;
const FLOOR_T = 0.02;
/** The lower tier's velvet floor. */
const FLOOR_Y = BODY_TOP + FLOOR_T;
/** Frame members (corner posts, rails). */
const FRAME = 0.025;
const GLASS_T = 0.006;
/** The velvet face of the back panel: the upper tier's boxes lean on it. */
const BACK_FACE = -DEPTH / 2 + 0.026;
/** The raised back step: its front face is the lower tier's support, its top the upper tier's floor. */
const STEP_H = 0.2;
const STEP_FRONT = -0.03;
const STEP_TOP = FLOOR_Y + STEP_H;
/** Free run inside the frame, the gap between two boxes and the room kept at either end. */
const INNER_W = WIDTH - 2 * FRAME;
const BOX_GAP = 0.04;
const END_MARGIN = 0.05;
/** The sign's brass rod rises from the back right corner post; the sign hangs from an arm off its top. */
const POST_X = WIDTH / 2 - FRAME / 2;
const POST_Z = -DEPTH / 2 + FRAME / 2;
const POST_TOP = 1.55;
const SIGN_PX_PER_M = 1600;

const WOOD = woodMaterial(0x3a2418, 0.45);
const PLINTH = woodMaterial(0x24160e, 0.55);
const BRASS = new THREE.MeshStandardMaterial({ color: 0xb8892a, roughness: 0.35, metalness: 0.9 });

/**
 * A collector's glass display case: a dark wooden base on a recessed plinth, and on it a glazed
 * box (glass front, sides and top, brass-edged frame, a wooden back) lined in velvet, holding two
 * tiers: the lower floor and a raised step at the back. Boxes lean on the step's front and on the
 * back panel, so the stall shows two rows, the upper over the lower. A small brass-framed sign
 * hangs from a rod at the back right corner. The glass does not stop the crosshair (the boxes
 * behind it are clickable), but the stallholder must hand them over (`behindGlass`). Local +z faces
 * the aisle. Collides (the whole case).
 */
export class GlassCaseStall extends THREE.Group implements StallLike {
  readonly behindGlass = true;
  /** Behind the case, facing the aisle. */
  readonly vendorAt: [number, number] = [0, -DEPTH / 2 - 0.45];
  /** The top of the sign's rod. */
  readonly pennantAt = new THREE.Vector3(POST_X, POST_TOP, POST_Z + 0.02);

  /** Boxes `boxWidth` wide in one tier. */
  static perRow(boxWidth: number): number {
    return fitInRow(INNER_W, boxWidth, BOX_GAP, END_MARGIN);
  }

  constructor(options: GlassCaseStallOptions) {
    super();
    this.name = 'GlassCaseStall';
    const velvet = fabric({ color: options.cloth ?? 0x4a1626, roughness: 0.95 });

    // The base: a recessed plinth, the cabinet, two raised panels on its front and a brass strip along its top edge.
    this.add(boxMesh(WIDTH - 0.04, PLINTH_H, DEPTH - 0.04, PLINTH, { y: PLINTH_H / 2 }));
    this.add(boxMesh(WIDTH, BODY_TOP - PLINTH_H, DEPTH, WOOD, { y: (BODY_TOP + PLINTH_H) / 2 }));
    for (const x of [-WIDTH / 4, WIDTH / 4]) this.add(boxMesh(WIDTH / 2 - 0.12, 0.28, 0.012, WOOD, { x, y: (BODY_TOP + PLINTH_H) / 2, z: DEPTH / 2 + 0.006 }));
    this.add(boxMesh(WIDTH + 0.006, 0.012, 0.012, BRASS, { y: BODY_TOP - 0.006, z: DEPTH / 2 - 0.004 }));

    // The glazed box's frame: four corner posts, rails round the top, a wooden back.
    const glassH = TOP - BODY_TOP;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) this.add(boxMesh(FRAME, glassH, FRAME, WOOD, { x: sx * (WIDTH / 2 - FRAME / 2), y: BODY_TOP + glassH / 2, z: sz * (DEPTH / 2 - FRAME / 2) }));
      this.add(boxMesh(FRAME, FRAME, DEPTH, WOOD, { x: sx * (WIDTH / 2 - FRAME / 2), y: TOP - FRAME / 2 }));
    }
    for (const sz of [-1, 1]) this.add(boxMesh(WIDTH, FRAME, FRAME, WOOD, { y: TOP - FRAME / 2, z: sz * (DEPTH / 2 - FRAME / 2) }));
    this.add(boxMesh(WIDTH + 0.004, 0.008, 0.008, BRASS, { y: TOP + 0.002, z: DEPTH / 2 - 0.002 }));
    this.add(boxMesh(INNER_W, glassH, 0.02, WOOD, { y: BODY_TOP + glassH / 2, z: -DEPTH / 2 + 0.01 }));

    // Velvet: the lower floor, the back panel's lining, the raised step.
    this.add(boxMesh(INNER_W, FLOOR_T, DEPTH - 2 * FRAME, velvet, { y: BODY_TOP + FLOOR_T / 2 }));
    this.add(boxMesh(INNER_W, TOP - FRAME - FLOOR_Y, 0.006, velvet, { y: (FLOOR_Y + TOP - FRAME) / 2, z: BACK_FACE - 0.003 }));
    this.add(boxMesh(INNER_W - 0.01, STEP_H, STEP_FRONT - BACK_FACE, velvet, { y: FLOOR_Y + STEP_H / 2, z: (STEP_FRONT + BACK_FACE) / 2 }));

    // The glass: front, sides and top, see-through to the eye and to the crosshair.
    const glass = new THREE.MeshStandardMaterial({ color: 0xe8f4f4, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
    const panes = [
      boxMesh(WIDTH - 2 * FRAME, glassH - FRAME, GLASS_T, glass, { y: BODY_TOP + (glassH - FRAME) / 2, z: DEPTH / 2 - FRAME / 2 }),
      boxMesh(GLASS_T, glassH - FRAME, DEPTH - 2 * FRAME, glass, { x: -WIDTH / 2 + FRAME / 2, y: BODY_TOP + (glassH - FRAME) / 2 }),
      boxMesh(GLASS_T, glassH - FRAME, DEPTH - 2 * FRAME, glass, { x: WIDTH / 2 - FRAME / 2, y: BODY_TOP + (glassH - FRAME) / 2 }),
      boxMesh(WIDTH - 2 * FRAME, GLASS_T, DEPTH - 2 * FRAME, glass, { y: TOP - GLASS_T / 2 }),
    ];
    for (const pane of panes) {
      pane.castShadow = false;
      pane.receiveShadow = false;
      this.add(unclickable(pane));
    }

    // The sign: a brass rod at the back right corner, an arm off its top, the sign hanging from it (painted both sides).
    this.add(cylinderMesh(0.008, POST_TOP - TOP, BRASS, { x: POST_X, y: (TOP + POST_TOP) / 2, z: POST_Z }, { segments: 8 }));
    const painted = paintStallSign(options.sign, options.accent ?? 0x6b2f2a, { pxPerMetre: SIGN_PX_PER_M, border: '#b8892a' });
    const armY = POST_TOP - 0.04;
    this.add(boxMesh(painted.width + 0.03, 0.01, 0.01, BRASS, { x: POST_X - (painted.width + 0.03) / 2, y: armY, z: POST_Z }));
    const edge = matte(0x2a1a10, 0.7);
    const signMat = new THREE.MeshStandardMaterial({ map: painted.map, roughness: 0.7 });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(painted.width, painted.height, 0.006), [edge, edge, edge, edge, signMat, signMat]);
    sign.position.set(POST_X - painted.width / 2 - 0.02, armY - 0.012 - painted.height / 2, POST_Z);
    sign.castShadow = true;
    this.add(sign);

    this.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh.material !== glass) mesh.receiveShadow = true;
    });
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-WIDTH / 2 - 0.01, 0, -DEPTH / 2 - 0.01), new THREE.Vector3(WIDTH / 2 + 0.01, TOP + 0.05, DEPTH / 2 + 0.01));
  }

  capacityFor(boxWidth: number): number {
    return 2 * GlassCaseStall.perRow(boxWidth);
  }

  /**
   * The lower tier first (the showpiece in the middle of it, the rest centre outwards), leaning on
   * the step's front, then the upper tier leaning on the back panel, centre outwards too.
   */
  layout(boxWidth: number, count: number): DisplaySlot[] {
    const perRow = GlassCaseStall.perRow(boxWidth);
    const lower = Math.min(count, perRow);
    const upper = Math.min(count - lower, perRow);
    const pitch = boxWidth + BOX_GAP;
    return [
      ...centreOutRow(lower, pitch).map((x) => ({ position: new THREE.Vector3(x, FLOOR_Y + 0.001, STEP_FRONT), pose: 'lean' as const, yaw: 0 })),
      ...centreOutRow(upper, pitch).map((x) => ({ position: new THREE.Vector3(x, STEP_TOP + 0.001, BACK_FACE), pose: 'lean' as const, yaw: 0 })),
    ];
  }

  /** A spot on the glass top (stall-local), clear of the sign's rod at the right-hand end. */
  crateTop(x: number): THREE.Vector3 {
    return new THREE.Vector3(THREE.MathUtils.clamp(x, -WIDTH / 2 + 0.15, WIDTH / 2 - 0.2), TOP + 0.001, 0);
  }
}
