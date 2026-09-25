import * as THREE from 'three';
import { cylinderMesh } from '../meshUtils';
import { Prop, part, matte } from './Prop';
import { SwingLeaf, revealWhileOpen } from './SwingLeaf';
import { CHROME, CLEAR_GLASS } from './bathroomMaterials';
import { mirrorGlass } from './MirrorGlass';

export interface MirrorCabinetOptions {
  /** Outer size. Default 0.5 x 0.62, 0.13 deep. */
  width?: number;
  height?: number;
  depth?: number;
  /** The door's hinge side as seen from the room (hang it on the side away from anything it would swing into). Default left. */
  hinge?: 'left' | 'right';
  /** Carcass colour. Default white lacquer. */
  color?: number;
}

const BOARD = 0.014;
const DOOR_THICKNESS = 0.018;
const GAP = 0.003;
/** The door stops short of flat against the wall beside it. */
const DOOR_ANGLE = THREE.MathUtils.degToRad(95);

const EDGE = matte(0xdfe3e4, 0.35);

/**
 * A bathroom mirror cabinet: a shallow lacquered box on the wall with a mirrored door that opens
 * on a click (`leaves`, placed by the builder with `placeLeaves`), two glass shelves of toiletries
 * behind it drawn only while it is ajar. The door's face is a true mirror on high quality
 * (`mirrorGlass`, one reflector: the room is rendered again only while it is in view). Wall-hung:
 * origin on the wall at the cabinet's bottom edge, +z into the room. Over the basin that already
 * blocks the way, so it never collides.
 */
export class MirrorCabinet extends Prop {
  readonly leaves: SwingLeaf[] = [];

  constructor(options: MirrorCabinetOptions = {}) {
    super();
    this.name = 'MirrorCabinet';
    const width = options.width ?? 0.5;
    const height = options.height ?? 0.62;
    const depth = options.depth ?? 0.13;
    const hinge = options.hinge ?? 'left';
    const carcass = matte(options.color ?? 0xf3f2ee, 0.35);

    const bodyD = depth - DOOR_THICKNESS;
    part(this, width, height, BOARD, carcass, { y: height / 2, z: BOARD / 2 });
    for (const side of [-1, 1]) part(this, BOARD, height, bodyD, carcass, { x: side * (width / 2 - BOARD / 2), y: height / 2, z: bodyD / 2 });
    for (const y of [BOARD / 2, height - BOARD / 2]) part(this, width, BOARD, bodyD, carcass, { y, z: bodyD / 2 });

    const interior = new THREE.Group();
    this.add(interior);
    this.buildShelves(interior, width - 2 * BOARD, height, bodyD);

    const w = width - 2 * GAP;
    const h = height - 2 * GAP;
    const leaf = new SwingLeaf({ width: w, height: h, thickness: DOOR_THICKNESS, hinge, noun: 'mirror cabinet', maxAngle: DOOR_ANGLE, onOpenness: revealWhileOpen(interior, 1)(0) });
    const { panel } = leaf;
    part(panel, w, h, DOOR_THICKNESS, EDGE, { x: leaf.edge(w / 2), y: h / 2, z: DOOR_THICKNESS / 2 });
    const silver = mirrorGlass(w - 0.006, h - 0.006);
    silver.position.set(leaf.edge(w / 2), h / 2, DOOR_THICKNESS + 0.0005);
    panel.add(silver);
    // A slim chrome pull down the free edge.
    part(panel, 0.008, 0.12, 0.012, CHROME, { x: leaf.edge(w - 0.02), y: h / 2, z: DOOR_THICKNESS + 0.006 }).castShadow = false;
    leaf.position.set(hinge === 'left' ? -width / 2 + GAP : width / 2 - GAP, GAP, bodyD);
    this.leaves.push(leaf);
  }

  /** Two glass shelves: bottles and a jar of cotton buds low, a razor, a box of plasters and a scent bottle higher up. */
  private buildShelves(interior: THREE.Group, inner: number, height: number, bodyD: number): void {
    const z = BOARD + (bodyD - BOARD) / 2;
    const levels = [BOARD, height * 0.36, height * 0.69];
    for (const y of levels.slice(1)) part(interior, inner, 0.006, bodyD - BOARD - 0.01, CLEAR_GLASS, { y, z }).castShadow = false;
    const on = (level: number): number => levels[level] + (level === 0 ? BOARD / 2 : 0.003);

    // Bottom: two bottles, a jar of cotton buds.
    const bottles: [x: number, r: number, h: number, colour: number][] = [
      [-0.16, 0.022, 0.15, 0x7fa7c4],
      [-0.1, 0.018, 0.12, 0xf0ece2],
    ];
    for (const [x, r, hh, colour] of bottles) {
      interior.add(cylinderMesh(r, hh, matte(colour, 0.35), { x, y: on(0) + hh / 2, z }, { segments: 12 }));
      interior.add(cylinderMesh(r * 0.5, 0.02, matte(0x2a2a2a, 0.5), { x, y: on(0) + hh + 0.01, z }, { segments: 8 }));
    }
    interior.add(cylinderMesh(0.03, 0.09, CLEAR_GLASS, { x: 0.02, y: on(0) + 0.045, z }, { segments: 14 }));
    interior.add(cylinderMesh(0.026, 0.07, matte(0xfafafa, 0.95), { x: 0.02, y: on(0) + 0.036, z }, { segments: 12 }));
    part(interior, 0.07, 0.1, 0.04, matte(0xd84d3f, 0.5), { x: 0.14, y: on(0) + 0.05, z });

    // Middle: a razor lying down, a tube of cream, a box of plasters.
    part(interior, 0.12, 0.012, 0.03, matte(0x2e3a48, 0.4), { x: -0.12, y: on(1) + 0.006, z: z + 0.01 });
    part(interior, 0.04, 0.014, 0.03, CHROME, { x: -0.045, y: on(1) + 0.007, z: z + 0.01 });
    const cream = cylinderMesh(0.016, 0.12, matte(0xf1e7d0, 0.4), { x: 0.05, y: on(1) + 0.06, z }, { radiusBottom: 0.02, segments: 12 });
    interior.add(cream);
    part(interior, 0.08, 0.05, 0.05, matte(0xf2f0ea, 0.6), { x: 0.15, y: on(1) + 0.025, z });

    // Top: a square scent bottle, a small tin, a spare toothbrush on its side.
    part(interior, 0.045, 0.08, 0.03, CLEAR_GLASS, { x: -0.14, y: on(2) + 0.04, z }).castShadow = false;
    part(interior, 0.03, 0.012, 0.03, matte(0x1f1f22, 0.3), { x: -0.14, y: on(2) + 0.086, z });
    interior.add(cylinderMesh(0.035, 0.03, matte(0x3f6f5f, 0.4), { x: 0.0, y: on(2) + 0.015, z }, { segments: 16 }));
    part(interior, 0.17, 0.01, 0.012, matte(0x9ccf9a, 0.5), { x: 0.13, y: on(2) + 0.005, z: z - 0.01 });
  }
}
