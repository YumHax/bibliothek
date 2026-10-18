import * as THREE from 'three';
import { createCanvas, toTexture } from '@/graphics/canvas';
import { repaintWhenFontLoads } from '@/graphics/fontReady';
import { formatCoins } from '@/text/money';
import { paint } from '../materials/palette';
import { part } from '../props/Prop';
import { UsableProp, type UseOptions } from '../props/UsableProp';

/** A tent card's size (m): a postcard folded in two, standing on the table; its canvas (px). */
const CARD = { w: 0.12, h: 0.07, t: 0.0015, lean: 0.38 };
const PX: [number, number] = [384, 224];
const MARKER = '"Permanent Marker", "Marker Felt", "Comic Sans MS", cursive';
const HAND = 'Caveat, "Comic Sans MS", cursive';

/** What the card says: the price of what is left on the table, and how many games that is. */
interface LotWriting {
  price: number;
  count: number;
}

/**
 * "THE LOT" on a seller's table (`classifieds/rules` `TABLE_LOT`): a folded card propped by the boxes, written by the
 * seller in marker (THE LOT, the price large, "all N games" underlined in biro on both faces). It is written again
 * whenever the table changes (a box bought one by one), as the player looks at it. A click is the builder's (the
 * pitch, then the whole table bought). Origin on the table under its fold. Never collides.
 */
export class LotCard extends UsableProp {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly material: THREE.MeshStandardMaterial;
  private written = '';

  constructor(options: UseOptions & { writing: () => LotWriting }) {
    // Asked as the player looks: the card is rewritten first when the table has changed.
    super({
      label: (player) => {
        this.write(options.writing());
        return options.label(player);
      },
      use: options.use,
    });
    this.name = 'LotCard';
    [this.canvas, this.ctx] = createCanvas(...PX);
    this.material = new THREE.MeshStandardMaterial({ map: toTexture(this.canvas), roughness: 0.85 });
    this.write(options.writing());
    repaintWhenFontLoads(`64px ${MARKER}`, () => this.write(options.writing(), true));
    const back = paint(0xe8dfc6, 0.85);
    // Two leaves leaning on each other, the fold on top, the writing on both faces.
    for (const side of [1, -1]) {
      const leaf = new THREE.Group();
      leaf.rotation.x = side * -CARD.lean;
      leaf.position.y = CARD.h * Math.cos(CARD.lean);
      leaf.userData.live = true;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(CARD.w, CARD.h), this.material);
      face.position.set(0, -CARD.h / 2, side * 0.0012);
      if (side < 0) face.rotation.y = Math.PI;
      leaf.add(face);
      part(leaf, CARD.w, CARD.h, CARD.t, back, { y: -CARD.h / 2 });
      this.add(leaf);
    }
    this.target(CARD.w + 0.04, CARD.h + 0.03, 0.08, { y: CARD.h / 2 });
  }

  /** Writes the card (cream, a ruled line, THE LOT, the price, the count); nothing when it already says that. */
  private write({ price, count }: LotWriting, force = false): void {
    const key = `${price}:${count}`;
    if (key === this.written && !force) return;
    this.written = key;
    const { ctx } = this;
    const [w, h] = PX;
    ctx.fillStyle = '#f4efe2';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(70, 100, 170, 0.25)';
    ctx.lineWidth = 2;
    for (let y = 52; y < h; y += 44) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1e2a4a';
    ctx.font = `40px ${MARKER}`;
    ctx.fillText('THE LOT', w / 2, 40);
    ctx.fillStyle = '#b3392f';
    ctx.font = `76px ${MARKER}`;
    ctx.fillText(count >= 2 ? formatCoins(price) : 'SOLD', w / 2, 112, w - 30);
    ctx.fillStyle = '#2b3550';
    ctx.font = `700 40px ${HAND}`;
    const under = count >= 2 ? `all ${count} games` : 'thank you!';
    ctx.fillText(under, w / 2, 182);
    const width = Math.min(w - 40, ctx.measureText(under).width + 16);
    ctx.strokeStyle = '#2b3550';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo((w - width) / 2, 204);
    ctx.quadraticCurveTo(w / 2, 210, (w + width) / 2, 202);
    ctx.stroke();
    if (this.material.map) this.material.map.needsUpdate = true;
  }

  dispose(): void {
    this.material.map?.dispose();
    this.material.dispose();
  }
}
