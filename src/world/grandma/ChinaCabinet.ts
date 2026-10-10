import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { cylinderMesh } from '../meshUtils';
import { part } from '../props/Prop';
import { METAL, paint, timber } from '../materials/palette';
import { GLASS, asGlass } from '../materials/glass';
import { PROUD, SEAM } from '../props/joinery';

const OFF_WALL = 0.02;
/** The cupboard below and the glazed case on it (m). */
const BASE = { h: 0.8, d: 0.44 };
const COUNTER = 0.025;
const CASE = { h: 0.98, d: 0.34 };
const CORNICE = 0.06;
const BOARD = 0.02;
const FACE = 0.018;
const BAR = 0.04;
const PANE = 0.004;
/** The glass shelves' heights over the counter. */
const SHELVES = [0.33, 0.66];
const SHELF_T = 0.008;
const KEY = 0.01;
const SAUCER = 0.01;

/**
 * Mémé's china cabinet (`furnishGrandmaDecor`): a walnut cupboard of two doors under a glazed case, her best plates
 * stood up along its glass shelves, the cups on their saucers, the soup tureen at the bottom. The doors stay shut
 * (her good service is for Sundays). Origin on the floor at the wall, front towards +z; `wall` placement with `y: 0`.
 * Collides.
 */
export class ChinaCabinet extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;
  /** The top of the cornice, in its own frame (a figurine stands there). */
  readonly topHeight: number;

  constructor(width = 1.0) {
    super();
    this.name = 'ChinaCabinet';
    const walnut = timber(0x5a3a22, 0.5);
    const dark = timber(0x46301c, 0.55);
    const inside = paint(0xc8d0c8, 0.8);
    const brass = METAL.agedBrass();

    // The cupboard: carcass, two doors proud of it, their brass knobs, a counter over it.
    const baseZ = OFF_WALL + BASE.d / 2;
    part(this, width, BASE.h, BASE.d, walnut, { y: BASE.h / 2, z: baseZ });
    const front = OFF_WALL + BASE.d + PROUD;
    const doorW = (width - 0.06) / 2;
    for (const s of [-1, 1]) {
      part(this, doorW - SEAM, BASE.h - 0.14, FACE, dark, { x: s * (doorW / 2 + 0.01), y: 0.08 + (BASE.h - 0.14) / 2, z: front + FACE / 2 });
      const knob = cylinderMesh(0.013, 0.02, brass, { x: s * 0.05, y: BASE.h * 0.62, z: front + FACE + 0.01 }, { segments: 12 });
      knob.rotation.x = Math.PI / 2;
      this.add(knob);
    }
    const counterTop = BASE.h + SEAM + COUNTER;
    part(this, width + 2 * 0.015, COUNTER, BASE.d + 0.015, walnut, { y: BASE.h + SEAM + COUNTER / 2, z: OFF_WALL + (BASE.d + 0.015) / 2 });

    // The case: a back painted pale, the sides and top, a cornice over all.
    const caseBottom = counterTop + SEAM;
    const caseZ = OFF_WALL + CASE.d / 2;
    const backH = CASE.h - BOARD - SEAM;
    part(this, width - 2 * BOARD, backH, BOARD, inside, { y: caseBottom + backH / 2, z: OFF_WALL + BOARD / 2 });
    for (const s of [-1, 1]) part(this, BOARD, CASE.h, CASE.d, walnut, { x: s * (width / 2 - BOARD / 2), y: caseBottom + CASE.h / 2, z: caseZ });
    part(this, width - 2 * BOARD - 2 * SEAM, BOARD, CASE.d, walnut, { y: caseBottom + CASE.h - BOARD / 2, z: caseZ });
    const corniceY = caseBottom + CASE.h + SEAM;
    part(this, width + 0.05, CORNICE, CASE.d + 0.025, dark, { y: corniceY + CORNICE / 2, z: OFF_WALL + (CASE.d + 0.025) / 2 });
    this.topHeight = corniceY + CORNICE;

    // The glass shelves, from side to side, a hair short of each.
    const innerW = width - 2 * BOARD - 2 * SEAM;
    const shelfD = CASE.d - BOARD - 0.04;
    const shelfZ = OFF_WALL + BOARD + SEAM + shelfD / 2;
    for (const y of SHELVES) asGlass(part(this, innerW, SHELF_T, shelfD, GLASS.shelf, { y: caseBottom + y, z: shelfZ }));
    this.fill(caseBottom, innerW, shelfZ);

    // The two glazed doors: a frame of four bars round a pane each, shut, a key in the right one.
    const caseFront = OFF_WALL + CASE.d;
    const leafW = (width - 2 * BOARD) / 2 - SEAM;
    for (const s of [-1, 1]) {
      const cx = s * (leafW / 2 + SEAM / 2);
      const barZ = caseFront + FACE / 2;
      const y0 = caseBottom;
      part(this, BAR, CASE.h - BOARD - SEAM, FACE, walnut, { x: cx - leafW / 2 + BAR / 2, y: y0 + (CASE.h - BOARD) / 2, z: barZ });
      part(this, BAR, CASE.h - BOARD - SEAM, FACE, walnut, { x: cx + leafW / 2 - BAR / 2, y: y0 + (CASE.h - BOARD) / 2, z: barZ });
      part(this, leafW - 2 * BAR - 2 * SEAM, BAR, FACE, walnut, { x: cx, y: y0 + BAR / 2, z: barZ });
      part(this, leafW - 2 * BAR - 2 * SEAM, BAR, FACE, walnut, { x: cx, y: y0 + CASE.h - BOARD - BAR / 2 - SEAM, z: barZ });
      asGlass(part(this, leafW - 2 * BAR + 0.01, CASE.h - BOARD - 2 * BAR + 0.01, PANE, GLASS.clear, { x: cx, y: y0 + (CASE.h - BOARD) / 2, z: caseFront + FACE / 2 - SEAM }));
    }
    const key = part(this, 0.008, 0.035, KEY, brass, { x: 0.04, y: caseBottom + CASE.h * 0.45, z: caseFront + FACE + KEY / 2 });
    key.castShadow = false;

    this.footprint = new THREE.Box3(new THREE.Vector3(-width / 2 - 0.02, 0, 0), new THREE.Vector3(width / 2 + 0.02, this.topHeight, OFF_WALL + BASE.d + 0.04));
  }

  /** Her service on the glass: plates stood up along the back of each shelf, cups on saucers before them, the tureen below. */
  private fill(caseBottom: number, innerW: number, shelfZ: number): void {
    const china = paint(0xf8f5ee, 0.3);
    const gilt = paint(0x2e4a7a, 0.35);
    const levels = [caseBottom, ...SHELVES.map((y) => caseBottom + y + SHELF_T / 2 + SEAM)];
    levels.forEach((y, level) => {
      if (level === 0) {
        // The tureen and its lid in the middle, a sauce boat beside it.
        this.add(cylinderMesh(0.12, 0.13, china, { y: y + 0.065, z: shelfZ }, { radiusBottom: 0.08, segments: 24 }));
        this.add(cylinderMesh(0.11, 0.035, china, { y: y + 0.13 + SEAM + 0.0175, z: shelfZ }, { radiusBottom: 0.122, segments: 24 }));
        this.add(cylinderMesh(0.018, 0.025, gilt, { y: y + 0.165 + 2 * SEAM + 0.0125, z: shelfZ }, { segments: 10 }));
        this.add(cylinderMesh(0.05, 0.05, china, { x: innerW * 0.3, y: y + 0.025, z: shelfZ + 0.03 }, { radiusBottom: 0.035, segments: 16 }));
        return;
      }
      // Plates on edge against the back, leaning a little.
      const plates = 4;
      for (let i = 0; i < plates; i++) {
        const r = level === 1 ? 0.11 : 0.09;
        const plate = cylinderMesh(r, 0.012, i % 2 ? gilt : china, { x: -innerW / 2 + 0.13 + i * (innerW - 0.26) / (plates - 1), y: y + r, z: OFF_WALL + BOARD + 0.035 }, { segments: 28 });
        plate.rotation.x = Math.PI / 2 - 0.18;
        this.add(plate);
      }
      // Cups on saucers along the front.
      for (let i = 0; i < 3; i++) {
        const x = -innerW / 2 + 0.16 + i * (innerW - 0.32) / 2;
        this.add(cylinderMesh(0.055, SAUCER, china, { x, y: y + SAUCER / 2, z: shelfZ + 0.06 }, { radiusBottom: 0.045, segments: 20 }));
        this.add(cylinderMesh(0.038, 0.055, level === 1 ? china : gilt, { x, y: y + SAUCER + SEAM + 0.0275, z: shelfZ + 0.06 }, { radiusBottom: 0.028, segments: 18 }));
      }
    });
  }
}
