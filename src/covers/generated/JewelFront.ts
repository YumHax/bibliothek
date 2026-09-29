import type * as THREE from 'three';
import { createCanvas, drawImageCover, toTexture } from './canvasUtils';

/** Pixels per millimetre of the drawn case. */
const PX_MM = 4;
/** A CD jewel case (mm): its size, the booklet's, and where the booklet sits (right of the hinge, centred top to bottom). */
const CASE = { w: 142, h: 125 };
const BOOKLET = { x: 19.5, y: 2.5, size: 120 };

/**
 * The front of a CD jewel case as seen: the square booklet (the cover scan) under the clear lid,
 * right of the hinge; the hinge strip down the left, the tray's black showing through its ribbed
 * plastic; a faint sheen across the lid. Replaces the scan, which the caller frees with the rest.
 */
export function jewelFront(cover: THREE.Texture, anisotropy: number): THREE.CanvasTexture {
  const w = CASE.w * PX_MM;
  const h = CASE.h * PX_MM;
  const [canvas, ctx] = createCanvas(w, h);
  ctx.fillStyle = '#121315';
  ctx.fillRect(0, 0, w, h);
  // The hinge: ribs moulded down the clear plastic.
  const hingeW = (BOOKLET.x - 2.5) * PX_MM;
  for (let x = 6; x < hingeW; x += 7) {
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(x, 0, 2, h);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(hingeW, 0, 3, h);
  const image = cover.image as CanvasImageSource | undefined;
  const bx = BOOKLET.x * PX_MM;
  const by = BOOKLET.y * PX_MM;
  const bs = BOOKLET.size * PX_MM;
  if (!image || !drawImageCover(ctx, image, bx, by, bs, bs)) {
    ctx.fillStyle = '#2a2b2e';
    ctx.fillRect(bx, by, bs, bs);
  }
  // The lid's sheen.
  const sheen = ctx.createLinearGradient(0, 0, w, h);
  sheen.addColorStop(0, 'rgba(255,255,255,0.10)');
  sheen.addColorStop(0.45, 'rgba(255,255,255,0)');
  sheen.addColorStop(1, 'rgba(255,255,255,0.05)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, w, h);
  cover.dispose();
  return toTexture(canvas, anisotropy);
}
