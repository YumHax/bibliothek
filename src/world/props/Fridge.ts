import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { cylinderMesh } from '../meshUtils';
import { part, matte } from './Prop';

export interface FridgeOptions {
  /** Outer size. Default a slim 0.6 x 0.65 x 1.85 m fridge-freezer. */
  width?: number;
  depth?: number;
  height?: number;
  /** Height of the freezer compartment on top. Default 0.55. */
  freezer?: number;
}

const DOOR_THICKNESS = 0.05;
const GAP = 0.004;
const FEET = 0.03;

const STEEL = new THREE.MeshStandardMaterial({ color: 0xbfc2c6, metalness: 0.7, roughness: 0.35 });
const SIDES = matte(0x9d9fa3, 0.55);
const GASKET = matte(0x1c1d20, 0.8);
const MAGNET_COLOURS = [0xd9463c, 0x2f6fb3, 0xf0b429, 0x3f9b5e];

/**
 * A brushed-steel fridge-freezer: freezer door on top, fridge door below, both with a long
 * vertical bar handle on the left, black gasket lines, a few magnets holding a note, and the
 * compressor grille at the back. Wall-hung with `y: 0`: origin on the floor at the wall, +z into
 * the room, doors facing +z. Collides as a full box.
 */
export class Fridge extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;

  constructor(options: FridgeOptions = {}) {
    super();
    this.name = 'Fridge';
    const width = options.width ?? 0.6;
    const depth = options.depth ?? 0.65;
    const height = options.height ?? 1.85;
    const freezer = options.freezer ?? 0.55;
    const bodyD = depth - DOOR_THICKNESS;
    const bodyH = height - FEET;

    // Cabinet on four short feet, a grille of fins across its back.
    part(this, width, bodyH, bodyD, SIDES, { y: FEET + bodyH / 2, z: bodyD / 2 });
    for (const dx of [-width / 2 + 0.05, width / 2 - 0.05]) for (const dz of [0.05, bodyD - 0.05]) this.add(cylinderMesh(0.012, FEET, GASKET, { x: dx, y: FEET / 2, z: dz }, { segments: 8 }));
    for (let i = 0; i < 7; i++) part(this, 0.01, bodyH - 0.2, 0.02, GASKET, { x: -width / 2 + 0.08 + i * ((width - 0.16) / 6), y: FEET + bodyH / 2, z: 0.011 }).castShadow = false;

    // Two doors: freezer (top), fridge (below), a gasket line showing round each.
    const doorZ = bodyD + DOOR_THICKNESS / 2;
    const fridgeH = bodyH - freezer - GAP;
    const doors: [number, number][] = [
      [FEET + fridgeH / 2, fridgeH],
      [FEET + fridgeH + GAP + freezer / 2, freezer],
    ];
    for (const [y, h] of doors) {
      part(this, width, h, DOOR_THICKNESS, STEEL, { y, z: doorZ });
      part(this, width - 0.02, h - 0.02, 0.002, GASKET, { y, z: bodyD + 0.001 }).castShadow = false;
      // The handle: a vertical bar standing off the door on two bosses, on the left edge.
      const handleH = h * 0.6;
      const hx = -width / 2 + 0.06;
      const bar = cylinderMesh(0.011, handleH, STEEL, { x: hx, y, z: depth + 0.035 }, { segments: 12 });
      this.add(bar);
      for (const dy of [-handleH / 2 + 0.03, handleH / 2 - 0.03]) {
        const boss = cylinderMesh(0.009, 0.035, STEEL, { x: hx, y: y + dy, z: depth + 0.0175 }, { segments: 8 });
        boss.rotation.x = Math.PI / 2;
        this.add(boss);
      }
    }

    // Magnets on the fridge door, a shopping list under two of them.
    const noteY = FEET + fridgeH - 0.25;
    part(this, 0.1, 0.14, 0.002, matte(0xfaf6ea, 0.9), { x: 0.08, y: noteY, z: depth + 0.001 }).castShadow = false;
    for (let i = 0; i < 4; i++) part(this, 0.008, 0.004, 0.09, matte(0x7a8ba0, 0.7), { x: 0.05, y: noteY + 0.045 - i * 0.025, z: depth + 0.0025 }).castShadow = false;
    const magnetSpots: [number, number][] = [
      [0.035, noteY + 0.06],
      [0.125, noteY + 0.06],
      [-0.1, FEET + fridgeH - 0.6],
      [0.15, FEET + fridgeH - 0.9],
    ];
    magnetSpots.forEach(([x, y], i) => {
      const magnet = cylinderMesh(0.014, 0.008, matte(MAGNET_COLOURS[i]!, 0.4), { x, y, z: depth + 0.004 }, { segments: 14 });
      magnet.rotation.x = Math.PI / 2;
      magnet.castShadow = false;
      this.add(magnet);
    });

    this.footprint = new THREE.Box3(new THREE.Vector3(-width / 2, 0, 0), new THREE.Vector3(width / 2, height, depth + 0.05));
  }
}
