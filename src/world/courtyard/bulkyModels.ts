import * as THREE from 'three';
import { BULKY_JUNK, BULKY_PIECES, type BulkyJunk, type BulkyPiece } from '@/building/bulkyWaste';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { part } from '../props/Prop';
import { cylinderMesh } from '../meshUtils';
import { softPart } from '../props/softBlock';
import { ticking, wovenCloth } from '../materials/weave';
import { METAL, paint, timber } from '../materials/palette';
import { GLASS } from '../materials/glass';
import { INSET, PROUD, SEAM } from '../props/joinery';

/*
 * What a bulky-waste pile is made of (`placeBulky`): the junk nobody takes, the pieces for the flat, the carton of
 * games and the owner's cardboard sign. Each model stands on its base at y 0, its front to +z, and says its size (the
 * click target, the pile's collider). Worn on purpose: faded cloth, scuffed paint, a split seat.
 */

/** A model and the box it fills (m). */
export interface PileModel {
  object: THREE.Group;
  size: [number, number, number];
}

const CARDBOARD = 0xb08a5a;
/** A carton's wall, a picture's or a mirror's frame, a set's face, a bookcase's back board (m). */
const CARD = 0.01;
const FRAME = 0.03;
const FACE = 0.01;
const BACK = 0.005;

/** A piece for the flat as it stands by the bins. */
export function pieceModel(piece: BulkyPiece): PileModel {
  const g = new THREE.Group();
  switch (piece) {
    case 'armchair': {
      const fabric = wovenCloth(0x8a6a4a);
      const legs = timber(0x4a3424);
      for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]] as const) part(g, 0.05, 0.12, 0.05, legs, { x, y: 0.06, z });
      softPart(g, 0.76, 0.24, 0.74, fabric, { y: 0.24 }, { round: 4, lumps: 0.02, seed: 3 });
      softPart(g, 0.76, 0.56, 0.2, fabric, { y: 0.62, z: -0.3 }, { round: 3, lumps: 0.015, seed: 5 });
      softPart(g, 0.16, 0.3, 0.66, fabric, { x: -0.33, y: 0.48, z: 0.02 }, { round: 3, seed: 7 });
      softPart(g, 0.16, 0.3, 0.66, fabric, { x: 0.33, y: 0.48, z: 0.02 }, { round: 3, seed: 9 });
      softPart(g, 0.5, 0.12, 0.5, wovenCloth(0x9a7a56), { y: 0.42, z: 0.06 }, { round: 3, lumps: 0.02, seed: 11 });
      return { object: g, size: [0.8, 0.9, 0.78] };
    }
    case 'floorLamp': {
      part(g, 0.28, 0.03, 0.28, METAL.agedBrass(), { y: 0.015 });
      g.add(cylinderMesh(0.012, 1.5, METAL.agedBrass(), { y: 0.03 + 0.75 }));
      const shade = cylinderMesh(0.16, 0.26, paint(0xd8c8a4, 0.95), { y: 1.62 }, { radiusBottom: 0.22 });
      shade.rotation.z = 0.25;
      shade.position.x = 0.04;
      g.add(shade);
      return { object: g, size: [0.45, 1.8, 0.45] };
    }
    case 'sideTable': {
      const walnut = timber(0x5a3a26);
      g.add(cylinderMesh(0.25, 0.025, walnut, { y: 0.56 }));
      g.add(cylinderMesh(0.025, 0.52, walnut, { y: 0.28 }));
      g.add(cylinderMesh(0.15, 0.03, walnut, { y: 0.015 }));
      return { object: g, size: [0.5, 0.58, 0.5] };
    }
    case 'mirror': {
      const frame = timber(0x6a4a2e);
      const lean = new THREE.Group();
      part(lean, 0.56, 1.6, FRAME, frame, { y: 0.8 });
      part(lean, 0.48, 1.52, 0.004, GLASS.mirror, { y: 0.8, z: FRAME / 2 + PROUD });
      lean.rotation.x = -0.14;
      lean.position.z = -0.08;
      g.add(lean);
      return { object: g, size: [0.6, 1.62, 0.36] };
    }
    case 'dresser': {
      const body = timber(0x8a6040);
      const front = timber(0x9a7050);
      part(g, 0.9, 0.78, 0.46, body, { y: 0.43 });
      part(g, 0.9 + 2 * PROUD, 0.03, 0.46 + 2 * PROUD, timber(0x7a5236), { y: 0.82 + 0.015 + SEAM });
      for (let i = 0; i < 3; i++) {
        const y = 0.18 + i * 0.24;
        part(g, 0.84, 0.21, 0.02, front, { y: 0.06 + y, z: 0.23 + 0.01 - INSET });
        part(g, 0.1, 0.02, 0.02, METAL.agedBrass(), { y: 0.06 + y, z: 0.23 + 0.02 + 0.01 - INSET });
      }
      for (const x of [-0.41, 0.41]) part(g, 0.05, 0.06, 0.05, body, { x, y: 0.03 });
      return { object: g, size: [0.94, 0.86, 0.5] };
    }
    case 'bookcase': {
      const pine = timber(0xc8a070);
      const w = 0.8;
      const h = 1.8;
      const d = 0.3;
      part(g, 0.02, h, d, pine, { x: -w / 2 + 0.01, y: h / 2 });
      part(g, 0.02, h, d, pine, { x: w / 2 - 0.01, y: h / 2 });
      part(g, w - 0.04 - 2 * SEAM, BACK, d - 2 * BACK, timber(0xd8b888), { y: h / 2, z: -d / 2 + 2 * BACK });
      for (let i = 0; i < 5; i++) part(g, w - 0.04 - 2 * SEAM, 0.018, d - 0.02, pine, { y: 0.06 + i * 0.42, z: BACK });
      return { object: g, size: [w, h, d] };
    }
    case 'crt': {
      const shell = paint(0x2a2a2c, 0.5);
      part(g, 0.42, 0.36, 0.38, shell, { y: 0.18 });
      part(g, 0.32, 0.25, FACE, paint(0x101414, 0.12), { x: -0.03, y: 0.2, z: 0.19 + FACE / 2 - INSET });
      part(g, 0.04, 0.04, FACE, paint(0x8a8a8a, 0.4), { x: 0.16, y: 0.26, z: 0.19 + FACE / 2 - INSET });
      part(g, 0.28, FACE, FACE, METAL.steel(), { y: 0.36 + FACE / 2 + SEAM, z: -0.05 });
      return { object: g, size: [0.44, 0.38, 0.4] };
    }
    case 'framedPrint': {
      const lean = new THREE.Group();
      part(lean, 0.5, 0.66, FRAME, timber(0x2a2420), { y: 0.33 });
      part(lean, 0.42, 0.58, 0.004, printMaterial(), { y: 0.33, z: FRAME / 2 + PROUD });
      lean.rotation.x = -0.18;
      lean.position.z = -0.05;
      g.add(lean);
      return { object: g, size: [0.52, 0.68, 0.24] };
    }
  }
}

/** What nobody takes. */
export function junkModel(kind: BulkyJunk): PileModel {
  const g = new THREE.Group();
  switch (kind) {
    case 'mattress': {
      // Stood on its long edge against the wall, leaning back.
      const m = new THREE.Group();
      softPart(m, 1.4, 1.9, 0.18, ticking(), {}, { round: 6, lumps: 0.01, seed: 13 });
      m.rotation.x = -0.12;
      m.rotation.z = Math.PI / 2;
      m.position.set(0, 0.71, 0.04);
      g.add(m);
      return { object: g, size: [1.9, 1.4, 0.5] };
    }
    case 'chair': {
      const wood = timber(0x7a5a3a);
      for (const [x, z] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]] as const) part(g, 0.035, 0.45, 0.035, wood, { x, y: 0.225, z });
      // The seat split in two, one half sagged.
      part(g, 0.44, 0.025, 0.2, wood, { y: 0.46, z: 0.11 });
      const half = part(g, 0.44, 0.025, 0.2, wood, { y: 0.43, z: -0.1 });
      half.rotation.x = 0.18;
      for (const y of [0.62, 0.78, 0.92]) part(g, 0.4, 0.04, 0.02, wood, { y, z: -0.2 });
      part(g, 0.035, 0.5, 0.035, wood, { x: -0.19, y: 0.72, z: -0.21 });
      part(g, 0.035, 0.5, 0.035, wood, { x: 0.19, y: 0.72, z: -0.21 });
      g.rotation.y = 0.5;
      return { object: g, size: [0.5, 0.98, 0.5] };
    }
    case 'carpet': {
      const roll = cylinderMesh(0.13, 1.7, wovenCloth(0x7a2e2a), {});
      roll.rotation.z = Math.PI / 2;
      roll.position.y = 0.13;
      g.add(roll);
      return { object: g, size: [1.7, 0.26, 0.26] };
    }
    case 'crockery': {
      const box = cardboardBox(g, 0.5, 0.32, 0.36);
      for (let i = 0; i < 5; i++) {
        const plate = cylinderMesh(0.11, 0.012, paint(i % 2 ? 0xe8e2d4 : 0xd8d0be, 0.3), { x: -0.16 + i * 0.075, y: box + 0.04, z: -0.02 });
        plate.rotation.z = Math.PI / 2;
        g.add(plate);
      }
      return { object: g, size: [0.5, 0.48, 0.36] };
    }
    case 'deadTv': {
      part(g, 0.62, 0.5, 0.48, paint(0x5a4a3a, 0.6), { y: 0.25 });
      part(g, 0.46, 0.36, FACE, paint(0x1a1c1c, 0.08), { x: -0.05, y: 0.26, z: 0.24 + FACE / 2 - INSET });
      // A crack across the screen.
      const crack = part(g, 0.3, 0.004, 0.002, paint(0xb8c0c4, 0.2), { x: -0.08, y: 0.3, z: 0.24 + FACE + SEAM - INSET });
      crack.rotation.z = 0.5;
      return { object: g, size: [0.62, 0.5, 0.48] };
    }
    case 'pram': {
      const body = paint(0x2a3a5a, 0.55);
      softPart(g, 0.42, 0.3, 0.75, body, { y: 0.52 }, { round: 5, seed: 17 });
      const hood = softPart(g, 0.44, 0.26, 0.3, paint(0x22304a, 0.7), { y: 0.72, z: -0.24 }, { round: 3, seed: 19 });
      hood.rotation.x = -0.3;
      for (const [x, z] of [[-0.23, -0.28], [0.23, -0.28], [-0.23, 0.28], [0.23, 0.28]] as const) {
        const wheel = cylinderMesh(0.16, 0.035, paint(0x1a1a1a, 0.8), { x, y: 0.16, z });
        wheel.rotation.z = Math.PI / 2;
        g.add(wheel);
      }
      part(g, 0.42, 0.025, 0.025, METAL.steel(), { y: 0.95, z: 0.5 });
      return { object: g, size: [0.5, 0.98, 1.0] };
    }
    case 'skis': {
      for (const x of [-0.06, 0.06]) {
        const ski = part(g, 0.07, 1.7, 0.02, paint(x < 0 ? 0xc83a2a : 0xd04a32, 0.35), { x, y: 0.84 });
        ski.rotation.x = -0.18;
        ski.position.z = -0.12;
      }
      return { object: g, size: [0.2, 1.7, 0.3] };
    }
  }
}

/** The carton the games are in: open, its flaps folded out. Returns the model and the height its games lie at. */
export function cartonModel(): PileModel & { top: number } {
  const g = new THREE.Group();
  const top = cardboardBox(g, 0.52, 0.3, 0.4);
  return { object: g, size: [0.7, 0.32, 0.6], top };
}

/** A cardboard box with its flaps open into `g`; returns its rim's height. */
function cardboardBox(g: THREE.Group, w: number, h: number, d: number): number {
  const card = paint(CARDBOARD, 0.95);
  part(g, w - 2 * CARD - 2 * SEAM, CARD, d - 2 * CARD - 2 * SEAM, card, { y: CARD / 2 + SEAM });
  part(g, w, h, CARD, card, { y: h / 2, z: d / 2 - CARD / 2 });
  part(g, w, h, CARD, card, { y: h / 2, z: -d / 2 + CARD / 2 });
  part(g, CARD, h, d - 2 * CARD - 2 * SEAM, card, { x: w / 2 - CARD / 2, y: h / 2 });
  part(g, CARD, h, d - 2 * CARD - 2 * SEAM, card, { x: -w / 2 + CARD / 2, y: h / 2 });
  const flap = paint(0xa07c4e, 0.95);
  for (const side of [-1, 1]) {
    const f = part(g, w * 0.98, 0.01, d * 0.45, flap, { y: h, z: side * (d / 2 + d * 0.2) });
    f.rotation.x = side * 0.7;
  }
  return h - 0.06;
}

/** The owner's sign, on a flap torn off a box: FREE, help yourself, their name. */
export function signModel(owner: string): PileModel {
  const g = new THREE.Group();
  const [canvas, ctx] = createCanvas(768, 576);
  ctx.scale(3, 3);
  ctx.fillStyle = '#b8935f';
  ctx.fillRect(0, 0, 256, 192);
  ctx.fillStyle = '#1e1a18';
  ctx.textAlign = 'center';
  ctx.font = 'bold 54px "Comic Sans MS", "Chalkboard SE", sans-serif';
  ctx.fillText('FREE', 128, 66);
  ctx.font = '26px "Comic Sans MS", "Chalkboard SE", sans-serif';
  ctx.fillText('help yourself!', 128, 112);
  ctx.font = 'italic 22px "Comic Sans MS", "Chalkboard SE", sans-serif';
  ctx.fillText(`— ${owner}`, 128, 160);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.315), new THREE.MeshStandardMaterial({ map: toTexture(canvas), roughness: 0.95 }));
  board.position.set(0, 0.17, 0.004);
  const back = part(g, 0.43, 0.32, 0.006, paint(CARDBOARD, 0.95), { y: 0.17 });
  board.castShadow = false;
  const lean = new THREE.Group();
  lean.add(back, board);
  lean.rotation.x = -0.32;
  g.add(lean);
  return { object: g, size: [0.44, 0.32, 0.2] };
}

/** A print of mountains at dusk: its own small canvas. */
function printMaterial(): THREE.MeshStandardMaterial {
  const [canvas, ctx] = createCanvas(384, 512);
  ctx.scale(4, 4);
  const sky = ctx.createLinearGradient(0, 0, 0, 128);
  sky.addColorStop(0, '#e8a868');
  sky.addColorStop(1, '#6a4a6a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 96, 128);
  ctx.fillStyle = '#3a3048';
  ctx.beginPath();
  ctx.moveTo(0, 100);
  ctx.lineTo(30, 60);
  ctx.lineTo(50, 82);
  ctx.lineTo(72, 50);
  ctx.lineTo(96, 90);
  ctx.lineTo(96, 128);
  ctx.lineTo(0, 128);
  ctx.fill();
  return new THREE.MeshStandardMaterial({ map: toTexture(canvas), roughness: 0.6 });
}

/** Every model of a pile side by side, a metre and a half apart (the headless checks' subject). */
export function bulkyPileSample(): THREE.Group {
  const g = new THREE.Group();
  const models = [...BULKY_PIECES.map(pieceModel), ...BULKY_JUNK.map(junkModel), cartonModel(), signModel('A neighbour')];
  models.forEach((m, i) => {
    m.object.position.x = (i - models.length / 2) * 1.5;
    g.add(m.object);
  });
  return g;
}
