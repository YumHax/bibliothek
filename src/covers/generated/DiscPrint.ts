import type * as THREE from 'three';
import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { createCanvas, drawImageCover, fitFontSize, toTexture, FONT } from './canvasUtils';
import { contrastText, css } from './palette';

const SIZE_PX = 512;
/** Radii as shares of the disc's: the clear hub with its stacking ring, and where the print starts. */
const HUB = 0.28;
const HOLE = 0.125;

/**
 * The printed face of a CD, square with the disc filling it (transparent outside it and in the
 * hole): the cover's art over the print area, a band with the title under it, the clear hub round
 * the hole with its stacking ring.
 */
export function createDiscPrintTexture(game: Game, accent: THREE.Color, art: CanvasImageSource | null, anisotropy: number): THREE.CanvasTexture {
  const s = SIZE_PX;
  const c = s / 2;
  const [canvas, ctx] = createCanvas(s, s);

  ctx.save();
  circle(ctx, c, c, c);
  ctx.clip();
  ctx.fillStyle = css(accent.clone().multiplyScalar(0.25));
  ctx.fillRect(0, 0, s, s);
  if (art) {
    ctx.globalAlpha = 0.92;
    drawImageCover(ctx, art, 0, 0, s, s);
    ctx.globalAlpha = 1;
  }
  // The title band across the lower half.
  const bandY = s * 0.68;
  const bandH = s * 0.12;
  ctx.fillStyle = css(accent);
  ctx.fillRect(0, bandY, s, bandH);
  ctx.fillStyle = contrastText(accent);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = fitFontSize(ctx, game.title, s * 0.62, Math.round(bandH * 0.55), 10, FONT);
  ctx.font = `bold ${size}px ${FONT}`;
  ctx.fillText(game.title, c, bandY + bandH / 2);
  ctx.font = `bold ${Math.round(s * 0.03)}px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText(getPlatform(game.platform).name.toUpperCase(), c, s * 0.87);
  ctx.restore();

  // The clear hub and its ring; the hole itself stays transparent.
  ctx.globalCompositeOperation = 'destination-out';
  circle(ctx, c, c, c * HUB);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(205,210,216,0.95)';
  circle(ctx, c, c, c * HUB);
  ctx.fill();
  ctx.strokeStyle = 'rgba(150,155,162,1)';
  ctx.lineWidth = 3;
  circle(ctx, c, c, c * 0.2);
  ctx.stroke();
  ctx.globalCompositeOperation = 'destination-out';
  circle(ctx, c, c, c * HOLE);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  return toTexture(canvas, anisotropy);
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}
