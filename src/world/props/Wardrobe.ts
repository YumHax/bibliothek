import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { cylinderMesh } from '../meshUtils';
import { part, matte } from './Prop';

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

/**
 * A two-door painted wardrobe standing against a wall: plinth, carcass, a cornice, two doors with
 * a raised panel each and long brass bar handles meeting in the middle, and a suitcase stored on
 * top of it. Wall-hung with `y: 0`: origin on the floor at the wall, +z into the room. Collides
 * as one box (the doors stay shut).
 */
export class Wardrobe extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;

  constructor(options: WardrobeOptions = {}) {
    super();
    this.name = 'Wardrobe';
    const width = options.width ?? 1.2;
    const height = options.height ?? 2.1;
    const depth = options.depth ?? 0.6;
    const paint = matte(options.paint ?? 0xdcd6c8, 0.65);
    const shadowPaint = matte(new THREE.Color(paint.color).multiplyScalar(0.9).getHex(), 0.65);
    const z = depth / 2;

    // Plinth set back a little, then the carcass as a closed box the doors lie on.
    part(this, width - 0.06, PLINTH, depth - 0.04, shadowPaint, { y: PLINTH / 2, z: z - 0.02 });
    const bodyH = height - PLINTH - CORNICE;
    part(this, width, bodyH, depth - PANEL, paint, { y: PLINTH + bodyH / 2, z: (depth - PANEL) / 2 });
    part(this, width + 0.04, CORNICE, depth + 0.02, paint, { y: height - CORNICE / 2, z: z + 0.01 });

    // Two doors, each with a raised panel, and their bar handles by the meeting stiles.
    const doorW = (width - DOOR_GAP) / 2;
    const doorH = bodyH - 0.02;
    const doorY = PLINTH + 0.01 + doorH / 2;
    for (const side of [-1, 1] as const) {
      const x = side * (doorW / 2 + DOOR_GAP / 2);
      part(this, doorW - DOOR_GAP, doorH, PANEL, paint, { x, y: doorY, z: depth - PANEL / 2 });
      part(this, doorW - 0.2, doorH - 0.3, 0.006, shadowPaint, { x, y: doorY, z: depth + 0.003 });
      const handleX = side * 0.06;
      this.add(cylinderMesh(0.007, HANDLE_H, BRASS, { x: handleX, y: HANDLE_Y, z: depth + 0.035 }, { segments: 10 }));
      for (const dy of [-HANDLE_H / 2 + 0.02, HANDLE_H / 2 - 0.02]) {
        const foot = cylinderMesh(0.005, 0.035, BRASS, { x: handleX, y: HANDLE_Y + dy, z: depth + 0.0175 }, { segments: 8 });
        foot.rotation.x = Math.PI / 2;
        this.add(foot);
      }
    }

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
}
