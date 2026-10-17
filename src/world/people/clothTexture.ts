import * as THREE from 'three';
import { createCanvas, roundRect, toTexture, repeatTexture } from '@/covers/generated/canvasUtils';
import type { PersonLook } from './looks';
import { cachedTexture } from './textureCache';
import { fnv1a, lcg } from '@/random';
import { smooth } from '@/math/scalar';


/*
 * The one canvas a person wears: the torso's texture, painted once from the look. The trunk's
 * seam is at the back, so u = 0.5 is the middle of the chest; v runs from the bottom
 * of the hips (0) to the neck (1) and rows are evenly spaced in height. Below `waistV` it is the
 * trousers (with the belt on the line); above, the top: a plain tee with a print, stripes, a
 * check, a hoodie with its pocket and strings, a jacket open over a shirt, a buttoned shirt; and
 * the stallholder's apron over any of them. The trousers get their seams and pockets, and
 * `finish` adds what makes paint read as fabric. `paintCloth` is the small tile the sleeves and
 * trouser legs wear. Both are shared by every look with the same values for them (`cachedTexture`),
 * the weave's flecks drawn from a random seeded by those values.
 */

/** The painter reads its pixels back (`getImageData`): its canvas kept in memory, not on the GPU (`createCanvas`). */
const READ_BACK: CanvasRenderingContext2DSettings = { willReadFrequently: true };

const W = 512;
const H = 512;

export function paintTorso(look: PersonLook, waistV: number): THREE.CanvasTexture {
  const key = ['torso', look.top, look.topColor, look.topAccent, look.trousers, look.apron ?? '', waistV].join('|');
  return cachedTexture(key, () => torso(look, waistV, lcg(fnv1a(key))));
}

/** Where an untucked top ends on the trunk (its v, the texture's height from the bottom), a third of the way from the waist down to the hips. */
export function untuckedHemV(waistV: number): number {
  return 0.65 * waistV;
}

function torso(look: PersonLook, waistV: number, random: () => number): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(W, H, READ_BACK);
  const waistY = (1 - waistV) * H;
  // Trousers and belt first: an untucked top is painted over them below.
  paintTrousers(ctx, look, waistY);
  const tucked = look.top === 'shirt' || look.top === 'jacket';
  const hemY = tucked ? waistY - 1 : (1 - untuckedHemV(waistV)) * H;
  TOPS[look.top](ctx, hemY, { look, base: css(look.topColor), accent: css(look.topAccent), shade: css(darken(look.topColor, 0.75)) });
  // An untucked top's hem: its stitching or ribbed band (the hem's own band stands over it, `garmentEdges`), and its shadow.
  if (!tucked) {
    paintHem(ctx, look, hemY);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, hemY, W, 6);
  }
  if (look.apron !== undefined) paintApron(ctx, look.apron, waistY);
  finish(ctx, look.top === 'tee' || look.top === 'stripes', random);
  return toTexture(canvas, 'facing');
}

/** The trousers below the waist, the belt on the line (buckle, loops), and the seams: the fly, the front pockets, the sides, the seat. */
function paintTrousers(ctx: CanvasRenderingContext2D, look: PersonLook, waistY: number): void {
  ctx.fillStyle = css(look.trousers);
  ctx.fillRect(0, waistY, W, H - waistY);
  ctx.fillStyle = css(darken(look.trousers, 0.7));
  ctx.fillRect(0, waistY - 5, W, 10);
  ctx.fillStyle = '#c9b48a';
  ctx.fillRect(W / 2 - 8, waistY - 6, 16, 12);
  ctx.fillStyle = css(darken(look.trousers, 0.85));
  for (const u of [0.1, 0.3, 0.42, 0.58, 0.7, 0.9]) ctx.fillRect(W * u - 3, waistY - 7, 6, 14);
  ctx.strokeStyle = css(darken(look.trousers, 0.65));
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W * 0.5 + 10, waistY + 4);
  ctx.lineTo(W * 0.5 + 10, waistY + (H - waistY) * 0.55);
  ctx.quadraticCurveTo(W * 0.5 + 8, waistY + (H - waistY) * 0.7, W * 0.5, waistY + (H - waistY) * 0.75);
  for (const side of [-1, 1]) {
    ctx.moveTo(W * (0.5 + side * 0.13), waistY + 4);
    ctx.quadraticCurveTo(W * (0.5 + side * 0.15), waistY + (H - waistY) * 0.3, W * (0.5 + side * 0.24), waistY + (H - waistY) * 0.36);
  }
  for (const u of [0.25, 0.75]) {
    ctx.moveTo(W * u, waistY + 4);
    ctx.lineTo(W * u, H);
  }
  ctx.moveTo(1, waistY + 4);
  ctx.lineTo(1, H);
  ctx.stroke();
  // Stitching beside each seam (gold on jeans), and the back pockets on the seat.
  stitch(ctx, isDenim(look.trousers) ? 'rgba(214,150,62,0.85)' : thread(look.trousers), () => {
    ctx.moveTo(0, waistY + 8);
    ctx.lineTo(W, waistY + 8);
    ctx.moveTo(W * 0.5 + 17, waistY + 9);
    ctx.lineTo(W * 0.5 + 17, waistY + (H - waistY) * 0.52);
    ctx.quadraticCurveTo(W * 0.5 + 15, waistY + (H - waistY) * 0.7, W * 0.5 + 2, waistY + (H - waistY) * 0.74);
    for (const side of [-1, 1]) {
      ctx.moveTo(W * (0.5 + side * 0.13) + side * 6, waistY + 9);
      ctx.quadraticCurveTo(W * (0.5 + side * 0.15) + side * 5, waistY + (H - waistY) * 0.3 - 4, W * (0.5 + side * 0.24), waistY + (H - waistY) * 0.36 - 7);
    }
    for (const u of [0.25, 0.75]) {
      ctx.moveTo(W * u + 4, waistY + 9);
      ctx.lineTo(W * u + 4, H);
    }
  });
  for (const u of [0.085, 0.915]) {
    const x = W * u;
    const top = waistY + 16;
    const pocket = (inset: number): void => {
      ctx.moveTo(x - 26 + inset, top + inset);
      ctx.lineTo(x + 26 - inset, top + inset);
      ctx.lineTo(x + 24 - inset, top + 50 - inset);
      ctx.lineTo(x, top + 58 - inset * 1.4);
      ctx.lineTo(x - 24 + inset, top + 50 - inset);
      ctx.closePath();
    };
    ctx.strokeStyle = css(darken(look.trousers, 0.68));
    ctx.lineWidth = 2;
    ctx.beginPath();
    pocket(0);
    ctx.stroke();
    stitch(ctx, isDenim(look.trousers) ? 'rgba(214,150,62,0.85)' : thread(look.trousers), () => pocket(4));
  }
}

/** The look and its colours as CSS, for a top's painter. */
interface TopPaint {
  look: PersonLook;
  base: string;
  accent: string;
  shade: string;
}

/** A top's painter: the garment from the neck (0) down to `hemY`. */
type TopPainter = (ctx: CanvasRenderingContext2D, hemY: number, paint: TopPaint) => void;

/** Each kind of top: adding one is one entry. */
const TOPS: Record<PersonLook['top'], TopPainter> = {
  tee: paintTee,
  stripes: paintStripes,
  flannel: paintFlannel,
  hoodie: paintHoodie,
  jacket: paintJacket,
  shirt: paintShirt,
};

/** A plain tee with a print on the chest: a disc or a bar, once in three nothing. */
function paintTee(ctx: CanvasRenderingContext2D, hemY: number, { look, base, accent }: TopPaint): void {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, hemY);
  if ((look.topColor ^ look.topAccent) % 3 === 0) return;
  ctx.fillStyle = accent;
  if ((look.topColor ^ look.topAccent) % 2) {
    ctx.beginPath();
    ctx.arc(W / 2, H * 0.34, W * 0.075, 0, Math.PI * 2);
    ctx.fill();
  } else {
    roundRect(ctx, W * 0.4, H * 0.3, W * 0.2, H * 0.09, 8);
    ctx.fill();
  }
  // The print worn by the wash: specks of the tee showing through it.
  const random = lcg(look.topColor ^ (look.topAccent << 1));
  ctx.fillStyle = withAlpha(look.topColor, 0.55);
  for (let i = 0; i < 260; i++) ctx.fillRect(W * (0.4 + random() * 0.2), H * (0.27 + random() * 0.14), 1 + random() * 1.5, 1 + random());
}

/** Horizontal stripes in the accent. */
function paintStripes(ctx: CanvasRenderingContext2D, hemY: number, { base, accent }: TopPaint): void {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, hemY);
  ctx.fillStyle = accent;
  const band = H / 14;
  for (let y = H * 0.1; y < hemY; y += band * 2) ctx.fillRect(0, y, W, Math.min(band, hemY - y));
}

/** A check: wide translucent bands both ways, fine dark lines through them, a button placket down the front. */
function paintFlannel(ctx: CanvasRenderingContext2D, hemY: number, { look, base, shade }: TopPaint): void {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, hemY);
  ctx.fillStyle = withAlpha(look.topAccent, 0.35);
  const cell = W / 8;
  for (let x = cell / 2; x < W; x += cell) ctx.fillRect(x - 10, 0, 20, hemY);
  for (let y = cell / 2; y < hemY; y += cell) ctx.fillRect(0, y - 10, W, Math.min(20, hemY - y + 10));
  ctx.fillStyle = withAlpha(darken(look.topColor, 0.6), 0.5);
  for (let x = cell / 2; x < W; x += cell) ctx.fillRect(x - 2, 0, 4, hemY);
  for (let y = cell / 2; y < hemY; y += cell) ctx.fillRect(0, y - 2, W, 4);
  ctx.fillStyle = shade;
  ctx.fillRect(W / 2 - 2, 0, 4, hemY);
}

/** A hoodie: the kangaroo pocket as a darker outline with its slanted openings, the drawstrings from the hood. */
function paintHoodie(ctx: CanvasRenderingContext2D, hemY: number, { base, shade }: TopPaint): void {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, hemY);
  ctx.strokeStyle = shade;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(W * 0.36, hemY - H * 0.02);
  ctx.lineTo(W * 0.36, H * 0.6);
  ctx.lineTo(W * 0.42, H * 0.52);
  ctx.moveTo(W * 0.64, hemY - H * 0.02);
  ctx.lineTo(W * 0.64, H * 0.6);
  ctx.lineTo(W * 0.58, H * 0.52);
  ctx.stroke();
  ctx.strokeStyle = '#efece6';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(W * 0.46, H * 0.06);
  ctx.lineTo(W * 0.45, H * 0.3);
  ctx.moveTo(W * 0.54, H * 0.06);
  ctx.lineTo(W * 0.555, H * 0.3);
  ctx.stroke();
}

/** A jacket open over a shirt: the shirt shows in a strip down the middle, the jacket's edges and lapels frame it. */
function paintJacket(ctx: CanvasRenderingContext2D, hemY: number, { look, base, accent, shade }: TopPaint): void {
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, hemY);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W * 0.43, hemY);
  ctx.fillRect(W * 0.57, 0, W * 0.43, hemY);
  // Lapels: a wedge each side opening towards the neck.
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.moveTo(W * 0.43, H * 0.32);
  ctx.lineTo(W * 0.43, 0);
  ctx.lineTo(W * 0.35, 0);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(W * 0.57, H * 0.32);
  ctx.lineTo(W * 0.57, 0);
  ctx.lineTo(W * 0.65, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shade;
  ctx.fillRect(W * 0.43 - 3, 0, 6, hemY);
  ctx.fillRect(W * 0.57 - 3, 0, 6, hemY);
  // The front edges stitched, and down the lapels.
  stitch(ctx, thread(look.topColor), () => {
    ctx.moveTo(W * 0.43 - 9, H * 0.32);
    ctx.lineTo(W * 0.43 - 9, hemY);
    ctx.moveTo(W * 0.57 + 9, H * 0.32);
    ctx.lineTo(W * 0.57 + 9, hemY);
    ctx.moveTo(W * 0.43 - 4, H * 0.3);
    ctx.lineTo(W * 0.355 + 4, 0);
    ctx.moveTo(W * 0.57 + 4, H * 0.3);
    ctx.lineTo(W * 0.645 - 4, 0);
  });
}

/** A buttoned shirt: the placket, its buttons, a breast pocket. */
function paintShirt(ctx: CanvasRenderingContext2D, hemY: number, { look, base, shade }: TopPaint): void {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, hemY);
  ctx.fillStyle = shade;
  ctx.fillRect(W / 2 - 10, 0, 20, hemY);
  ctx.fillStyle = base;
  ctx.fillRect(W / 2 - 6, 0, 12, hemY);
  // Buttons: a shadow under each, the face, two holes.
  for (let y = H * 0.12; y < hemY - 12; y += H * 0.11) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.arc(W / 2 + 0.8, y + 1.2, 4.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e9e4d8';
    ctx.beginPath();
    ctx.arc(W / 2, y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(60,50,40,0.55)';
    ctx.fillRect(W / 2 - 2, y - 0.6, 1.2, 1.2);
    ctx.fillRect(W / 2 + 0.8, y - 0.6, 1.2, 1.2);
  }
  ctx.strokeStyle = shade;
  ctx.lineWidth = 4;
  ctx.strokeRect(W * 0.6, H * 0.24, W * 0.12, H * 0.12);
  stitch(ctx, thread(look.topColor), () => {
    ctx.rect(W * 0.6 + 5, H * 0.24 + 5, W * 0.12 - 10, H * 0.12 - 10);
    ctx.moveTo(W / 2 - 12, 0);
    ctx.lineTo(W / 2 - 12, hemY);
    ctx.moveTo(W / 2 + 12, 0);
    ctx.lineTo(W / 2 + 12, hemY);
  });
}

/** The stallholder's apron over the top: bib, the skirt below the waist, the straps up to the neck, the waist ties round the back, a pocket and a wear line. */
function paintApron(ctx: CanvasRenderingContext2D, colour: number, waistY: number): void {
  const apron = css(colour);
  ctx.fillStyle = apron;
  ctx.fillRect(W * 0.41, H * 0.2, W * 0.18, H * 0.3);
  ctx.fillRect(W * 0.34, H * 0.48, W * 0.32, H - H * 0.48);
  ctx.strokeStyle = apron;
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(W * 0.43, H * 0.2);
  ctx.lineTo(W * 0.46, 0);
  ctx.moveTo(W * 0.57, H * 0.2);
  ctx.lineTo(W * 0.54, 0);
  ctx.stroke();
  ctx.fillRect(0, waistY - 8, W, 10);
  ctx.strokeStyle = css(darken(colour, 0.7));
  ctx.lineWidth = 4;
  ctx.strokeRect(W * 0.4, H * 0.62, W * 0.2, H * 0.14);
}

/** An untucked top's hem: a hoodie's ribbed waistband, or a twin row of stitching above a turned hem. */
function paintHem(ctx: CanvasRenderingContext2D, look: PersonLook, hemY: number): void {
  if (look.top === 'hoodie') {
    const band = 34;
    for (let x = 0; x < W; x += 4) {
      ctx.fillStyle = 'rgba(0,0,0,0.13)';
      ctx.fillRect(x, hemY - band, 1.5, band);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(x + 2, hemY - band, 1, band);
    }
    seam(ctx, hemY - band);
    return;
  }
  stitch(ctx, thread(look.topColor), () => {
    for (const y of [hemY - 13, hemY - 17]) {
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
    }
  });
}

/** A row of stitches along whatever `path` draws (a fine dashed thread). */
function stitch(ctx: CanvasRenderingContext2D, colour: string, path: () => void): void {
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1.3;
  ctx.setLineDash([4, 2.5]);
  ctx.lineCap = 'butt';
  ctx.beginPath();
  path();
  ctx.stroke();
  ctx.restore();
}

/** A sewn seam across at `y`: the shadowed fold and the light catching the ridge beside it. */
function seam(ctx: CanvasRenderingContext2D, y: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(0, y - 1, W, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, y + 1, W, 2);
}

/** The thread a garment of `color` is sewn with: its own colour, a shade lighter, half seen. */
function thread(color: number): string {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  const lift = (c: number): number => Math.min(255, Math.round(c * 1.3 + 22));
  return `rgba(${lift(r)},${lift(g)},${lift(b)},0.45)`;
}

/**
 * What makes paint read as cloth: side seams and a neckline, soft folds where the fabric bunches
 * (at the waist, under the arms), and a fine weave of noise over everything.
 */
function finish(ctx: CanvasRenderingContext2D, ribbedNeck: boolean, random: () => number): void {
  // Side seams: the fold in shadow, the ridge beside it catching the light.
  for (const u of [0.25, 0.75]) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(W * u - 1, 0, 2, H);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(W * u + 1, 0, 2, H);
  }
  // Worn paler where it rubs: the front of the chest and belly, across the shoulder blades.
  for (const [u, v, r] of [[0.5, 0.32, 0.16], [0.5, 0.62, 0.12], [0.08, 0.25, 0.1], [0.92, 0.25, 0.1]] as const) {
    const wear = ctx.createRadialGradient(W * u, H * v, 0, W * u, H * v, W * r);
    wear.addColorStop(0, 'rgba(255,255,255,0.045)');
    wear.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = wear;
    ctx.fillRect(0, 0, W, H);
  }
  if (ribbedNeck) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(0, 0, W, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, 5, W, 5);
  }
  // Folds: faint diagonal creases fanning from the armpits and bunching above the belt.
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      ctx.strokeStyle = `rgba(0,0,0,${0.05 + 0.02 * (k % 2)})`;
      ctx.lineWidth = 6 + k * 2;
      ctx.beginPath();
      ctx.moveTo(W * (0.5 + side * 0.24), H * (0.2 + k * 0.03));
      ctx.quadraticCurveTo(W * (0.5 + side * 0.17), H * (0.35 + k * 0.05), W * (0.5 + side * (0.1 + k * 0.02)), H * (0.5 + k * 0.04));
      ctx.stroke();
    }
  }
  const image = ctx.getImageData(0, 0, W, H);
  const data = image.data;
  // Cloth is never one even tone: a soft blotchy unevenness over it (a coarse grid of values, eased between, wrapping round the back's seam).
  const G = 8;
  const tone = Array.from({ length: G * (G + 1) }, () => random() * 2 - 1);
  const toneAt = (x: number, y: number): number => {
    const gx = (x / W) * G;
    const gy = (y / H) * G;
    const x0 = Math.floor(gx);
    const y0 = Math.min(G - 1, Math.floor(gy));
    const fx = smooth(gx - x0);
    const fy = smooth(gy - y0);
    const at = (cx: number, cy: number): number => tone[(cy % (G + 1)) * G + (cx % G)]!;
    return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
  };
  for (let i = 0; i < data.length; i += 4) {
    const p = i / 4;
    const x = p % W;
    const y = (p - x) / W;
    // A twill: diagonal ribs plus a little random fleck, over the unevenness.
    const weave = ((x + y) % 4 < 2 ? 1.025 : 0.975) * (0.97 + random() * 0.06) * (1 + 0.035 * toneAt(x, y));
    data[i] = Math.min(255, data[i]! * weave);
    data[i + 1] = Math.min(255, data[i + 1]! * weave);
    data[i + 2] = Math.min(255, data[i + 2]! * weave);
  }
  ctx.putImageData(image, 0, 0);
}

/** The pattern of a `paintCloth` tile. */
type ClothPattern = 'plain' | 'stripes' | 'check' | 'denim';

/** Blue trousers are jeans: a denim weave with the wear lighter down the front of the leg (`paintCloth` 'denim'). */
export function isDenim(color: number): boolean {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  return b > r + 14 && b >= g;
}

/**
 * A small tile for sleeves, trouser legs and hoods: the colour with the same weave, and for a
 * striped or checked top its pattern, so a striped tee has striped sleeves. Denim is one tile round
 * the whole leg (not repeated): a twill with pale threads in it and the front worn lighter, more so
 * mid-thigh and at the knee (a leg's u = 0 is its front).
 */
export function paintCloth(color: number, accent: number, pattern: ClothPattern): THREE.CanvasTexture {
  // A plain tile never shows its accent: leave it out of the key so it is shared more.
  const key = ['cloth', color, pattern === 'plain' ? '' : accent, pattern].join('|');
  return cachedTexture(key, () => cloth(color, accent, pattern, lcg(fnv1a(key))));
}

function cloth(color: number, accent: number, pattern: ClothPattern, random: () => number): THREE.CanvasTexture {
  if (pattern === 'denim') return denim(color, random);
  const S = 64;
  const [canvas, ctx] = createCanvas(S, S, READ_BACK);
  ctx.fillStyle = css(color);
  ctx.fillRect(0, 0, S, S);
  if (pattern === 'stripes') {
    ctx.fillStyle = css(accent);
    for (let y = 0; y < S; y += 16) ctx.fillRect(0, y, S, 8);
  } else if (pattern === 'check') {
    ctx.fillStyle = withAlpha(accent, 0.35);
    ctx.fillRect(14, 0, 10, S);
    ctx.fillRect(0, 14, S, 10);
    ctx.fillStyle = withAlpha(darken(color, 0.6), 0.5);
    ctx.fillRect(18, 0, 2, S);
    ctx.fillRect(0, 18, S, 2);
  }
  const image = ctx.getImageData(0, 0, S, S);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const p = i / 4;
    const weave = ((p % S) + Math.floor(p / S)) % 4 < 2 ? 1.03 : 0.97;
    const k = weave * (0.97 + random() * 0.06);
    data[i] = Math.min(255, data[i]! * k);
    data[i + 1] = Math.min(255, data[i + 1]! * k);
    data[i + 2] = Math.min(255, data[i + 2]! * k);
  }
  ctx.putImageData(image, 0, 0);
  const texture = toTexture(canvas, 'facing');
  repeatTexture(texture);
  texture.repeat.set(3, pattern === 'plain' ? 3 : 4);
  return texture;
}

function denim(color: number, random: () => number): THREE.CanvasTexture {
  const S = 128;
  const [canvas, ctx] = createCanvas(S, S, READ_BACK);
  ctx.fillStyle = css(color);
  ctx.fillRect(0, 0, S, S);
  const image = ctx.getImageData(0, 0, S, S);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const p = i / 4;
    const x = p % S;
    const y = (p - x) / S;
    // The front of the leg (u near 0 and 1), worn pale mid-thigh and at the knee (v from the bottom: the texture's rows from the top).
    const u = Math.min(x, S - x) / S;
    const v = 1 - y / S;
    const front = Math.exp(-((u / 0.16) ** 2));
    const wear = front * (0.55 * Math.exp(-(((v - 0.62) / 0.16) ** 2)) + 0.35 * Math.exp(-(((v - 0.25) / 0.1) ** 2)));
    // A right-hand twill, a pale weft thread showing through now and then.
    const twill = (x + y * 2) % 5 < 2 ? 1.06 : 0.95;
    const fleck = random() < 0.04 ? 1.25 : 0.97 + random() * 0.06;
    for (let c = 0; c < 3; c++) {
      const base = data[i + c]! * twill * fleck;
      data[i + c] = Math.min(255, base + (200 - base) * wear * 0.45);
    }
  }
  ctx.putImageData(image, 0, 0);
  return toTexture(canvas, 'facing');
}

function css(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function withAlpha(color: number, alpha: number): string {
  return `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},${alpha})`;
}

function darken(color: number, factor: number): number {
  const r = Math.round(((color >> 16) & 255) * factor);
  const g = Math.round(((color >> 8) & 255) * factor);
  const b = Math.round((color & 255) * factor);
  return (r << 16) | (g << 8) | b;
}
