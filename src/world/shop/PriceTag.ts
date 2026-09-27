import * as THREE from 'three';
import { createCanvas, fitFontSize, toTexture, FONT } from '@/covers/generated/canvasUtils';
import { cylinderMesh } from '../meshUtils';
import { paint } from '../materials/palette';

/** How a tag stands: a tent card on the surface in front of the piece, a card on a stick on the floor, or pinned flat to the wall. */
export type TagStyle = 'card' | 'stand' | 'wall';

/** What a tag reads: the price, SOLD (the one-offs, bought), AT HOME (as many at home as there is room for). */
export type TagState = 'price' | 'sold' | 'full';

const CARD_W = 0.12;
const CARD_H = 0.075;
/** The stick of a `stand` tag, to the card's bottom edge. */
const STICK = 0.55;
const HOVER = new THREE.Color(0x2a2418);
const BLACK = new THREE.Color(0x000000);
const STEEL = paint(0x3a3a3a, 0.4);

/**
 * A price tag in a shop: the piece's name and price, handwritten on a card with the shop's colour across the top, a
 * red SOLD stamped over it once bought. Its material is its own (the hover lightens it, and only it). Origin at its
 * foot: on the surface for a `card`, on the floor for a `stand`, on the wall for a `wall` card (facing +z).
 */
export class PriceTag extends THREE.Group {
  private readonly material: THREE.MeshStandardMaterial;
  private readonly textures: Record<TagState, THREE.Texture>;
  private state: TagState = 'price';

  constructor(name: string, price: number, accent: string, style: TagStyle) {
    super();
    this.name = 'PriceTag';
    this.textures = {
      price: paintTag(name, `${price} coins`, accent, null),
      sold: paintTag(name, `${price} coins`, accent, 'SOLD'),
      full: paintTag(name, `${price} coins`, accent, 'AT HOME'),
    };
    this.material = new THREE.MeshStandardMaterial({ map: this.textures.price, roughness: 0.85, side: THREE.DoubleSide });
    const card = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H), this.material);
    card.castShadow = false;
    card.receiveShadow = true;
    if (style === 'card') {
      // A folded card: the face leans back on its fold, the back leg behind it.
      card.position.set(0, CARD_H / 2 * Math.cos(0.35), 0);
      card.rotation.x = -0.35;
      const back = new THREE.Mesh(card.geometry, paint(0xf2ecdc, 0.9));
      back.position.set(0, CARD_H / 2 * Math.cos(0.35), -CARD_H * Math.sin(0.35));
      back.rotation.x = 0.35;
      back.castShadow = false;
      this.add(back);
    } else if (style === 'stand') {
      this.add(cylinderMesh(0.07, 0.012, STEEL, { y: 0.006 }, { segments: 16 }));
      this.add(cylinderMesh(0.005, STICK, STEEL, { y: STICK / 2 }, { segments: 6 }));
      card.position.set(0, STICK + CARD_H / 2 - 0.01, 0.004);
      card.rotation.x = -0.5;
    } else {
      card.position.set(0, 0, 0.003);
    }
    this.add(card);
  }

  setState(state: TagState): void {
    if (state === this.state) return;
    this.state = state;
    this.material.map = this.textures[state];
    this.material.needsUpdate = true;
  }

  setHovered(hovered: boolean): void {
    this.material.emissive.copy(hovered ? HOVER : BLACK);
  }

  /** The textures not on the card are not in the scene: the zone's unload would miss them. */
  dispose(): void {
    for (const texture of Object.values(this.textures)) texture.dispose();
  }
}

/** The card: a band of the shop's colour, the name, the price large, and a stamp across it (SOLD, AT HOME) or none. */
function paintTag(name: string, price: string, accent: string, stamp: string | null): THREE.Texture {
  const W = 256;
  const H = 160;
  const [canvas, ctx] = createCanvas(W, H);
  ctx.fillStyle = '#f7f2e4';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, 26);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#2a2622';
  fitFontSize(ctx, name, W - 24, 30, 16, `"Segoe Print", "Bradley Hand", "Comic Sans MS", ${FONT}`, '600');
  ctx.fillText(name, W / 2, 60);
  fitFontSize(ctx, price, W - 24, 52, 24, `"Segoe Print", "Bradley Hand", "Comic Sans MS", ${FONT}`, '800');
  ctx.fillText(price, W / 2, 112);
  if (stamp) {
    ctx.save();
    ctx.translate(W / 2, H / 2 + 8);
    ctx.rotate(-0.22);
    ctx.strokeStyle = 'rgba(196, 36, 30, 0.9)';
    ctx.fillStyle = 'rgba(196, 36, 30, 0.9)';
    ctx.lineWidth = 6;
    ctx.strokeRect(-100, -30, 200, 60);
    fitFontSize(ctx, stamp, 180, 46, 20, `Impact, "Arial Narrow", ${FONT}`, '900');
    ctx.fillText(stamp, 0, 2);
    ctx.restore();
  }
  return toTexture(canvas, 4);
}
