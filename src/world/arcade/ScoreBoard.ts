import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { createCanvas } from '@/covers/generated/canvasUtils';
import { boxMesh } from '../meshUtils';
import { markShared, matte, Prop } from '../props/Prop';
import { drawText } from './games/ArcadeGame';
import type { ScoreTable } from './scoreTable';

export interface ScoreBoardOptions {
  /** The hall's games, in the order they are listed. */
  games: readonly { id: string; title: string }[];
  /** The tables; the board repaints when one changes. */
  scores: ScoreTable;
  width?: number;
  height?: number;
}

const PX_PER_M = 700;
/** Games per page (a 2 x 2 grid), and how long a page shows. */
const PER_PAGE = 4;
const PAGE_SECONDS = 8;
const FRAME = markShared(matte(0x0d0c12, 0.4));
const MEDALS = ['#ffd23a', '#d8dce6', '#e0995a', '#9a96c0', '#9a96c0'];

/**
 * The hall of fame: a backlit LED board with the top five of every machine in the hall, initials
 * and scores, four games a page, turning every few seconds. The player's own entries stand out in
 * green. Follows the tables live (`ScoreTable.subscribe`). Wall-hung: origin at the centre, on the
 * wall, +z into the room. Decoration: never collides.
 */
export class ScoreBoard extends Prop implements Updatable {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly options: Required<ScoreBoardOptions>;
  private readonly unsubscribe: () => void;
  private page = 0;
  private pageClock = 0;
  private dirty = true;

  constructor(options: ScoreBoardOptions) {
    super();
    this.name = 'ScoreBoard';
    this.options = { width: 1.5, height: 1.0, ...options };
    const { width, height } = this.options;

    const frame = boxMesh(width + 0.08, height + 0.08, 0.05, FRAME, { z: 0.025 });
    frame.castShadow = false;
    this.add(frame);
    this.canvas = createCanvas(Math.round(width * PX_PER_M), Math.round(height * PX_PER_M))[0];
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false, color: 0xd0d0d0 }));
    face.position.z = 0.052;
    this.add(face);
    this.unsubscribe = options.scores.subscribe(() => (this.dirty = true));
    this.repaint();
  }

  private get pages(): number {
    return Math.max(1, Math.ceil(this.options.games.length / PER_PAGE));
  }

  update(dt: number): void {
    this.pageClock += dt;
    if (this.pageClock >= PAGE_SECONDS && this.pages > 1) {
      this.pageClock = 0;
      this.page = (this.page + 1) % this.pages;
      this.dirty = true;
    }
    if (this.dirty) this.repaint();
  }

  dispose(): void {
    this.unsubscribe();
  }

  private repaint(): void {
    this.dirty = false;
    const { games, scores } = this.options;
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.fillStyle = '#0b1026';
    ctx.fillRect(0, 0, W, H);
    // A dotted matrix behind the letters, the way an LED board looks up close.
    ctx.fillStyle = 'rgba(255,255,255,0.035)';
    for (let y = 4; y < H; y += 8) for (let x = 4; x < W; x += 8) ctx.fillRect(x, y, 2, 2);
    ctx.strokeStyle = '#ffd23a';
    ctx.lineWidth = 6;
    ctx.strokeRect(12, 12, W - 24, H - 24);
    drawText(ctx, 'HALL OF FAME', W / 2, H * 0.08, Math.round(H * 0.065), '#ffd23a');
    if (this.pages > 1) drawText(ctx, `${this.page + 1} / ${this.pages}`, W - 40, H * 0.08, Math.round(H * 0.03), '#5a6aa0', 'right');

    const shown = games.slice(this.page * PER_PAGE, this.page * PER_PAGE + PER_PAGE);
    const cellW = (W - 60) / 2;
    const cellH = (H * 0.8) / 2;
    shown.forEach((game, i) => {
      const x0 = 30 + (i % 2) * cellW;
      const y0 = H * 0.15 + Math.floor(i / 2) * cellH;
      ctx.fillStyle = 'rgba(58,74,138,0.25)';
      ctx.fillRect(x0 + 8, y0 + 4, cellW - 16, cellH - 12);
      drawText(ctx, game.title, x0 + cellW / 2, y0 + cellH * 0.11, Math.round(cellH * 0.09), '#c9c4ff');
      const table = scores.table(game.id);
      const rowH = (cellH * 0.78) / 5;
      const size = Math.round(rowH * 0.5);
      table.forEach((entry, rank) => {
        const y = y0 + cellH * 0.24 + rowH * (rank + 0.5);
        const colour = entry.you ? '#7ee787' : '#ffffff';
        drawText(ctx, `${rank + 1}`, x0 + 30, y, size, MEDALS[rank]!, 'left');
        drawText(ctx, entry.name, x0 + 70, y, size, colour, 'left');
        drawText(ctx, entry.score.toLocaleString('en-US'), x0 + cellW - 30, y, size, colour, 'right');
      });
    });
    drawText(ctx, 'BEAT THE BOARD · YOUR SCORES IN GREEN', W / 2, H * 0.96, Math.round(H * 0.028), '#ff8a80');
    this.texture.needsUpdate = true;
  }
}
