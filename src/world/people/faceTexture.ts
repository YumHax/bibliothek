import * as THREE from 'three';
import { createCanvas, seededRandom, toTexture } from '@/covers/generated/canvasUtils';
import { bump, ramp } from './geometry';
import { beardCover } from './hair';
import type { PersonLook } from './looks';

/*
 * The skin of the head, painted once from the look. The canvas is laid out like the head's
 * geometry (`radialSurface`): x is the azimuth with the face in the middle and +x to the right, y
 * the polar angle from the crown (top) to under the chin (bottom), 1 radian = W / 2pi pixels both
 * ways. Painted in the same angles the head is sculpted in (`au`, `fv`): the flush of the cheeks
 * and nose, shade in the eye sockets and under the jaw, stubble, freckles, then the brows, the lips
 * and the nostrils.
 */

const W = 1024;
const H = 512;

type RGB = [number, number, number];

export function paintFace(look: PersonLook): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(W, H);
  const random = seededRandom(look.skin * 13 + look.hair * 7 + Math.round(look.nose * 100));
  const skin = rgb(look.skin);
  const hair = rgb(look.hair);
  ctx.fillStyle = css(skin);
  ctx.fillRect(0, 0, W, H);

  // Per pixel over the face and jaw: tone, shade, stubble, grain.
  const x0 = Math.floor(W * (0.5 - 1.75 / (2 * Math.PI)));
  const x1 = Math.ceil(W * (0.5 + 1.75 / (2 * Math.PI)));
  const y0 = Math.floor(H * (0.5 - 0.8 / Math.PI));
  const image = ctx.getImageData(x0, y0, x1 - x0, H - y0);
  const data = image.data;
  const flush: RGB = [196, 92, 84];
  const d = new THREE.Vector3();
  const stubble = look.beard !== undefined;
  // Soft features, each a bell across (u) times a bell up (v), precomputed per column and row.
  const shades = [
    [-0.12, 0.34, 0.15, 0.2, 0.12], // eye sockets
    [-0.06, 0.2, -0.46, 0.12, 0.05], // the fold from nose to mouth
  ] as const;
  const flushes = [
    [0.13, 0.55, -0.22, 0.17, 0.14], // cheeks
    [0.1, 0, -0.3, 0.06, 0.07], // tip of the nose
    [0.05, 0, -0.9, 0.18, 0.1], // chin
    [0.05, 0.34, 0.2, 0.2, 0.1], // eyelids
  ] as const;
  const columns = (list: ReadonlyArray<readonly number[]>): Float32Array[] =>
    list.map(([, u0, , su]) => Float32Array.from({ length: x1 - x0 }, (_, i) => bump(Math.abs(((x0 + i) / W - 0.5) * 2 * Math.PI), u0!, su!)));
  const rows = (list: ReadonlyArray<readonly number[]>): Float32Array[] =>
    list.map(([, , v0, , sv]) => Float32Array.from({ length: H - y0 }, (_, i) => bump((0.5 - (y0 + i) / H) * Math.PI, v0!, sv!)));
  const shadeCols = columns(shades);
  const shadeRows = rows(shades);
  const flushCols = columns(flushes);
  const flushRows = rows(flushes);
  for (let py = y0; py < H; py++) {
    const fv = (0.5 - py / H) * Math.PI;
    const row = py - y0;
    const jaw = ramp(fv, -0.9, -1.2);
    for (let px = x0; px < x1; px++) {
      const col = px - x0;
      let shade = 1 - 0.2 * jaw;
      for (let f = 0; f < shades.length; f++) shade += shades[f]![0] * shadeCols[f]![col]! * shadeRows[f]![row]!;
      shade *= 1 + (random() - 0.5) * 0.04;
      let redden = 0;
      for (let f = 0; f < flushes.length; f++) redden += flushes[f]![0] * flushCols[f]![col]! * flushRows[f]![row]!;
      let r = THREE.MathUtils.lerp(skin[0], flush[0], redden) * shade;
      let gr = THREE.MathUtils.lerp(skin[1], flush[1], redden) * shade;
      let b = THREE.MathUtils.lerp(skin[2], flush[2], redden) * shade;
      if (stubble) {
        const fu = (px / W - 0.5) * 2 * Math.PI;
        d.set(Math.cos(fv) * Math.sin(fu), Math.sin(fv), Math.cos(fv) * Math.cos(fu));
        const cover = beardCover(d);
        if (cover > 0) {
          const k = cover * (look.beard === 'full' ? 0.6 : 0.42) * (0.45 + 0.55 * random());
          r = THREE.MathUtils.lerp(r, hair[0] * 0.8, k);
          gr = THREE.MathUtils.lerp(gr, hair[1] * 0.8, k);
          b = THREE.MathUtils.lerp(b, hair[2] * 0.8, k);
        }
      }
      const i = (row * (x1 - x0) + col) * 4;
      data[i] = r;
      data[i + 1] = gr;
      data[i + 2] = b;
    }
  }
  ctx.putImageData(image, x0, y0);

  if (look.freckles) {
    for (let i = 0; i < 140; i++) {
      const u = (random() - 0.5) * 1.1;
      const v = -0.1 - random() * 0.3 + Math.abs(u) * 0.1;
      ctx.fillStyle = css(mix(skin, [120, 70, 45], 0.35 + random() * 0.25), 0.55);
      ctx.beginPath();
      ctx.arc(...P(u, v), 0.8 + random() * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  brows(ctx, look, hair, random);
  lips(ctx, look, skin);
  // Nostrils, on the underside of the tip.
  ctx.fillStyle = css(mix(skin, [30, 15, 12], 0.7), 0.85);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(...P(side * 0.075, -0.385), 4.5, 2.2, side * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(canvas, 4);
}

/** Canvas pixel of the face angles (`u` across, +x to the right; `v` up). */
function P(u: number, v: number): [number, number] {
  return [W * (0.5 + u / (2 * Math.PI)), H * (0.5 - v / Math.PI)];
}

/** Each brow: a tapering band arching over the eye, then hairs combed up and out. */
function brows(ctx: CanvasRenderingContext2D, look: PersonLook, hair: RGB, random: () => number): void {
  const color = mix(hair, [20, 14, 10], hair[0] > 150 ? 0.35 : 0.15);
  const line = (t: number): number => 0.32 + 0.06 * Math.sin(Math.min(1, t / 0.62) * (Math.PI / 2)) - 0.06 * Math.max(0, (t - 0.62) / 0.38) ** 2;
  const width = (t: number): number => (0.034 - 0.022 * t) * look.brows;
  for (const side of [-1, 1]) {
    const u = (t: number): number => side * (0.13 + 0.45 * t);
    ctx.fillStyle = css(color, 0.8);
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      ctx.lineTo(...P(u(t), line(t) + width(t) * 0.5));
    }
    for (let i = 12; i >= 0; i--) {
      const t = i / 12;
      ctx.lineTo(...P(u(t), line(t) - width(t) * 0.5));
    }
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 70; i++) {
      const t = random();
      const [x, y] = P(u(t), line(t) + (random() - 0.5) * width(t));
      const lift = t < 0.2 ? 1.4 : 0.5;
      ctx.strokeStyle = css(mix(color, random() < 0.5 ? [0, 0, 0] : hair, 0.3), 0.6);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + side * 5, y - lift * 3);
      ctx.stroke();
    }
  }
}

/** Cupid's bow, the fuller lower lip, the dark line between; the corners turn up for a smile. */
function lips(ctx: CanvasRenderingContext2D, look: PersonLook, skin: RGB): void {
  const base = mix(skin, [176, 86, 82], 0.34);
  const corner = look.smile ? -0.55 : -0.578;
  const middle = look.smile ? -0.595 : -0.58;
  const cu = look.smile ? 0.28 : 0.26;
  const mouth = (): void => {
    ctx.moveTo(...P(-cu, corner));
    ctx.quadraticCurveTo(...P(0, middle * 2 - corner), ...P(cu, corner));
  };
  // Upper lip.
  ctx.fillStyle = css(mix(base, [0, 0, 0], 0.16));
  ctx.beginPath();
  mouth();
  ctx.quadraticCurveTo(...P(0.16, -0.5), ...P(0.055, -0.505));
  ctx.lineTo(...P(0, -0.522));
  ctx.lineTo(...P(-0.055, -0.505));
  ctx.quadraticCurveTo(...P(-0.16, -0.5), ...P(-cu, corner));
  ctx.fill();
  // Lower lip.
  ctx.fillStyle = css(base);
  ctx.beginPath();
  mouth();
  ctx.quadraticCurveTo(...P(0.17, -0.668), ...P(0, -0.668));
  ctx.quadraticCurveTo(...P(-0.17, -0.668), ...P(-cu, corner));
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.ellipse(...P(0, -0.64), 10, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // The line between them, deepest at the corners.
  ctx.strokeStyle = css(mix(base, [20, 8, 8], 0.6));
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  mouth();
  ctx.stroke();
  ctx.fillStyle = css(mix(base, [20, 8, 8], 0.5), 0.6);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(...P(side * cu, corner), 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function rgb(color: number): RGB {
  return [(color >> 16) & 255, (color >> 8) & 255, color & 255];
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function css(c: RGB, alpha = 1): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alpha})`;
}
