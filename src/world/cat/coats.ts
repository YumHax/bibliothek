import * as THREE from 'three';
import { createCanvas, seededRandom, toTexture } from '@/covers/generated/canvasUtils';
import type { CoatKind } from './types';

/*
 * Fur of the procedural cat: flat colours for the small parts (head, legs, muzzle, paws, nose,
 * iris) and three tiny canvases for what needs a pattern: the body (stripes, bib, patches), the
 * tail (rings) and the eye (iris + slit pupil). `CoatTextures.paint(coat)` repaints the canvases
 * in place so a coat change never rebuilds geometry.
 *
 * Body canvas mapping (CapsuleGeometry rotated so its axis runs along the cat): x is the way round
 * the body starting at the belly line (x = 0 and x = width are the belly, the middle is the back),
 * y runs along the body with the front at the top row (textures are flipped on upload).
 */

export interface CoatPalette {
  /** Main fur (body, head, upper legs). */
  base: string;
  /** Stripes and dark patches. */
  dark: string;
  /** Orange patches (calico); the stripes' colour elsewhere. */
  patch: string;
  /** Belly, bib, white areas. */
  light: string;
  muzzle: string;
  paws: string;
  earInner: string;
  nose: string;
  iris: string;
}

export const COAT_PALETTES: Record<CoatKind, CoatPalette> = {
  tabby: { base: '#8a7159', dark: '#3f3226', patch: '#3f3226', light: '#cbbba5', muzzle: '#c3b39d', paws: '#7a644d', earInner: '#b08a80', nose: '#6b4a3f', iris: '#6f9c3c' },
  tuxedo: { base: '#1d1b1c', dark: '#0f0e0f', patch: '#0f0e0f', light: '#f1ede5', muzzle: '#f1ede5', paws: '#f1ede5', earInner: '#5a4548', nose: '#3a2b2d', iris: '#d3a63d' },
  ginger: { base: '#d1823a', dark: '#b3652a', patch: '#b3652a', light: '#f4e7d5', muzzle: '#f0e0cc', paws: '#ead2ae', earInner: '#d9968a', nose: '#d78f7b', iris: '#c9a53a' },
  grey: { base: '#6f7582', dark: '#5a606d', patch: '#5a606d', light: '#a9aeb8', muzzle: '#8d929c', paws: '#666c78', earInner: '#8d7f86', nose: '#5b5460', iris: '#c8b13a' },
  calico: { base: '#f2ede4', dark: '#232021', patch: '#d8843c', light: '#f7f3ec', muzzle: '#f7f3ec', paws: '#f7f3ec', earInner: '#d9a09a', nose: '#d78f8a', iris: '#d3a63d' },
};

const BODY_SIZE = { w: 256, h: 128 };
const TAIL_SIZE = { w: 64, h: 32 };
const EYE_SIZE = { w: 64, h: 32 };

/** The three fur canvases and their textures; call `paint` whenever the coat changes. */
export class CoatTextures {
  readonly body: THREE.CanvasTexture;
  readonly tail: THREE.CanvasTexture;
  readonly eye: THREE.CanvasTexture;
  private readonly bodyCtx: CanvasRenderingContext2D;
  private readonly tailCtx: CanvasRenderingContext2D;
  private readonly eyeCtx: CanvasRenderingContext2D;

  constructor(coat: CoatKind) {
    const [bodyCanvas, bodyCtx] = createCanvas(BODY_SIZE.w, BODY_SIZE.h);
    const [tailCanvas, tailCtx] = createCanvas(TAIL_SIZE.w, TAIL_SIZE.h);
    const [eyeCanvas, eyeCtx] = createCanvas(EYE_SIZE.w, EYE_SIZE.h);
    this.bodyCtx = bodyCtx;
    this.tailCtx = tailCtx;
    this.eyeCtx = eyeCtx;
    this.body = toTexture(bodyCanvas, 4);
    this.body.wrapS = THREE.RepeatWrapping; // the seam is the belly line: let the filter wrap across it
    this.tail = toTexture(tailCanvas, 2);
    this.tail.wrapS = THREE.RepeatWrapping;
    this.eye = toTexture(eyeCanvas, 2);
    this.paint(coat);
  }

  paint(coat: CoatKind): void {
    const palette = COAT_PALETTES[coat];
    paintBody(this.bodyCtx, BODY_SIZE.w, BODY_SIZE.h, coat, palette);
    paintTail(this.tailCtx, TAIL_SIZE.w, TAIL_SIZE.h, coat, palette);
    paintEye(this.eyeCtx, EYE_SIZE.w, EYE_SIZE.h, palette);
    this.body.needsUpdate = true;
    this.tail.needsUpdate = true;
    this.eye.needsUpdate = true;
  }

  dispose(): void {
    this.body.dispose();
    this.tail.dispose();
    this.eye.dispose();
  }
}

/** `a` mixed towards `b` by `t`, as a CSS colour. */
function mix(a: string, b: string, t: number): string {
  return `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;
}

function paintBody(ctx: CanvasRenderingContext2D, w: number, h: number, coat: CoatKind, p: CoatPalette): void {
  const random = seededRandom(0x5ca7);
  ctx.globalAlpha = 1;
  ctx.fillStyle = p.base;
  ctx.fillRect(0, 0, w, h);

  // Lighter underside fading up the flanks, painted from both edges since the seam is the belly line.
  const bellyWidth = w * (coat === 'tuxedo' ? 0.12 : coat === 'calico' ? 0.1 : 0.22);
  for (const [x0, x1] of [
    [0, bellyWidth],
    [w, w - bellyWidth],
  ]) {
    const gradient = ctx.createLinearGradient(x0, 0, x1, 0);
    gradient.addColorStop(0, p.light);
    gradient.addColorStop(1, mix(p.light, p.base, 1));
    ctx.fillStyle = gradient;
    ctx.fillRect(Math.min(x0, x1), 0, Math.abs(x1 - x0), h);
  }

  if (coat === 'tabby' || coat === 'ginger') {
    stripes(ctx, w, h, p.dark, coat === 'tabby' ? 0.8 : 0.32, random);
    if (coat === 'ginger') bib(ctx, w, h, p.light, 0.16, 0.2);
  } else if (coat === 'tuxedo') {
    bib(ctx, w, h, p.light, 0.2, 0.3);
    // The white keeps running down the belly as a narrower stripe.
    ctx.fillStyle = p.light;
    ctx.fillRect(0, 0, w * 0.06, h * 0.7);
    ctx.fillRect(w - w * 0.06, 0, w * 0.06, h * 0.7);
  } else if (coat === 'grey') {
    // A slightly darker saddle along the spine.
    const gradient = ctx.createLinearGradient(w * 0.25, 0, w * 0.75, 0);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(0.5, 'rgba(20,22,30,0.22)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(w * 0.25, 0, w * 0.5, h);
  } else {
    patches(ctx, w, h, p, random);
  }
  ctx.globalAlpha = 1;
}

/** Dorsal line plus paired flank stripes, wobbly and broken like a mackerel tabby. */
function stripes(ctx: CanvasRenderingContext2D, w: number, h: number, colour: string, alpha: number, random: () => number): void {
  ctx.strokeStyle = colour;
  ctx.lineCap = 'round';
  ctx.globalAlpha = alpha;
  // Spine.
  ctx.lineWidth = w * 0.035;
  ctx.beginPath();
  ctx.moveTo(w / 2, -4);
  for (let y = 0; y <= h + 8; y += 12) ctx.lineTo(w / 2 + (random() - 0.5) * 6, y);
  ctx.stroke();
  // Flanks: stripes run from the spine down towards the belly, symmetric on both sides.
  const count = 9;
  for (let i = 0; i < count; i++) {
    const y = h * (0.06 + (i / count) * 0.9) + (random() - 0.5) * 6;
    const reach = w * (0.2 + random() * 0.13);
    const sag = 4 + random() * 10;
    ctx.lineWidth = 3 + random() * 4;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(w / 2 + side * w * 0.03, y);
      ctx.quadraticCurveTo(w / 2 + side * reach * 0.55, y - sag * 0.4, w / 2 + side * reach, y + sag);
      ctx.stroke();
    }
  }
  // Faint mottling over the back so the base colour is not flat.
  ctx.fillStyle = colour;
  ctx.globalAlpha = alpha * 0.18;
  for (let i = 0; i < 70; i++) {
    const x = w * (0.25 + random() * 0.5);
    const y = random() * h;
    ctx.beginPath();
    ctx.ellipse(x, y, 2 + random() * 3, 1.5 + random() * 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** White chest at the front of the belly line. */
function bib(ctx: CanvasRenderingContext2D, w: number, h: number, colour: string, rx: number, ry: number): void {
  ctx.globalAlpha = 1;
  ctx.fillStyle = colour;
  for (const cx of [0, w]) {
    ctx.beginPath();
    ctx.ellipse(cx, h * 0.1, w * rx, h * ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Calico: orange and black blobs over the back and flanks, never on the belly. */
function patches(ctx: CanvasRenderingContext2D, w: number, h: number, p: CoatPalette, random: () => number): void {
  ctx.globalAlpha = 1;
  const blobs = 7;
  for (let i = 0; i < blobs; i++) {
    ctx.fillStyle = i % 2 === 0 ? p.patch : p.dark;
    const cx = w * (0.3 + random() * 0.4);
    const cy = h * (0.08 + (i / blobs) * 0.85 + (random() - 0.5) * 0.1);
    const r = w * (0.06 + random() * 0.06);
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.ellipse(cx + (random() - 0.5) * r * 1.4, cy + (random() - 0.5) * r * 1.2, r * (0.6 + random() * 0.5), r * (0.5 + random() * 0.4), random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** One tail segment's fur: a ring across the middle for the striped coats, two tones for calico. */
function paintTail(ctx: CanvasRenderingContext2D, w: number, h: number, coat: CoatKind, p: CoatPalette): void {
  ctx.globalAlpha = 1;
  ctx.fillStyle = p.base;
  ctx.fillRect(0, 0, w, h);
  if (coat === 'tabby' || coat === 'ginger') {
    ctx.globalAlpha = coat === 'tabby' ? 0.8 : 0.35;
    ctx.fillStyle = p.dark;
    ctx.fillRect(0, h * 0.32, w, h * 0.34);
  } else if (coat === 'calico') {
    ctx.fillStyle = p.patch;
    ctx.fillRect(0, 0, w, h * 0.5);
    ctx.fillStyle = p.dark;
    ctx.fillRect(0, h * 0.5, w, h * 0.5);
  } else if (coat === 'grey') {
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = p.dark;
    ctx.fillRect(w * 0.3, 0, w * 0.4, h);
  }
  ctx.globalAlpha = 1;
}

/**
 * The eyeball: iris all over (only the front shows), a dark limbal ring, a vertical slit pupil
 * and a glint. The pupil sits at u = 0.25, the point of a SphereGeometry that faces local +z.
 */
function paintEye(ctx: CanvasRenderingContext2D, w: number, h: number, p: CoatPalette): void {
  const cx = w * 0.25;
  const cy = h * 0.5;
  ctx.globalAlpha = 1;
  ctx.fillStyle = mix(p.iris, '#000000', 0.35);
  ctx.fillRect(0, 0, w, h);
  const iris = ctx.createRadialGradient(cx, cy, 1, cx, cy, w * 0.19);
  iris.addColorStop(0, mix(p.iris, '#ffffff', 0.25));
  iris.addColorStop(0.7, p.iris);
  iris.addColorStop(1, mix(p.iris, '#000000', 0.45));
  ctx.fillStyle = iris;
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 0.19, h * 0.46, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0a0a0c';
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 0.035, h * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.ellipse(cx - w * 0.05, cy - h * 0.16, w * 0.022, h * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
}
