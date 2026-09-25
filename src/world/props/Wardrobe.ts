import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { cylinderMesh } from '../meshUtils';
import { part, matte } from './Prop';
import { SwingLeaf, revealWhileOpen } from './SwingLeaf';

export interface WardrobeOptions {
  /** Length along the wall. Default 1.2 (two doors). */
  width?: number;
  height?: number;
  depth?: number;
  /** Paint of the carcass and doors. */
  paint?: number;
  /** An old suitcase stored on top. Default true. */
  suitcase?: boolean;
}

const PANEL = 0.02;
const PLINTH = 0.08;
const CORNICE = 0.05;
const DOOR_GAP = 0.004;
const HANDLE_Y = 1.05;
const HANDLE_H = 0.3;

const BRASS = new THREE.MeshStandardMaterial({ color: 0xc9a75b, metalness: 0.85, roughness: 0.3 });
const LEATHER = matte(0x5a3a26, 0.6);
/** Shirts, a coat, a dress, knitwear: what hangs on the rail and lies folded on the shelf. */
const CLOTHES = [0x3e4a5c, 0xd8d2c4, 0x8c3b3b, 0x6e7b5a, 0x2b2b30, 0xc9a552, 0x9fb3c8, 0x5a4a6e];

/**
 * A two-door painted wardrobe standing against a wall: plinth, carcass, a cornice, two doors with
 * a raised panel each and long brass bar handles meeting in the middle, and a suitcase stored on
 * top of it. Each door opens on a click (`leaves`, placed by the builder with `placeLeaves`) onto
 * a hanging rail of clothes under a shelf of folded jumpers, drawn only while a door is ajar.
 * Wall-hung with `y: 0`: origin on the floor at the wall, +z into the room. Collides as one box.
 */
export class Wardrobe extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;
  /** Left door, right door. */
  readonly leaves: SwingLeaf[];

  constructor(options: WardrobeOptions = {}) {
    super();
    this.name = 'Wardrobe';
    const width = options.width ?? 1.2;
    const height = options.height ?? 2.1;
    const depth = options.depth ?? 0.6;
    const paint = matte(options.paint ?? 0xdcd6c8, 0.65);
    const shadowPaint = matte(new THREE.Color(paint.color).multiplyScalar(0.9).getHex(), 0.65);
    const inside = matte(new THREE.Color(paint.color).multiplyScalar(0.8).getHex(), 0.8);
    const z = depth / 2;

    // Plinth set back a little, then the carcass: back, sides, top and bottom round an open front the doors close.
    part(this, width - 0.06, PLINTH, depth - 0.04, shadowPaint, { y: PLINTH / 2, z: z - 0.02 });
    const bodyH = height - PLINTH - CORNICE;
    const bodyD = depth - PANEL;
    const midY = PLINTH + bodyH / 2;
    part(this, width, bodyH, PANEL, paint, { y: midY, z: PANEL / 2 });
    for (const side of [-1, 1]) part(this, PANEL, bodyH, bodyD, paint, { x: side * (width / 2 - PANEL / 2), y: midY, z: bodyD / 2 });
    part(this, width, PANEL, bodyD, paint, { y: PLINTH + PANEL / 2, z: bodyD / 2 });
    part(this, width, PANEL, bodyD, paint, { y: PLINTH + bodyH - PANEL / 2, z: bodyD / 2 });
    part(this, width + 0.04, CORNICE, depth + 0.02, paint, { y: height - CORNICE / 2, z: z + 0.01 });

    const interior = new THREE.Group();
    this.add(interior);
    this.buildInterior(interior, width, bodyH, bodyD, inside);

    // Two doors, hung on the outer edges, each with a raised panel and its bar handle by the meeting stiles.
    const doorW = (width - DOOR_GAP) / 2 - DOOR_GAP;
    const doorH = bodyH - 0.02;
    const doorBottom = PLINTH + 0.01;
    const reveal = revealWhileOpen(interior, 2);
    this.leaves = (['left', 'right'] as const).map((hinge, i) => {
      const leaf = new SwingLeaf({ width: doorW, height: doorH, thickness: PANEL, hinge, noun: 'wardrobe', onOpenness: reveal(i) });
      const { panel } = leaf;
      const x = leaf.edge(doorW / 2);
      part(panel, doorW, doorH, PANEL, paint, { x, y: doorH / 2, z: PANEL / 2 });
      part(panel, doorW - 0.2, doorH - 0.3, 0.006, shadowPaint, { x, y: doorH / 2, z: PANEL + 0.003 });
      // The handle stands 0.06 m from the middle of the wardrobe, near the leaf's free edge.
      const handleX = leaf.edge(doorW + DOOR_GAP / 2 - 0.06);
      const handleY = HANDLE_Y - doorBottom;
      panel.add(cylinderMesh(0.007, HANDLE_H, BRASS, { x: handleX, y: handleY, z: PANEL + 0.035 }, { segments: 10 }));
      for (const dy of [-HANDLE_H / 2 + 0.02, HANDLE_H / 2 - 0.02]) {
        const foot = cylinderMesh(0.005, 0.035, BRASS, { x: handleX, y: handleY + dy, z: PANEL + 0.0175 }, { segments: 8 });
        foot.rotation.x = Math.PI / 2;
        panel.add(foot);
      }
      const side = hinge === 'left' ? -1 : 1;
      leaf.position.set(side * (width / 2 - DOOR_GAP), doorBottom, bodyD);
      return leaf;
    });

    if (options.suitcase ?? true) {
      // A leather suitcase lying flat on top, pushed to the wall, its handle towards the room.
      const w = Math.min(0.6, width * 0.45);
      const suitcase = part(this, w, 0.17, 0.4, LEATHER, { x: -width * 0.18, y: height + 0.085, z: 0.24 });
      suitcase.rotation.y = 0.06;
      part(this, 0.12, 0.02, 0.03, BRASS, { x: -width * 0.18, y: height + 0.085, z: 0.455 });
      for (const dx of [-w * 0.32, w * 0.32]) part(this, 0.03, 0.02, 0.012, BRASS, { x: -width * 0.18 + dx, y: height + 0.13, z: 0.445 });
    }

    this.footprint = new THREE.Box3(new THREE.Vector3(-width / 2 - 0.02, 0, 0), new THREE.Vector3(width / 2 + 0.02, height, depth + 0.04));
  }

  /** A shelf near the top with folded jumpers, a chrome rail under it and the clothes hanging from it. */
  private buildInterior(interior: THREE.Group, width: number, bodyH: number, bodyD: number, inside: THREE.Material): void {
    const innerW = width - 2 * PANEL;
    const z = PANEL + (bodyD - PANEL) / 2;
    const shelfY = PLINTH + bodyH - 0.36;
    part(interior, innerW, 0.02, bodyD - PANEL, inside, { y: shelfY, z });
    // Folded stacks on the shelf.
    for (let i = 0; i < 4; i++) {
      const colour = CLOTHES[(i * 3) % CLOTHES.length]!;
      const h = 0.1 + (i % 2) * 0.05;
      part(interior, 0.3, h, 0.28, matte(colour, 0.95), { x: -innerW / 2 + 0.18 + i * 0.28, y: shelfY + 0.01 + h / 2, z: z + 0.03 });
    }
    const railY = shelfY - 0.06;
    const rail = cylinderMesh(0.012, innerW, matte(0xc8ccd0, 0.3), { y: railY, z }, { segments: 10 });
    rail.rotation.z = Math.PI / 2;
    interior.add(rail);
    // Hangers along the rail: a few garments, each a thin slab of cloth hanging square to the back wall.
    const count = Math.max(4, Math.floor(innerW / 0.11));
    for (let i = 0; i < count; i++) {
      const x = -innerW / 2 + 0.08 + (i * (innerW - 0.16)) / (count - 1);
      const length = [0.95, 0.7, 1.2, 0.75, 0.9, 1.1][i % 6]!;
      const garment = part(interior, 0.035, length, 0.46, matte(CLOTHES[(i * 5 + 1) % CLOTHES.length]!, 0.95), { x, y: railY - 0.05 - length / 2, z });
      garment.rotation.z = (i % 3 - 1) * 0.03;
    }
    // Shoes on the floor of the wardrobe.
    for (let i = 0; i < 3; i++) part(interior, 0.1, 0.08, 0.26, matte(i === 1 ? 0x5a3a26 : 0x1f1f22, 0.5), { x: -innerW / 2 + 0.15 + i * 0.3, y: PLINTH + PANEL + 0.04, z: z + 0.05 });
  }
}
