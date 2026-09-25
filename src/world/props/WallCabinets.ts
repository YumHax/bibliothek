import * as THREE from 'three';
import { cylinderMesh } from '../meshUtils';
import { Prop, part, matte } from './Prop';
import { SwingLeaf, revealWhileOpen } from './SwingLeaf';

/** One bay of the row, left to right as seen from the room: a cupboard (one door under 0.5 m, two above) or the extractor hood over the hob. */
export interface WallCabinetUnit {
  kind: 'doors' | 'hood';
  width: number;
}

export interface WallCabinetsOptions {
  units: WallCabinetUnit[];
  /** Colour of the doors. Default the sage of `KitchenRun`. */
  front?: number;
  /** Height of the room's ceiling: the hood's chimney runs up to it. Default 2.8. */
  ceiling?: number;
}

/** The row hangs with its underside this high, leaving a tiled band over the worktop. */
export const WALL_CABINET_BOTTOM = 1.45;
const HEIGHT = 0.7;
const DEPTH = 0.35;
const DOOR_THICKNESS = 0.018;
/** Thickness of the carcass boards. */
const CARCASS_WALL = 0.016;
const GAP = 0.003;
const HANDLE_LENGTH = 0.14;
/** How far a door hinged at an end of the row opens: its handle (3.5 cm proud) stays clear of the wall or the fridge beside it. */
const END_DOOR_ANGLE = THREE.MathUtils.degToRad(80);
/** The hood canopy hangs a little lower than the cupboards, over the hob. */
const HOOD_BOTTOM = 1.52;
const CANOPY_HEIGHT = 0.06;
const CANOPY_DEPTH = 0.48;
const CHIMNEY = 0.3;

const CARCASS = matte(0xe9e4da, 0.8);
const STEEL = new THREE.MeshStandardMaterial({ color: 0xbfc2c6, metalness: 0.7, roughness: 0.35 });
const FILTER = new THREE.MeshStandardMaterial({ color: 0x8e9296, metalness: 0.6, roughness: 0.6 });
const CROCKERY = matte(0xf4f1ea, 0.3);
const GLASS = new THREE.MeshStandardMaterial({ color: 0xe8f0f2, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
const HOOD_LIGHT = new THREE.MeshStandardMaterial({ color: 0xfff4dc, emissive: 0xfff0d0, emissiveIntensity: 0.35, roughness: 0.6 });

/**
 * A row of wall cupboards over a worktop, painted doors with short bar handles at their bottom
 * edge, and, in the bay over the hob, a brushed-steel extractor hood whose chimney runs up to the
 * ceiling. Wall-hung: origin on the floor at the wall (`y: 0`), +z into the room, the bays laid out
 * left to right along +x; the cupboards start at `WALL_CABINET_BOTTOM`. Every door opens on a click
 * (`leaves`, placed by the builder with `placeLeaves`). Overhead of the base run that already
 * blocks the way, so it never collides.
 */
export class WallCabinets extends Prop {
  readonly width: number;
  readonly leaves: SwingLeaf[] = [];

  constructor(options: WallCabinetsOptions) {
    super();
    this.name = 'WallCabinets';
    const front = matte(options.front ?? 0x8d9c85, 0.65);
    const ceiling = options.ceiling ?? 2.8;
    this.width = options.units.reduce((sum, u) => sum + u.width, 0);

    // A single door hangs on the side away from the hood, so it never swings into the extractor.
    const hoodIndex = options.units.findIndex((u) => u.kind === 'hood');
    const last = options.units.length - 1;
    let x = -this.width / 2;
    options.units.forEach((unit, i) => {
      const cx = x + unit.width / 2;
      if (unit.kind === 'hood') this.buildHood(cx, unit.width, ceiling);
      else this.buildCupboard(cx, unit.width, front, hoodIndex !== -1 && i > hoodIndex ? 'right' : 'left', { left: i === 0, right: i === last });
      x += unit.width;
    });
  }

  /**
   * A carcass open at the front, its doors hung on the outer edges (a single door on the side away
   * from the hood), handles low so a hand reaches them from the worktop, and behind them a shelf of
   * crockery, drawn only while a door is ajar.
   */
  /** `rowEnd`: whether the bay ends the row on that side (a wall, the fridge): a door hinged there stops short of square (`END_DOOR_ANGLE`), or it and its handle would swing into it. */
  private buildCupboard(cx: number, width: number, front: THREE.Material, hingeSide: 'left' | 'right', rowEnd: { left: boolean; right: boolean }): void {
    const y = WALL_CABINET_BOTTOM + HEIGHT / 2;
    const bodyD = DEPTH - DOOR_THICKNESS;
    part(this, width, HEIGHT, CARCASS_WALL, CARCASS, { x: cx, y, z: CARCASS_WALL / 2 });
    for (const side of [-1, 1]) part(this, CARCASS_WALL, HEIGHT, bodyD, CARCASS, { x: cx + side * (width / 2 - CARCASS_WALL / 2), y, z: bodyD / 2 });
    for (const shelfY of [WALL_CABINET_BOTTOM + CARCASS_WALL / 2, WALL_CABINET_BOTTOM + HEIGHT - CARCASS_WALL / 2]) part(this, width, CARCASS_WALL, bodyD, CARCASS, { x: cx, y: shelfY, z: bodyD / 2 });

    const interior = new THREE.Group();
    this.add(interior);
    this.buildCrockery(interior, cx, width, bodyD);

    const count = width > 0.5 ? 2 : 1;
    const w = width / count - 2 * GAP;
    const reveal = revealWhileOpen(interior, count);
    for (let i = 0; i < count; i++) {
      const hinge = count === 1 ? hingeSide : i === 0 ? 'left' : 'right';
      const maxAngle = rowEnd[hinge] ? END_DOOR_ANGLE : undefined;
      const leaf = new SwingLeaf({ width: w, height: HEIGHT - 2 * GAP, thickness: DOOR_THICKNESS, hinge, noun: 'cupboard', maxAngle, onOpenness: reveal(i) });
      const { panel } = leaf;
      const h = HEIGHT - 2 * GAP;
      part(panel, w, h, DOOR_THICKNESS, front, { x: leaf.edge(w / 2), y: h / 2, z: DOOR_THICKNESS / 2 });
      // The handle near the free edge, along the bottom.
      const hx = leaf.edge(w - 0.1);
      const hy = 0.05 - GAP;
      const bar = cylinderMesh(0.005, HANDLE_LENGTH, STEEL, { x: hx, y: hy, z: DOOR_THICKNESS + 0.03 }, { segments: 10 });
      bar.rotation.z = Math.PI / 2;
      bar.castShadow = false;
      panel.add(bar);
      for (const dx of [-HANDLE_LENGTH / 2 + 0.015, HANDLE_LENGTH / 2 - 0.015]) {
        const post = cylinderMesh(0.004, 0.03, STEEL, { x: hx + dx, y: hy, z: DOOR_THICKNESS + 0.015 }, { segments: 8 });
        post.rotation.x = Math.PI / 2;
        post.castShadow = false;
        panel.add(post);
      }
      const left = cx - width / 2 + i * (width / count) + GAP;
      leaf.position.set(hinge === 'left' ? left : left + w, WALL_CABINET_BOTTOM + GAP, bodyD);
      this.leaves.push(leaf);
    }
  }

  /** A shelf halfway up: plates and bowls stacked below, mugs and a jar on the shelf, glasses upside down at the back. */
  private buildCrockery(interior: THREE.Group, cx: number, width: number, bodyD: number): void {
    const inner = width - 2 * CARCASS_WALL;
    const z = CARCASS_WALL + (bodyD - CARCASS_WALL) / 2;
    const floor = WALL_CABINET_BOTTOM + CARCASS_WALL;
    const shelfY = WALL_CABINET_BOTTOM + HEIGHT / 2;
    part(interior, inner, 0.015, bodyD - CARCASS_WALL, CARCASS, { x: cx, y: shelfY, z });
    const plates = cylinderMesh(0.12, 0.09, CROCKERY, { x: cx - inner / 4, y: floor + 0.045, z }, { segments: 20 });
    interior.add(plates, cylinderMesh(0.09, 0.07, CROCKERY, { x: cx + inner / 4, y: floor + 0.035, z }, { segments: 18 }));
    const mugs = [0xc9785a, 0x3e4a5c, 0xe8e2d4];
    mugs.forEach((colour, i) => interior.add(cylinderMesh(0.04, 0.095, matte(colour, 0.4), { x: cx - inner / 2 + 0.07 + i * 0.1, y: shelfY + 0.055, z: z + 0.04 }, { segments: 14 })));
    interior.add(cylinderMesh(0.05, 0.16, matte(0xb98a4a, 0.3), { x: cx + inner / 2 - 0.08, y: shelfY + 0.088, z: z - 0.03 }, { segments: 14 }));
    // Glasses upside down at the back of the top shelf, bowls stacked beside the plates.
    for (let i = 0; i < 3; i++) {
      const x = cx - inner / 2 + 0.06 + i * 0.075;
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.11, 16, 1, true), GLASS);
      glass.position.set(x, shelfY + 0.0075 + 0.055, z - 0.09);
      interior.add(glass);
      // The base, a little inside the wall so the two glass surfaces do not coincide.
      interior.add(cylinderMesh(0.0285, 0.004, GLASS, { x, y: shelfY + 0.0075 + 0.108, z: z - 0.09 }, { segments: 16 }));
    }
    for (let i = 0; i < 3; i++) interior.add(cylinderMesh(0.07, 0.04, matte(0x9fb7c9, 0.3), { x: cx + inner / 4, y: floor + 0.07 + 0.02 + i * 0.03, z }, { radiusBottom: 0.045, segments: 16 }));
  }

  /** The extractor: a flat steel canopy with its grease filters and a warm lamp underneath, a square chimney up to the ceiling. */
  private buildHood(cx: number, width: number, ceiling: number): void {
    const canopyY = HOOD_BOTTOM + CANOPY_HEIGHT / 2;
    part(this, width, CANOPY_HEIGHT, CANOPY_DEPTH, STEEL, { x: cx, y: canopyY, z: CANOPY_DEPTH / 2 });
    // Two filter panels and the lamp, flush with the underside (drawn a hair below it).
    for (const dx of [-width / 4, width / 4]) part(this, width / 2 - 0.05, 0.004, CANOPY_DEPTH - 0.14, FILTER, { x: cx + dx, y: HOOD_BOTTOM - 0.002, z: CANOPY_DEPTH / 2 - 0.02 }).castShadow = false;
    part(this, 0.16, 0.004, 0.04, HOOD_LIGHT, { x: cx, y: HOOD_BOTTOM - 0.002, z: CANOPY_DEPTH - 0.06 }).castShadow = false;
    // A lip along the front edge with the push buttons on it.
    part(this, width, 0.03, 0.02, STEEL, { x: cx, y: HOOD_BOTTOM + CANOPY_HEIGHT + 0.015, z: CANOPY_DEPTH - 0.01 });
    for (let i = 0; i < 4; i++) part(this, 0.014, 0.014, 0.006, matte(0x2a2c2f, 0.5), { x: cx - 0.06 + i * 0.03, y: HOOD_BOTTOM + CANOPY_HEIGHT / 2, z: CANOPY_DEPTH + 0.003 }).castShadow = false;
    const chimneyH = ceiling - (HOOD_BOTTOM + CANOPY_HEIGHT);
    part(this, CHIMNEY, chimneyH, CHIMNEY, STEEL, { x: cx, y: HOOD_BOTTOM + CANOPY_HEIGHT + chimneyH / 2, z: CHIMNEY / 2 });
  }
}
