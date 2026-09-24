import * as THREE from 'three';
import { createCanvas, roundRect, toTexture } from '@/covers/generated/canvasUtils';
import type { PersonLook } from './looks';

/*
 * The one canvas a person wears: the torso's texture, painted once from the look. The trunk's
 * seam is at the back, so u = 0.5 is the middle of the chest; v runs from the bottom
 * of the hips (0) to the neck (1) and rows are evenly spaced in height. Below `waistV` it is the
 * trousers (with the belt on the line); above, the top: a plain tee with a print, stripes, a
 * check, a hoodie with its pocket and strings, a jacket open over a shirt, a buttoned shirt; and
 * the stallholder's apron over any of them. The trousers get their seams and pockets, and
 * `finish` adds what makes paint read as fabric. `paintCloth` is the small tile the sleeves and
 * trouser legs wear.
 */

const W = 512;
const H = 512;

export function paintTorso(look: PersonLook, waistV: number): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(W, H);
  const waistY = (1 - waistV) * H;
  const base = css(look.topColor);
  const accent = css(look.topAccent);
  const shade = css(darken(look.topColor, 0.75));

  // Trousers and belt first: an untucked top is painted over them below.
  ctx.fillStyle = css(look.trousers);
  ctx.fillRect(0, waistY, W, H - waistY);
  ctx.fillStyle = css(darken(look.trousers, 0.7));
  ctx.fillRect(0, waistY - 5, W, 10);
  // Belt buckle, belt loops.
  ctx.fillStyle = '#c9b48a';
  ctx.fillRect(W / 2 - 8, waistY - 6, 16, 12);
  ctx.fillStyle = css(darken(look.trousers, 0.85));
  for (const u of [0.1, 0.3, 0.42, 0.58, 0.7, 0.9]) ctx.fillRect(W * u - 3, waistY - 7, 6, 14);
  // Trouser seams: the fly, the front pockets, the sides, the seat.
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

  const tucked = look.top === 'shirt' || look.top === 'jacket';
  const hemY = tucked ? waistY - 1 : waistY + 0.35 * (H - waistY);

  switch (look.top) {
    case 'tee':
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, W, hemY);
      // A print on the chest: a disc or a bar, once in three nothing.
      if ((look.topColor ^ look.topAccent) % 3 !== 0) {
        ctx.fillStyle = accent;
        if ((look.topColor ^ look.topAccent) % 2) {
          ctx.beginPath();
          ctx.arc(W / 2, H * 0.34, W * 0.075, 0, Math.PI * 2);
          ctx.fill();
        } else {
          roundRect(ctx, W * 0.4, H * 0.3, W * 0.2, H * 0.09, 8);
          ctx.fill();
        }
      }
      break;
    case 'stripes': {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, W, hemY);
      ctx.fillStyle = accent;
      const band = H / 14;
      for (let y = H * 0.1; y < hemY; y += band * 2) ctx.fillRect(0, y, W, Math.min(band, hemY - y));
      break;
    }
    case 'flannel': {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, W, hemY);
      ctx.fillStyle = withAlpha(look.topAccent, 0.35);
      const cell = W / 8;
      for (let x = cell / 2; x < W; x += cell) ctx.fillRect(x - 10, 0, 20, hemY);
      for (let y = cell / 2; y < hemY; y += cell) ctx.fillRect(0, y - 10, W, Math.min(20, hemY - y + 10));
      ctx.fillStyle = withAlpha(darken(look.topColor, 0.6), 0.5);
      for (let x = cell / 2; x < W; x += cell) ctx.fillRect(x - 2, 0, 4, hemY);
      for (let y = cell / 2; y < hemY; y += cell) ctx.fillRect(0, y - 2, W, 4);
      // A button placket down the front.
      ctx.fillStyle = shade;
      ctx.fillRect(W / 2 - 2, 0, 4, hemY);
      break;
    }
    case 'hoodie': {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, W, hemY);
      // Kangaroo pocket, drawn as a darker outline with its slanted openings.
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
      // Drawstrings from the hood.
      ctx.strokeStyle = '#efece6';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(W * 0.46, H * 0.06);
      ctx.lineTo(W * 0.45, H * 0.3);
      ctx.moveTo(W * 0.54, H * 0.06);
      ctx.lineTo(W * 0.555, H * 0.3);
      ctx.stroke();
      break;
    }
    case 'jacket': {
      // The shirt underneath shows in a strip down the middle; the jacket's edges frame it.
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
      break;
    }
    case 'shirt': {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, W, hemY);
      ctx.fillStyle = shade;
      ctx.fillRect(W / 2 - 10, 0, 20, hemY);
      ctx.fillStyle = base;
      ctx.fillRect(W / 2 - 6, 0, 12, hemY);
      ctx.fillStyle = '#e9e4d8';
      for (let y = H * 0.12; y < hemY - 12; y += H * 0.11) {
        ctx.beginPath();
        ctx.arc(W / 2, y, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // A breast pocket.
      ctx.strokeStyle = shade;
      ctx.lineWidth = 4;
      ctx.strokeRect(W * 0.6, H * 0.24, W * 0.12, H * 0.12);
      break;
    }
  }

  // The hem shadow of an untucked top.
  if (!tucked) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, hemY, W, 6);
  }

  if (look.apron !== undefined) {
    const apron = css(look.apron);
    ctx.fillStyle = apron;
    // Bib, then the skirt below the waist, then the straps up to the neck.
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
    // Waist ties run round the back.
    ctx.fillRect(0, waistY - 8, W, 10);
    // A pocket and a wear line.
    ctx.strokeStyle = css(darken(look.apron, 0.7));
    ctx.lineWidth = 4;
    ctx.strokeRect(W * 0.4, H * 0.62, W * 0.2, H * 0.14);
  }

  finish(ctx, look.top === 'tee' || look.top === 'stripes');
  return toTexture(canvas, 4);
}

/**
 * What makes paint read as cloth: side seams and a neckline, soft folds where the fabric bunches
 * (at the waist, under the arms), and a fine weave of noise over everything.
 */
function finish(ctx: CanvasRenderingContext2D, ribbedNeck: boolean): void {
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (const u of [0.25, 0.75]) ctx.fillRect(W * u - 1, 0, 2, H);
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
  for (let i = 0; i < data.length; i += 4) {
    const p = i / 4;
    const x = p % W;
    const y = (p - x) / W;
    // A twill: diagonal ribs plus a little random fleck.
    const weave = ((x + y) % 4 < 2 ? 1.025 : 0.975) * (0.97 + Math.random() * 0.06);
    data[i] = Math.min(255, data[i]! * weave);
    data[i + 1] = Math.min(255, data[i + 1]! * weave);
    data[i + 2] = Math.min(255, data[i + 2]! * weave);
  }
  ctx.putImageData(image, 0, 0);
}

/**
 * A small tile for sleeves, trouser legs and hoods: the colour with the same weave, and for a
 * striped or checked top its pattern, so a striped tee has striped sleeves.
 */
export function paintCloth(color: number, accent: number, pattern: 'plain' | 'stripes' | 'check'): THREE.CanvasTexture {
  const S = 64;
  const [canvas, ctx] = createCanvas(S, S);
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
    const k = weave * (0.97 + Math.random() * 0.06);
    data[i] = Math.min(255, data[i]! * k);
    data[i + 1] = Math.min(255, data[i + 1]! * k);
    data[i + 2] = Math.min(255, data[i + 2]! * k);
  }
  ctx.putImageData(image, 0, 0);
  const texture = toTexture(canvas, 4);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, pattern === 'plain' ? 3 : 4);
  return texture;
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
