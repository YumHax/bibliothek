import * as THREE from 'three';
import { seededRandom } from '@/covers/generated/canvasUtils';
import { cylinderMesh } from '../meshUtils';
import { Prop, part, matte } from './Prop';
import { wood as woodMaterial } from '@/world/materials/finishes';

export interface WallShelfOptions {
  /** Length of the boards. Default 0.8. */
  width?: number;
  /** Number of boards, one above the other. Default 2. */
  tiers?: number;
  /** Height between two boards. Default 0.3. */
  spacing?: number;
  /** Depth of the boards. Default 0.2. */
  depth?: number;
  /** Board colour. Default oiled oak. */
  wood?: number;
  /** What stands on it: `mugs` (a row of mugs, handles out), `jars` (glass jars), `mixed` (both, and a small stack of bowls). Default 'mixed'. */
  items?: 'mugs' | 'jars' | 'mixed';
  seed?: number;
}

const BRACKET = matte(0x2b2b2e, 0.5);
const MUG_COLOURS = [0xc9785a, 0x3e4a5c, 0xe8e2d4, 0x8fa383, 0xf0b429, 0x6e7b8c];
const JAR_FILLS = [0xe0b96a, 0xf1eadb, 0x3a2418, 0x9b3d2a, 0x6b8e3a];

/**
 * Open wall shelves: oak boards on black steel brackets, the bottom one at the origin's height,
 * with mugs (handles turned to the room), glass jars or a bit of both standing on them. Wall-hung:
 * origin at the middle of the lowest board's back edge (its top face), +z into the room.
 * Decoration: never collides.
 */
export class WallShelf extends Prop {
  constructor(options: WallShelfOptions = {}) {
    super();
    this.name = 'WallShelf';
    const width = options.width ?? 0.8;
    const tiers = options.tiers ?? 2;
    const spacing = options.spacing ?? 0.3;
    const depth = options.depth ?? 0.2;
    const items = options.items ?? 'mixed';
    const random = seededRandom(options.seed ?? 7);
    const board = woodMaterial(options.wood ?? 0x9a7248, 0.55);
    const thickness = 0.025;

    for (let t = 0; t < tiers; t++) {
      const y = t * spacing;
      part(this, width, thickness, depth, board, { y: y - thickness / 2, z: depth / 2 });
      // Two L brackets under each board.
      for (const side of [-1, 1]) {
        const bx = side * (width / 2 - 0.1);
        part(this, 0.015, 0.14, 0.012, BRACKET, { x: bx, y: y - thickness - 0.07, z: 0.006 }).castShadow = false;
        part(this, 0.015, 0.012, depth * 0.8, BRACKET, { x: bx, y: y - thickness - 0.006, z: depth * 0.4 }).castShadow = false;
      }
      const kind = items === 'mixed' ? (t % 2 === 0 ? 'mugs' : 'jars') : items;
      if (kind === 'mugs') this.mugs(y, width, depth, random);
      else this.jars(y, width, depth, random);
    }
  }

  private mugs(y: number, width: number, depth: number, random: () => number): void {
    const count = Math.max(1, Math.floor((width - 0.08) / 0.12));
    const pitch = (width - 0.08) / count;
    for (let i = 0; i < count; i++) {
      const colour = MUG_COLOURS[Math.floor(random() * MUG_COLOURS.length)]!;
      const x = -width / 2 + 0.04 + (i + 0.5) * pitch;
      const h = 0.09 + random() * 0.015;
      const material = matte(colour, 0.35);
      this.add(cylinderMesh(0.04, h, material, { x, y: y + h / 2, z: depth / 2 }, { radiusBottom: 0.037, segments: 18 }));
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.006, 8, 14, Math.PI), material);
      // Handles turned towards the room, a little askew from one mug to the next.
      const turn = -Math.PI / 2 + (random() - 0.5) * 0.8;
      handle.position.set(x + Math.cos(turn) * 0.04, y + h * 0.5, depth / 2 - Math.sin(turn) * 0.04);
      handle.rotation.set(0, turn, -Math.PI / 2);
      handle.castShadow = true;
      this.add(handle);
    }
  }

  private jars(y: number, width: number, depth: number, random: () => number): void {
    const glass = new THREE.MeshStandardMaterial({ color: 0xe8f0f2, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
    const lid = woodMaterial(0xb98a58, 0.6);
    let x = -width / 2 + 0.06;
    while (x < width / 2 - 0.06) {
      const r = 0.035 + random() * 0.02;
      if (x + r > width / 2 - 0.03) break;
      const h = 0.1 + random() * 0.1;
      const fill = cylinderMesh(r - 0.004, h * 0.7, matte(JAR_FILLS[Math.floor(random() * JAR_FILLS.length)]!, 0.9), { x: x + r, y: y + (h * 0.7) / 2 + 0.003, z: depth / 2 }, { segments: 16 });
      fill.castShadow = false;
      this.add(fill);
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 18, 1, true), glass);
      jar.position.set(x + r, y + h / 2, depth / 2);
      this.add(jar);
      this.add(cylinderMesh(r + 0.003, 0.016, lid, { x: x + r, y: y + h + 0.008, z: depth / 2 }, { segments: 18 }));
      x += 2 * r + 0.025;
    }
  }
}
