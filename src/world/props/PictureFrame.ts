import * as THREE from 'three';
import { createCanvas, toTexture, seededRandom } from '@/covers/generated/canvasUtils';
import { Prop, part, matte } from './Prop';
import { wood as woodMaterial } from '@/world/materials/finishes';

/** `sunset`: soft gradient over a sea line; `mountains`: layered pastel-blue ridges; `abstract`: pastel shapes on cream. */
export type PictureMotif = 'sunset' | 'mountains' | 'abstract';

export interface PictureFrameOptions {
  /** Outer size of the frame. */
  width?: number;
  height?: number;
  motif?: PictureMotif;
  /** Wood colour of the frame. */
  frameColor?: number;
  /** Thickness of the wooden frame bars, in the picture plane. */
  frameWidth?: number;
  /** Width of the off-white mat between frame and picture. */
  matWidth?: number;
  /** Varies the composition of the motif. */
  seed?: number;
}

const FRAME_DEPTH = 0.028;
const BOARD_DEPTH = 0.01;
const CANVAS_W = 512;
const MAT_COLOR = '#f3efe6';

/**
 * A framed picture to hang on a wall: wooden frame bars around an off-white mat and a
 * procedurally painted motif. Local origin is the centre of the picture, on the wall;
 * local +z faces into the room (so `wallMount()` places it like a `Poster`).
 */
export class PictureFrame extends Prop {
  readonly options: Required<PictureFrameOptions>;

  constructor(options: PictureFrameOptions = {}) {
    super();
    this.options = { width: 0.4, height: 0.3, motif: 'sunset', frameColor: 0x3c2f24, frameWidth: 0.022, matWidth: 0.03, seed: 1, ...options };
    this.name = `PictureFrame:${this.options.motif}`;
    const { width, height, frameWidth, frameColor } = this.options;

    const wood = woodMaterial(frameColor, 0.5);
    // Four bars, the horizontal ones spanning the full width, sitting proud of the wall.
    const zBar = FRAME_DEPTH / 2;
    part(this, width, frameWidth, FRAME_DEPTH, wood, { y: height / 2 - frameWidth / 2, z: zBar });
    part(this, width, frameWidth, FRAME_DEPTH, wood, { y: -height / 2 + frameWidth / 2, z: zBar });
    part(this, frameWidth, height - 2 * frameWidth, FRAME_DEPTH, wood, { x: -width / 2 + frameWidth / 2, z: zBar });
    part(this, frameWidth, height - 2 * frameWidth, FRAME_DEPTH, wood, { x: width / 2 - frameWidth / 2, z: zBar });

    // Backboard recessed inside the bars, carrying mat + picture as one texture.
    const innerW = width - 2 * frameWidth;
    const innerH = height - 2 * frameWidth;
    const board = part(this, innerW, innerH, BOARD_DEPTH, matte(0x2a221c, 0.8), { z: BOARD_DEPTH / 2 });
    board.castShadow = false;
    const picture = new THREE.Mesh(
      new THREE.PlaneGeometry(innerW, innerH),
      new THREE.MeshStandardMaterial({ map: this.paint(innerW, innerH), roughness: 0.85 }),
    );
    picture.position.z = BOARD_DEPTH + 0.0005;
    picture.receiveShadow = true;
    this.add(picture);
  }

  /** Paints the mat and, inside it, the chosen motif. */
  private paint(innerW: number, innerH: number): THREE.CanvasTexture {
    const W = CANVAS_W;
    const H = Math.round((W * innerH) / innerW);
    const [canvas, ctx] = createCanvas(W, H);
    const random = seededRandom(this.options.seed * 40503 + 7);

    ctx.fillStyle = MAT_COLOR;
    ctx.fillRect(0, 0, W, H);

    const m = Math.round((W * this.options.matWidth) / innerW);
    const pw = W - 2 * m;
    const ph = H - 2 * m;
    // Bevel of the mat opening: a faint shadow line so the picture reads as recessed.
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(m - 3, m - 3, pw + 6, ph + 6);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(m - 1, m - 1, pw + 2, ph + 2);

    ctx.save();
    ctx.translate(m, m);
    ctx.beginPath();
    ctx.rect(0, 0, pw, ph);
    ctx.clip();
    const painters: Record<PictureMotif, MotifPainter> = { sunset: paintSunset, mountains: paintMountains, abstract: paintAbstract };
    painters[this.options.motif](ctx, pw, ph, random);
    ctx.restore();

    // Paper grain over the whole thing.
    for (let i = 0; i < 2500; i++) {
      ctx.fillStyle = `rgba(${random() < 0.5 ? '0,0,0' : '255,255,255'},${(random() * 0.05).toFixed(3)})`;
      ctx.fillRect(random() * W, random() * H, 2, 2);
    }
    return toTexture(canvas, 4);
  }
}

type MotifPainter = (ctx: CanvasRenderingContext2D, w: number, h: number, random: () => number) => void;

function verticalGradient(ctx: CanvasRenderingContext2D, y0: number, y1: number, stops: [number, string][]): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [at, color] of stops) g.addColorStop(at, color);
  return g;
}

/** Pale peach-to-lavender sky, a low sun and a calm sea with a light path under it. */
const paintSunset: MotifPainter = (ctx, w, h, random) => {
  const horizon = h * (0.6 + random() * 0.08);
  ctx.fillStyle = verticalGradient(ctx, 0, horizon, [
    [0, '#cfc3dc'],
    [0.45, '#f1cbb8'],
    [0.85, '#f8d9a6'],
    [1, '#fbe6b8'],
  ]);
  ctx.fillRect(0, 0, w, horizon);

  // Sun sitting on the horizon.
  const sunX = w * (0.35 + random() * 0.3);
  const sunR = w * 0.075;
  const glow = ctx.createRadialGradient(sunX, horizon - sunR * 0.6, sunR * 0.3, sunX, horizon - sunR * 0.6, sunR * 3.5);
  glow.addColorStop(0, 'rgba(255,240,200,0.75)');
  glow.addColorStop(1, 'rgba(255,240,200,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, horizon);
  ctx.fillStyle = '#fff3cf';
  ctx.beginPath();
  ctx.arc(sunX, horizon - sunR * 0.6, sunR, 0, Math.PI * 2);
  ctx.fill();

  // A few soft cloud streaks.
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 4; i++) {
    const y = horizon * (0.15 + random() * 0.55);
    const len = w * (0.15 + random() * 0.3);
    const x = random() * (w - len);
    ctx.beginPath();
    ctx.ellipse(x + len / 2, y, len / 2, h * 0.012, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Sea, with the sun's reflection as a brighter band.
  ctx.fillStyle = verticalGradient(ctx, horizon, h, [
    [0, '#a9bfc9'],
    [0.5, '#8aa4b3'],
    [1, '#7a94a3'],
  ]);
  ctx.fillRect(0, horizon, w, h - horizon);
  ctx.fillStyle = 'rgba(255,236,190,0.35)';
  ctx.beginPath();
  ctx.moveTo(sunX - sunR * 0.8, horizon);
  ctx.lineTo(sunX + sunR * 0.8, horizon);
  ctx.lineTo(sunX + sunR * 2.2, h);
  ctx.lineTo(sunX - sunR * 2.2, h);
  ctx.closePath();
  ctx.fill();
  // Ripples: short horizontal light dashes.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 28; i++) {
    const y = horizon + (h - horizon) * random();
    const len = w * (0.02 + random() * 0.06);
    const x = random() * (w - len);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y);
    ctx.stroke();
  }
  // Horizon line.
  ctx.fillStyle = 'rgba(120,140,155,0.5)';
  ctx.fillRect(0, horizon - 1, w, 2);
};

/** Pale sky, a faint sun and four ridges of mountains getting bluer as they come forward. */
const paintMountains: MotifPainter = (ctx, w, h, random) => {
  ctx.fillStyle = verticalGradient(ctx, 0, h, [
    [0, '#e9f0f6'],
    [0.6, '#d3e1ec'],
    [1, '#c4d5e3'],
  ]);
  ctx.fillRect(0, 0, w, h);

  const sunX = w * (0.2 + random() * 0.6);
  const sunY = h * (0.18 + random() * 0.15);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.arc(sunX, sunY, w * 0.05, 0, Math.PI * 2);
  ctx.fill();

  const layers = ['#c7d7e5', '#aac1d4', '#8fa9c0', '#7590a7'];
  layers.forEach((color, layer) => {
    const t = layer / (layers.length - 1);
    const baseY = h * (0.42 + t * 0.32);
    const amplitude = h * (0.16 - t * 0.05);
    const peaks = 3 + layer;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, baseY - amplitude * random() * 0.5);
    for (let i = 0; i <= peaks; i++) {
      const x = (w * (i + random() * 0.6 - 0.3)) / peaks;
      const peakY = baseY - amplitude * (0.5 + random() * 0.5);
      const valleyY = baseY - amplitude * random() * 0.25;
      ctx.lineTo(Math.max(0, Math.min(w, x)), peakY);
      if (i < peaks) ctx.lineTo((w * (i + 0.5 + random() * 0.3 - 0.15)) / peaks, valleyY);
    }
    ctx.lineTo(w, baseY - amplitude * random() * 0.5);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    // Mist at the foot of each ridge blends it into the next one.
    ctx.fillStyle = verticalGradient(ctx, baseY - amplitude * 0.2, baseY + amplitude * 0.5, [
      [0, 'rgba(233,240,246,0)'],
      [1, 'rgba(233,240,246,0.45)'],
    ]);
    ctx.fillRect(0, baseY - amplitude * 0.2, w, amplitude * 0.7);
  });

  // A pale water line at the very bottom.
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(0, h * 0.94, w, h * 0.06);
};

/** Overlapping pastel discs and slabs on cream, with one thin ink line for tension. */
const paintAbstract: MotifPainter = (ctx, w, h, random) => {
  ctx.fillStyle = '#f5f0e6';
  ctx.fillRect(0, 0, w, h);
  const palette = ['#f0c6b4', '#a9c6c2', '#e6d3a0', '#b8c4d9', '#d9b8c4', '#c9d3b3'];
  const pick = () => palette[Math.floor(random() * palette.length)];

  ctx.globalAlpha = 0.85;
  const shapes = 5 + Math.floor(random() * 3);
  for (let i = 0; i < shapes; i++) {
    ctx.fillStyle = pick();
    const cx = w * (0.15 + random() * 0.7);
    const cy = h * (0.15 + random() * 0.7);
    if (random() < 0.55) {
      const r = Math.min(w, h) * (0.12 + random() * 0.2);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const rw = w * (0.15 + random() * 0.3);
      const rh = h * (0.12 + random() * 0.35);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((random() - 0.5) * 0.3);
      ctx.fillRect(-rw / 2, -rh / 2, rw, rh);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;

  // One or two thin dark lines.
  ctx.strokeStyle = 'rgba(60,50,45,0.7)';
  ctx.lineWidth = 3;
  const lines = 1 + Math.floor(random() * 2);
  for (let i = 0; i < lines; i++) {
    ctx.beginPath();
    if (random() < 0.5) {
      const y = h * (0.2 + random() * 0.6);
      ctx.moveTo(w * 0.1, y);
      ctx.lineTo(w * 0.9, y + (random() - 0.5) * h * 0.2);
    } else {
      ctx.arc(w * (0.3 + random() * 0.4), h * (0.3 + random() * 0.4), Math.min(w, h) * (0.15 + random() * 0.2), 0, Math.PI * 2);
    }
    ctx.stroke();
  }
};
