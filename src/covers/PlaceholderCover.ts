import * as THREE from 'three';
import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { boxDimensionsOf } from '@/catalog/media';
import { createCanvas, fitFontSize, toTexture, wrapLines, FONT } from './generated/canvasUtils';
import { css } from './generated/palette';
import { fnv1a } from '@/random';

/** A pen hand for the homebrew label, whichever the system has. */
const HAND = '"Segoe Print", "Bradley Hand", "Chalkboard SE", "Comic Sans MS", cursive';

/** Generates a canvas texture with the title so a box is readable even without art (a homebrew or bootleg cart gets its own made-at-home front). */
export function createPlaceholderTexture(game: Game): THREE.CanvasTexture {
  if (game.publisher === 'Homebrew' || game.bootleg) return createHomebrewFront(game);
  const platform = getPlatform(game.platform);
  const w = 256;
  const dims = boxDimensionsOf(game);
  const h = Math.round((w * dims.height) / dims.width);
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

/**
 * A cart made long after its console, or never licensed for it: no publisher's art, so a front of the kind such boxes
 * have: plain card, a pixel motif drawn from the game's name (the same every time) in the console's colour, the title
 * in marker on a strip of label tape, who made it underneath, and a stamp saying what it is.
 */
function createHomebrewFront(game: Game): THREE.CanvasTexture {
  const platform = getPlatform(game.platform);
  const accent = new THREE.Color(platform.accentColor);
  const w = 256;
  const dims = boxDimensionsOf(game);
  const h = Math.round((w * dims.height) / dims.width);
  const [canvas, ctx] = createCanvas(w, h);
  ctx.fillStyle = '#e8e1d0';
  ctx.fillRect(0, 0, w, h);
  // The motif: an 8 x 8 sprite, mirrored like an invader, from the name's hash.
  let bits = fnv1a(game.id);
  const cell = Math.floor((w * 0.55) / 8);
  const x0 = (w - cell * 8) / 2;
  const y0 = h * 0.12;
  ctx.fillStyle = css(accent);
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 4; col++) {
      if (bits & 1) {
        ctx.fillRect(x0 + col * cell, y0 + row * cell, cell, cell);
        ctx.fillRect(x0 + (7 - col) * cell, y0 + row * cell, cell, cell);
      }
      bits = (bits >>> 1) | ((bits & 1) << 31);
      if (row * 4 + col === 15) bits = fnv1a(`${game.id}:2`);
    }
  }
  // The title on a strip of black label tape, letters embossed white.
  const tapeY = y0 + cell * 8 + h * 0.06;
  ctx.fillStyle = '#16161a';
  ctx.fillRect(14, tapeY, w - 28, 40);
  ctx.fillStyle = '#f4f4f0';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = fitFontSize(ctx, game.title.toUpperCase(), w - 44, 26, 12, FONT);
  ctx.font = `bold ${size}px ${FONT}`;
  ctx.fillText(game.title.toUpperCase(), w / 2, tapeY + 21);
  // Who made it, in pen; what it is, stamped.
  ctx.fillStyle = '#2a3550';
  ctx.font = `18px ${HAND}`;
  if (game.developer) ctx.fillText(`by ${game.developer}`, w / 2, tapeY + 70);
  ctx.save();
  ctx.translate(w / 2, h - 40);
  ctx.rotate(-0.08);
  ctx.strokeStyle = 'rgba(160, 40, 40, 0.8)';
  ctx.fillStyle = 'rgba(160, 40, 40, 0.8)';
  ctx.lineWidth = 2;
  ctx.strokeRect(-62, -14, 124, 28);
  ctx.font = `bold 14px ${FONT}`;
  ctx.fillText(game.bootleg ? 'UNLICENSED' : `${platform.shortName} HOMEBREW`, 0, 1);
  ctx.restore();
  return toTexture(canvas);
}
