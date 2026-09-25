import * as THREE from 'three';
import { createCanvas, seededRandom, toTexture, FONT } from '@/covers/generated/canvasUtils';
import type { DisplaySlot, StallLike } from './stallTypes';
import { boxMesh, cylinderMesh } from '../meshUtils';
import { matte } from '../props/Prop';
import { fabric, wood as woodMaterial } from '@/world/materials/finishes';
import { centreOutRow, evenRow, fitInRow } from './stallPaint';

export interface BlanketStallOptions {
  /** What is scrawled on the cardboard sign (a platform's name). */
  sign: string;
  /** Main colour of the woollen blanket. */
  cloth?: number;
  /** Colour of the blanket's cross stripes and of the marker underline on the sign. */
  accent?: number;
  /** Varies the lie of the flat boxes and the sign's scrawl. */
  seed?: number;
}

const BLANKET_W = 1.6;
const BLANKET_D = 1.1;
/** The blanket lies a hair over the floor; the boxes rest on it. */
const BLANKET_Y = 0.004;
const BOX_Y = 0.012;
/** A fold across the blanket, raised a little (never up to the boxes' height). */
const FOLD_X = 0.28;
const FOLD_H = 0.006;
const FOLD_HALF_W = 0.05;
/** The suitcase lies open at the back, partly off the blanket: its shell, walls, and the lid swung up behind it. */
const SUIT_W = 0.86;
const SUIT_D = 0.42;
const SUIT_H = 0.22;
const SUIT_WALL = 0.015;
const SUIT_FRONT = -0.3;
const SUIT_BACK = SUIT_FRONT - SUIT_D;
const LID_T = 0.07;
/** How far past upright the lid falls back (radians). */
const LID_BACK = 0.17;
/** Clothes bundled in the shell: the sign and whatever stands on the suitcase rest on them. */
const CLOTHES_TOP = 0.17;
/** Boxes leaning on the shell's front, and two rows lying face up in front of them. */
const BOX_GAP = 0.05;
const LEAN_MARGIN = 0.04;
const FLAT_MARGIN = 0.1;
const FLAT_ZS = [0.0, 0.3];
/** Where the leaning boxes stand: against the shell's front, clear of the straps over it. */
const LEAN_Z = SUIT_FRONT + 0.005;
const FLAT_YAW = 0.12;
/** The cardboard sign, leaning back on the lid from the clothes, on the left half of the shell. */
const SIGN_W = 0.4;
const SIGN_H = 0.27;
const SIGN_X = -0.18;
const SIGN_LEAN = 0.36;
/** The pennant stick by the suitcase's left end. */
const STICK_X = -SUIT_W / 2 - 0.08;
const STICK_Z = SUIT_BACK + 0.12;
const STICK_H = 0.9;
/** The folding stool, behind the right end of the suitcase. */
const STOOL_X = 0.5;
const STOOL_Z = SUIT_BACK - 0.35;
const STOOL_H = 0.42;

const LEATHER = matte(0x6a3f24, 0.55);
const LINING = fabric({ color: 0x8a6a4a, roughness: 0.95 });
const BRASS = new THREE.MeshStandardMaterial({ color: 0xb8892a, roughness: 0.35, metalness: 0.9 });
const STRAP = matte(0x3a2616, 0.7);
const ALUMINIUM = new THREE.MeshStandardMaterial({ color: 0xb0b4b8, roughness: 0.35, metalness: 0.85 });

/**
 * A car-boot seller's pitch on the floor: a patterned woollen blanket with a fold in it, an old
 * leather suitcase lying open at the back (lid up, clothes bundled inside), boxes leaning on the
 * suitcase's front and two rows of boxes lying face up on the blanket before it; a cardboard sign
 * scrawled in marker props against the open lid, a short stick stands by the suitcase for the
 * wishlist pennant, and the seller's folding stool waits behind. Local +z faces the aisle. Collides
 * low (the blanket and the suitcase): the player cannot tread on the boxes.
 */
export class BlanketStall extends THREE.Group implements StallLike {
  /** The folding stool behind the suitcase. */
  readonly vendorAt: [number, number] = [STOOL_X, STOOL_Z];
  /** The top of the stick by the suitcase. */
  readonly pennantAt = new THREE.Vector3(STICK_X, STICK_H, STICK_Z);
  private readonly seed: number;

  static leanPerRow(boxWidth: number): number {
    return fitInRow(SUIT_W, boxWidth, BOX_GAP, LEAN_MARGIN);
  }

  static flatPerRow(boxWidth: number): number {
    return fitInRow(BLANKET_W, boxWidth, BOX_GAP, FLAT_MARGIN);
  }

  constructor(options: BlanketStallOptions) {
    super();
    this.name = 'BlanketStall';
    this.seed = options.seed ?? 1;
    const random = seededRandom(this.seed * 69069);
    const cloth = new THREE.Color(options.cloth ?? 0x3f5a3a);
    const accent = new THREE.Color(options.accent ?? 0xc8a24a);

    this.add(blanket(cloth, accent));
    this.buildSuitcase();

    // The cardboard sign, its foot on the clothes, leaning back on the open lid.
    const signMat = new THREE.MeshStandardMaterial({ map: paintCardboard(options.sign, accent, random), roughness: 0.95 });
    const card = matte(0xb8935e, 0.95);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(SIGN_W, SIGN_H, 0.005), [card, card, card, card, signMat, card]);
    const foot = new THREE.Group();
    foot.position.set(SIGN_X, CLOTHES_TOP, SUIT_BACK + 0.07);
    foot.rotation.set(-SIGN_LEAN, 0, 0.04);
    sign.position.y = SIGN_H / 2;
    sign.castShadow = true;
    foot.add(sign);
    this.add(foot);

    // The pennant stick, pushed into the ground by the suitcase.
    const stick = cylinderMesh(0.008, STICK_H, woodMaterial(0x8a6a44, 0.7), { x: STICK_X, y: STICK_H / 2, z: STICK_Z }, { segments: 6 });
    stick.rotation.z = 0.03;
    this.add(stick);

    this.add(foldingStool());

    this.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) mesh.receiveShadow = true;
    });
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-BLANKET_W / 2, 0, SUIT_BACK - 0.05), new THREE.Vector3(BLANKET_W / 2, 0.3, BLANKET_D / 2));
  }

  capacityFor(boxWidth: number): number {
    return BlanketStall.leanPerRow(boxWidth) + FLAT_ZS.length * BlanketStall.flatPerRow(boxWidth);
  }

  /**
   * The row leaning on the suitcase first (the showpiece in the middle, centre outwards), then the
   * lying rows, the near one to the suitcase first, each centred and a little askew.
   */
  layout(boxWidth: number, count: number): DisplaySlot[] {
    const lean = Math.min(count, BlanketStall.leanPerRow(boxWidth));
    const pitch = boxWidth + BOX_GAP;
    const slots: DisplaySlot[] = centreOutRow(lean, pitch).map((x) => ({ position: new THREE.Vector3(x, BOX_Y, LEAN_Z), pose: 'lean', yaw: 0 }));
    const random = seededRandom(this.seed * 7919);
    let left = count - lean;
    FLAT_ZS.forEach((z, row) => {
      const n = Math.min(left, BlanketStall.flatPerRow(boxWidth));
      left -= n;
      // The far row sits half a box over, so the rows do not line up like a shop's.
      const shift = row % 2 ? pitch / 4 : -pitch / 4;
      for (const x of evenRow(n, pitch)) {
        const clamped = THREE.MathUtils.clamp(x + (n > 1 ? shift : 0), -BLANKET_W / 2 + FLAT_MARGIN / 2 + boxWidth / 2, BLANKET_W / 2 - FLAT_MARGIN / 2 - boxWidth / 2);
        slots.push({ position: new THREE.Vector3(clamped, BOX_Y, z), pose: 'flat', yaw: (random() - 0.5) * 2 * FLAT_YAW });
      }
    });
    return slots;
  }

  /** A spot on the clothes in the open suitcase (stall-local). The sign stands on the left half: keep `x` > 0. */
  crateTop(x: number): THREE.Vector3 {
    return new THREE.Vector3(THREE.MathUtils.clamp(x, -SUIT_W / 2 + 0.12, SUIT_W / 2 - 0.12), CLOTHES_TOP, (SUIT_FRONT + SUIT_BACK) / 2 + 0.03);
  }

  /** The open shell (floor and four walls, lined), brass corners, straps over its front, the clothes, and the lid swung up behind. */
  private buildSuitcase(): void {
    const cz = (SUIT_FRONT + SUIT_BACK) / 2;
    this.add(boxMesh(SUIT_W, 0.02, SUIT_D, LEATHER, { y: 0.01, z: cz }));
    for (const z of [SUIT_FRONT - SUIT_WALL / 2, SUIT_BACK + SUIT_WALL / 2]) this.add(boxMesh(SUIT_W, SUIT_H, SUIT_WALL, LEATHER, { y: SUIT_H / 2, z }));
    for (const x of [-SUIT_W / 2 + SUIT_WALL / 2, SUIT_W / 2 - SUIT_WALL / 2]) this.add(boxMesh(SUIT_WALL, SUIT_H, SUIT_D - 2 * SUIT_WALL, LEATHER, { x, y: SUIT_H / 2, z: cz }));
    for (const sx of [-1, 1]) {
      for (const z of [SUIT_FRONT - 0.012, SUIT_BACK + 0.012]) this.add(boxMesh(0.04, 0.04, 0.03, BRASS, { x: sx * (SUIT_W / 2 - 0.018), y: SUIT_H - 0.02, z }));
      // A strap down the front, under the leaning boxes.
      this.add(boxMesh(0.035, SUIT_H + 0.004, 0.004, STRAP, { x: sx * SUIT_W * 0.3, y: SUIT_H / 2, z: SUIT_FRONT + 0.002 }));
    }
    // Clothes bundled in the shell: a soft lump over most of its floor.
    const clothes = boxMesh(SUIT_W - 2 * SUIT_WALL - 0.02, CLOTHES_TOP - 0.02, SUIT_D - 2 * SUIT_WALL - 0.02, fabric({ color: 0x5a6a8a, roughness: 0.95 }), { y: 0.02 + (CLOTHES_TOP - 0.02) / 2, z: cz });
    clothes.castShadow = false;
    this.add(clothes);
    // The lid, hinged at the shell's back top edge, fallen just past upright; its lining faces the aisle.
    const lid = new THREE.Group();
    lid.position.set(0, SUIT_H, SUIT_BACK);
    lid.rotation.x = -(Math.PI / 2 + LID_BACK);
    // BoxGeometry material order: +x, -x, +y, -y (the inside when shut), +z, -z.
    const shell = new THREE.Mesh(new THREE.BoxGeometry(SUIT_W, LID_T, SUIT_D), [LEATHER, LEATHER, LEATHER, LINING, LEATHER, LEATHER]);
    shell.position.set(0, LID_T / 2, SUIT_D / 2);
    shell.castShadow = true;
    lid.add(shell);
    lid.add(boxMesh(0.12, 0.025, 0.03, STRAP, { y: LID_T + 0.012, z: SUIT_D - 0.1 }));
    this.add(lid);
  }
}

/** The blanket: a painted wool plaid with fringed ends, raised along a soft fold across it. */
function blanket(cloth: THREE.Color, accent: THREE.Color): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(BLANKET_W, BLANKET_D, 32, 1);
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const d = Math.abs(pos.getX(i) - FOLD_X) / FOLD_HALF_W;
    // PlaneGeometry lies in xy; its z becomes height once laid flat.
    pos.setZ(i, d < 1 ? FOLD_H * 0.5 * (1 + Math.cos(Math.PI * d)) : 0);
  }
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, fabric({ map: paintBlanket(cloth, accent), roughness: 1 }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = BLANKET_Y;
  mesh.castShadow = false;
  return mesh;
}

/** Plaid: wide bands of a darker shade, fine accent stripes crossing them, a woolly speckle, fringes along the short ends, the fold's crease shaded. */
function paintBlanket(cloth: THREE.Color, accent: THREE.Color): THREE.Texture {
  const W = 512;
  const H = Math.round((W * BLANKET_D) / BLANKET_W);
  const [canvas, ctx] = createCanvas(W, H);
  const random = seededRandom(90210);
  ctx.fillStyle = `#${cloth.getHexString()}`;
  ctx.fillRect(0, 0, W, H);
  const dark = `#${cloth.clone().multiplyScalar(0.6).getHexString()}`;
  const stripe = `#${accent.getHexString()}`;
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = dark;
  for (let x = 30; x < W; x += 96) ctx.fillRect(x, 0, 40, H);
  for (let y = 24; y < H; y += 96) ctx.fillRect(0, y, W, 40);
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = stripe;
  for (let x = 48; x < W; x += 96) ctx.fillRect(x, 0, 4, H);
  for (let y = 42; y < H; y += 96) ctx.fillRect(0, y, W, 4);
  ctx.globalAlpha = 1;
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = random() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
    ctx.fillRect(random() * W, random() * H, 2, 2);
  }
  // The fold: a lit ridge with a shadow on the far side.
  const fx = ((FOLD_X + BLANKET_W / 2) / BLANKET_W) * W;
  const band = (FOLD_HALF_W / BLANKET_W) * W;
  const crease = ctx.createLinearGradient(fx - band, 0, fx + band, 0);
  crease.addColorStop(0, 'rgba(255,255,255,0)');
  crease.addColorStop(0.45, 'rgba(255,255,255,0.12)');
  crease.addColorStop(0.6, 'rgba(0,0,0,0.18)');
  crease.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = crease;
  ctx.fillRect(fx - band, 0, 2 * band, H);
  // Fringes along the short ends.
  ctx.fillStyle = dark;
  for (const x0 of [0, W - 10]) for (let y = 0; y < H; y += 5) ctx.fillRect(x0, y, 10, 2);
  return toTexture(canvas, 4);
}

/** A sheet of box cardboard, the text scrawled in black marker and underlined in the accent colour. */
function paintCardboard(text: string, accent: THREE.Color, random: () => number): THREE.Texture {
  const W = 400;
  const H = Math.round((W * SIGN_H) / SIGN_W);
  const [canvas, ctx] = createCanvas(W, H);
  ctx.fillStyle = '#b8935e';
  ctx.fillRect(0, 0, W, H);
  // Corrugation showing through, a torn edge along the top.
  ctx.fillStyle = 'rgba(80,55,25,0.12)';
  for (let x = 0; x < W; x += 9) ctx.fillRect(x, 0, 3, H);
  ctx.fillStyle = 'rgba(60,40,20,0.35)';
  for (let x = 0; x < W; x += 12) ctx.fillRect(x, 0, 12, 2 + random() * 6);
  ctx.save();
  ctx.translate(W / 2, H * 0.45);
  ctx.rotate((random() - 0.5) * 0.1);
  ctx.fillStyle = '#1e1a16';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = 88;
  ctx.font = `bold ${size}px "Marker Felt", "Comic Sans MS", ${FONT}`;
  while (ctx.measureText(text).width > W * 0.86 && size > 24) {
    size -= 2;
    ctx.font = `bold ${size}px "Marker Felt", "Comic Sans MS", ${FONT}`;
  }
  ctx.fillText(text, 0, 0);
  const width = ctx.measureText(text).width;
  ctx.fillStyle = `#${accent.getHexString()}`;
  ctx.fillRect(-width / 2, size * 0.55, width, 7);
  ctx.fillStyle = '#1e1a16';
  ctx.font = `${Math.round(size * 0.42)}px "Marker Felt", "Comic Sans MS", ${FONT}`;
  ctx.fillText('all tested!', 0, size * 1.1);
  ctx.restore();
  return toTexture(canvas, 4);
}

/** A folding camping stool: two crossed pairs of aluminium legs and a canvas seat. */
function foldingStool(): THREE.Group {
  const g = new THREE.Group();
  g.position.set(STOOL_X, 0, STOOL_Z);
  g.rotation.y = 0.3;
  const half = 0.16;
  const leg = Math.hypot(STOOL_H, 2 * half);
  const tilt = Math.atan2(2 * half, STOOL_H);
  for (const x of [-0.14, 0.14]) {
    for (const s of [-1, 1]) {
      const l = cylinderMesh(0.009, leg, ALUMINIUM, { x, y: STOOL_H / 2 }, { segments: 6 });
      l.rotation.x = s * tilt;
      g.add(l);
    }
  }
  for (const z of [-half, half]) g.add(cylinderMesh(0.01, 0.3, ALUMINIUM, { y: STOOL_H, z }, { segments: 6 }).rotateZ(Math.PI / 2));
  const seat = boxMesh(0.28, 0.008, 2 * half, fabric({ color: 0x2f4a6a, roughness: 0.95 }), { y: STOOL_H - 0.01 });
  g.add(seat);
  return g;
}
