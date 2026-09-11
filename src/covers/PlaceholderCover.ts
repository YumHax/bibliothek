import * as THREE from 'three';
import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { createCanvas, toTexture, wrapLines, FONT } from './generated/canvasUtils';
import { css } from './generated/palette';

/** Generates a canvas texture with the title so a box is readable even without art. */
export function createPlaceholderTexture(game: Game): THREE.CanvasTexture {
  const platform = getPlatform(game.platform);
  const w = 256;
  const h = Math.round((w * platform.boxDimensions.height) / platform.boxDimensions.width);
  const [canvas, ctx] = createCanvas(w, h);

  ctx.fillStyle = css(new THREE.Color(platform.accentColor));
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(12, 12, w - 24, h - 24);

  ctx.fillStyle = '#f0f0f0';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold 22px ${FONT}`;
  const lineHeight = 26;
  const lines = wrapLines(ctx, game.title, w - 48);
  const startY = h / 2 - 10 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => ctx.fillText(line, w / 2, startY + i * lineHeight));

  ctx.font = `16px ${FONT}`;
  ctx.fillStyle = '#9a9a9a';
  ctx.fillText(platform.shortName, w / 2, h - 32);

  return toTexture(canvas);
}
