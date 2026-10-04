import * as THREE from 'three';
import { createCanvas, toTexture, repeatTexture } from '@/covers/generated/canvasUtils';
import { fabric } from '@/world/materials/finishes';
import { shared } from '../materials/palette';

/**
 * Shared painting and layout helpers of the market's stall styles (`GlassCaseStall`,
 * `BlanketStall`, `RiserStall`): the platform sign, the gingham cloth, a tiled material, a row
 * of box positions filled centre outwards.
 */

/** The sign is painted at this height and text size, and grows with its text (never narrower than `SIGN_MIN_PX`). */
const SIGN_H_PX = 200;
const SIGN_FONT_PX = 84;
const SIGN_PAD_PX = 50;
const SIGN_MIN_PX = 620;
const SIGN_PAPER = '#f4ecd8';
const SIGN_INK = '#2a1a10';

interface StallSignOptions {
  /** Pixels per metre: the sign's size in the world (MarketStall's is 1000, a small shop card more). */
  pxPerMetre?: number;
  /** A frame all round in this colour (the glass case's brass) instead of the two accent bands only. */
  border?: string;
}

/** A painted sign as wide as its text needs: its texture and its size in metres. */
interface StallSign {
  map: THREE.Texture;
  width: number;
  height: number;
}

/** The platform sign: cream board, accent bands top and bottom, the text in a bold serif. */
export function paintStallSign(text: string, accent: number, options: StallSignOptions = {}): StallSign {
  const pxPerMetre = options.pxPerMetre ?? 1000;
  const [measure] = createCanvas(1, 1);
  const mctx = measure.getContext('2d')!;
  mctx.font = `bold ${SIGN_FONT_PX}px Georgia, serif`;
  const W = Math.max(SIGN_MIN_PX, Math.ceil(mctx.measureText(text).width) + 2 * SIGN_PAD_PX);
  const H = SIGN_H_PX;
  const [canvas, ctx] = createCanvas(W, H);
  ctx.fillStyle = SIGN_PAPER;
  ctx.fillRect(0, 0, W, H);
  const band = options.border ? 34 : 16;
  ctx.fillStyle = `#${new THREE.Color(accent).getHexString()}`;
  ctx.fillRect(0, 0, W, band);
  ctx.fillRect(0, H - band, W, band);
  if (options.border) {
    ctx.strokeStyle = options.border;
    ctx.lineWidth = 16;
    ctx.strokeRect(8, 8, W - 16, H - 16);
  }
  ctx.fillStyle = SIGN_INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${SIGN_FONT_PX}px Georgia, serif`;
  ctx.fillText(text, W / 2, H / 2);
  return { map: toTexture(canvas, 'facing'), width: W / pxPerMetre, height: H / pxPerMetre };
}

/** Gingham: the cloth colour crossed by paler bands, one tile = 0.5 m of cloth. */
export function paintGingham(cloth: THREE.Color): THREE.Texture {
  const S = 256;
  const [canvas, ctx] = createCanvas(S, S);
  ctx.fillStyle = `#${cloth.getHexString()}`;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = 'rgba(255,245,225,0.22)';
  const cell = S / 8;
  for (let i = 0; i < 8; i += 2) {
    ctx.fillRect(i * cell, 0, cell, S);
    ctx.fillRect(0, i * cell, S, cell);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.07)';
  for (let y = 0; y < S; y += 3) ctx.fillRect(0, y, S, 1);
  return toTexture(canvas, 'facing');
}

/** A plain woollen or cotton cloth of `color` (velvet lining, clothes, a stool's seat): one shared material per colour. */
export function plainCloth(color: number, roughness = 0.95): THREE.MeshStandardMaterial {
  return shared(`fabric|${color}|${roughness}`, () => fabric({ color, roughness }));
}

/** A material carrying `map` repeated `u` x `v` times over its face (its own clone of the texture). */
export function tiledMaterial(map: THREE.Texture, u: number, v: number, roughness = 0.95): THREE.MeshStandardMaterial {
  const tex = map.clone();
  repeatTexture(tex);
  tex.repeat.set(u, v);
  tex.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ map: tex, roughness });
}

/** Boxes `boxWidth` wide, `gap` apart, that fit in a run `length` long with `margin` kept free at either end. */
export function fitInRow(length: number, boxWidth: number, gap: number, margin: number): number {
  return Math.max(0, Math.floor((length - 2 * margin + gap) / (boxWidth + gap)));
}

/** `n` centres `pitch` apart about x = 0, in filling order: the middle first, then alternately left and right. */
export function centreOutRow(n: number, pitch: number): number[] {
  return Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * pitch).sort((a, b) => Math.abs(a) - Math.abs(b) || a - b);
}

/** `n` centres `pitch` apart about x = 0, left to right. */
export function evenRow(n: number, pitch: number): number[] {
  return Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * pitch);
}
