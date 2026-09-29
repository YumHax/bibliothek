import type * as THREE from 'three';
import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { createCanvas, drawImageCover, fitFontSize, roundRect, toTexture, wrapLines, FONT } from './canvasUtils';
import { contrastText, css } from './palette';

const WIDTH_PX = 384;

/**
 * A cartridge's sticker: the game's art (title screen, screenshot or the cover itself) over a title
 * strip in the accent colour. `aspect` is the sticker's width / height so the drawing is not
 * stretched; `fold` is the share of its height at the top that folds over the cartridge's top edge
 * (the end label: just the title, read from above).
 */
export function createCartridgeLabelTexture(game: Game, accent: THREE.Color, art: CanvasImageSource | null, anisotropy: number, aspect: number, fold = 0): THREE.CanvasTexture {
  const w = WIDTH_PX;
  const h = Math.round(w / aspect);
  const [canvas, ctx] = createCanvas(w, h);
  const foldH = Math.round(h * fold);

  // Paper, with the accent's dark shade as the border ground.
  ctx.fillStyle = css(accent.clone().multiplyScalar(0.3));
  ctx.fillRect(0, 0, w, h);

  // The end label: the title across the top edge.
  if (foldH > 0) {
    ctx.fillStyle = css(accent);
    ctx.fillRect(0, 0, w, foldH);
    ctx.fillStyle = contrastText(accent);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = fitFontSize(ctx, game.title.toUpperCase(), w - 24, Math.round(foldH * 0.62), 8, FONT);
    ctx.font = `bold ${size}px ${FONT}`;
    ctx.fillText(game.title.toUpperCase(), w / 2, foldH / 2 + 1);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, foldH - 2, w, 2); // the crease
  }

  const lx = 6, ly = foldH + 6, lw = w - 12, lh = h - foldH - 12;
  const stripH = Math.round(lh * 0.24);
  const artX = lx, artY = ly, artW = lw, artH = lh - stripH;
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
  ctx.font = `bold ${size}px ${FONT}`;
  const lines = ctx.measureText(game.title).width > maxTitleW ? wrapLines(ctx, game.title, maxTitleW, 2) : [game.title];
  const lineH = size * 1.1;
  const startY = stripY + stripH / 2 - ((lines.length - 1) * lineH) / 2;
  lines.forEach((line, i) => ctx.fillText(line, lx + lw / 2, startY + i * lineH));

  // Platform pill in the art's top-left corner.
  const short = getPlatform(game.platform).shortName;
  const pillSize = Math.max(10, Math.round(lh * 0.05));
  ctx.font = `bold ${pillSize}px ${FONT}`;
  const pillW = ctx.measureText(short).width + 14;
  const pillH = pillSize + 8;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  roundRect(ctx, artX + 8, artY + 8, pillW, pillH, 4);
  ctx.fill();
  ctx.fillStyle = '#f4f4f4';
  ctx.textAlign = 'left';
  ctx.fillText(short, artX + 15, artY + 8 + pillH / 2);

  // A little gloss on the paper.
  const gloss = ctx.createLinearGradient(0, foldH, w, h);
  gloss.addColorStop(0, 'rgba(255,255,255,0.10)');
  gloss.addColorStop(0.5, 'rgba(255,255,255,0)');
  gloss.addColorStop(1, 'rgba(0,0,0,0.08)');
  ctx.fillStyle = gloss;
  ctx.fillRect(0, foldH, w, h - foldH);

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
