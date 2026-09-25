import type * as THREE from 'three';
import type { BoxDimensions } from '@/catalog/types';
import { createCanvas, toTexture } from './canvasUtils';
import { css } from './palette';

/** Longest side of the front cover in the atlas: the real covers are at most this big. */
const FRONT_PX = 512;
const MIN_SPINE_PX = 24;
/** Edge pixels repeated round each printed face so the smaller mip levels do not bleed one face into the next. */
const GUTTER_PX = 4;
const SOLID_PX = 16;

/** A column of the atlas, in pixels; every face runs the full height. */
export interface AtlasColumn {
  x: number;
  width: number;
}

/** Where each face of a closed box is painted: the printed ones, then two plain colours (top / bottom flaps, the back). */
export interface BoxAtlasLayout {
  width: number;
  height: number;
  front: AtlasColumn;
  left: AtlasColumn;
  right: AtlasColumn;
  flap: AtlasColumn;
  back: AtlasColumn;
}

/** Everything a closed box shows, as drawables and colours (linear, like `THREE.Color`). */
export interface BoxAtlasFaces {
  front: CanvasImageSource | null;
  left: CanvasImageSource | null;
  right: CanvasImageSource | null;
  flap: THREE.Color;
  back: THREE.Color;
  /** Multiplies the printed faces (a worn copy). */
  tint: THREE.Color | null;
}

export function boxAtlasLayout(dims: BoxDimensions): BoxAtlasLayout {
  const scale = FRONT_PX / Math.max(dims.width, dims.height);
  const height = Math.round(dims.height * scale);
  const spine = Math.max(MIN_SPINE_PX, Math.round(dims.depth * scale));
  let x = 0;
  const printed = (width: number): AtlasColumn => {
    const column = { x: x + GUTTER_PX, width };
    x += width + 2 * GUTTER_PX;
    return column;
  };
  const solid = (): AtlasColumn => {
    const column = { x, width: SOLID_PX };
    x += SOLID_PX;
    return column;
  };
  const front = printed(Math.round(dims.width * scale));
  const left = printed(spine);
  const right = printed(spine);
  const flap = solid();
  const back = solid();
  return { width: x, height, front, left, right, flap, back };
}

/**
 * One texture for a whole closed box (see `ClosedBox`): the front cover and both spines side by
 * side, each stretched to its face like the separate textures are, then the flaps' and the back's
 * colours. Paint it with `paintBoxAtlas`.
 */
export function createBoxAtlas(layout: BoxAtlasLayout): THREE.CanvasTexture {
  const [canvas] = createCanvas(layout.width, layout.height);
  return toTexture(canvas);
}

export function paintBoxAtlas(texture: THREE.CanvasTexture, layout: BoxAtlasLayout, faces: BoxAtlasFaces, anisotropy: number): void {
  const canvas = texture.image as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const h = layout.height;
  ctx.fillStyle = '#0d0d0f';
  ctx.fillRect(0, 0, layout.width, h);

  const printed: [AtlasColumn, CanvasImageSource | null][] = [
    [layout.front, faces.front],
    [layout.left, faces.left],
    [layout.right, faces.right],
  ];
  for (const [column, image] of printed) {
    if (image) {
      try {
        ctx.drawImage(image, column.x, 0, column.width, h);
      } catch {
        // Not decoded (or tainted): the face stays dark, as an untextured one would.
      }
    }
  }
  if (faces.tint) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = css(faces.tint);
    ctx.fillRect(0, 0, layout.flap.x, h);
    ctx.globalCompositeOperation = 'source-over';
  }
  for (const [column] of printed) {
    ctx.drawImage(canvas, column.x, 0, 1, h, column.x - GUTTER_PX, 0, GUTTER_PX, h);
    ctx.drawImage(canvas, column.x + column.width - 1, 0, 1, h, column.x + column.width, 0, GUTTER_PX, h);
  }
  ctx.fillStyle = css(faces.flap);
  ctx.fillRect(layout.flap.x, 0, layout.flap.width, h);
  ctx.fillStyle = css(faces.back);
  ctx.fillRect(layout.back.x, 0, layout.back.width, h);

  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
}
