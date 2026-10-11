import * as THREE from 'three';
import type { Furniture } from '../../Furniture';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { snowCovered } from '../snowCover';
import { STREET_PLAN, type Vec2 } from '../streetPlan';
import { TriBuilder } from '../relief/TriBuilder';
import { TexQuads, type UvRect } from '../shopfronts/TexQuads';
import { LETTERING, letteringFont } from '../../city/shopLooks';
import { gapAt } from '../../surface/layers';

const { cabinets: CABINETS, payStations: PAY_STATIONS, bottleBanks: BOTTLE_BANKS, signs: SIGNS, fountain: FOUNTAIN } = STREET_PLAN.details;

/** A telecom cabinet: its body, on a plinth, a little wider cap. */
const CABINET = { w: 0.62, h: 1.15, d: 0.36, plinth: 0.08 };
/** A parking pay station: its post, its head (the screen, the slot), the P over it. */
const PAY = { post: 1.1, head: { w: 0.34, h: 0.58, d: 0.24 }, plate: 0.22 };
/** A bottle bank: its bin, its rounded lid, the two round mouths. */
const BANK = { w: 1.45, h: 1.35, d: 1.15, mouth: 0.1 };
/** A road sign: its post, its plate's size and height. */
const SIGN = { post: 2.25, plate: 0.6, radius: 0.03 };
/** The drinking fountain: its plinth, the four columns under the dome, its height. */
const FOUNTAIN_SIZE = { base: 0.42, columns: 0.24, height: 2.4 };
const STEEL = '#8e9296';
/** Each sign's face in the atlas (a cell each; the P over a pay station too). */
type SignFace = 'limit30' | 'crossing' | 'noStopping' | 'parking';
const FACES: readonly SignFace[] = ['limit30', 'crossing', 'noStopping', 'parking'];
/** A sign's face stands this far in front of its plate's front (one mesh against another: a real gap seen across the street). */
const FACE = gapAt(40);
/** How far a thing on a fixture's face (a seam, a sticker, a screen) stands proud of it, its back buried in it. */
const PROUD = gapAt(30);

const m = new THREE.Matrix4();
const local = new THREE.Matrix4();

/**
 * The street's fixtures (`STREET_PLAN.details`): grey-green telecom cabinets on the kerbs, parking pay stations with
 * their screen and a P on top, the bottle banks in the stretch the works open up, road signs on their posts (thirty,
 * a pedestrian crossing, no stopping) facing the drivers they speak to, and by the park a cast-iron drinking fountain,
 * four columns under its dome and a thin stream of water. One mesh of vertex colours and the signs' faces; everything
 * collides; the snow settles on it.
 */
export class StreetFixtures extends THREE.Group implements Furniture {
  readonly contactShadow = false;
  readonly colliders: THREE.Box3[] = [];

  constructor() {
    super();
    this.name = 'StreetFixtures';
    const b = new TriBuilder().hideGround();
    const faces = new TexQuads();
    for (const c of CABINETS) cabinet(b, c.at, c.yaw);
    for (const p of PAY_STATIONS) payStation(b, faces, p.at, p.yaw);
    for (const bank of BOTTLE_BANKS) bottleBank(b, bank.at, bank.yaw, bank.colour);
    for (const s of SIGNS) sign(b, faces, s.at, s.yaw, s.sign);
    fountain(b, FOUNTAIN.at);
    for (const c of CABINETS) this.collide(c.at, CABINET.w / 2 + 0.05, CABINET.h);
    for (const p of PAY_STATIONS) this.collide(p.at, 0.18, 1.7);
    for (const bank of BOTTLE_BANKS) this.collide(bank.at, BANK.w / 2, BANK.h);
    for (const s of SIGNS) this.collide(s.at, 0.07, 2.2);
    this.collide(FOUNTAIN.at, FOUNTAIN_SIZE.base + 0.05, FOUNTAIN_SIZE.height);
    const mesh = new THREE.Mesh(b.build(), snowCovered(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 })));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.add(mesh);
    if (!faces.isEmpty) {
      const plates = new THREE.Mesh(faces.build(), new THREE.MeshStandardMaterial({ map: signAtlas(), roughness: 0.4, alphaTest: 0.5 }));
      plates.receiveShadow = true;
      this.add(plates);
    }
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  private collide([x, z]: Vec2, half: number, height: number): void {
    this.colliders.push(new THREE.Box3(new THREE.Vector3(x - half, 0, z - half), new THREE.Vector3(x + half, height, z + half)));
  }
}

/** A frame at (x, z) turned `yaw` (its +z facing (sin yaw, cos yaw)). */
function frame([x, z]: Vec2, yaw: number): THREE.Matrix4 {
  return new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z);
}

function cabinet(b: TriBuilder, at: Vec2, yaw: number): void {
  const f = frame(at, yaw);
  const { w, h, d, plinth } = CABINET;
  b.box(f, 0, plinth / 2, 0, w - 0.04, plinth, d - 0.04, '#3a3c3a');
  b.box(f, 0, plinth + (h - plinth) / 2, 0, w, h - plinth, d, '#5f6b62');
  b.box(f, 0, h + 0.025, 0, w + 0.05, 0.05, d + 0.05, '#566058');
  // Its two doors' seam, the lock, a vent's louvres, a sticker.
  b.box(f, 0, plinth + (h - plinth) / 2, d / 2, 0.008, h - plinth - 0.08, 2 * PROUD, '#3e4640');
  b.box(f, 0.05, 0.75, d / 2, 0.03, 0.05, 0.016, '#9a9ea0');
  for (let y = 0.25; y < 0.5; y += 0.05) b.box(f, -0.16, y, d / 2, 0.16, 0.012, 3 * PROUD, '#4a524c');
  b.box(f, 0.17, 0.95, d / 2, 0.12, 0.08, 2 * PROUD, '#e8e2d0');
}

function payStation(b: TriBuilder, faces: TexQuads, at: Vec2, yaw: number): void {
  const f = frame(at, yaw);
  const { post, head, plate } = PAY;
  b.box(f, 0, post / 2, 0, 0.1, post, 0.1, '#2a3440');
  const hy = post + head.h / 2;
  b.box(f, 0, hy, 0, head.w, head.h, head.d, '#2e4a6a');
  b.box(f, 0, post + head.h + 0.02, 0, head.w + 0.03, 0.04, head.d + 0.03, '#2a3440');
  // The screen, the keys under it, the coin slot.
  b.box(f, 0, hy + 0.12, head.d / 2, 0.2, 0.13, 2 * PROUD, '#1a2a22');
  b.box(f, 0, hy - 0.04, head.d / 2, 0.18, 0.08, 4 * PROUD, '#a8acb0');
  b.box(f, 0.11, hy - 0.16, head.d / 2, 0.04, 0.06, 5 * PROUD, '#c8ccd0');
  // A P on a post over the head, both ways.
  const top = post + head.h + 0.04;
  b.box(f, 0, top + 0.15, 0, 0.03, 0.3, 0.03, STEEL);
  b.box(f, 0, top + 0.3 + plate / 2, 0, plate, plate, 0.02, '#e8eaee');
  faces.quad(f, 0, top + 0.3 + plate / 2, 0.01 + FACE, plate * 0.94, plate * 0.94, cell('parking'));
  faces.quad(f, 0, top + 0.3 + plate / 2, -0.01 - FACE, plate * 0.94, plate * 0.94, cell('parking'), Math.PI);
}

function bottleBank(b: TriBuilder, at: Vec2, yaw: number, colour: string): void {
  const f = frame(at, yaw);
  const { w, h, d, mouth } = BANK;
  b.box(f, 0, (h - 0.25) / 2, 0, w, h - 0.25, d, colour);
  // The rounded lid: a half cylinder along its width.
  local.makeTranslation(0, h - 0.25, 0).premultiply(f).multiply(m.makeScale(w, 0.25, d / 2));
  b.geometry(local, LID, colour);
  // Two round mouths and their rubber rims on the street side, a white band.
  for (const s of [-0.35, 0.35]) {
    local.makeTranslation(s, h - 0.5, d / 2 + 2 * PROUD).premultiply(f).multiply(m.makeScale(mouth, mouth, 1));
    b.geometry(local, MOUTH, '#141414');
    local.makeTranslation(s, h - 0.5, d / 2 + PROUD).premultiply(f).multiply(m.makeScale(mouth + 0.03, mouth + 0.03, 1));
    b.geometry(local, MOUTH, '#2a2a2a');
  }
  b.box(f, 0, 0.5, d / 2, w - 0.1, 0.12, 2 * PROUD, '#e8e8e2');
  b.box(f, 0, 0.04, 0, w + 0.06, 0.08, d + 0.06, '#3a3c3a');
}

function sign(b: TriBuilder, faces: TexQuads, at: Vec2, yaw: number, face: SignFace): void {
  const f = frame(at, yaw);
  const { post, plate, radius } = SIGN;
  b.box(f, 0, post / 2, 0, radius * 2, post, radius * 2, STEEL);
  const y = post + plate / 2 - 0.05;
  // The plate's back (grey, its rim), the face in front.
  const round = face !== 'crossing';
  if (round) {
    local.makeTranslation(0, y, 0.03).premultiply(f).multiply(m.makeScale(plate / 2, plate / 2, 0.02));
    b.geometry(local, DISC, '#9a9ea2');
  } else {
    b.box(f, 0, y, 0.03, plate, plate, 0.02, '#9a9ea2');
  }
  faces.quad(f, 0, y, 0.04 + FACE, plate * 0.98, plate * 0.98, cell(face));
  b.box(f, 0, y + 0.18, 0.015, 0.06, 0.04, 0.03, STEEL);
  b.box(f, 0, y - 0.18, 0.015, 0.06, 0.04, 0.03, STEEL);
}

/** A drinking fountain in cast iron: a stepped plinth, four slim columns under a scaled dome, a stream down its middle. */
function fountain(b: TriBuilder, at: Vec2): void {
  const f = frame(at, 0);
  const { base, columns, height } = FOUNTAIN_SIZE;
  const green = '#27412f';
  local.copy(f).multiply(m.makeScale(base, 0.5, base));
  b.geometry(local, PLINTH, green);
  for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    local.makeTranslation(dx * columns * 0.7, 0.5, dz * columns * 0.7).premultiply(f).multiply(m.makeScale(0.045, height - 1.15, 0.045));
    b.geometry(local, COLUMN, green);
  }
  local.makeTranslation(0, height - 0.65, 0).premultiply(f).multiply(m.makeScale(columns + 0.08, 0.05, columns + 0.08));
  b.geometry(local, PLINTH, green);
  local.makeTranslation(0, height - 0.6, 0).premultiply(f).multiply(m.makeScale(columns + 0.06, 0.42, columns + 0.06));
  b.geometry(local, DOME, green);
  // The stream, from under the dome to the grate in the plinth.
  local.makeTranslation(0, 0.5, 0).premultiply(f).multiply(m.makeScale(0.012, height - 1.18, 0.012));
  b.geometry(local, COLUMN, '#b8d4e0');
}

/** A half cylinder along x, its round side up (a unit long, a unit in radius). */
const LID = new THREE.CylinderGeometry(1, 1, 1, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2);
const MOUTH = new THREE.CircleGeometry(1, 16);
const DISC = new THREE.CylinderGeometry(1, 1, 1, 24).rotateX(Math.PI / 2);
const PLINTH = new THREE.CylinderGeometry(1, 1.1, 1, 8).translate(0, 0.5, 0);
const COLUMN = new THREE.CylinderGeometry(1, 1, 1, 8).translate(0, 0.5, 0);
const DOME = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);

/** A sign face's cell in the atlas. */
function cell(face: SignFace): UvRect {
  const i = FACES.indexOf(face);
  return { u0: i / FACES.length, v0: 0, u1: (i + 1) / FACES.length, v1: 1 };
}

/** The signs' faces, a 128 px cell each: thirty in a red ring, the walker on blue, no stopping, a white P on blue. */
function signAtlas(): THREE.CanvasTexture {
  const c = 128;
  const [canvas, ctx] = createCanvas(c * FACES.length, c);
  FACES.forEach((face, i) => {
    const x = i * c;
    const mid = x + c / 2;
    ctx.save();
    if (face === 'limit30') {
      disc(ctx, mid, c / 2, 62, '#d02a24');
      disc(ctx, mid, c / 2, 48, '#f4f4f0');
      ctx.fillStyle = '#141414';
      ctx.font = letteringFont(LETTERING.sans, 52);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('30', mid, c / 2 + 3);
    } else if (face === 'noStopping') {
      disc(ctx, mid, c / 2, 62, '#d02a24');
      disc(ctx, mid, c / 2, 49, '#2a5aa8');
      ctx.strokeStyle = '#d02a24';
      ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.moveTo(mid - 34, c / 2 - 34);
      ctx.lineTo(mid + 34, c / 2 + 34);
      ctx.moveTo(mid + 34, c / 2 - 34);
      ctx.lineTo(mid - 34, c / 2 + 34);
      ctx.stroke();
    } else if (face === 'crossing') {
      ctx.fillStyle = '#f4f4f0';
      ctx.fillRect(x + 2, 2, c - 4, c - 4);
      ctx.fillStyle = '#2a5aa8';
      ctx.fillRect(x + 7, 7, c - 14, c - 14);
      ctx.fillStyle = '#f4f4f0';
      ctx.beginPath();
      ctx.moveTo(mid, 16);
      ctx.lineTo(x + c - 16, c - 22);
      ctx.lineTo(x + 16, c - 22);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#141414';
      ctx.fillRect(mid - 26, c - 40, 52, 6);
      disc(ctx, mid + 2, 50, 7, '#141414');
      ctx.fillRect(mid - 3, 57, 8, 22);
    } else {
      ctx.fillStyle = '#2a5aa8';
      ctx.fillRect(x + 4, 4, c - 8, c - 8);
      ctx.fillStyle = '#f4f4f0';
      ctx.font = letteringFont(LETTERING.sans, 92);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('P', mid, c / 2 + 4);
    }
    ctx.restore();
  });
  return toTexture(canvas, 'facing');
}

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
