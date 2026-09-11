import type * as THREE from 'three';
import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { createCanvas, drawImageCover, fitFontSize, toTexture, wrapLines, FONT } from './canvasUtils';
import { contrastText, css } from './palette';

const WIDTH_PX = 256;

/** Cover of the instruction booklet: cream paper, accent header, a framed miniature of the cover art and the title. */
export function createManualCoverTexture(game: Game, accent: THREE.Color, art: CanvasImageSource | null, anisotropy: number, aspect: number): THREE.CanvasTexture {
  const w = WIDTH_PX;
  const h = Math.round(w / aspect);
  const [canvas, ctx] = createCanvas(w, h);
  const platform = getPlatform(game.platform);

  ctx.fillStyle = '#f3efe4';
  ctx.fillRect(0, 0, w, h);

  // Header band.
  const bandH = Math.round(h * 0.13);
  ctx.fillStyle = css(accent);
  ctx.fillRect(0, 0, w, bandH);
  ctx.fillStyle = contrastText(accent);
  ctx.font = `bold ${Math.round(bandH * 0.45)}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(platform.shortName, 14, bandH / 2);
  ctx.textAlign = 'right';
  ctx.font = `${Math.round(bandH * 0.3)}px ${FONT}`;
  ctx.fillText(spaced('MANUAL'), w - 14, bandH / 2);

  // Framed art.
  const fx = Math.round(w * 0.1);
  const fy = bandH + Math.round(h * 0.06);
  const fw = w - fx * 2;
  const fh = Math.round(h * 0.42);
  ctx.fillStyle = '#1b1b1b';
  ctx.fillRect(fx - 3, fy - 3, fw + 6, fh + 6);
  if (!art || !drawImageCover(ctx, art, fx, fy, fw, fh)) {
    ctx.fillStyle = css(accent.clone().multiplyScalar(0.6));
    ctx.fillRect(fx, fy, fw, fh);
  }

  // Title.
  const ty = fy + fh + Math.round(h * 0.05);
  ctx.fillStyle = '#1a1a1a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const maxW = w - 28;
  const size = fitFontSize(ctx, game.title, maxW, 22, 11, FONT);
  const lines = ctx.measureText(game.title).width > maxW ? wrapLines(ctx, game.title, maxW, 2) : [game.title];
  lines.forEach((line, i) => ctx.fillText(line, w / 2, ty + i * size * 1.15));

  // Footer.
  ctx.font = `${Math.max(8, Math.round(h * 0.028))}px ${FONT}`;
  ctx.fillStyle = '#6d6a62';
  ctx.textBaseline = 'bottom';
  ctx.fillText(spaced('INSTRUCTION BOOKLET'), w / 2, h - Math.round(h * 0.04));

  return toTexture(canvas, anisotropy);
}

/** Letter-spaced caps without relying on `ctx.letterSpacing`. */
function spaced(text: string): string {
  return text.split('').join(' ');
}
