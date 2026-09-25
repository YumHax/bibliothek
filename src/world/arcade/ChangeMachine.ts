import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { createCanvas, toTexture, FONT } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../Furniture';
import { boxMesh, cylinderMesh, invisibleHitbox } from '../meshUtils';
import { drawText } from './games/ArcadeGame';

export interface ChangeMachineOptions {
  /** Whether it works today (then the OUT OF ORDER note is gone and its LED is green); the Session pays the change. */
  working?: boolean;
  /** Paint of the steel body. Default a blue-grey. */
  color?: number;
}

const WIDTH = 0.6;
const HEIGHT = 1.7;
const DEPTH = 0.45;
const PLINTH_H = 0.08;
const HEADER_H = 0.24;
const PX_PER_M = 800;

const STEEL_DARK = new THREE.MeshStandardMaterial({ color: 0x1d1f2a, roughness: 0.5, metalness: 0.4 });
const CHROME = new THREE.MeshStandardMaterial({ color: 0xb9bcc0, metalness: 0.7, roughness: 0.3 });

/**
 * The change machine every arcade has and nobody trusts: a tall steel box with a lit CHANGE
 * header, a note acceptor, a coin slot and a return cup, and most days a hand-written OUT OF
 * ORDER note taped over the slot. Some days (`working`, drawn by `ArcadeDaily`) the note is gone
 * and a click gets a few coins once (`SessionActions.collectChange` decides). Origin on the floor
 * under its centre, +z faces the room. Collides.
 */
export class ChangeMachine extends THREE.Group implements Furniture, Interactable {
  readonly hitboxes: THREE.Object3D[];
  private readonly header: THREE.MeshBasicMaterial;
  private readonly working: boolean;

  constructor(options: ChangeMachineOptions = {}) {
    super();
    this.name = 'ChangeMachine';
    this.working = options.working ?? false;
    const steel = new THREE.MeshStandardMaterial({ color: options.color ?? 0x3b4258, roughness: 0.45, metalness: 0.35 });

    this.add(boxMesh(WIDTH, PLINTH_H, DEPTH, STEEL_DARK, { y: PLINTH_H / 2 }));
    this.add(boxMesh(WIDTH, HEIGHT - PLINTH_H, DEPTH, steel, { y: PLINTH_H + (HEIGHT - PLINTH_H) / 2 }));
    // The front panel: everything printed on the machine, painted.
    const panelH = HEIGHT - PLINTH_H - HEADER_H - 0.04;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH - 0.04, panelH), new THREE.MeshStandardMaterial({ map: paintPanel(WIDTH - 0.04, panelH, this.working), roughness: 0.5, metalness: 0.2 }));
    panel.position.set(0, PLINTH_H + panelH / 2 + 0.01, DEPTH / 2 + 0.002);
    panel.receiveShadow = true;
    this.add(panel);
    // The lit header.
    this.header = new THREE.MeshBasicMaterial({ map: paintHeader(), toneMapped: false, color: 0xdddddd });
    const header = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH - 0.06, HEADER_H - 0.04), this.header);
    header.position.set(0, HEIGHT - 0.02 - HEADER_H / 2, DEPTH / 2 + 0.004);
    this.add(header);
    this.add(boxMesh(WIDTH - 0.04, 0.012, 0.03, CHROME, { y: HEIGHT - HEADER_H - 0.02, z: DEPTH / 2 + 0.01 }));
    // The return cup, a real hollow you could reach into, and the lock.
    const cup = new THREE.Group();
    cup.position.set(0, 0.62, DEPTH / 2 + 0.03);
    cup.add(boxMesh(0.26, 0.015, 0.07, STEEL_DARK, { y: -0.05 }));
    cup.add(boxMesh(0.015, 0.11, 0.07, STEEL_DARK, { x: -0.1225 }));
    cup.add(boxMesh(0.015, 0.11, 0.07, STEEL_DARK, { x: 0.1225 }));
    cup.add(boxMesh(0.26, 0.11, 0.008, STEEL_DARK, { z: 0.03 }));
    this.add(cup);
    const lock = cylinderMesh(0.012, 0.01, CHROME, { x: WIDTH / 2 - 0.06, y: 1.0, z: DEPTH / 2 + 0.005 }, { segments: 12 });
    lock.rotation.x = Math.PI / 2;
    this.add(lock);

    const hitbox = invisibleHitbox(WIDTH + 0.04, HEIGHT, DEPTH + 0.06, { y: HEIGHT / 2 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-WIDTH / 2, 0, -DEPTH / 2), new THREE.Vector3(WIDTH / 2, HEIGHT, DEPTH / 2 + 0.07));
  }

  setHovered(hovered: boolean): void {
    this.header.color.setHex(hovered ? 0xffffff : 0xdddddd);
  }

  label(): string {
    return this.working ? 'Change machine — it works today! Click for change' : 'Change machine — click';
  }

  activate(session: SessionActions): void {
    session.collectChange();
  }
}

/** CHANGE in yellow on red, a chrome-ish border, the coins it takes along the bottom. */
function paintHeader(): THREE.Texture {
  const [canvas, ctx] = createCanvas(512, 180);
  ctx.fillStyle = '#b8202a';
  ctx.fillRect(0, 0, 512, 180);
  ctx.strokeStyle = '#ffd23a';
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, 492, 160);
  drawText(ctx, 'CHANGE', 256, 78, 62, '#ffe680');
  drawText(ctx, 'TOKENS · COINS', 256, 140, 18, '#ffd6d6');
  return toTexture(canvas, 4);
}

/** The steel front: a note acceptor, a coin slot, arrows and instructions, a coin-return legend, and the taped note. */
function paintPanel(wM: number, hM: number, working: boolean): THREE.Texture {
  const W = Math.round(wM * PX_PER_M);
  const H = Math.round(hM * PX_PER_M);
  const [canvas, ctx] = createCanvas(W, H);
  ctx.fillStyle = '#3b4258';
  ctx.fillRect(0, 0, W, H);
  // Brushed steel: fine horizontal streaks.
  for (let y = 0; y < H; y += 2) {
    ctx.fillStyle = `rgba(255,255,255,${0.02 + (y % 7) * 0.006})`;
    ctx.fillRect(0, y, W, 1);
  }
  const cx = W / 2;
  // Canvas y grows downwards: the top of the panel is y = 0 (just under the header).
  // Note acceptor: a black mouth in a chrome bezel with a green LED beside it.
  const noteY = H * 0.12;
  ctx.fillStyle = '#9ea2a8';
  ctx.fillRect(cx - W * 0.3, noteY - 24, W * 0.6, 48);
  ctx.fillStyle = '#0b0b10';
  ctx.fillRect(cx - W * 0.27, noteY - 10, W * 0.54, 20);
  ctx.fillStyle = working ? '#3aff6a' : '#ff3a3a';
  ctx.beginPath();
  ctx.arc(cx + W * 0.36, noteY, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8eaf0';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(W * 0.055)}px ${FONT}`;
  ctx.fillText('INSERT NOTE FACE UP', cx, noteY + 60);
  // Arrows pointing at the mouth.
  ctx.fillStyle = '#ffd23a';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + sx * W * 0.38, noteY - 60);
    ctx.lineTo(cx + sx * W * 0.34, noteY - 40);
    ctx.lineTo(cx + sx * W * 0.42, noteY - 40);
    ctx.closePath();
    ctx.fill();
  }
  // Coin slot: a vertical slit in a small chrome plate.
  const coinY = H * 0.3;
  ctx.fillStyle = '#9ea2a8';
  ctx.fillRect(cx - 30, coinY - 40, 60, 80);
  ctx.fillStyle = '#0b0b10';
  ctx.fillRect(cx - 5, coinY - 28, 10, 56);
  ctx.fillStyle = '#e8eaf0';
  ctx.font = `${Math.round(W * 0.05)}px ${FONT}`;
  ctx.fillText('1 · 2 · 5', cx, coinY + 66);
  // The rates.
  ctx.font = `bold ${Math.round(W * 0.06)}px ${FONT}`;
  ctx.fillStyle = '#ffd23a';
  ctx.fillText('1 NOTE = 10 TOKENS', cx, H * 0.45);
  ctx.fillStyle = '#c9ccd4';
  ctx.font = `${Math.round(W * 0.045)}px ${FONT}`;
  ctx.fillText('no refunds · no exchange', cx, H * 0.45 + W * 0.08);
  // Coin return legend, just above where the cup bolts on.
  ctx.font = `${Math.round(W * 0.045)}px ${FONT}`;
  ctx.fillText('COIN RETURN', cx, H * 0.6);
  // The taped note, askew over the slot: torn paper, marker capitals, two strips of tape. Gone on a
  // day it works, bar the tape marks.
  if (working) {
    ctx.fillStyle = 'rgba(220,200,140,0.35)';
    ctx.fillRect(cx - W * 0.17, coinY - W * 0.2, W * 0.12, W * 0.04);
    ctx.fillRect(cx + W * 0.13, coinY - W * 0.19, W * 0.12, W * 0.04);
  } else {
    ctx.save();
    ctx.translate(cx + W * 0.05, coinY - 6);
    ctx.rotate(-0.12);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-W * 0.31 + 6, -W * 0.16 + 8, W * 0.62, W * 0.32);
    ctx.fillStyle = '#f3ead2';
    ctx.fillRect(-W * 0.31, -W * 0.16, W * 0.62, W * 0.32);
    ctx.fillStyle = '#2a2622';
    ctx.font = `bold ${Math.round(W * 0.11)}px "Comic Sans MS", "Chalkboard SE", "Segoe Print", ${FONT}`;
    ctx.fillText('OUT OF', 0, -W * 0.06);
    ctx.fillText('ORDER', 0, W * 0.05);
    ctx.font = `${Math.round(W * 0.045)}px "Comic Sans MS", "Chalkboard SE", "Segoe Print", ${FONT}`;
    ctx.fillText('see counter', 0, W * 0.125);
    ctx.fillStyle = 'rgba(220,200,140,0.7)';
    ctx.fillRect(-W * 0.2, -W * 0.18, W * 0.12, W * 0.04);
    ctx.fillRect(W * 0.1, -W * 0.175, W * 0.12, W * 0.04);
    ctx.restore();
  }
  // Screws in the corners.
  ctx.fillStyle = '#9ea2a8';
  for (const [x, y] of [[14, 14], [W - 14, 14], [14, H - 14], [W - 14, H - 14]] as const) {
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(canvas, 4);
}
