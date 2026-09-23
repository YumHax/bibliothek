import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { createCanvas } from '@/covers/generated/canvasUtils';
import { boxMesh } from '../meshUtils';
import { matte, Prop } from '../props/Prop';
import { drawText } from './games/ArcadeGame';

export interface ScoreBoardOptions {
  /** The cabinets' games, in the order they are listed. */
  games: readonly { id: string; title: string }[];
  /** Where the best scores come from; read again every second, repainted when one moves. */
  scores: { bestOf(gameId: string): number };
  /** What a score pays, for the tickets column. */
  ticketsFor: (score: number) => number;
  /** The rate, written at the bottom. */
  pointsPerTicket: number;
  width?: number;
  height?: number;
}

const PX_PER_M = 800;
/** How often the bests are read again. */
const POLL_SECONDS = 1;
const FRAME = matte(0x0d0c12, 0.4);

/**
 * The hall of fame: a backlit board listing the best score on every cabinet and the tickets it
 * paid, the way an arcade pins its records up by the counter. Follows the scores live (a new
 * best appears within the second). Wall-hung: origin at the centre, on the wall, +z into the
 * room. Decoration: never collides.
 */
export class ScoreBoard extends Prop implements Updatable {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly options: Required<ScoreBoardOptions>;
  private shown = '';
  private pollClock = 0;

  constructor(options: ScoreBoardOptions) {
    super();
    this.name = 'ScoreBoard';
    this.options = { width: 1.1, height: 0.75, ...options };
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
    this.repaint();
  }

  update(dt: number): void {
    this.pollClock += dt;
    if (this.pollClock < POLL_SECONDS) return;
    this.pollClock = 0;
    this.repaint();
  }

  /** Repaints only when a best has moved since the last time. */
  private repaint(): void {
    const { games, scores } = this.options;
    const key = games.map((g) => scores.bestOf(g.id)).join(',');
    if (key === this.shown) return;
    this.shown = key;
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
    ctx.strokeRect(14, 14, W - 28, H - 28);
    drawText(ctx, 'HALL OF FAME', W / 2, H * 0.14, Math.round(H * 0.085), '#ffd23a');
    ctx.fillStyle = '#3a4a8a';
    ctx.fillRect(W * 0.08, H * 0.22, W * 0.84, 3);
    const rowH = (H * 0.58) / Math.max(1, games.length);
    const size = Math.round(Math.min(rowH * 0.42, H * 0.06));
    games.forEach((game, i) => {
      const y = H * 0.26 + rowH * (i + 0.5);
      const best = scores.bestOf(game.id);
      drawText(ctx, game.title, W * 0.09, y, size, '#c9c4ff', 'left');
      drawText(ctx, best > 0 ? best.toLocaleString('en-US') : '- - -', W * 0.72, y, size, best > 0 ? '#ffffff' : '#5a5a7a', 'right');
      if (best > 0) drawText(ctx, `${this.options.ticketsFor(best)} TIX`, W * 0.91, y, Math.round(size * 0.7), '#7ee787', 'right');
    });
    drawText(ctx, `${this.options.pointsPerTicket} PTS = 1 TICKET · BEAT THE BOARD`, W / 2, H * 0.91, Math.round(H * 0.04), '#ff8a80');
    this.texture.needsUpdate = true;
  }
}
