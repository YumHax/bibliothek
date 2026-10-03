import type * as THREE from 'three';
import { createCanvas, toTexture } from '@/graphics/canvas';
import type { UvRect } from './TexQuads';

/*
 * What the walk-in shops put out on the pavement, painted: the florist's chalk board (two lines of the plan's), the
 * furniture shop's TRY ME tag, the pet shop's card by the dogs' water, the TV repair shop's FREE note and the dead set's
 * cracked screen. One small atlas, tiles of 256 px.
 */

const TILE = 256;
const COLS = 4;
export type SpillTile = 'board' | 'sale' | 'dogs' | 'free' | 'cracked';
const TILES: readonly SpillTile[] = ['board', 'sale', 'dogs', 'free', 'cracked'];
const HAND = '"Comic Sans MS", "Marker Felt", "Segoe Print", cursive';
const SANS = 'Arial, Helvetica, sans-serif';

export interface SpillAtlas {
  texture: THREE.CanvasTexture;
  tile(id: SpillTile): UvRect;
}

/** Paints the tiles; `board` is the chalk board's two lines. */
export function paintSpillAtlas(board: readonly [string, string]): SpillAtlas {
  const rows = Math.ceil(TILES.length / COLS);
  const [canvas, ctx] = createCanvas(TILE * COLS, TILE * rows);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  TILES.forEach((id, i) => {
    ctx.save();
    ctx.translate((i % COLS) * TILE, Math.floor(i / COLS) * TILE);
    PAINTERS[id](ctx, board);
    ctx.restore();
  });
  const texture = toTexture(canvas, 'grazing');
  const w = canvas.width;
  const h = canvas.height;
  return {
    texture,
    tile: (id) => {
      const i = TILES.indexOf(id);
      const x = (i % COLS) * TILE;
      const y = Math.floor(i / COLS) * TILE;
      return { u0: (x + 2) / w, u1: (x + TILE - 2) / w, v0: 1 - (y + TILE - 2) / h, v1: 1 - (y + 2) / h };
    },
  };
}

function text(ctx: CanvasRenderingContext2D, line: string, y: number, px: number, color: string, font: string, maxWidth = TILE - 30): void {
  let size = px;
  ctx.font = `bold ${size}px ${font}`;
  while (size > 12 && ctx.measureText(line).width > maxWidth) {
    size -= 2;
    ctx.font = `bold ${size}px ${font}`;
  }
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(line, TILE / 2, y);
}

const PAINTERS: Record<SpillTile, (ctx: CanvasRenderingContext2D, board: readonly [string, string]) => void> = {
  // Chalk on a black board: the two lines, a flower drawn under them, the smudges.
  board: (ctx, [a, b]) => {
    ctx.fillStyle = '#222a26';
    ctx.fillRect(0, 0, TILE, TILE);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 12; i++) ctx.fillRect((i * 53) % TILE, (i * 97) % TILE, 60, 18);
    text(ctx, a, 58, 46, '#f4f0e6', HAND);
    text(ctx, b, 112, 40, '#f0c94a', HAND);
    ctx.strokeStyle = '#e0567a';
    ctx.lineWidth = 5;
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(128 + Math.cos(angle) * 16, 180 + Math.sin(angle) * 16, 12, 8, angle, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = '#6fa35e';
    ctx.beginPath();
    ctx.moveTo(128, 196);
    ctx.lineTo(128, 244);
    ctx.stroke();
  },
  // A buff luggage tag: TRY ME in red, and where the rest is (the bench is the shop's to sit on, not for sale out here).
  sale: (ctx) => {
    ctx.fillStyle = '#e8d8b0';
    ctx.beginPath();
    ctx.moveTo(40, 20);
    ctx.lineTo(216, 20);
    ctx.lineTo(236, 60);
    ctx.lineTo(236, 236);
    ctx.lineTo(20, 236);
    ctx.lineTo(20, 60);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#8a7a5a';
    ctx.beginPath();
    ctx.arc(128, 48, 10, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, 'TRY ME', 112, 52, '#b8302a', SANS);
    text(ctx, 'sit a while,', 168, 30, '#5a4a3a', HAND);
    text(ctx, 'more inside!', 212, 30, '#b8302a', HAND);
  },
  // DOGS WELCOME: a bone and the line about the water.
  dogs: (ctx) => {
    ctx.fillStyle = '#f0ead8';
    ctx.fillRect(8, 8, TILE - 16, TILE - 16);
    ctx.fillStyle = '#2f6a6a';
    ctx.fillRect(8, 8, TILE - 16, 20);
    text(ctx, 'DOGS', 70, 48, '#2f6a6a', SANS);
    text(ctx, 'WELCOME', 118, 40, '#2f6a6a', SANS);
    text(ctx, 'fresh water here', 170, 26, '#2a2622', HAND);
    ctx.fillStyle = '#d9c9a8';
    ctx.fillRect(96, 204, 64, 14);
    for (const x of [96, 160]) {
      for (const y of [202, 220]) {
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },
  // A note taped on the dead set.
  free: (ctx) => {
    ctx.fillStyle = '#f6f2e0';
    ctx.fillRect(14, 30, TILE - 28, TILE - 60);
    ctx.fillStyle = 'rgba(230,220,160,0.7)';
    ctx.fillRect(90, 18, 76, 26);
    text(ctx, 'FREE', 100, 64, '#b8302a', SANS);
    text(ctx, 'works sometimes', 160, 28, '#2a2622', HAND);
    text(ctx, '(hit it)', 196, 22, '#2a2622', HAND);
  },
  // The dead set's screen: dark glass, a crack across it.
  cracked: (ctx) => {
    const g = ctx.createRadialGradient(128, 110, 10, 128, 128, 170);
    g.addColorStop(0, '#3a4448');
    g.addColorStop(1, '#101416');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, TILE, TILE);
    ctx.strokeStyle = 'rgba(220,230,235,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(150, 90);
    for (const [x, y] of [[40, 30], [150, 90], [230, 60], [150, 90], [200, 230], [150, 90], [20, 200], [150, 90], [120, 250]] as const) ctx.lineTo(x, y);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(30, 20, 90, 30);
  },
};
