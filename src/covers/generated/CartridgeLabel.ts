import type * as THREE from 'three';
import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { createCanvas, drawImageCover, fitFontSize, roundRect, toTexture, wrapLines, FONT } from './canvasUtils';
import { contrastText, css } from './palette';

const WIDTH_PX = 384;

/**
 * Front face of the cartridge: ridged grey plastic on top, a label below carrying the game's
 * art (title screen, screenshot or the cover itself) and a title strip in the accent colour.
 * `aspect` is the face's width / height so the drawing is not stretched.
 */
export function createCartridgeLabelTexture(game: Game, accent: THREE.Color, art: CanvasImageSource | null, anisotropy: number, aspect: number): THREE.CanvasTexture {
  const w = WIDTH_PX;
  const h = Math.round(w / aspect);
  const [canvas, ctx] = createCanvas(w, h);

  // Plastic body with grooves along the top.
  ctx.fillStyle = '#8e8e91';
  ctx.fillRect(0, 0, w, h);
  const grooveTop = Math.round(h * 0.05);
  const grooveStep = Math.round(h * 0.045);
  for (let i = 0; i < 5; i++) {
    const y = grooveTop + i * grooveStep;
    ctx.fillStyle = '#6f6f73';
    ctx.fillRect(Math.round(w * 0.08), y, Math.round(w * 0.84), 3);
    ctx.fillStyle = '#a3a3a6';
    ctx.fillRect(Math.round(w * 0.08), y + 3, Math.round(w * 0.84), 1);
  }

  // Label.
  const lx = Math.round(w * 0.06);
  const ly = Math.round(h * 0.3);
  const lw = w - lx * 2;
  const lh = Math.round(h * 0.95) - ly;
  ctx.fillStyle = css(accent.clone().multiplyScalar(0.35));
  roundRect(ctx, lx, ly, lw, lh, 8);
  ctx.fill();

  const stripH = Math.round(lh * 0.24);
  const artX = lx + 4, artY = ly + 4, artW = lw - 8, artH = lh - stripH - 8;
  if (!art || !drawImageCover(ctx, art, artX, artY, artW, artH)) drawStripes(ctx, artX, artY, artW, artH, accent);

  // Title strip.
  const stripY = ly + lh - stripH;
  ctx.fillStyle = css(accent);
  ctx.fillRect(lx, stripY, lw, stripH);
  ctx.fillStyle = contrastText(accent);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const maxTitleW = lw - 20;
  const size = fitFontSize(ctx, game.title, maxTitleW, Math.round(stripH * 0.5), 11, FONT);
  const lines = ctx.measureText(game.title).width > maxTitleW ? wrapLines(ctx, game.title, maxTitleW, 2) : [game.title];
  const lineH = size * 1.1;
  const startY = stripY + stripH / 2 - ((lines.length - 1) * lineH) / 2;
  lines.forEach((line, i) => ctx.fillText(line, lx + lw / 2, startY + i * lineH));

  // Platform pill in the label's top-left corner.
  const short = getPlatform(game.platform).shortName;
  const pillSize = Math.max(10, Math.round(h * 0.03));
  ctx.font = `bold ${pillSize}px ${FONT}`;
  const pillW = ctx.measureText(short).width + 14;
  const pillH = pillSize + 8;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  roundRect(ctx, artX + 8, artY + 8, pillW, pillH, 4);
  ctx.fill();
  ctx.fillStyle = '#f4f4f4';
  ctx.textAlign = 'left';
  ctx.fillText(short, artX + 15, artY + 8 + pillH / 2);

  // Label border.
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 2;
  roundRect(ctx, lx + 1, ly + 1, lw - 2, lh - 2, 7);
  ctx.stroke();

  return toTexture(canvas, anisotropy);
}

function drawStripes(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, accent: THREE.Color): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = css(accent.clone().multiplyScalar(0.5));
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = css(accent.clone().multiplyScalar(0.7));
  const step = 22;
  for (let i = -h; i < w; i += step) {
    ctx.beginPath();
    ctx.moveTo(x + i, y + h);
    ctx.lineTo(x + i + h, y);
    ctx.lineTo(x + i + h + step / 2, y);
    ctx.lineTo(x + i + step / 2, y + h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
