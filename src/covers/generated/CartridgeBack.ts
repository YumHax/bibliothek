import type * as THREE from 'three';
import type { Game } from '@/catalog/types';
import { productCode } from '@/catalog/productCode';
import { fnv1a } from '@/random';
import { layoutCanvas, toTexture, FONT } from './canvasUtils';

/** Layout width: every size below is in these units. */
const WIDTH = 200;
/** The canvas's longest side (px): read up close with the cartridge turned over in hand (only it draws one). */
const LONG_PX = 768;

/**
 * The sticker on a cartridge's back, seen when it is turned over in the hand (`GameBox.turnLifted`): silver-grey,
 * where it was made, the product code, a serial number, the patents and the care line, in small black type.
 */
export function createCartridgeBackTexture(game: Game, aspect: number): THREE.CanvasTexture {
  const w = WIDTH;
  const h = Math.max(20, Math.round(WIDTH / aspect));
  const [canvas, ctx] = layoutCanvas(w, h, LONG_PX);
  ctx.fillStyle = '#d7d8d6';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#8f908d';
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, w - 8, h - 8);
  const made = /japan/i.test(game.region ?? '') || game.platform !== 'ps1' ? 'MADE IN JAPAN' : 'MADE IN U.S.A.';
  const serial = `S/N ${String(fnv1a(`${game.id}|serial`) % 100000000).padStart(8, '0')}`;
  const lines: [string, number, string][] = [
    [made, 0.2, 'bold'],
    [productCode(game), 0.14, 'bold'],
    [serial, 0.11, ''],
    ['PAT. PEND.  DO NOT TOUCH THE TERMINALS', 0.075, ''],
  ];
  ctx.fillStyle = '#1b1b1b';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Spaced so the last line's foot stays inside the border (a wide, low sticker is about 105 units tall).
  let y = h * 0.17;
  for (const [text, share, weight] of lines) {
    ctx.font = `${weight ? `${weight} ` : ''}${Math.max(6, Math.round(h * share))}px ${FONT}`;
    ctx.fillText(text, w / 2, y, w - 16);
    y += h * share * 1.35 + h * 0.025;
  }
  return toTexture(canvas, 'facing');
}
