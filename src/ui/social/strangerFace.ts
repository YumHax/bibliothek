import { createCanvas } from '@/graphics/canvas';
import { randomLook } from '@/world/people/looks';
import { paintFace, type Expression } from './face';

const cache = new Map<string, HTMLCanvasElement>();

/**
 * A face for someone the town keeps no card on (a shopkeeper, the taxi driver, the Christmas stall's keeper), painted
 * like the roster's (`face.ts`) from the look seed their walker wears, so the face on the panel is the one in the
 * street. Drawn at the screen's density, cached per seed and expression; each call hands back a copy (a canvas
 * stands in one place only). `size` is in CSS pixels.
 */
export function strangerFace(seed: number, size: number, backdrop: string, expression: Expression = 'rest'): HTMLCanvasElement {
  const density = Math.min(3, Math.max(1, Math.round((globalThis.devicePixelRatio ?? 1) * 2) / 2));
  const px = Math.round(size * density);
  const key = `${seed}:${px}:${backdrop}:${expression}`;
  let painted = cache.get(key);
  if (!painted) {
    const [canvas, g] = createCanvas(px, px);
    paintFace(g, px, randomLook(seed, 'vendor'), backdrop, expression);
    painted = canvas;
    cache.set(key, painted);
  }
  const [copy, g] = createCanvas(px, px);
  g.drawImage(painted, 0, 0);
  copy.className = 'stranger-face';
  copy.style.setProperty('--size', `${size}px`);
  copy.setAttribute('aria-hidden', 'true');
  return copy;
}
