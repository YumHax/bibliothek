import * as THREE from 'three';
import { createCanvas, fitFontSize, toTexture, FONT } from '@/covers/generated/canvasUtils';
import { cylinderMesh } from '../meshUtils';
import { paint } from '../materials/palette';

/** How a tag stands: a tent card on the surface in front of the piece, a card on a stick on the floor, or pinned flat to the wall. */
export type TagStyle = 'card' | 'stand' | 'wall';

/**
 * What a tag reads: the price, SOLD (the one-offs, bought), AT HOME (as many at home as there is room for), NEEDS (what
 * it goes with is not bought yet), or AGAIN TO BUY (clicked once: the next click buys it).
 */
export type TagState = 'price' | 'sold' | 'full' | 'needs' | 'armed';

const CARD_W = 0.12;
const CARD_H = 0.075;
/** The stick of a `stand` tag, to the card's bottom edge. */
const STICK = 0.55;
const HOVER = new THREE.Color(0x2a2418);
const BLACK = new THREE.Color(0x000000);
const STEEL = paint(0x3a3a3a, 0.4);

/**
 * A price tag in a shop: the piece's name and price, handwritten on a card with the shop's colour across the top, a
 * red SOLD stamped over it once bought (AT HOME, NEEDS THE BED), a green AGAIN TO BUY while a first click waits for
 * the second; the ink faded while the wallet does not stretch to it (`setAffordable`), as at the market. Its material
 * is its own (the hover lightens it, and only it); each look is painted the first time it shows. Origin at its foot: on
 * the surface for a `card`, on the floor for a `stand`, on the wall for a `wall` card (facing +z).
 */
export class PriceTag extends THREE.Group {
  private readonly material: THREE.MeshStandardMaterial;
  private readonly textures = new Map<string, THREE.Texture>();
  private state: TagState = 'price';
  private affordable = true;

  /** `needs`: the name of what it goes with, for its stamp. */
  constructor(
    private readonly title: string,
    private readonly price: number,
    private readonly accent: string,
    style: TagStyle,
    private readonly needs: string | null = null,
  ) {
    super();
    this.name = 'PriceTag';
    this.material = new THREE.MeshStandardMaterial({ map: this.texture(), roughness: 0.85, side: THREE.DoubleSide });
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
      // Its foot thicker than a rug (12 mm): stood on one, its top would lie in the rug's.
      this.add(cylinderMesh(0.07, 0.016, STEEL, { y: 0.008 }, { segments: 16 }));
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
    this.repaint();
  }

  /** Whether the wallet stretches to the price: faded ink when it does not. */
  setAffordable(affordable: boolean): void {
    if (affordable === this.affordable) return;
    this.affordable = affordable;
    this.repaint();
  }

  private repaint(): void {
    this.material.map = this.texture();
    this.material.needsUpdate = true;
  }

  /** The card for the current state and wallet, painted on first need. */
  private texture(): THREE.Texture {
    // Only an offer on sale fades: SOLD and AT HOME read the same whatever the wallet holds.
    const faded = !this.affordable && (this.state === 'price' || this.state === 'armed');
    const key = `${this.state}${faded ? ':faded' : ''}`;
    let texture = this.textures.get(key);
    if (!texture) {
      texture = paintTag(this.title, `${this.price} coins`, this.accent, STAMPS[this.state](this.needs), faded);
      this.textures.set(key, texture);
    }
    return texture;
  }

  setHovered(hovered: boolean): void {
    this.material.emissive.copy(hovered ? HOVER : BLACK);
  }

  /** The textures not on the card are not in the scene: the zone's unload would miss them. */
  dispose(): void {
    for (const texture of this.textures.values()) texture.dispose();
    this.textures.clear();
  }
}

/** A stamp across the card: its words and ink; none on a plain price. */
interface Stamp {
  text: string;
  ink: string;
}

const RED = 'rgba(196, 36, 30, 0.9)';
const GREEN = 'rgba(30, 128, 62, 0.92)';
const STAMPS: Record<TagState, (needs: string | null) => Stamp | null> = {
  price: () => null,
  sold: () => ({ text: 'SOLD', ink: RED }),
  full: () => ({ text: 'AT HOME', ink: RED }),
  needs: (needs) => ({ text: needs ? `NEEDS ${needs.toUpperCase()}` : 'NOT YET', ink: RED }),
  armed: () => ({ text: 'AGAIN TO BUY', ink: GREEN }),
};

/** Faded ink and card, for a price the wallet does not stretch to (the market's tags fade the same). */
const FADED_INK = '#9a948a';

/** The card: a band of the shop's colour, the name, the price large, and a stamp across it (SOLD, AT HOME...) or none; `faded` washes it out. */
function paintTag(name: string, price: string, accent: string, stamp: Stamp | null, faded: boolean): THREE.Texture {
  const W = 256;
  const H = 160;
  const [canvas, ctx] = createCanvas(W, H);
  ctx.fillStyle = faded ? '#e6e0d2' : '#f7f2e4';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = accent;
  if (faded) ctx.globalAlpha = 0.45;
  ctx.fillRect(0, 0, W, 26);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = faded ? FADED_INK : '#2a2622';
  fitFontSize(ctx, name, W - 24, 30, 16, `"Segoe Print", "Bradley Hand", "Comic Sans MS", ${FONT}`, '600');
  ctx.fillText(name, W / 2, 60);
  fitFontSize(ctx, price, W - 24, 52, 24, `"Segoe Print", "Bradley Hand", "Comic Sans MS", ${FONT}`, '800');
  ctx.fillText(price, W / 2, 112);
  if (stamp) {
    ctx.save();
    ctx.translate(W / 2, H / 2 + 8);
    ctx.rotate(-0.22);
    ctx.strokeStyle = stamp.ink;
    ctx.fillStyle = stamp.ink;
    ctx.lineWidth = 6;
    ctx.strokeRect(-110, -30, 220, 60);
    fitFontSize(ctx, stamp.text, 200, 46, 14, `Impact, "Arial Narrow", ${FONT}`, '900');
    ctx.fillText(stamp.text, 0, 2);
    ctx.restore();
  }
  return toTexture(canvas, 'facing');
}
