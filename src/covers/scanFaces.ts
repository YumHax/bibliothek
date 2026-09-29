import type * as THREE from 'three';
import type { BoxDimensions } from '@/catalog/types';
import { createCanvas, toTexture } from './generated/canvasUtils';

/** Longest side of a face drawn from a scan (px): as sharp as the generated ones. */
const MAX_SIDE = 1024;
/** A spine scan whose length / width is off the box side's by more than this factor is some other face (a top flap). */
const SPINE_ASPECT_SLACK = 1.5;
/** Alpha under this is background, when trimming a photo to what it shows. */
const ALPHA_EDGE = 16;
/** An opaque photo's background: this close to its corner's colour (per channel) counts as background. */
const COLOUR_EDGE = 26;

/**
 * Both side faces of a box from a spine scan, or null when the scan is not this box's side.
 *
 * A spine scan shows the spine as seen facing it, the box standing: text down its length. Some
 * are stored lying down (wider than tall): they are stood up again turned clockwise, since spines
 * read top to bottom (every scan examined, of every region, does). The same drawing goes on both sides unflipped: each
 * side face is seen from outside with its texture's u running to the viewer's right, so the text
 * reads right on either. A scan much longer or shorter than the side (a landscape box's spine
 * runs along its top) is not used.
 */
export function spineFacesFromScan(
  image: CanvasImageSource & { width: number; height: number },
  dims: BoxDimensions,
  anisotropy: number,
  /** Share of the side's thickness the print covers, centred (a jewel case's tray card behind clear plastic); the rest is the case's dark edge. */
  printShare = 1,
): { left: THREE.CanvasTexture; right: THREE.CanvasTexture } | null {
  const lying = image.width > image.height;
  const long = Math.max(image.width, image.height);
  const short = Math.min(image.width, image.height);
  const aspect = long / Math.max(1, short);
  const want = dims.height / (dims.depth * printShare);
  if (aspect < 3 || Math.max(aspect / want, want / aspect) > SPINE_ASPECT_SLACK) return null;

  const scale = Math.min(1, MAX_SIDE / long);
  const pw = Math.max(1, Math.round(short * scale));
  const h = Math.max(1, Math.round(long * scale));
  const w = Math.round(pw / printShare);
  const x0 = Math.round((w - pw) / 2);
  const draw = (): HTMLCanvasElement => {
    const [canvas, ctx] = createCanvas(w, h);
    if (printShare < 1) {
      ctx.fillStyle = '#161719';
      ctx.fillRect(0, 0, w, h);
    }
    if (lying) {
      // Stood up turned clockwise: spines read top to bottom (every region's scan examined does).
      ctx.translate(x0 + pw / 2, h / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(image, -h / 2, -pw / 2, h, pw);
    } else {
      ctx.drawImage(image, x0, 0, pw, h);
    }
    return canvas;
  };
  // A canvas each: the consumer disposes (and may repaint) each face on its own.
  return { left: toTexture(draw(), anisotropy), right: toTexture(draw(), anisotropy) };
}

/** Whether a spine scan's proportions are nearer a landscape box's long top than its short end. */
export function scanIsTop(image: { width: number; height: number }, dims: BoxDimensions): boolean {
  const aspect = Math.max(image.width, image.height) / Math.max(1, Math.min(image.width, image.height));
  const off = (want: number) => Math.max(aspect / want, want / aspect);
  return off(dims.width / dims.depth) < off(dims.height / dims.depth);
}

/**
 * A landscape box's top from its spine scan (a long strip, the title left to right), or null when
 * the scan is not that face. One stored standing up is laid down, turned back the way
 * `spineFacesFromScan` stands one up.
 */
export function topFaceFromScan(image: CanvasImageSource & { width: number; height: number }, dims: BoxDimensions, anisotropy: number): THREE.CanvasTexture | null {
  const standing = image.height > image.width;
  const long = Math.max(image.width, image.height);
  const short = Math.min(image.width, image.height);
  const aspect = long / Math.max(1, short);
  const want = dims.width / dims.depth;
  if (aspect < 3 || Math.max(aspect / want, want / aspect) > SPINE_ASPECT_SLACK) return null;
  const scale = Math.min(1, MAX_SIDE / long);
  const w = Math.max(1, Math.round(long * scale));
  const h = Math.max(1, Math.round(short * scale));
  const [canvas, ctx] = createCanvas(w, h);
  if (standing) {
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(image, -h / 2, -w / 2, h, w);
  } else {
    ctx.drawImage(image, 0, 0, w, h);
  }
  return toTexture(canvas, anisotropy);
}

/**
 * A cartridge photo cut to the cartridge: the transparent (or plain) margin around it trimmed, so
 * the texture spans the cartridge's front edge to edge, top of the photo up. Alpha kept.
 */
export function cartFromScan(image: CanvasImageSource & { width: number; height: number }, anisotropy: number): THREE.CanvasTexture | null {
  const trimmed = trim(image);
  return trimmed ? toTexture(trimmed, anisotropy) : null;
}

/** A disc photo trimmed to the disc and centred on a square canvas (alpha kept round it), top of the photo up. */
export function discFromScan(image: CanvasImageSource & { width: number; height: number }, anisotropy: number): THREE.CanvasTexture | null {
  const trimmed = trim(image);
  if (!trimmed) return null;
  const side = Math.max(trimmed.width, trimmed.height);
  const [canvas, ctx] = createCanvas(side, side);
  ctx.drawImage(trimmed, (side - trimmed.width) / 2, (side - trimmed.height) / 2);
  return toTexture(canvas, anisotropy);
}

/**
 * The image on a canvas (at most `MAX_SIDE`), cropped to its opaque bounding box; for a photo
 * with no transparency, to what differs from its corner's colour. Null for an empty image.
 */
function trim(image: CanvasImageSource & { width: number; height: number }): HTMLCanvasElement | null {
  const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
  const w = Math.max(1, Math.round(image.width * scale));
  const h = Math.max(1, Math.round(image.height * scale));
  const [full, fctx] = createCanvas(w, h);
  fctx.drawImage(image, 0, 0, w, h);
  let data: Uint8ClampedArray;
  try {
    data = fctx.getImageData(0, 0, w, h).data;
  } catch {
    return full; // a tainted canvas cannot be read: the photo as it is
  }
  const transparent = data[3]! < ALPHA_EDGE;
  const [cr, cg, cb] = [data[0]!, data[1]!, data[2]!];
  const isBackground = (i: number): boolean =>
    transparent ? data[i + 3]! < ALPHA_EDGE : Math.abs(data[i]! - cr) < COLOUR_EDGE && Math.abs(data[i + 1]! - cg) < COLOUR_EDGE && Math.abs(data[i + 2]! - cb) < COLOUR_EDGE;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isBackground((y * w + x) * 4)) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < x0 || y1 < y0) return null;
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  if (cw === w && ch === h) return full;
  const [canvas, ctx] = createCanvas(cw, ch);
  ctx.drawImage(full, x0, y0, cw, ch, 0, 0, cw, ch);
  return canvas;
}
