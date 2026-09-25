import * as THREE from 'three';
import { createCanvas, fitFontSize, toTexture, FONT } from '@/covers/generated/canvasUtils';
import { boxMesh } from '../meshUtils';
import { Prop } from '../props/Prop';
import { wood as woodMaterial } from '@/world/materials/finishes';

/** One line of the board: text on the left, an optional figure on the right, a red star in front when `star`. */
export interface InfoRow {
  text: string;
  right?: string;
  star?: boolean;
}

export interface InfoBoardOptions {
  /** Colour of the title band. */
  accent?: number;
  /** The title painted until the first `setContent()`. */
  label?: string;
}

const BOARD_W = 0.7;
const BOARD_H = 0.9;
const BOARD_T = 0.018;
/** The board's top edge. */
const TOP = 1.7;
const LEG = 0.045;
const FOOT_D = 0.36;
/** The board is painted at this scale. */
const PX_PER_M = 900;
const TITLE_BAND = 0.16;
const PAPER = '#f4ecd8';
const INK = '#2a1a10';
const STAR = '#c8342a';

/**
 * A free-standing sign, the kind that lists the stalls or today's prices: a painted board between
 * two posts on splayed feet, a title band in the accent colour over a list of rows (text left, a
 * figure right-aligned, a red star before a starred row). `setContent()` repaints it. Both faces
 * show the board. Origin on the floor under the middle, the board along local x (read from +z and
 * from -z). Decoration: never collides.
 */
export class InfoBoard extends Prop {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly accent: string;

  constructor(options: InfoBoardOptions = {}) {
    super();
    this.name = 'InfoBoard';
    this.accent = `#${new THREE.Color(options.accent ?? 0x6b2f2a).getHexString()}`;
    const wood = woodMaterial(0x5a4632, 0.7);
    // Two posts on feet, the board between them.
    const postX = BOARD_W / 2 + LEG / 2;
    for (const sx of [-1, 1]) {
      this.add(boxMesh(LEG, TOP + 0.03, LEG, wood, { x: sx * postX, y: (TOP + 0.03) / 2 }));
      this.add(boxMesh(LEG + 0.01, 0.04, FOOT_D, wood, { x: sx * postX, y: 0.02 }));
    }
    [this.canvas, this.ctx] = createCanvas(Math.round(BOARD_W * PX_PER_M), Math.round(BOARD_H * PX_PER_M));
    this.texture = toTexture(this.canvas, 4);
    const face = new THREE.MeshStandardMaterial({ map: this.texture, roughness: 0.85 });
    // BoxGeometry material order: +x, -x, +y, -y, +z, -z: the painted face on both broad sides.
    const board = new THREE.Mesh(new THREE.BoxGeometry(BOARD_W, BOARD_H, BOARD_T), [wood, wood, wood, wood, face, face]);
    board.position.y = TOP - BOARD_H / 2;
    board.castShadow = true;
    board.receiveShadow = true;
    this.add(board);
    this.setContent(options.label ?? '', []);
  }

  /** Repaints the board: the title in its band, then the rows, as many as fit at a readable size. */
  setContent(title: string, rows: readonly InfoRow[]): void {
    const { canvas, ctx } = this;
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 6;
    ctx.strokeRect(14, 14, W - 28, H - 28);
    const band = TITLE_BAND * PX_PER_M;
    ctx.fillStyle = this.accent;
    ctx.fillRect(14, 14, W - 28, band);
    ctx.fillStyle = PAPER;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitFontSize(ctx, title, W * 0.84, Math.round(band * 0.55), 18, `Georgia, serif`, 'bold');
    ctx.fillText(title, W / 2, 14 + band / 2);

    const top = 14 + band + 20;
    const pad = 40;
    const rowH = Math.min(64, (H - top - 30) / Math.max(1, rows.length));
    const size = Math.max(14, Math.round(rowH * 0.56));
    rows.forEach((row, i) => {
      const y = top + rowH * (i + 0.5);
      if (i % 2) {
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        ctx.fillRect(20, y - rowH / 2, W - 40, rowH);
      }
      ctx.textBaseline = 'middle';
      let x = pad;
      if (row.star) {
        ctx.fillStyle = STAR;
        ctx.textAlign = 'left';
        ctx.font = `bold ${size}px ${FONT}`;
        ctx.fillText('★', x - size * 0.2, y);
        x += size * 1.05;
      }
      ctx.font = `bold ${size}px ${FONT}`;
      const rightW = row.right ? ctx.measureText(row.right).width + 20 : 0;
      ctx.fillStyle = INK;
      ctx.textAlign = 'left';
      ctx.font = `${size}px ${FONT}`;
      ctx.fillText(row.text, x, y, W - pad - x - rightW);
      if (row.right) {
        ctx.textAlign = 'right';
        ctx.font = `bold ${size}px ${FONT}`;
        ctx.fillText(row.right, W - pad, y);
      }
    });
    this.texture.needsUpdate = true;
  }
}
