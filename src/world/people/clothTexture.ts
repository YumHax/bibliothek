import * as THREE from 'three';
import { createCanvas, roundRect, toTexture } from '@/covers/generated/canvasUtils';
import type { PersonLook } from './looks';

/*
 * The one canvas a person wears: the torso's texture, painted once from the look. The torso is a
 * lathe whose seam is at the back, so u = 0.5 is the middle of the chest; v runs from the bottom
 * of the hips (0) to the neck (1) and rows are evenly spaced in height. Below `waistV` it is the
 * trousers (with the belt on the line); above, the top: a plain tee with a print, stripes, a
 * check, a hoodie with its pocket and strings, a jacket open over a shirt, a buttoned shirt; and
 * the stallholder's apron over any of them.
 */

const W = 256;
const H = 256;

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
  ctx.fillRect(0, waistY - 2, W, 4);
  // Belt buckle.
  ctx.fillStyle = '#c9b48a';
  ctx.fillRect(W / 2 - 4, waistY - 3, 8, 6);

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
          roundRect(ctx, W * 0.4, H * 0.3, W * 0.2, H * 0.09, 4);
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
      for (let x = cell / 2; x < W; x += cell) ctx.fillRect(x - 5, 0, 10, hemY);
      for (let y = cell / 2; y < hemY; y += cell) ctx.fillRect(0, y - 5, W, Math.min(10, hemY - y + 5));
      ctx.fillStyle = withAlpha(darken(look.topColor, 0.6), 0.5);
      for (let x = cell / 2; x < W; x += cell) ctx.fillRect(x - 1, 0, 2, hemY);
      for (let y = cell / 2; y < hemY; y += cell) ctx.fillRect(0, y - 1, W, 2);
      // A button placket down the front.
      ctx.fillStyle = shade;
      ctx.fillRect(W / 2 - 1, 0, 2, hemY);
      break;
    }
    case 'hoodie': {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, W, hemY);
      // Kangaroo pocket, drawn as a darker outline with its slanted openings.
      ctx.strokeStyle = shade;
      ctx.lineWidth = 3;
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
      ctx.lineWidth = 2.5;
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
      ctx.fillRect(W * 0.43 - 1.5, 0, 3, hemY);
      ctx.fillRect(W * 0.57 - 1.5, 0, 3, hemY);
      break;
    }
    case 'shirt': {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, W, hemY);
      ctx.fillStyle = shade;
      ctx.fillRect(W / 2 - 5, 0, 10, hemY);
      ctx.fillStyle = base;
      ctx.fillRect(W / 2 - 3, 0, 6, hemY);
      ctx.fillStyle = '#e9e4d8';
      for (let y = H * 0.12; y < hemY - 6; y += H * 0.11) {
        ctx.beginPath();
        ctx.arc(W / 2, y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      // A breast pocket.
      ctx.strokeStyle = shade;
      ctx.lineWidth = 2;
      ctx.strokeRect(W * 0.6, H * 0.24, W * 0.12, H * 0.12);
      break;
    }
  }

  // The hem shadow of an untucked top.
  if (!tucked) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, hemY, W, 3);
  }

  if (look.apron !== undefined) {
    const apron = css(look.apron);
    ctx.fillStyle = apron;
    // Bib, then the skirt below the waist, then the straps up to the neck.
    ctx.fillRect(W * 0.41, H * 0.2, W * 0.18, H * 0.3);
    ctx.fillRect(W * 0.34, H * 0.48, W * 0.32, H - H * 0.48);
    ctx.strokeStyle = apron;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(W * 0.43, H * 0.2);
    ctx.lineTo(W * 0.46, 0);
    ctx.moveTo(W * 0.57, H * 0.2);
    ctx.lineTo(W * 0.54, 0);
    ctx.stroke();
    // Waist ties run round the back.
    ctx.fillRect(0, waistY - 4, W, 5);
    // A pocket and a wear line.
    ctx.strokeStyle = css(darken(look.apron, 0.7));
    ctx.lineWidth = 2;
    ctx.strokeRect(W * 0.4, H * 0.62, W * 0.2, H * 0.14);
  }

  return toTexture(canvas, 2);
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
