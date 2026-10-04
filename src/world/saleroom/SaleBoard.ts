import * as THREE from 'three';
import { createCanvas, toTexture } from '@/graphics/canvas';
import type { Furniture } from '../Furniture';
import { timber } from '../materials/palette';
import { part } from '../props/Prop';
import { faceOn } from '../props/joinery';
import { WALL } from '../surface/layers';

/** What the board shows: the lot being called, or a notice (no sale today, the sale over). */
type BoardFace =
  | { kind: 'lot'; number: number; of: number; title: string; estimate: number; bid: number | null; leader: string | null; status: string; you: boolean }
  | { kind: 'notice'; title: string; lines: readonly string[] };

const WIDTH = 1.6;
const HEIGHT = 1;
const PX = [768, 480] as const;
const FRAME = timber(0x3a2414, 0.5);

/**
 * The saleroom's board on the wall by the rostrum: lot number, what it is, the estimate, the bid and whose paddle is
 * up, and the auctioneer's call (GOING ONCE, SOLD) in lit letters on a dark green field, as the sale goes; between
 * sales, a notice. Repainted only when what it says changes. Wall-hung: origin at its middle, +z into the room.
 */
export class SaleBoard extends THREE.Group implements Furniture {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly material: THREE.MeshStandardMaterial;
  private painted = '';

  constructor() {
    super();
    this.name = 'SaleBoard';
    [this.canvas, this.ctx] = createCanvas(PX[0], PX[1]);
    this.texture = toTexture(this.canvas);
    // The letters are lit (a sale board's bulbs): they read across the room whatever the lamp.
    this.material = new THREE.MeshStandardMaterial({ map: this.texture, emissiveMap: this.texture, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.7 });
    const frame = part(this, WIDTH + 0.08, HEIGHT + 0.08, 0.04, FRAME, { z: 0.02 });
    this.add(faceOn(new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, HEIGHT), this.material), frame, WALL.notice));
    this.show({ kind: 'notice', title: 'SALEROOM', lines: ['…'] });
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  show(face: BoardFace): void {
    const key = JSON.stringify(face);
    if (key === this.painted) return;
    this.painted = key;
    const { ctx } = this;
    const [w, h] = PX;
    ctx.fillStyle = '#12261c';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#c9a85a';
    ctx.lineWidth = 6;
    ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (face.kind === 'notice') {
      ctx.fillStyle = '#f0d890';
      ctx.font = 'bold 64px Georgia, serif';
      ctx.fillText(face.title, w / 2, 90);
      ctx.fillStyle = '#e8e2d0';
      ctx.font = '34px Georgia, serif';
      face.lines.slice(0, 6).forEach((line, i) => ctx.fillText(fit(ctx, line, w - 80), w / 2, 170 + i * 48));
    } else {
      ctx.fillStyle = '#c9a85a';
      ctx.font = 'bold 34px Georgia, serif';
      ctx.fillText(`LOT ${face.number} OF ${face.of}`, w / 2, 58);
      ctx.fillStyle = '#f4efe0';
      ctx.font = 'bold 50px Georgia, serif';
      ctx.fillText(fit(ctx, face.title, w - 70), w / 2, 128);
      ctx.fillStyle = '#b8c8b0';
      ctx.font = '30px Georgia, serif';
      ctx.fillText(`estimate around ${face.estimate} coins`, w / 2, 186);
      ctx.fillStyle = face.you ? '#ffe070' : '#f4efe0';
      ctx.font = 'bold 78px Georgia, serif';
      ctx.fillText(face.bid === null ? 'NO BID YET' : `${face.bid} COINS`, w / 2, 272);
      ctx.font = 'bold 36px Georgia, serif';
      ctx.fillText(face.leader ? (face.you ? 'YOUR PADDLE' : `paddle: ${face.leader}`) : '', w / 2, 340);
      ctx.fillStyle = '#ff9a5a';
      ctx.font = 'bold 46px Georgia, serif';
      ctx.fillText(face.status, w / 2, 410);
    }
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
    this.material.dispose();
  }
}

/** `text`, shortened with an ellipsis to fit `width` pixels in the current font. */
function fit(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let cut = text;
  while (cut.length > 3 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
  return `${cut}…`;
}
