import type * as THREE from 'three';
import { hashString, seededRandom } from '@/graphics/canvas';

// The generic helpers live in `graphics/canvas`; re-exported so every drawing module keeps importing from here.
export { createCanvas, hashString, seededRandom, toTexture } from '@/graphics/canvas';

/** Word-wraps `text` and returns the lines that fit; the last line is ellipsised if `maxLines` is hit. */
export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = Infinity): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (ctx.measureText(last + '…').width > maxWidth && last.length > 0) last = last.slice(0, -1);
    kept[maxLines - 1] = last.trimEnd() + '…';
    return kept;
  }
  return lines;
}

/** Shrinks the font size until `text` fits `maxWidth`. Returns the size used. */
export function fitFontSize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startPx: number, minPx: number, family: string, weight = 'bold'): number {
  let size = startPx;
  ctx.font = `${weight} ${size}px ${family}`;
  while (ctx.measureText(text).width > maxWidth && size > minPx) {
    size -= 1;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  return size;
}

/** Gold "seal of quality" style roundel used on spine and back. `text` (words) is written inside, one per line. */
export function drawSeal(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, text?: string): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#d4a52a';
  ctx.fill();
  ctx.lineWidth = Math.max(1, radius * 0.12);
  ctx.strokeStyle = '#8a6a12';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.7, 0, Math.PI * 2);
  ctx.strokeStyle = '#f3dc8a';
  ctx.lineWidth = Math.max(1, radius * 0.06);
  ctx.stroke();
  if (text) {
    const words = text.split(/\s+/);
    const size = Math.max(6, Math.round(radius * 0.32));
    ctx.font = `bold ${size}px ${FONT}`;
    ctx.fillStyle = '#4a3506';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const startY = cy - ((words.length - 1) * size * 1.05) / 2;
    words.forEach((word, i) => ctx.fillText(word.toUpperCase(), cx, startY + i * size * 1.05));
  }
  ctx.restore();
}

/** Adds a rounded-rectangle path (no fill / stroke). */
export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Pixel size of a drawable image source, or null when unknown (e.g. an image still loading). */
export function imageSize(img: CanvasImageSource): { width: number; height: number } | null {
  if (img instanceof HTMLImageElement) return img.naturalWidth > 0 ? { width: img.naturalWidth, height: img.naturalHeight } : null;
  if (img instanceof HTMLVideoElement) return img.videoWidth > 0 ? { width: img.videoWidth, height: img.videoHeight } : null;
  const { width, height } = img as { width: number | SVGAnimatedLength; height: number | SVGAnimatedLength };
  if (typeof width === 'number' && typeof height === 'number' && width > 0 && height > 0) return { width, height };
  return null;
}

/**
 * Draws `img` scaled to fill the rectangle, cropping the overflow (CSS `object-fit: cover`).
 * Returns false when the image could not be drawn (tainted or not yet decoded).
 */
export function drawImageCover(ctx: CanvasRenderingContext2D, img: CanvasImageSource, x: number, y: number, w: number, h: number): boolean {
  const size = imageSize(img);
  if (!size) return false;
  const scale = Math.max(w / size.width, h / size.height);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (size.width - sw) / 2;
  const sy = (size.height - sh) / 2;
  try {
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
    return true;
  } catch {
    return false;
  }
}

/** The drawable behind a texture, when it is something a 2D canvas can consume. */
export function imageSourceOf(texture: THREE.Texture | null | undefined): CanvasImageSource | null {
  const image: unknown = texture?.image;
  if (image instanceof HTMLImageElement) return image.complete && image.naturalWidth > 0 ? image : null;
  if (image instanceof HTMLCanvasElement) return image;
  if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) return image;
  return null;
}

/** A fake EAN-style barcode on a white patch: guard bars, pseudo-random modules and 13 digits derived from `seed`. */
export function drawBarcode(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: string): void {
  const rand = seededRandom(hashString(seed));
  ctx.save();
  ctx.fillStyle = '#f7f7f5';
  roundRect(ctx, x, y, w, h, 3);
  ctx.fill();

  const pad = Math.round(w * 0.06);
  const digitH = Math.max(8, Math.round(h * 0.24));
  const barsTop = y + pad;
  const barsH = h - pad * 2 - digitH;
  const modules = 95;
  const module = (w - pad * 2) / modules;
  const guards = new Set([0, 2, 46, 48, 92, 94]);
  ctx.fillStyle = '#111';
  for (let i = 0; i < modules; i++) {
    const guard = guards.has(i);
    if (!guard && rand() < 0.5) continue;
    if (!guard && (i === 1 || i === 47 || i === 93)) continue;
    const extra = guard ? digitH * 0.55 : 0;
    ctx.fillRect(x + pad + i * module, barsTop, Math.max(1, module * 0.95), barsH + extra);
  }

  const digits = Array.from({ length: 13 }, () => Math.floor(rand() * 10)).join('');
  ctx.font = `${digitH}px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  // Leading digit in the left padding, then one group under each half of the bars.
  const groups = [digits.slice(0, 1), digits.slice(1, 7), digits.slice(7, 13)];
  const centres = [x + pad * 0.5, x + pad + module * 24, x + pad + module * 70];
  groups.forEach((g, i) => ctx.fillText(g, centres[i], y + h - pad * 0.6));
  ctx.restore();
}

export const FONT = 'system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif';
export const MONO = 'ui-monospace, Menlo, Consolas, "Courier New", monospace';
