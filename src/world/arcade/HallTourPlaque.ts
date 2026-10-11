import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { boxMesh } from '../meshUtils';
import { Prop } from '../props/Prop';
import { faceOn } from '../props/joinery';
import { WALL } from '../surface/layers';
import { paint } from '../materials/palette';
import { drawText } from './games/ArcadeGame';

/** The medals as the plaque reads them (the concrete `ArcadeMedals` lives in `economy/`). */
interface MedalSource {
  earned(gameId: string): readonly string[];
  platinum(gameId: string): boolean;
  readonly tourDone: boolean;
  subscribe(cb: () => void): () => void;
}

interface HallTourPlaqueOptions {
  medals: MedalSource;
  /** The machines of the tour (every one that keeps a table), by id and title. */
  games: readonly { id: string; title: string }[];
  /** The player's initials, engraved once the tour is done. */
  initials: () => string;
  width?: number;
  height?: number;
}

const PX_PER_M = 640;
const FRAME = paint(0x2a1e0c, 0.35);
/** The four medals of a machine, left to right, and their lit and unlit colours. */
const MEDALS: readonly { tier: string; lit: string; dim: string }[] = [
  { tier: 'bronze', lit: '#d08a4a', dim: '#3a2a1e' },
  { tier: 'silver', lit: '#d8dde6', dim: '#2e3036' },
  { tier: 'gold', lit: '#ffd23a', dim: '#3a3212' },
  { tier: 'platinum', lit: '#bff4ff', dim: '#1e3238' },
];

/**
 * THE HALL'S TOUR on the back wall: a brass-framed plaque with every machine that keeps a table and its four medals
 * (bronze, silver, gold, platinum) lit as they are won; with gold on every one, the plaque turns gold and carries the
 * player's initials. No rules on it, only the medals. Follows the medals live. Wall-hung, +z into the room; never
 * collides.
 */
export class HallTourPlaque extends Prop implements Updatable {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly options: HallTourPlaqueOptions;
  private readonly unsubscribe: () => void;
  private dirty = true;

  constructor(options: HallTourPlaqueOptions) {
    super();
    this.name = 'HallTourPlaque';
    this.options = options;
    const width = options.width ?? 0.9;
    const height = options.height ?? 0.78;
    const frame = boxMesh(width + 0.06, height + 0.06, 0.035, FRAME, { z: 0.0175 });
    frame.castShadow = false;
    this.add(frame);
    const [canvas, ctx] = createCanvas(Math.round(width * PX_PER_M), Math.round(height * PX_PER_M));
    this.ctx = ctx;
    this.texture = toTexture(canvas);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: this.texture, color: 0xd0d0d0 }));
    this.add(faceOn(face, frame, WALL.notice));
    this.unsubscribe = options.medals.subscribe(() => (this.dirty = true));
  }

  update(): void {
    if (this.dirty) this.repaint();
  }

  dispose(): void {
    this.unsubscribe();
  }

  private repaint(): void {
    this.dirty = false;
    const { ctx } = this;
    const { width: W, height: H } = ctx.canvas;
    const { medals, games } = this.options;
    const done = medals.tourDone;
    ctx.fillStyle = done ? '#2a2008' : '#120c1a';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = done ? '#ffd23a' : '#8a6a3a';
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, W - 16, H - 16);
    drawText(ctx, "THE HALL'S TOUR", W / 2, H * 0.08, Math.round(H * 0.06), done ? '#ffd23a' : '#e0c48a');
    const top = H * 0.15;
    const bottom = done ? H * 0.82 : H * 0.95;
    const rowH = (bottom - top) / Math.max(1, games.length);
    const size = Math.round(Math.min(rowH * 0.5, H * 0.04));
    const dotR = Math.min(rowH * 0.3, 9);
    games.forEach((game, i) => {
      const y = top + rowH * (i + 0.5);
      const earned = medals.earned(game.id);
      const gold = earned.includes('gold');
      drawText(ctx, game.title, 28, y, size, gold ? '#ffe9a8' : '#b8b0c8', 'left');
      MEDALS.forEach((m, j) => {
        const lit = m.tier === 'platinum' ? medals.platinum(game.id) : earned.includes(m.tier);
        ctx.fillStyle = lit ? m.lit : m.dim;
        ctx.beginPath();
        ctx.arc(W - 30 - (MEDALS.length - 1 - j) * dotR * 2.6, y, dotR, 0, Math.PI * 2);
        ctx.fill();
      });
    });
    if (done) drawText(ctx, this.options.initials(), W / 2, H * 0.9, Math.round(H * 0.07), '#ffd23a');
    this.texture.needsUpdate = true;
  }
}
