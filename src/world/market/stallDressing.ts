import * as THREE from 'three';
import { createCanvas, toTexture } from '@/graphics/canvas';
import { repaintWhenFontLoads } from '@/graphics/fontReady';
import { boxMesh, cylinderMesh } from '../meshUtils';
import { paint, METAL } from '../materials/palette';
import { WALL, layMesh } from '../surface/layers';

/*
 * What a flea-market table has on it besides its stock: the cash tin and the thermos on the crates, a tray of loose
 * carts and a tangled pad under the table, a hand-lettered card pinned to the cloth, the platform stencilled on the
 * crates. Seeded per stall, so no two tables are dressed alike. Built into the stall (stall-local, +z the aisle).
 */

/** What the cards pinned to the front of a table say. */
const CARDS: readonly (readonly string[])[] = [['3 FOR 10'], ['ALL', 'BOXED'], ['CASH', 'ONLY'], ['NO TIME', 'WASTERS'], ['MAKE ME', 'AN OFFER'], ['TESTED', 'WORKING']];
const MARKER = '"Permanent Marker", "Marker Felt", "Comic Sans MS", cursive';
const CARD_PAPERS = ['#f4ecd8', '#ffe98a', '#ffd0c0', '#d8f0d0'];

/** The crates' stencil: the platform's name sprayed in black through a card stencil, a little faded, on bare card. */
export function stencilMaterial(text: string, card: number): THREE.MeshStandardMaterial {
  const [canvas, ctx] = createCanvas(256, 160);
  const base = `#${new THREE.Color(card).getHexString()}`;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 160);
  ctx.save();
  ctx.translate(128, 84);
  ctx.rotate(-0.03);
  ctx.fillStyle = 'rgba(28,24,20,0.78)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = 54;
  ctx.font = `900 ${size}px Impact, "Arial Narrow Bold", sans-serif`;
  while (ctx.measureText(text).width > 220 && size > 18) ctx.font = `900 ${--size}px Impact, "Arial Narrow Bold", sans-serif`;
  ctx.fillText(text.toUpperCase(), 0, 0);
  ctx.restore();
  // The stencil's bridges: thin gaps across the letters, as a cut card stencil leaves them.
  ctx.fillStyle = base;
  for (let x = 30; x < 236; x += 22) ctx.fillRect(x, 60, 2, 48);
  // Spray overrun and scuffs.
  ctx.fillStyle = 'rgba(28,24,20,0.06)';
  for (let i = 0; i < 40; i++) ctx.fillRect(20 + ((i * 37) % 216), 40 + ((i * 53) % 90), 3, 3);
  return new THREE.MeshStandardMaterial({ map: toTexture(canvas, 'facing'), roughness: 0.9 });
}

/** The card pinned to the table's front flap: a hand-lettered sales line, on coloured paper. Origin on the cloth's face, +z out. */
export function pinnedCard(random: () => number): THREE.Group {
  const lines = CARDS[Math.floor(random() * CARDS.length)]!;
  const paper = CARD_PAPERS[Math.floor(random() * CARD_PAPERS.length)]!;
  const [canvas, ctx] = createCanvas(240, 160);
  const paintIt = (): void => {
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, 240, 160);
    ctx.fillStyle = '#c8261e';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = lines.length > 1 ? 50 : 64;
    ctx.font = `${size}px ${MARKER}`;
    lines.forEach((line, i) => {
      let fit = size;
      while (ctx.measureText(line).width > 216 && fit > 20) ctx.font = `${--fit}px ${MARKER}`;
      ctx.fillText(line, 120, 80 + (i - (lines.length - 1) / 2) * 58);
      ctx.font = `${size}px ${MARKER}`;
    });
    // The drawing pin.
    ctx.fillStyle = '#2a6ac8';
    ctx.beginPath();
    ctx.arc(120, 12, 7, 0, Math.PI * 2);
    ctx.fill();
  };
  paintIt();
  const texture = toTexture(canvas, 'facing');
  repaintWhenFontLoads(`64px ${MARKER}`, () => {
    paintIt();
    texture.needsUpdate = true;
  });
  const card = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.14), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 }));
  layMesh(card, WALL.flyer);
  card.rotation.z = (random() - 0.5) * 0.18;
  card.position.z = WALL.flyer.lift;
  card.castShadow = false;
  card.receiveShadow = true;
  const pinned = new THREE.Group();
  pinned.add(card);
  return pinned;
}

const TIN = paint(0x2f5a3a, 0.4);
const TIN_LID = paint(0x24472d, 0.4);
const THERMOS = paint(0xb8342a, 0.45);
const CAP = METAL.satinSteel();
const TRAY = paint(0x3a3c40, 0.6);
const CART_GREY = paint(0x8a8d92, 0.55);
const CART_DARK = paint(0x2a2b2f, 0.55);
const PAD = paint(0x9a9aa0, 0.5);
const PAD_DARK = paint(0x1d1d20, 0.5);
const LEAD = paint(0x18181a, 0.6);

/** The stallholder's cash tin, its lid closed (origin under it). */
export function cashTin(): THREE.Group {
  const group = new THREE.Group();
  group.add(boxMesh(0.2, 0.06, 0.14, TIN, { y: 0.03 }));
  group.add(boxMesh(0.204, 0.014, 0.144, TIN_LID, { y: 0.067 }));
  group.add(boxMesh(0.05, 0.008, 0.012, CAP, { y: 0.078, z: 0.05 }));
  return group;
}

/** A tartan-red thermos with its steel cup on top (origin under it). */
export function thermos(): THREE.Group {
  const group = new THREE.Group();
  group.add(cylinderMesh(0.038, 0.24, THERMOS, { y: 0.12 }, { segments: 16 }));
  group.add(cylinderMesh(0.041, 0.06, CAP, { y: 0.27 }, { segments: 16 }));
  return group;
}

/** A shallow tray of loose cartridges standing on their ends, `count` of them, grey and black (origin under it). */
export function cartTray(random: () => number, count = 7): THREE.Group {
  const group = new THREE.Group();
  const W = 0.32;
  const D = 0.16;
  const BASE_T = 0.012;
  const SIDE_T = 0.008;
  group.add(boxMesh(W, BASE_T, D, TRAY, { y: BASE_T / 2 }));
  for (const sx of [-1, 1]) group.add(boxMesh(SIDE_T, 0.04, D, TRAY, { x: sx * (W / 2 - SIDE_T / 2), y: 0.02 }));
  for (const sz of [-1, 1]) group.add(boxMesh(W - 2 * SIDE_T, 0.04, SIDE_T, TRAY, { y: 0.02, z: sz * (D / 2 - SIDE_T / 2) }));
  for (let i = 0; i < count; i++) {
    const cart = boxMesh(0.12, 0.1, 0.02, random() < 0.6 ? CART_GREY : CART_DARK, { x: -W / 2 + 0.03 + i * 0.04, y: 0.012 + 0.05, z: (random() - 0.5) * 0.02 });
    cart.rotation.y = Math.PI / 2;
    cart.rotation.z = (random() - 0.5) * 0.2;
    group.add(cart);
  }
  return group;
}

/** A controller lying on the floor, its lead in loose loops beside it (origin on the floor under the pad). */
export function tangledPad(random: () => number): THREE.Group {
  const group = new THREE.Group();
  group.add(boxMesh(0.12, 0.022, 0.055, random() < 0.5 ? PAD : PAD_DARK, { y: 0.011 }));
  const points: THREE.Vector3[] = [new THREE.Vector3(0, 0.012, -0.03)];
  let angle = -Math.PI / 2;
  for (let i = 0; i < 14; i++) {
    angle += 0.9 + random() * 0.9;
    const r = 0.05 + random() * 0.07;
    points.push(new THREE.Vector3(Math.cos(angle) * r - 0.02, 0.006, -0.12 + Math.sin(angle) * r));
  }
  const lead = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 64, 0.0035, 5, false), LEAD);
  lead.castShadow = false;
  lead.receiveShadow = true;
  group.add(lead);
  return group;
}
