import * as THREE from 'three';
import { createCanvas, toTexture } from '@/graphics/canvas';
import { FLOOR } from '../surface/layers';
import { paint, shared } from '../materials/palette';
import { cylinderMesh } from '../meshUtils';
import { Prop, part } from '../props/Prop';
import { INSET, PROUD, SEAM } from '../props/joinery';

/*
 * The things of the past the memories filmed at Mémé's lay out (docs/story.md "Mémé"): the parcel Félix wrapped in
 * the sports pages, torn open on the rug (Christmas 1995); a Sunday supper gone cold on the table (the row); Félix's
 * keys on their ring (the keys). Each is placed by its reel through `MemorySet.place`, struck with the scene.
 */

/** The sports pages, a print of columns, a headline and a match photo: one canvas for every parcel. */
function sportsPages(): THREE.MeshStandardMaterial {
  return shared('memory:sportsPages', () => {
    const [canvas, ctx] = createCanvas(256, 256);
    ctx.fillStyle = '#e9e2cf';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#26221c';
    ctx.font = 'bold 30px Georgia, serif';
    ctx.fillText('SPORTS', 12, 36);
    ctx.fillRect(12, 44, 232, 3);
    // The match photo, grey, and the columns of small print round it.
    ctx.fillStyle = '#6e6a62';
    ctx.fillRect(12, 56, 120, 82);
    ctx.fillStyle = '#9a958a';
    ctx.fillRect(30, 92, 22, 30);
    ctx.fillRect(74, 84, 18, 38);
    ctx.fillStyle = '#4a463e';
    for (let column = 0; column < 4; column++) {
      const x = 12 + column * 60;
      for (let y = column < 2 ? 150 : 60; y < 248; y += 7) ctx.fillRect(x, y, 50 - ((y * 7 + column * 13) % 11), 3);
    }
    const material = new THREE.MeshStandardMaterial({ map: toTexture(canvas, 'facing'), roughness: 0.95, side: THREE.DoubleSide });
    return material;
  });
}

/** A plate's blue rim, its china and a cold helping, and the bread board (thicknesses, m); the keys' paper tag. */
const PLATE = { rim: 0.008, china: 0.004, food: 0.012, board: 0.018 } as const;
const TAG = 0.001;

/** A scrap's size (m): torn bits, from a corner to a strip. */
const SCRAPS: readonly (readonly [w: number, d: number, x: number, z: number, turn: number])[] = [
  [0.12, 0.09, 0.2, 0.1, 0.4],
  [0.07, 0.05, -0.18, 0.16, 1.2],
  [0.16, 0.06, 0.08, -0.2, -0.7],
  [0.05, 0.04, -0.24, -0.08, 2.1],
  [0.09, 0.07, 0.3, -0.12, 0.9],
  [0.04, 0.03, 0.02, 0.28, -1.4],
];

/**
 * THE PARCEL, opened: the Game Boy's box with its lid off beside it, the sports pages it was wrapped in torn and
 * crumpled round it, scraps strewn about on the rug. Origin on the floor; it lies on a pile rug (its top's lift).
 */
export class TornParcel extends Prop {
  readonly contactShadow = false;

  constructor() {
    super();
    this.name = 'TornParcel';
    const base = FLOOR.rug.lift + PROUD; // convention-ok: solid things standing on the pile rug's top, not a layer drawn on it
    const card = paint(0xd8d2c4, 0.8);
    const print = paint(0x2a5a8a, 0.6);
    const pages = sportsPages();
    // The box, open, its blue-printed sides, and its lid tipped against it.
    part(this, 0.2, 0.06, 0.16, card, { y: base + 0.03 });
    part(this, 0.2 + 2 * PROUD, 0.025, 0.16 + 2 * PROUD, print, { y: base + 0.03 });
    const lid = part(this, 0.205, 0.012, 0.165, print, { x: 0.15, y: base + 0.06, z: 0.03 });
    lid.rotation.z = -0.9;
    // The wrapping: big torn sheets, crumpled up at angles, each a hair over the last.
    const sheets: readonly (readonly [w: number, d: number, x: number, z: number, tilt: number, turn: number])[] = [
      [0.3, 0.24, -0.16, 0.06, 0.18, 0.3],
      [0.26, 0.2, 0.04, 0.19, -0.15, -0.5],
      [0.22, 0.18, -0.06, -0.17, 0.2, 1.1],
    ];
    sheets.forEach(([w, d, x, z, tilt, turn], i) => {
      const sheet = part(this, w, 0.0015, d, pages, { x, y: base + 0.026 + i * 0.012, z });
      sheet.rotation.set(tilt, turn, tilt * 0.4);
    });
    // The scraps, flat on the rug, each a little over the one before (no two in one plane).
    SCRAPS.forEach(([w, d, x, z, turn], i) => {
      const scrap = part(this, w, 0.0008, d, pages, { x, y: base + (i + 1) * SEAM * 2, z });
      scrap.rotation.y = turn;
    });
  }
}

/**
 * A SUNDAY SUPPER GONE COLD on a table whose top (a cloth's, if any) is at `top`: the enamel cocotte in the middle,
 * three plates pushed back (Mémé's at the back, the brothers' at the ends), the child's left at the front, the bread,
 * the bottle and the glasses. Origin on the floor under the table's middle, like the table's.
 */
export class ColdSupper extends Prop {
  readonly contactShadow = false;

  constructor({ top, width }: { top: number; width: number }) {
    super();
    this.name = 'ColdSupper';
    const china = paint(0xf2eee4, 0.35);
    const rim = paint(0x2a4a7a, 0.4);
    const enamel = paint(0xc8562a, 0.3);
    const glass = paint(0xd8e2e0, 0.08);
    const wine = paint(0x3a0e16, 0.15);
    const crust = paint(0xb8823a, 0.85);
    const y = top + PROUD;
    // The plates: china over a blue rim a hair under it, a cold helping on each but the child's.
    const ends = width / 2 - 0.2;
    const places: readonly (readonly [x: number, z: number, eaten: boolean])[] = [
      [0, -0.24, false],
      [-ends, 0, true],
      [ends, 0.02, false],
      [0.22, 0.27, true],
    ];
    const chinaTop = y + PLATE.rim + PLATE.china - INSET;
    for (const [x, z, eaten] of places) {
      this.add(cylinderMesh(0.125, PLATE.rim, rim, { x, y: y + PLATE.rim / 2, z }, { segments: 24 }));
      // The china buried in its rim, the helping in the china.
      this.add(cylinderMesh(0.115, PLATE.china, china, { x, y: chinaTop - PLATE.china / 2, z }, { segments: 24 }));
      if (!eaten) this.add(cylinderMesh(0.06, PLATE.food, paint(0xe8d8b0, 0.5), { x: x + 0.02, y: chinaTop + PLATE.food / 2 - INSET, z }, { radiusBottom: 0.07, segments: 12 }));
      // A glass to the right of each.
      this.add(cylinderMesh(0.03, 0.1, glass, { x: x + 0.16, y: y + 0.05, z: z - 0.1 }, { segments: 12 }));
    }
    // The cocotte, its lid on, in the middle.
    this.add(cylinderMesh(0.12, 0.1, enamel, { y: y + 0.05, z: 0.02 }, { radiusBottom: 0.11, segments: 24 }));
    this.add(cylinderMesh(0.124, 0.012, enamel, { y: y + 0.105, z: 0.02 }, { segments: 24 }));
    this.add(cylinderMesh(0.02, 0.025, paint(0x2a2622, 0.5), { y: y + 0.122, z: 0.02 }, { segments: 10 }));
    // The bottle, half drunk, and the end of the loaf on its board.
    this.add(cylinderMesh(0.038, 0.24, wine, { x: -0.3, y: y + 0.12, z: 0.12 }, { segments: 14 }));
    this.add(cylinderMesh(0.014, 0.08, wine, { x: -0.3, y: y + 0.278, z: 0.12 }, { segments: 10 }));
    part(this, 0.3, PLATE.board, 0.16, paint(0x9a6a3a, 0.7), { x: 0.36, y: y + PLATE.board / 2, z: -0.2 });
    const loaf = cylinderMesh(0.035, 0.2, crust, { x: 0.36, y: y + PLATE.board + 0.033, z: -0.2 }, { segments: 10 });
    loaf.rotation.z = Math.PI / 2;
    this.add(loaf);
  }
}

/**
 * FÉLIX'S KEYS on their ring: two flat keys and a round one, brass and steel, and a paper tag on a string. Origin
 * under the ring's middle, lying flat (on a table, or in her hands).
 */
export class KeyRing extends Prop {
  readonly contactShadow = false;

  constructor() {
    super();
    this.name = 'KeyRing';
    const brass = paint(0xc8a24a, 0.3);
    const steel = paint(0xb8bcc0, 0.25);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.0018, 6, 18), steel);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.002;
    this.add(ring);
    const keys: readonly (readonly [turn: number, metal: THREE.Material, long: number])[] = [
      [0.3, brass, 0.055],
      [-0.5, steel, 0.048],
      [1.6, brass, 0.04],
    ];
    keys.forEach(([turn, metal, long], i) => {
      const key = new THREE.Group();
      key.rotation.y = turn;
      key.position.y = 0.002 + i * 0.0012;
      const bow = cylinderMesh(0.011, 0.002, metal, { z: 0.024 }, { segments: 12 });
      part(key, 0.008, 0.002, long, metal, { z: 0.035 + long / 2 });
      key.add(bow);
      this.add(key);
    });
    // The tag on its string: a buff card with his writing.
    part(this, 0.03, TAG, 0.045, paint(0xe2cf9a, 0.9), { x: -0.035, y: SEAM + TAG / 2, z: -0.02 }).rotation.y = -0.4;
  }
}
