import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { cylinderMesh } from '../meshUtils';
import { part, matte } from './Prop';
import { SwingLeaf, revealWhileOpen } from './SwingLeaf';

export interface FridgeOptions {
  /** Outer size. Default a slim 0.6 x 0.65 x 1.85 m fridge-freezer. */
  width?: number;
  depth?: number;
  height?: number;
  /** Height of the freezer compartment on top. Default 0.55. */
  freezer?: number;
  /** The side the doors are hung on (the handles are on the other). Default 'right'. */
  hinge?: 'left' | 'right';
}

const DOOR_THICKNESS = 0.05;
const GAP = 0.004;
const FEET = 0.03;
/** Thickness of the cabinet's insulated walls. */
const WALL = 0.035;

const STEEL = new THREE.MeshStandardMaterial({ color: 0xbfc2c6, metalness: 0.7, roughness: 0.35 });
const SIDES = matte(0x9d9fa3, 0.55);
const GASKET = matte(0x1c1d20, 0.8);
const MAGNET_COLOURS = [0xd9463c, 0x2f6fb3, 0xf0b429, 0x3f9b5e];
/** The white plastic liner, lit by the fridge's bulb: an emissive glow, not a light (a new light recompiles every shader). */
const LINER = new THREE.MeshStandardMaterial({ color: 0xf2f4f6, emissive: 0xeaf1ff, emissiveIntensity: 0.3, roughness: 0.45 });
const FROST = new THREE.MeshStandardMaterial({ color: 0xe4ecf2, emissive: 0xdde8f5, emissiveIntensity: 0.2, roughness: 0.7 });
const SHELF = matte(0xd6dde2, 0.25);
/** The bulb's frosted cover under the fridge's ceiling, glowing while it is drawn (only with a door open). */
const BULB = new THREE.MeshStandardMaterial({ color: 0xfffaf0, emissive: 0xfff3dc, emissiveIntensity: 1.6, roughness: 0.3 });

/**
 * A brushed-steel fridge-freezer: freezer door on top, fridge door below, both hung on one side
 * (`hinge`) with a long vertical bar handle on the other, a few magnets holding a note, and the compressor
 * grille at the back. Both doors open on a click (`leaves`, placed by the builder with
 * `placeLeaves`) onto a glowing white liner, shelves and the week's shopping; the insides are only
 * drawn while a door is ajar. Wall-hung with `y: 0`: origin on the floor at the wall, +z into the
 * room, doors facing +z. Collides as a full box.
 */
export class Fridge extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;
  /** The fridge door, then the freezer door. */
  readonly leaves: SwingLeaf[];

  constructor(options: FridgeOptions = {}) {
    super();
    this.name = 'Fridge';
    const width = options.width ?? 0.6;
    const depth = options.depth ?? 0.65;
    const height = options.height ?? 1.85;
    const freezer = options.freezer ?? 0.55;
    const bodyD = depth - DOOR_THICKNESS;
    const bodyH = height - FEET;
    const fridgeH = bodyH - freezer - GAP;
    const hinge = options.hinge ?? 'right';
    const hingeX = hinge === 'right' ? width / 2 : -width / 2;

    // Cabinet on four short feet: an open-fronted box the doors close, a grille of fins across its back.
    const midY = FEET + bodyH / 2;
    part(this, width, bodyH, WALL, SIDES, { y: midY, z: WALL / 2 });
    for (const side of [-1, 1]) part(this, WALL, bodyH, bodyD, SIDES, { x: side * (width / 2 - WALL / 2), y: midY, z: bodyD / 2 });
    part(this, width, WALL, bodyD, SIDES, { y: height - WALL / 2, z: bodyD / 2 });
    part(this, width, WALL, bodyD, SIDES, { y: FEET + WALL / 2, z: bodyD / 2 });
    for (const dx of [-width / 2 + 0.05, width / 2 - 0.05]) for (const dz of [0.05, bodyD - 0.05]) this.add(cylinderMesh(0.012, FEET, GASKET, { x: dx, y: FEET / 2, z: dz }, { segments: 8 }));
    for (let i = 0; i < 7; i++) part(this, 0.01, bodyH - 0.2, 0.02, GASKET, { x: -width / 2 + 0.08 + i * ((width - 0.16) / 6), y: midY, z: 0.011 }).castShadow = false;

    const interior = new THREE.Group();
    this.add(interior);
    this.buildInterior(interior, width, bodyD, fridgeH, freezer);

    // Two doors on the hinge side: fridge (below), freezer (top).
    const reveal = revealWhileOpen(interior, 2);
    const fridgeDoor = this.buildDoor(width, fridgeH, hinge, 'fridge', reveal(0));
    fridgeDoor.position.set(hingeX, FEET, bodyD);
    const freezerDoor = this.buildDoor(width, freezer, hinge, 'freezer', reveal(1));
    freezerDoor.position.set(hingeX, FEET + fridgeH + GAP, bodyD);
    this.leaves = [fridgeDoor, freezerDoor];
    this.decorateFridgeDoor(fridgeDoor, width, fridgeH, hingeX);

    this.footprint = new THREE.Box3(new THREE.Vector3(-width / 2, 0, 0), new THREE.Vector3(width / 2, height, depth + 0.05));
  }

  /** A steel door with its gasket behind and its bar handle on the free edge. */
  private buildDoor(width: number, h: number, hinge: 'left' | 'right', noun: string, onOpenness: (openness: number) => void): SwingLeaf {
    const leaf = new SwingLeaf({ width, height: h, thickness: DOOR_THICKNESS, hinge, noun, maxAngle: THREE.MathUtils.degToRad(105), onOpenness });
    const { panel } = leaf;
    const x = leaf.edge(width / 2);
    part(panel, width, h, DOOR_THICKNESS, STEEL, { x, y: h / 2, z: DOOR_THICKNESS / 2 });
    // The gasket: a black rim round the inside of the door, seen when it is open.
    part(panel, width - 0.02, h - 0.02, 0.008, GASKET, { x, y: h / 2, z: -0.004 }).castShadow = false;
    const handleH = h * 0.6;
    const hx = leaf.edge(width - 0.06);
    panel.add(cylinderMesh(0.011, handleH, STEEL, { x: hx, y: h / 2, z: DOOR_THICKNESS + 0.035 }, { segments: 12 }));
    for (const dy of [-handleH / 2 + 0.03, handleH / 2 - 0.03]) {
      const boss = cylinderMesh(0.009, 0.035, STEEL, { x: hx, y: h / 2 + dy, z: DOOR_THICKNESS + 0.0175 }, { segments: 8 });
      boss.rotation.x = Math.PI / 2;
      panel.add(boss);
    }
    return leaf;
  }

  /** Magnets and a shopping list on the front, a bottle bin on the inside. */
  private decorateFridgeDoor(leaf: SwingLeaf, width: number, h: number, hingeX: number): void {
    const { panel } = leaf;
    const front = DOOR_THICKNESS;
    // Positions measured from the fridge's centre line, as on its face.
    const at = (x: number) => x - hingeX;
    const noteY = h - 0.25;
    part(panel, 0.1, 0.14, 0.002, matte(0xfaf6ea, 0.9), { x: at(0.08), y: noteY, z: front + 0.001 }).castShadow = false;
    for (let i = 0; i < 4; i++) part(panel, 0.008, 0.004, 0.09, matte(0x7a8ba0, 0.7), { x: at(0.05), y: noteY + 0.045 - i * 0.025, z: front + 0.0025 }).castShadow = false;
    const magnetSpots: [number, number][] = [
      [0.035, noteY + 0.06],
      [0.125, noteY + 0.06],
      [-0.1, h - 0.6],
      [0.15, h - 0.9],
    ];
    magnetSpots.forEach(([x, y], i) => {
      const magnet = cylinderMesh(0.014, 0.008, matte(MAGNET_COLOURS[i]!, 0.4), { x: at(x), y, z: front + 0.004 }, { segments: 14 });
      magnet.rotation.x = Math.PI / 2;
      magnet.castShadow = false;
      panel.add(magnet);
    });
    // Inside: a bin across the door with two bottles and a carton standing in it.
    const binY = h * 0.45;
    part(panel, width - 0.1, 0.06, 0.07, LINER, { x: leaf.edge(width / 2), y: binY, z: -0.045 }).castShadow = false;
    const bottles: [number, number, number][] = [
      [0.12, 0x3f7a3a, 0.24],
      [0.22, 0xc9d6de, 0.2],
    ];
    for (const [d, colour, tall] of bottles) {
      panel.add(cylinderMesh(0.03, tall, matte(colour, 0.2), { x: leaf.edge(d), y: binY + tall / 2 - 0.02, z: -0.045 }, { segments: 12 }));
    }
    part(panel, 0.07, 0.19, 0.06, matte(0xf4f1e6, 0.7), { x: leaf.edge(width - 0.14), y: binY + 0.075, z: -0.045 });
  }

  /** Liner, shelves and what is on them; only drawn while a door is open. */
  private buildInterior(interior: THREE.Group, width: number, bodyD: number, fridgeH: number, freezer: number): void {
    const innerW = width - 2 * WALL;
    const innerD = bodyD - WALL;
    const z = WALL + innerD / 2;
    // The liner: back and sides of each compartment, and the shelf between them.
    const floorY = FEET + WALL;
    const splitY = FEET + fridgeH + GAP / 2;
    const top = FEET + fridgeH + GAP + freezer - WALL;
    const lined = (bottom: number, ceiling: number): void => {
      const h = ceiling - bottom;
      part(interior, innerW, h, 0.004, LINER, { y: bottom + h / 2, z: WALL + 0.002 }).castShadow = false;
      for (const side of [-1, 1]) part(interior, 0.004, h, innerD, LINER, { x: side * (innerW / 2 - 0.002), y: bottom + h / 2, z }).castShadow = false;
      part(interior, innerW, 0.004, innerD, LINER, { y: bottom + 0.002, z }).castShadow = false;
    };
    lined(floorY, splitY - 0.02);
    lined(splitY + 0.02, top);
    // The light: a frosted cover at the top of the fridge, towards the front.
    part(interior, 0.12, 0.025, 0.05, BULB, { y: splitY - 0.02 - 0.0125, z: bodyD - 0.12 }).castShadow = false;
    part(interior, width - 2 * WALL, 0.04, innerD, SIDES, { y: splitY, z });

    // Two shelves, set back from the door's bin, and a crisper drawer at the bottom.
    const shelfD = innerD - 0.1;
    const shelfZ = WALL + shelfD / 2;
    const shelfYs = [floorY + 0.36, floorY + 0.72];
    for (const y of shelfYs) part(interior, innerW - 0.01, 0.008, shelfD, SHELF, { y, z: shelfZ }).castShadow = false;
    part(interior, innerW - 0.02, 0.2, shelfD, FROST, { y: floorY + 0.11, z: shelfZ });

    // The week's shopping: milk and juice, a jar, cheese, eggs, leftovers under a lid, a bottle of wine lying down.
    const lower = shelfYs[0]! + 0.004;
    const upper = shelfYs[1]! + 0.004;
    part(interior, 0.07, 0.2, 0.07, matte(0xf6f4ee, 0.7), { x: -innerW / 2 + 0.07, y: lower + 0.1, z: shelfZ });
    part(interior, 0.07, 0.18, 0.07, matte(0xf0a830, 0.6), { x: -innerW / 2 + 0.16, y: lower + 0.09, z: shelfZ + 0.04 });
    interior.add(cylinderMesh(0.04, 0.1, matte(0xc0392b, 0.3), { x: 0.08, y: lower + 0.05, z: shelfZ - 0.05 }, { segments: 14 }));
    part(interior, 0.14, 0.05, 0.1, matte(0xf2d06b, 0.5), { x: innerW / 2 - 0.1, y: lower + 0.025, z: shelfZ + 0.06 });
    part(interior, 0.16, 0.07, 0.11, matte(0xb9a27d, 0.9), { x: -0.05, y: upper + 0.035, z: shelfZ + 0.05 });
    part(interior, 0.18, 0.08, 0.14, matte(0x8fb3c9, 0.35), { x: innerW / 2 - 0.11, y: upper + 0.04, z: shelfZ - 0.03 });
    const wine = cylinderMesh(0.035, 0.3, matte(0x2b3a2a, 0.2), { x: 0, y: floorY + 0.25, z: shelfZ }, { segments: 12 });
    wine.rotation.z = Math.PI / 2;
    interior.add(wine);

    // The freezer: two frosted drawers and an ice tray on top.
    const freezerFloor = splitY + 0.02;
    const drawerH = (top - freezerFloor - 0.08) / 2;
    for (let i = 0; i < 2; i++) part(interior, innerW - 0.02, drawerH - 0.01, innerD - 0.02, FROST, { y: freezerFloor + (i + 0.5) * drawerH, z: WALL + (innerD - 0.02) / 2 });
    part(interior, 0.24, 0.03, 0.1, matte(0xdfe9f0, 0.3), { y: freezerFloor + 2 * drawerH + 0.02, z: shelfZ });
  }
}
