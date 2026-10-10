import * as THREE from 'three';
import { createCanvas, toTexture } from '@/graphics/canvas';
import type { Furniture } from '../Furniture';
import { timber } from '../materials/palette';
import { part } from '../props/Prop';
import { faceOn } from '../props/joinery';
import { WALL } from '../surface/layers';
import { formatCoins } from '@/text/money';
import type { BoxArtLoader } from '@/covers/BoxArtLoader';
import type { Game } from '@/catalog/types';

/** What the board shows: the lot being called, or a notice (no sale today, the sale over). */
type BoardFace =
  | { kind: 'lot'; number: number; of: number; title: string; estimate: number; bid: number | null; leader: string | null; status: string; you: boolean }
  | { kind: 'notice'; title: string; lines: readonly string[] };

const WIDTH = 1.6;
const HEIGHT = 1;
const PX = [768, 480] as const;
const FRAME = timber(0x3a2414, 0.5);
/** Where a lot's cover goes on the board's canvas (an NES box's proportions). */
const COVER = { x: 44, y: 70, w: 230, h: 322 };
/** The number on the player's paddle (the board names it; the saleroom's bidders hold theirs up). */
const PLAYER_PADDLE = 27;

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
  private face: BoardFace = { kind: 'notice', title: 'SALEROOM', lines: ['…'] };
  /** The lot's cover, drawn big on the left of a lot's face (copied off its front texture once it loads). */
  private cover: { id: string; image: CanvasImageSource | null } | null = null;
  private coverGame: Game | null = null;

  constructor(private readonly covers?: BoxArtLoader) {
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

  /**
   * The lot's game, whose front cover the board shows big beside the text (null: none, a sealed carton or a notice).
   * The art is asked of the loader and held until the next lot.
   */
  showCover(game: Game | null): void {
    if ((game?.id ?? null) === (this.coverGame?.id ?? null)) return;
    if (this.coverGame) this.covers?.release(this.coverGame);
    this.coverGame = game;
    this.cover = game ? { id: game.id, image: null } : null;
    this.repaint();
    if (!game || !this.covers) return;
    this.covers.load(game).then(
      (art) => {
        if (this.cover?.id !== game.id) return;
        this.cover.image = (art.front.image as CanvasImageSource | undefined) ?? null;
        this.repaint();
      },
      () => {},
    );
  }

  show(face: BoardFace): void {
    this.face = face;
    const key = JSON.stringify(face) + (this.cover?.image ? `|${this.cover.id}` : '');
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
      // The cover on the left, in a gilt frame; the text centred in what is left.
      const image = this.cover?.image ?? null;
      const cx = image ? COVER.x + COVER.w + (w - COVER.x - COVER.w) / 2 - 10 : w / 2;
      const room = image ? w - COVER.w - COVER.x - 60 : w - 70;
      if (image) {
        ctx.fillStyle = '#c9a85a';
        ctx.fillRect(COVER.x - 6, COVER.y - 6, COVER.w + 12, COVER.h + 12);
        try {
          ctx.drawImage(image, COVER.x, COVER.y, COVER.w, COVER.h);
        } catch {
          // An image the canvas cannot draw (a closed bitmap): the frame stays empty.
        }
      }
      ctx.fillStyle = '#c9a85a';
      ctx.font = 'bold 34px Georgia, serif';
      ctx.fillText(`LOT ${face.number} OF ${face.of}`, cx, 58);
      ctx.fillStyle = '#f4efe0';
      ctx.font = 'bold 50px Georgia, serif';
      ctx.fillText(fit(ctx, face.title, room), cx, 128);
      ctx.fillStyle = '#b8c8b0';
      ctx.font = '30px Georgia, serif';
      ctx.fillText(fit(ctx, `estimate around ${formatCoins(face.estimate)}`, room), cx, 186);
      ctx.fillStyle = face.you ? '#ffe070' : '#f4efe0';
      ctx.font = `bold ${image ? 64 : 78}px Georgia, serif`;
      ctx.fillText(fit(ctx, face.bid === null ? 'NO BID YET' : `${face.bid} COINS`, room), cx, 272);
      ctx.font = 'bold 36px Georgia, serif';
      ctx.fillText(face.leader ? fit(ctx, face.you ? `YOUR PADDLE · No. ${PLAYER_PADDLE}` : `paddle: ${face.leader}`, room) : '', cx, 340);
      ctx.fillStyle = '#ff9a5a';
      ctx.font = 'bold 46px Georgia, serif';
      ctx.fillText(fit(ctx, face.status, room), cx, 410);
    }
    this.texture.needsUpdate = true;
  }

  /** Paints the face shown again (the cover came in or went). */
  private repaint(): void {
    this.painted = '';
    this.show(this.face);
  }

  dispose(): void {
    if (this.coverGame) this.covers?.release(this.coverGame);
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
