import * as THREE from 'three';
import { cylinderMesh } from '../meshUtils';
import { Prop, part, matte } from './Prop';

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
const GAP = 0.003;
const HANDLE_LENGTH = 0.14;
/** The hood canopy hangs a little lower than the cupboards, over the hob. */
const HOOD_BOTTOM = 1.52;
const CANOPY_HEIGHT = 0.06;
const CANOPY_DEPTH = 0.48;
const CHIMNEY = 0.3;

const CARCASS = matte(0xe9e4da, 0.8);
const STEEL = new THREE.MeshStandardMaterial({ color: 0xbfc2c6, metalness: 0.7, roughness: 0.35 });
const FILTER = new THREE.MeshStandardMaterial({ color: 0x8e9296, metalness: 0.6, roughness: 0.6 });
const HOOD_LIGHT = new THREE.MeshStandardMaterial({ color: 0xfff4dc, emissive: 0xfff0d0, emissiveIntensity: 0.35, roughness: 0.6 });

/**
 * A row of wall cupboards over a worktop, painted doors with short bar handles at their bottom
 * edge, and, in the bay over the hob, a brushed-steel extractor hood whose chimney runs up to the
 * ceiling. Wall-hung: origin on the floor at the wall (`y: 0`), +z into the room, the bays laid out
 * left to right along +x; the cupboards start at `WALL_CABINET_BOTTOM`. Overhead of the base run
 * that already blocks the way, so it never collides.
 */
export class WallCabinets extends Prop {
  readonly width: number;

  constructor(options: WallCabinetsOptions) {
    super();
    this.name = 'WallCabinets';
    const front = matte(options.front ?? 0x8d9c85, 0.65);
    const ceiling = options.ceiling ?? 2.8;
    this.width = options.units.reduce((sum, u) => sum + u.width, 0);

    let x = -this.width / 2;
    for (const unit of options.units) {
      const cx = x + unit.width / 2;
      if (unit.kind === 'hood') this.buildHood(cx, unit.width, ceiling);
      else this.buildCupboard(cx, unit.width, front);
      x += unit.width;
    }
  }

  /** A carcass box with its doors, handles low so a hand reaches them from the worktop. */
  private buildCupboard(cx: number, width: number, front: THREE.Material): void {
    const y = WALL_CABINET_BOTTOM + HEIGHT / 2;
    part(this, width, HEIGHT, DEPTH - DOOR_THICKNESS, CARCASS, { x: cx, y, z: (DEPTH - DOOR_THICKNESS) / 2 });
    const count = width > 0.5 ? 2 : 1;
    const w = width / count - 2 * GAP;
    for (let i = 0; i < count; i++) {
      const x = cx - width / 2 + (i + 0.5) * (width / count);
      part(this, w, HEIGHT - 2 * GAP, DOOR_THICKNESS, front, { x, y, z: DEPTH - DOOR_THICKNESS / 2 });
      const side = count === 1 ? 0 : i === 0 ? 1 : -1;
      const hx = x + side * (w / 2 - 0.1);
      const hy = WALL_CABINET_BOTTOM + 0.05;
      const bar = cylinderMesh(0.005, HANDLE_LENGTH, STEEL, { x: hx, y: hy, z: DEPTH + 0.03 }, { segments: 10 });
      bar.rotation.z = Math.PI / 2;
      bar.castShadow = false;
      this.add(bar);
      for (const dx of [-HANDLE_LENGTH / 2 + 0.015, HANDLE_LENGTH / 2 - 0.015]) {
        const post = cylinderMesh(0.004, 0.03, STEEL, { x: hx + dx, y: hy, z: DEPTH + 0.015 }, { segments: 8 });
        post.rotation.x = Math.PI / 2;
        post.castShadow = false;
        this.add(post);
      }
    }
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
