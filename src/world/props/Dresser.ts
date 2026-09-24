import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { cylinderMesh } from '../meshUtils';
import { part, matte } from './Prop';
import { wood as woodMaterial } from '@/world/materials/finishes';

export interface DresserOptions {
  /** Length along the wall. Default 0.9. */
  width?: number;
  /** Drawers, top to bottom. Default 3. */
  drawers?: number;
}

const DEPTH = 0.45;
const HEIGHT = 0.85;
const LEG = 0.1;
const PANEL = 0.02;
const DRAWER_GAP = 0.012;
/** How far the dresser stands off the wall. */
const OFF_WALL = 0.015;

const WALNUT = woodMaterial(0x5e412b, 0.5);
const DARK_WALNUT = woodMaterial(0x4a3221, 0.55);
const BRASS = new THREE.MeshStandardMaterial({ color: 0xc9a75b, metalness: 0.85, roughness: 0.3 });
const GLASS = new THREE.MeshStandardMaterial({ color: 0xcfe0e6, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.7 });
const PAGES = matte(0xf0e9d8, 0.9);

/**
 * A walnut chest of drawers against a wall: a carcass on tapered legs, three wide drawers with
 * two brass knobs each, and on top a tray with a perfume bottle, a couple of books and a small
 * ceramic dish. Wall-hung with `y: 0`: origin on the floor at the wall, +z into the room.
 * Collides as its box.
 */
export class Dresser extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;
  /** Height of the top surface. */
  readonly topHeight = HEIGHT;

  constructor(options: DresserOptions = {}) {
    super();
    this.name = 'Dresser';
    const width = options.width ?? 0.9;
    const drawers = options.drawers ?? 3;
    const z = OFF_WALL + DEPTH / 2;

    // Carcass on four tapered legs; the top overhangs a touch.
    const bodyH = HEIGHT - LEG;
    part(this, width, bodyH, DEPTH - PANEL, WALNUT, { y: LEG + bodyH / 2, z: z - PANEL / 2 });
    part(this, width + 0.03, PANEL, DEPTH + 0.02, WALNUT, { y: HEIGHT - PANEL / 2, z: z + 0.005 });
    for (const dx of [-width / 2 + 0.05, width / 2 - 0.05])
      for (const dz of [OFF_WALL + 0.05, OFF_WALL + DEPTH - 0.05]) this.add(cylinderMesh(0.022, LEG, DARK_WALNUT, { x: dx, y: LEG / 2, z: dz }, { radiusBottom: 0.014, segments: 10 }));

    // Drawer fronts, evenly split, the bottom one a shade taller; two knobs each.
    const stackH = bodyH - PANEL - DRAWER_GAP;
    const drawerH = (stackH - (drawers - 1) * DRAWER_GAP) / drawers;
    const frontZ = OFF_WALL + DEPTH - PANEL / 2;
    for (let i = 0; i < drawers; i++) {
      const y = LEG + DRAWER_GAP + i * (drawerH + DRAWER_GAP) + drawerH / 2;
      part(this, width - 0.05, drawerH, PANEL, WALNUT, { y, z: frontZ });
      for (const dx of [-width * 0.25, width * 0.25]) {
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), BRASS);
        knob.position.set(dx, y, frontZ + PANEL / 2 + 0.01);
        knob.castShadow = false;
        this.add(knob);
      }
    }

    this.dressTop(width, z);
    this.footprint = new THREE.Box3(new THREE.Vector3(-width / 2 - 0.015, 0, 0), new THREE.Vector3(width / 2 + 0.015, HEIGHT, OFF_WALL + DEPTH + 0.01));
  }

  /** What lives on the top: a tray holding a perfume bottle and a dish, and two books at the other end. */
  private dressTop(width: number, z: number): void {
    const y = HEIGHT;
    const trayX = -width * 0.22;
    const tray = part(this, 0.3, 0.012, 0.2, DARK_WALNUT, { x: trayX, y: y + 0.006, z });
    tray.castShadow = false;
    const bottle = cylinderMesh(0.028, 0.09, GLASS, { x: trayX - 0.07, y: y + 0.012 + 0.045, z: z - 0.03 }, { segments: 14 });
    this.add(bottle, cylinderMesh(0.012, 0.03, BRASS, { x: trayX - 0.07, y: y + 0.012 + 0.105, z: z - 0.03 }, { segments: 10 }));
    this.add(cylinderMesh(0.055, 0.02, matte(0xe9e2d6, 0.4), { x: trayX + 0.07, y: y + 0.012 + 0.01, z: z + 0.03 }, { radiusBottom: 0.04, segments: 18 }));

    // Two hardbacks lying flat at the other end, the top one turned a little.
    const bookX = width * 0.28;
    let top = y;
    [0x35506b, 0x8c3b34].forEach((colour, i) => {
      const cover = matte(colour, 0.7);
      const h = 0.03;
      // BoxGeometry material order: +x (spine), -x, +y (cover), -y, +z, -z.
      const book = new THREE.Mesh(new THREE.BoxGeometry(0.16 - i * 0.01, h, 0.22 - i * 0.02), [cover, PAGES, cover, cover, PAGES, PAGES]);
      book.position.set(bookX + i * 0.01, top + h / 2, z);
      book.rotation.y = i * 0.18;
      book.castShadow = true;
      book.receiveShadow = true;
      this.add(book);
      top += h;
    });
  }
}
