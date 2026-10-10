import type * as THREE from 'three';
import type { BoxDimensions } from '@/catalog/types';
import { createCanvas, toTexture } from './canvasUtils';
import { lcg } from '@/random';
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

/**
 * Where each face of a closed box is painted: the printed ones, then two plain colours (top / bottom
 * flaps, the back). A landscape box also prints its `top` (its spine runs there, top and bottom).
 */
export interface BoxAtlasLayout {
  width: number;
  height: number;
  front: AtlasColumn;
  left: AtlasColumn;
  right: AtlasColumn;
  top: AtlasColumn | null;
  flap: AtlasColumn;
  back: AtlasColumn;
}

/** Everything a closed box shows, as drawables and colours (linear, like `THREE.Color`). */
export interface BoxAtlasFaces {
  front: CanvasImageSource | null;
  left: CanvasImageSource | null;
  right: CanvasImageSource | null;
  /** A landscape box's top and bottom (its spine); ignored when the layout has no `top`. */
  top?: CanvasImageSource | null;
  flap: THREE.Color;
  back: THREE.Color;
  /** Multiplies the printed faces (a worn copy). */
  tint: THREE.Color | null;
  /**
   * Handling marks on the printed faces (`paintWear`): `amount` 0 (sealed, none) to 1 (a worn copy: whitened edges,
   * scuffed corners, a crease), `cardboard` for card (whitens and creases) rather than a plastic case's sleeve (a light
   * rim where the case's rounded edge catches the light), `seed` which marks.
   */
  wear?: { amount: number; cardboard: boolean; seed: number };
  /** 0..1: a film of dust on the flaps (seen on the top of a box on a high shelf). */
  dust?: number;
}

export function boxAtlasLayout(dims: BoxDimensions, printedTop = false): BoxAtlasLayout {
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
  // The top is drawn across a column like the others (its uvs stretch it back): as wide as the front, it keeps its pixels.
  const top = printedTop ? printed(Math.round(dims.width * scale)) : null;
  const flap = solid();
  const back = solid();
  return { width: x, height, front, left, right, top, flap, back };
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
    ...(layout.top ? [[layout.top, faces.top ?? null] as [AtlasColumn, CanvasImageSource | null]] : []),
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
  if (faces.wear) for (const [column, image] of printed) if (image) paintWear(ctx, column, h, faces.wear);
  for (const [column] of printed) {
    ctx.drawImage(canvas, column.x, 0, 1, h, column.x - GUTTER_PX, 0, GUTTER_PX, h);
    ctx.drawImage(canvas, column.x + column.width - 1, 0, 1, h, column.x + column.width, 0, GUTTER_PX, h);
  }
  ctx.fillStyle = css(faces.flap);
  ctx.fillRect(layout.flap.x, 0, layout.flap.width, h);
  if (faces.dust) {
    ctx.fillStyle = `rgba(190,184,172,${(0.35 * Math.min(1, faces.dust)).toFixed(3)})`;
    ctx.fillRect(layout.flap.x, 0, layout.flap.width, h);
  }
  ctx.fillStyle = css(faces.back);
  ctx.fillRect(layout.back.x, 0, layout.back.width, h);

  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
}

/**
 * Handling marks painted over one printed face (a column runs the face's full height; its left and right edges are the
 * box's vertical edges, its top and bottom rows the horizontal ones): card whitens along the edges where the print
 * rubbed off, more at the corners, with a crease or two across; a plastic case's sleeve gets a thin light rim instead
 * (the case's rounded edge catching the light: a bevel the single box of the atlas cannot have).
 */
function paintWear(ctx: CanvasRenderingContext2D, column: AtlasColumn, h: number, wear: { amount: number; cardboard: boolean; seed: number }): void {
  const { x, width: w } = column;
  const random = lcg((wear.seed ^ (x * 7919)) >>> 0);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, 0, w, h);
  ctx.clip();
  if (!wear.cardboard) {
    // The rim: a pixel or two of light along every edge, whatever the copy's state.
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, 1, w - 2, h - 2);
    ctx.restore();
    return;
  }
  const amount = wear.amount;
  if (amount <= 0) {
    ctx.restore();
    return;
  }
  // Rubbed edges: short pale dashes along each edge, denser as the copy is more worn.
  ctx.fillStyle = `rgba(245,240,228,${(0.25 + 0.45 * amount).toFixed(3)})`;
  const along = (length: number, put: (at: number, size: number) => void): void => {
    const count = Math.round((4 + 26 * amount) * (length / 256));
    for (let i = 0; i < count; i++) put(random() * length, 2 + random() * (8 + 30 * amount));
  };
  const thick = (): number => 1 + random() * (1 + 2 * amount);
  along(h, (at, size) => ctx.fillRect(x, at, thick(), size));
  along(h, (at, size) => {
    const t = thick();
    ctx.fillRect(x + w - t, at, t, size);
  });
  along(w, (at, size) => ctx.fillRect(x + at, 0, size, thick()));
  along(w, (at, size) => {
    const t = thick();
    ctx.fillRect(x + at, h - t, size, t);
  });
  // Corners: a soft pale scuff where the box is picked up and put down.
  for (const [cx, cy] of [
    [x, 0],
    [x + w, 0],
    [x, h],
    [x + w, h],
  ] as const) {
    if (random() > 0.35 + 0.6 * amount) continue;
    const r = (3 + random() * 10) * (0.5 + amount);
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    glow.addColorStop(0, `rgba(248,244,234,${(0.35 + 0.4 * amount).toFixed(3)})`);
    glow.addColorStop(1, 'rgba(248,244,234,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  }
  // A crease or two across a wide face: a pale line with a dark one beside it (the fold's lit and shaded sides).
  if (w > 64) {
    const creases = amount > 0.6 ? 1 + Math.floor(random() * 2) : random() < amount ? 1 : 0;
    for (let i = 0; i < creases; i++) {
      const fromLeft = random() < 0.5;
      const y0 = random() * h;
      const y1 = y0 + (random() - 0.5) * h * 0.3;
      const x0 = fromLeft ? x : x + w;
      const x1 = x + w * (fromLeft ? 0.2 + random() * 0.4 : 0.4 + random() * 0.4);
      for (const [offset, colour] of [
        [0, `rgba(250,246,236,${(0.3 + 0.3 * amount).toFixed(3)})`],
        [1.5, `rgba(0,0,0,${(0.12 + 0.12 * amount).toFixed(3)})`],
      ] as const) {
        ctx.strokeStyle = colour;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0, y0 + offset);
        ctx.lineTo(x1, y1 + offset);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}
