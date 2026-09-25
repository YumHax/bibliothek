import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { createCanvas, fitFontSize, seededRandom, toTexture, FONT } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../Furniture';
import { boxMesh, cylinderMesh, invisibleHitbox } from '../meshUtils';
import { matte } from '../props/Prop';

export interface LotCrateOptions {
  /** Hover caption. */
  label: () => string;
  /** Click: buy the lot. */
  onActivate: (session: SessionActions) => void;
  /** Varies the jumble of boxes inside. */
  seed?: number;
}

const WIDTH = 0.6;
const DEPTH = 0.4;
const HEIGHT = 0.35;
const WALL = 0.008;
/** The flaps fall open outwards, hanging this far off vertical. */
const FLAP_OUT = 0.45;
const FLAP_LONG = 0.19;
const FLAP_SHORT = 0.15;
/** The jumble rests on crumpled paper this high, so the boxes' tops stick out over the rim. */
const FILL_Y = 0.23;
const BOXES = 11;
/** The price card on its stick, outside the front right corner. */
const CARD_W = 0.22;
const CARD_H = 0.15;
const STICK_H = 0.62;
const HAND = `"Marker Felt", "Comic Sans MS", ${FONT}`;
const BOX_COLOURS = [0xb8342a, 0x2f4a8a, 0x3a7a3a, 0xd8a82a, 0x2a2a2a, 0x8a3a8a, 0xe8e2d4, 0x2a7a8a];

/**
 * A job lot at the market: a big open cardboard box on the floor, its flaps fallen open, crammed
 * with game boxes at odd angles (plain slabs, some with a cover stripe) and a console's box
 * peeking out at the back; a card on a stick reads JOB LOT over a second line (`setSign`, e.g. the
 * price or SOLD). `setSold(true)` empties it. Clicking it calls `onActivate`. Origin on the floor
 * under the middle, +z the buyer's side. Collides (a small footprint).
 */
export class LotCrate extends THREE.Group implements Furniture, Interactable {
  readonly hitboxes: THREE.Object3D[];
  private readonly contents = new THREE.Group();
  private readonly cardMat: THREE.MeshStandardMaterial;

  constructor(private readonly options: LotCrateOptions) {
    super();
    this.name = 'LotCrate';
    const random = seededRandom((options.seed ?? 1) * 22695477);
    const card = matte(new THREE.Color(0xc4a26f).multiplyScalar(0.92 + random() * 0.12), 0.95);
    const inside = matte(0x9a7a4a, 0.95);

    // The box: floor, four walls (tan outside, darker inside), and the four flaps hanging open.
    this.add(boxMesh(WIDTH, WALL, DEPTH, card, { y: WALL / 2 }));
    for (const sz of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(WIDTH, HEIGHT, WALL), sz > 0 ? [card, card, card, card, card, inside] : [card, card, card, card, inside, card]);
      wall.position.set(0, HEIGHT / 2, sz * (DEPTH / 2 - WALL / 2));
      this.add(wall);
      this.add(flap(WIDTH, FLAP_SHORT, card, new THREE.Vector3(0, HEIGHT, sz * DEPTH / 2), sz > 0 ? 0 : Math.PI));
    }
    for (const sx of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(WALL, HEIGHT, DEPTH - 2 * WALL), sx > 0 ? [card, inside, card, card, card, card] : [inside, card, card, card, card, card]);
      wall.position.set(sx * (WIDTH / 2 - WALL / 2), HEIGHT / 2, 0);
      this.add(wall);
      this.add(flap(DEPTH, FLAP_LONG, card, new THREE.Vector3(sx * WIDTH / 2, HEIGHT, 0), sx > 0 ? Math.PI / 2 : -Math.PI / 2));
    }
    // A marker scrawl on the front wall.
    const scrawl = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.12), new THREE.MeshStandardMaterial({ map: paintScrawl(), transparent: true, alphaTest: 0.3, roughness: 0.95 }));
    scrawl.position.set(-0.05, HEIGHT * 0.45, DEPTH / 2 + 0.002);
    scrawl.castShadow = false;
    this.add(scrawl);

    this.fill(random);
    this.add(this.contents);

    // The card on its stick, pushed into the gap between two flaps at the front right corner.
    const stickX = WIDTH / 2 + 0.015;
    const stickZ = DEPTH / 2 + 0.015;
    this.add(cylinderMesh(0.006, STICK_H, matte(0x8a6a44, 0.7), { x: stickX, y: STICK_H / 2, z: stickZ }, { segments: 6 }));
    this.cardMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    const cardMesh = new THREE.Mesh(new THREE.BoxGeometry(CARD_W, CARD_H, 0.003), [card, card, card, card, this.cardMat, this.cardMat]);
    cardMesh.position.set(stickX, STICK_H - CARD_H / 2 + 0.02, stickZ + 0.005);
    cardMesh.rotation.set(-0.08, -0.2, 0.05);
    cardMesh.castShadow = true;
    this.add(cardMesh);
    this.setSign('');

    this.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.receiveShadow = true;
        if (mesh !== scrawl) mesh.castShadow = true;
      }
    });
    const hitbox = invisibleHitbox(WIDTH + 0.04, HEIGHT + 0.1, DEPTH + 0.04, { y: (HEIGHT + 0.1) / 2 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
  }

  get footprint(): THREE.Box3 {
    const out = Math.sin(FLAP_OUT) * FLAP_LONG;
    return new THREE.Box3(new THREE.Vector3(-WIDTH / 2 - out, 0, -DEPTH / 2 - out), new THREE.Vector3(WIDTH / 2 + out, HEIGHT, DEPTH / 2 + out));
  }

  /** Repaints the card: JOB LOT, and `text` under it (the price, or SOLD). */
  setSign(text: string): void {
    this.cardMat.map?.dispose();
    this.cardMat.map = paintCard(text);
    this.cardMat.needsUpdate = true;
  }

  /** Empties the box (the lot has gone) or fills it again. */
  setSold(sold: boolean): void {
    this.contents.visible = !sold;
  }

  setHovered(_hovered: boolean): void {}

  label(): string {
    return this.options.label();
  }

  activate(session: SessionActions): void {
    this.options.onActivate(session);
  }

  /** Crumpled paper, a console's box standing at the back, and the game boxes jammed in two files at odd angles. */
  private fill(random: () => number): void {
    const paper = matte(0xe8e0cc, 1);
    this.contents.add(boxMesh(WIDTH - 2 * WALL - 0.01, 0.02, DEPTH - 2 * WALL - 0.01, paper, { y: FILL_Y - 0.01 }));
    const consoleBox = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.24, 0.09), [matte(0x2a2a2a, 0.6), matte(0x2a2a2a, 0.6), matte(0x3a3a3a, 0.6), matte(0x2a2a2a, 0.6), new THREE.MeshStandardMaterial({ map: paintConsoleBox(), roughness: 0.6 }), matte(0x2a2a2a, 0.6)]);
    consoleBox.position.set(-0.08, FILL_Y + 0.1, -DEPTH / 2 + 0.07);
    consoleBox.rotation.set(-0.12, 0.08, 0.05);
    this.contents.add(consoleBox);
    const covers = [paintCover('#b8342a', random), paintCover('#2f4a8a', random), paintCover('#2a2a2a', random)].map((map) => new THREE.MeshStandardMaterial({ map, roughness: 0.55 }));
    const plain = BOX_COLOURS.map((c) => matte(c, 0.55));
    for (let i = 0; i < BOXES; i++) {
      const row = i % 2;
      const w = random() < 0.5 ? 0.127 : 0.14;
      const h = random() < 0.3 ? 0.135 : 0.18;
      const side = plain[Math.floor(random() * plain.length)]!;
      const front = random() < 0.45 ? covers[Math.floor(random() * covers.length)]! : side;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.025), [side, side, side, side, front, side]);
      const x = -WIDTH / 2 + 0.13 + ((i >> 1) / (Math.ceil(BOXES / 2) - 1)) * (WIDTH - 0.26) + (random() - 0.5) * 0.03;
      const z = row ? 0.1 : -0.02;
      slab.position.set(x, FILL_Y + h / 2 - 0.02, z + (random() - 0.5) * 0.03);
      slab.rotation.set(-0.25 - random() * 0.35, (random() - 0.5) * 0.7, (random() - 0.5) * 0.5);
      this.contents.add(slab);
    }
  }
}

/** A flap `width` long, `height` deep, hinged at `hinge` (the rim), hanging outwards; `yaw` turns it to face its side. */
function flap(width: number, height: number, material: THREE.Material, hinge: THREE.Vector3, yaw: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(hinge);
  g.rotation.y = yaw;
  const pivot = new THREE.Group();
  // Up from the rim, then fallen outwards (+z of the flap's frame) past horizontal to hang down.
  pivot.rotation.x = Math.PI - FLAP_OUT;
  pivot.add(boxMesh(width, height, WALL * 0.8, material, { y: height / 2 }));
  g.add(pivot);
  return g;
}

/** The card: JOB LOT in black marker, the second line in red. */
function paintCard(text: string): THREE.Texture {
  const W = 330;
  const H = Math.round((W * CARD_H) / CARD_W);
  const [canvas, ctx] = createCanvas(W, H);
  ctx.fillStyle = '#f4ecd8';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#2a1a10';
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, W - 12, H - 12);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#1e1a16';
  fitFontSize(ctx, 'JOB LOT', W * 0.86, 64, 20, HAND, 'bold');
  ctx.fillText('JOB LOT', W / 2, H * 0.34);
  if (text) {
    ctx.fillStyle = '#b8342a';
    fitFontSize(ctx, text, W * 0.88, 40, 12, HAND, 'bold');
    ctx.fillText(text, W / 2, H * 0.72);
  }
  return toTexture(canvas, 4);
}

/** A marker scrawl on the box's side (transparent round it). */
function paintScrawl(): THREE.Texture {
  const [canvas, ctx] = createCanvas(340, 120);
  ctx.save();
  ctx.translate(170, 60);
  ctx.rotate(-0.05);
  ctx.fillStyle = '#2a2622';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold 54px ${HAND}`;
  ctx.fillText('GAMES', 0, 0);
  ctx.fillRect(-110, 32, 220, 4);
  ctx.restore();
  return toTexture(canvas, 2);
}

/** A generic cover: a coloured sleeve, a white stripe with a dark title bar, a picture window. */
function paintCover(base: string, random: () => number): THREE.Texture {
  const [canvas, ctx] = createCanvas(128, 180);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 180);
  ctx.fillStyle = '#f4f0e6';
  ctx.fillRect(0, 18, 128, 26);
  ctx.fillStyle = '#1e1a16';
  ctx.fillRect(12, 25, 70 + random() * 30, 12);
  const sky = ctx.createLinearGradient(0, 56, 0, 150);
  sky.addColorStop(0, `hsl(${Math.floor(random() * 360)}, 60%, 55%)`);
  sky.addColorStop(1, `hsl(${Math.floor(random() * 360)}, 50%, 25%)`);
  ctx.fillStyle = sky;
  ctx.fillRect(12, 56, 104, 94);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillRect(12, 160, 40, 8);
  return toTexture(canvas, 2);
}

/** The front of a console's box: a dark sleeve, a grey console drawn on it, a coloured band. */
function paintConsoleBox(): THREE.Texture {
  const [canvas, ctx] = createCanvas(320, 240);
  ctx.fillStyle = '#1e1e24';
  ctx.fillRect(0, 0, 320, 240);
  ctx.fillStyle = '#c8342a';
  ctx.fillRect(0, 0, 320, 40);
  ctx.fillStyle = '#f4f0e6';
  ctx.font = `bold 26px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ENTERTAINMENT SYSTEM', 160, 21, 300);
  ctx.fillStyle = '#b8b8b0';
  ctx.fillRect(70, 100, 180, 70);
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(70, 150, 180, 20);
  ctx.fillRect(90, 110, 90, 12);
  ctx.fillStyle = '#c8342a';
  ctx.fillRect(200, 112, 30, 8);
  return toTexture(canvas, 2);
}
