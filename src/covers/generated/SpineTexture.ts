import type * as THREE from 'three';
import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { createCanvas, drawSeal, fitFontSize, roundRect, toTexture, FONT } from './canvasUtils';
import { css } from './palette';

/** Layout height: every size below is in these units. */
const HEIGHT_PX = 1024;
/** The canvas is drawn at this fraction of the layout: 512 px along a 0.178 m spine is as sharp as the front cover. */
const SCALE = 0.5;
/** Pixels reserved along the spine for the seal (top) and the platform tag (bottom). */
const RESERVED_PX = 230;

/**
 * Generated box side. `frontEdge` says on which side of the texture the front cover sits:
 * three.js maps the +x face with the front on the left and the -x face with it on the right.
 * The title runs along the spine with its glyph tops toward the front cover, like a book.
 * Long titles that would become tiny are split into a main line and a subtitle stacked across the spine.
 */
export function createSpineTexture(game: Game, accent: THREE.Color, frontEdge: 'left' | 'right', anisotropy: number): THREE.CanvasTexture {
  const platform = getPlatform(game.platform);
  const { depth, height } = platform.boxDimensions;
  const w = Math.max(48, Math.round((HEIGHT_PX * depth) / height));
  const h = HEIGHT_PX;
  const [canvas, ctx] = createCanvas(Math.round(w * SCALE), h * SCALE);
  ctx.scale(SCALE, SCALE);
  const angle = frontEdge === 'left' ? -Math.PI / 2 : Math.PI / 2;
  /** Canvas x of a position given as a fraction of the way from the front edge (0) to the back edge (1). */
  const across = (fraction: number) => (frontEdge === 'left' ? fraction * w : (1 - fraction) * w);

  ctx.fillStyle = '#0d0d0f';
  ctx.fillRect(0, 0, w, h);

  // Accent strip along the front edge.
  const strip = Math.max(3, Math.round(w * 0.12));
  ctx.fillStyle = css(accent);
  ctx.fillRect(frontEdge === 'left' ? 0 : w - strip, 0, strip, h);

  const along = (text: string, size: number, weight: string, colour: string, canvasX: number, canvasY = h / 2) => {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.fillStyle = colour;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.translate(canvasX, canvasY);
    ctx.rotate(angle);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  };

  // Title: one line when it stays legible, otherwise two lines stacked across the spine.
  const usable = h - RESERVED_PX;
  const singleSize = fitFontSize(ctx, game.title, usable, Math.round(w * 0.6), 8, FONT);
  const parts = singleSize < w * 0.34 ? splitTitle(game.title) : null;
  if (!parts) {
    along(game.title, singleSize, 'bold', '#f4f4f4', across(0.56));
  } else {
    const [main, sub] = parts;
    along(main, fitFontSize(ctx, main, usable, Math.round(w * 0.38), 8, FONT), 'bold', '#f4f4f4', across(0.4));
    along(sub, fitFontSize(ctx, sub, usable, Math.round(w * 0.27), 8, FONT, '600'), '600', '#d0d0d0', across(0.77));
  }

  // Platform tag near the bottom, seal near the top.
  const tagSize = Math.max(9, Math.round(w * 0.26));
  ctx.font = `bold ${tagSize}px ${FONT}`;
  const tagW = ctx.measureText(platform.shortName).width + tagSize;
  const tagH = tagSize * 1.5;
  ctx.save();
  ctx.translate(w / 2, h - 70);
  ctx.rotate(angle);
  ctx.fillStyle = '#e8e8e8';
  roundRect(ctx, -tagW / 2, -tagH / 2, tagW, tagH, 4);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(platform.shortName, 0, 1);
  ctx.restore();
  drawSeal(ctx, w / 2, 60, Math.min(w * 0.3, 26));

  return toTexture(canvas, anisotropy);
}

/** "Zelda II: The Adventure of Link" -> ["Zelda II", "The Adventure of Link"]; long titles without a separator split near the middle. */
function splitTitle(title: string): [string, string] | null {
  const separated = title.match(/^(.+?)\s*[:–—-]\s+(.+)$/);
  if (separated) return [separated[1], separated[2]];
  const words = title.split(' ');
  if (words.length < 3) return null;
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const diff = Math.abs(words.slice(0, i).join(' ').length - title.length / 2);
    if (diff < bestDiff) {
      best = i;
      bestDiff = diff;
    }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}
