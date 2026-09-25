import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { createCanvas, fitFontSize, toTexture, FONT } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../Furniture';
import { boxMesh, cylinderMesh, invisibleHitbox } from '../meshUtils';
import { matte } from '../props/Prop';
import { wood as woodMaterial } from '@/world/materials/finishes';

export interface CoffeeCartOptions {
  /** Price of a cup, chalked on the menu board. */
  price: number;
  /** Hover caption. */
  label: () => string;
  /** Click: buy a coffee. */
  onActivate: (session: SessionActions) => void;
}

const WIDTH = 1.1;
const DEPTH = 0.55;
/** The cart's body, on two wheels at the right and two short legs at the left. */
const BODY_BOTTOM = 0.22;
const COUNTER_Y = 0.92;
const COUNTER_T = 0.035;
const COUNTER_TOP = COUNTER_Y + COUNTER_T;
const WHEEL_R = 0.2;
const WHEEL_X = 0.3;
/** The espresso machine, on the counter's left half. */
const MACHINE_X = -0.22;
const MACHINE_W = 0.4;
const MACHINE_H = 0.34;
const MACHINE_D = 0.3;
/** The parasol's pole rises from the counter's back right corner. */
const PARASOL_X = WIDTH / 2 - 0.08;
const PARASOL_Z = -DEPTH / 2 + 0.06;
const PARASOL_TOP = 2.25;
const PARASOL_R = 0.85;
const PARASOL_RISE = 0.28;
const PARASOL_PANELS = 12;
/** The chalk menu board, standing on the counter's front right. */
const MENU_W = 0.24;
const MENU_H = 0.3;

const CHROME = new THREE.MeshStandardMaterial({ color: 0xd0d2d4, roughness: 0.18, metalness: 0.95 });
const BLACK = matte(0x1c1a18, 0.5);
const RUBBER = matte(0x1a1a1a, 0.9);
const PAPER = matte(0xf4efe4, 0.8);

/**
 * A little espresso cart: a painted wooden body on two spoked wheels and two legs, a counter
 * with a chrome espresso machine (two group heads, a pressure gauge, a cup rail on top), a stack
 * of paper cups, a chalk menu board reading COFFEE and the price, and a striped parasol on a pole.
 * Clicking it buys a cup (`onActivate`). The barista stands at `serveAt`, behind it. Origin on the
 * floor under the middle, +z the customer's side. Collides.
 */
export class CoffeeCart extends THREE.Group implements Furniture, Interactable {
  readonly hitboxes: THREE.Object3D[];
  /** Behind the cart, where the barista stands (cart-local floor point). */
  readonly serveAt = new THREE.Vector3(0, 0, -DEPTH / 2 - 0.4);

  constructor(private readonly options: CoffeeCartOptions) {
    super();
    this.name = 'CoffeeCart';
    const paint = matte(0x2f5a4a, 0.5);
    const trim = woodMaterial(0x8b6a44, 0.55);

    // The body: a painted box, framed panels on the customer's side, a wooden counter overhanging it.
    const bodyH = COUNTER_Y - BODY_BOTTOM;
    this.add(boxMesh(WIDTH, bodyH, DEPTH, paint, { y: BODY_BOTTOM + bodyH / 2 }));
    for (const x of [-WIDTH / 4, WIDTH / 4]) this.add(boxMesh(WIDTH / 2 - 0.1, bodyH - 0.14, 0.012, trim, { x, y: BODY_BOTTOM + bodyH / 2, z: DEPTH / 2 + 0.006 }));
    this.add(boxMesh(WIDTH + 0.06, COUNTER_T, DEPTH + 0.06, trim, { y: COUNTER_Y + COUNTER_T / 2 }));
    // Wheels on an axle under the right half, two legs under the left, a push handle at the left end.
    for (const sz of [-1, 1]) {
      const z = sz * (DEPTH / 2 + 0.03);
      const tyre = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_R - 0.015, 0.018, 8, 24), RUBBER);
      tyre.position.set(WHEEL_X, WHEEL_R, z);
      tyre.castShadow = true;
      this.add(tyre);
      for (let s = 0; s < 3; s++) {
        const spoke = boxMesh(0.012, 2 * WHEEL_R - 0.04, 0.012, trim, { x: WHEEL_X, y: WHEEL_R, z });
        spoke.rotation.z = (s * Math.PI) / 3;
        this.add(spoke);
      }
      this.add(cylinderMesh(0.03, 0.04, CHROME, { x: WHEEL_X, y: WHEEL_R, z }, { segments: 10 }).rotateX(Math.PI / 2));
      this.add(boxMesh(0.04, BODY_BOTTOM, 0.04, trim, { x: -WIDTH / 2 + 0.08, y: BODY_BOTTOM / 2, z: sz * (DEPTH / 2 - 0.06) }));
    }
    this.add(cylinderMesh(0.012, DEPTH + 0.06, CHROME, { x: WHEEL_X, y: WHEEL_R }, { segments: 8 }).rotateX(Math.PI / 2));
    this.add(cylinderMesh(0.014, DEPTH * 0.8, CHROME, { x: -WIDTH / 2 - 0.1, y: COUNTER_Y - 0.08 }, { segments: 8 }).rotateX(Math.PI / 2));
    for (const sz of [-1, 1]) this.add(boxMesh(0.1, 0.02, 0.02, CHROME, { x: -WIDTH / 2 - 0.05, y: COUNTER_Y - 0.08, z: sz * DEPTH * 0.38 }));

    this.buildMachine();
    // A stack of paper cups, a sleeve band round the lower ones, and a saucer of sugar sticks.
    const cups = cylinderMesh(0.042, 0.26, PAPER, { x: 0.12, y: COUNTER_TOP + 0.13, z: 0.08 }, { radiusBottom: 0.032, segments: 16 });
    this.add(cups);
    this.add(cylinderMesh(0.041, 0.05, matte(0x8a5a32, 0.8), { x: 0.12, y: COUNTER_TOP + 0.05, z: 0.08 }, { radiusBottom: 0.035, segments: 16 }));
    this.add(cylinderMesh(0.06, 0.012, PAPER, { x: 0.12, y: COUNTER_TOP + 0.006, z: -0.1 }, { segments: 16 }));
    this.buildMenu();
    this.buildParasol();

    this.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) mesh.receiveShadow = true;
    });
    const hitbox = invisibleHitbox(WIDTH + 0.1, COUNTER_TOP + 0.4, DEPTH + 0.12, { y: (COUNTER_TOP + 0.4) / 2 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-WIDTH / 2 - 0.12, 0, -DEPTH / 2 - 0.06), new THREE.Vector3(WIDTH / 2 + 0.04, COUNTER_TOP, DEPTH / 2 + 0.06));
  }

  setHovered(_hovered: boolean): void {}

  label(): string {
    return this.options.label();
  }

  activate(session: SessionActions): void {
    this.options.onActivate(session);
  }

  /** A chrome box with a black top rail of cups, two group heads with handles and spouts over a drip tray, a steam wand and a gauge; faces the customer. */
  private buildMachine(): void {
    const x = MACHINE_X;
    const front = MACHINE_D / 2;
    this.add(boxMesh(MACHINE_W, MACHINE_H, MACHINE_D, CHROME, { x, y: COUNTER_TOP + MACHINE_H / 2 }));
    this.add(boxMesh(MACHINE_W + 0.02, 0.03, MACHINE_D + 0.02, BLACK, { x, y: COUNTER_TOP + MACHINE_H + 0.015 }));
    // Two cups warming on top.
    for (const dx of [-0.08, 0.06]) this.add(cylinderMesh(0.03, 0.05, PAPER, { x: x + dx, y: COUNTER_TOP + MACHINE_H + 0.055 }, { radiusBottom: 0.024, segments: 12 }));
    // The drip tray, the group heads with their portafilter handles.
    this.add(boxMesh(MACHINE_W - 0.04, 0.02, 0.1, BLACK, { x, y: COUNTER_TOP + 0.01, z: front + 0.04 }));
    for (const dx of [-0.09, 0.09]) {
      this.add(cylinderMesh(0.035, 0.05, CHROME, { x: x + dx, y: COUNTER_TOP + 0.19, z: front + 0.03 }, { segments: 14 }));
      const handle = boxMesh(0.022, 0.022, 0.12, BLACK, { x: x + dx, y: COUNTER_TOP + 0.16, z: front + 0.1 });
      handle.rotation.x = -0.15;
      this.add(handle);
    }
    // The steam wand and the pressure gauge.
    const wand = cylinderMesh(0.006, 0.16, CHROME, { x: x + MACHINE_W / 2 - 0.03, y: COUNTER_TOP + 0.18, z: front + 0.03 }, { segments: 6 });
    wand.rotation.x = 0.25;
    this.add(wand);
    const gauge = new THREE.Mesh(new THREE.CircleGeometry(0.032, 20), new THREE.MeshStandardMaterial({ map: paintGauge(), roughness: 0.3 }));
    gauge.position.set(x, COUNTER_TOP + MACHINE_H - 0.07, front + 0.002);
    this.add(gauge);
  }

  /** A small framed chalkboard on a kickstand, reading COFFEE and the price. */
  private buildMenu(): void {
    const stand = new THREE.Group();
    stand.position.set(0.38, COUNTER_TOP, 0.12);
    stand.rotation.set(-0.18, -0.25, 0);
    const slate = new THREE.MeshStandardMaterial({ map: paintMenu(this.options.price), roughness: 0.9 });
    const frame = woodMaterial(0x6a4a2a, 0.7);
    const board = new THREE.Mesh(new THREE.BoxGeometry(MENU_W, MENU_H, 0.012), [frame, frame, frame, frame, slate, frame]);
    board.position.y = MENU_H / 2;
    board.castShadow = true;
    stand.add(board);
    for (const dx of [-MENU_W / 2, MENU_W / 2]) stand.add(boxMesh(0.018, MENU_H + 0.01, 0.018, frame, { x: dx, y: MENU_H / 2, z: 0.004 }));
    stand.add(boxMesh(MENU_W + 0.018, 0.018, 0.018, frame, { y: MENU_H, z: 0.004 }));
    this.add(stand);
  }

  /** The pole, a striped cone of canvas at its top and a finial. */
  private buildParasol(): void {
    const poleH = PARASOL_TOP - COUNTER_TOP;
    this.add(cylinderMesh(0.015, poleH, CHROME, { x: PARASOL_X, y: COUNTER_TOP + poleH / 2, z: PARASOL_Z }, { segments: 8 }));
    const canopyMat = new THREE.MeshStandardMaterial({ map: paintParasol(), roughness: 0.9, side: THREE.DoubleSide });
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(PARASOL_R, PARASOL_RISE, PARASOL_PANELS, 1, true), canopyMat);
    canopy.position.set(PARASOL_X, PARASOL_TOP - PARASOL_RISE / 2, PARASOL_Z);
    canopy.castShadow = true;
    this.add(canopy);
    this.add(cylinderMesh(0.02, 0.06, CHROME, { x: PARASOL_X, y: PARASOL_TOP + 0.03, z: PARASOL_Z }, { segments: 8 }));
  }
}

/** A gauge dial: cream face, ticks, a red needle. */
function paintGauge(): THREE.Texture {
  const [canvas, ctx] = createCanvas(64, 64);
  ctx.fillStyle = '#f1e8d6';
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = '#2a2420';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI * (0.75 + (i / 8) * 1.5);
    ctx.beginPath();
    ctx.moveTo(32 + Math.cos(a) * 22, 32 + Math.sin(a) * 22);
    ctx.lineTo(32 + Math.cos(a) * 28, 32 + Math.sin(a) * 28);
    ctx.stroke();
  }
  ctx.strokeStyle = '#c8342a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(32, 32);
  ctx.lineTo(32 + Math.cos(-0.4) * 24, 32 + Math.sin(-0.4) * 24);
  ctx.stroke();
  return toTexture(canvas);
}

/** Slate with COFFEE in big chalk capitals, a cup doodle and the price. */
function paintMenu(price: number): THREE.Texture {
  const W = 240;
  const H = 300;
  const [canvas, ctx] = createCanvas(W, H);
  ctx.fillStyle = '#1f2a22';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 12; i++) ctx.fillRect((i * 53) % W, (i * 97) % H, 50, 6);
  const hand = `"Comic Sans MS", "Chalkboard SE", "Segoe Print", ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,250,235,0.92)';
  fitFontSize(ctx, 'COFFEE', W * 0.86, 60, 20, hand, 'bold');
  ctx.fillText('COFFEE', W / 2, 60);
  ctx.fillRect(W * 0.18, 92, W * 0.64, 3);
  // A steaming cup.
  ctx.strokeStyle = 'rgba(255,250,235,0.85)';
  ctx.lineWidth = 4;
  ctx.strokeRect(W / 2 - 30, 128, 60, 44);
  ctx.beginPath();
  ctx.arc(W / 2 + 36, 150, 12, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  for (const dx of [-14, 0, 14]) {
    ctx.beginPath();
    ctx.moveTo(W / 2 + dx, 120);
    ctx.quadraticCurveTo(W / 2 + dx + 8, 108, W / 2 + dx, 98);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,225,160,0.92)';
  const text = `${price} coin${price === 1 ? '' : 's'}`;
  fitFontSize(ctx, text, W * 0.86, 44, 16, hand, 'bold');
  ctx.fillText(text, W / 2, 222);
  ctx.fillStyle = 'rgba(190,230,255,0.85)';
  fitFontSize(ctx, 'freshly brewed', W * 0.86, 24, 12, hand, 'normal');
  ctx.fillText('freshly brewed', W / 2, 264);
  return toTexture(canvas, 4);
}

/** Alternating cream and red panels round the cone (the cone's u runs round it), a scalloped darker hem. */
function paintParasol(): THREE.Texture {
  const W = 512;
  const H = 128;
  const [canvas, ctx] = createCanvas(W, H);
  const panel = W / PARASOL_PANELS;
  for (let i = 0; i < PARASOL_PANELS; i++) {
    ctx.fillStyle = i % 2 ? '#f1e8d6' : '#b8342a';
    ctx.fillRect(i * panel, 0, panel + 1, H);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(0, H - 10, W, 10);
  return toTexture(canvas, 4);
}
