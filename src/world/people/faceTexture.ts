import * as THREE from 'three';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { gaussian, ramp } from '@/math/scalar';
import { beardCover, hairlineAt } from './hair';
import { faceTraitsOf, type PersonLook } from './looks';
import { eyeSurface, faceShapeOf, lowerLipAt, partingAt, upperLipAt, type FaceShape, type MouthLine } from './head';
import { cachedTexture } from './textureCache';
import { absorb, absorbInto } from './skinTone';
import { lcg } from '@/random';


/*
 * The skin of the head, painted once from the look. The canvas is laid out like the head's
 * geometry (`radialSurface`): x is the azimuth with the face in the middle and +x to the right, y
 * the polar angle from the crown (top) to under the chin (bottom), 1 radian = W / 2pi pixels both
 * ways. Painted in the same angles the head is sculpted in (`au`, `fv`): the flush of the cheeks
 * and nose, shade in the eye sockets, under the jaw and under the hairline, stubble, freckles, then the eyes as seen
 * from afar, the brows, the lips and the nostrils.
 */

/** The painter reads its pixels back (`getImageData`): its canvas kept in memory, not on the GPU (`createCanvas`). */
const READ_BACK: CanvasRenderingContext2DSettings = { willReadFrequently: true };

const W = 1024;
const H = 512;

type RGB = [number, number, number];

/** How dark the hair leaves the skin just under its edge, by style (none round a bald head's horseshoe). */
const HAIR_SHADE: Record<PersonLook['hairStyle'], number> = { long: 0.16, curly: 0.14, bun: 0.1, ponytail: 0.1, short: 0.1, buzz: 0.05, bald: 0 };

/** The head's skin for `look`, shared by every look with the same values for it (`cachedTexture`). */
export function paintFace(look: PersonLook): THREE.CanvasTexture {
  const t = faceTraitsOf(look);
  const lines = [t.eye, t.noseTilt, t.corner, t.lips].map((v) => Math.round(v * 100));
  const key = ['face', look.skin, look.hair, look.hairStyle, Math.round(look.nose * 100), look.beard ?? '', look.freckles, look.brows, look.eyes, look.age ?? '', shavenShadow(look), ...lines].join('|');
  return cachedTexture(key, () => paint(look));
}

function paint(look: PersonLook): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(W, H, READ_BACK);
  const random = lcg(look.skin * 13 + look.hair * 7 + Math.round(look.nose * 100));
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
  const d = new THREE.Vector3();
  const stubble = look.beard !== undefined;
  const shadow = !stubble && shavenShadow(look);
  const child = look.age === 'child';
  const elder = look.age === 'elder';
  // Soft features, each a bell across (u) times a bell up (v), precomputed per column and row: shade,
  // blood (a flush: more haemoglobin, red at any tone, `absorb`) and melanin (darker, browner).
  const shades = [
    [-0.12, 0.34, 0.15, 0.2, 0.12], // eye sockets
    [-0.06, 0.2, -0.46, 0.12, 0.05], // the fold from nose to mouth
    [-0.04, 0.38, 0.07, 0.13, 0.04], // under the eyes
  ] as const;
  // Kept light on fair skin, where a flush shows most and too much reads as a doll's painted pink.
  const flush = fairness(look.skin) > 0.82 ? 0.72 : 0.85;
  const bloods = [
    [(child ? 0.42 : elder ? 0.26 : 0.32) * flush, 0.55, -0.22, 0.17, 0.14], // cheeks
    [0.28 * flush, 0, -0.3, 0.06, 0.07], // tip of the nose
    [0.22 * flush, 0.15, -0.36, 0.05, 0.04], // the nose's wings
    [0.12 * flush, 0, -0.9, 0.18, 0.1], // chin
    [0.18 * flush, 0.34, 0.2, 0.2, 0.1], // eyelids
  ];
  const melanins = [
    [child ? 0.04 : elder ? 0.3 : 0.16, 0.38, 0.07, 0.14, 0.045], // under the eyes
    [0.06, 0.18, -0.56, 0.22, 0.08], // round the mouth
  ] as const;
  const columns = (list: ReadonlyArray<readonly number[]>): Float32Array[] =>
    list.map(([, u0, , su]) => Float32Array.from({ length: x1 - x0 }, (_, i) => gaussian(Math.abs(((x0 + i) / W - 0.5) * 2 * Math.PI), u0!, su!)));
  const rows = (list: ReadonlyArray<readonly number[]>): Float32Array[] =>
    list.map(([, , v0, , sv]) => Float32Array.from({ length: H - y0 }, (_, i) => gaussian((0.5 - (y0 + i) / H) * Math.PI, v0!, sv!)));
  const sum = (list: ReadonlyArray<readonly number[]>, cols: Float32Array[], rws: Float32Array[], col: number, row: number): number => {
    let total = 0;
    for (let f = 0; f < list.length; f++) total += list[f]![0]! * cols[f]![col]! * rws[f]![row]!;
    return total;
  };
  const shadeCols = columns(shades);
  const shadeRows = rows(shades);
  const bloodCols = columns(bloods);
  const bloodRows = rows(bloods);
  const melaninCols = columns(melanins);
  const melaninRows = rows(melanins);
  // Faint blotches of colour: a few waves at odd angles, never a pattern.
  const phase = [random(), random(), random(), random()].map((p) => p * Math.PI * 2);
  // Each wave, sin(cu * fu + cv * fv + p), from a column's part and a row's part (sin(a + b) = sin a cos b +
  // cos a sin b): no sine per pixel (the painter runs over a quarter of a million of them per face).
  const wave = (cu: number, cv: number, p: number): ((col: number, row: number) => number) => {
    const across = (i: number): number => cu * ((x0 + i) / W - 0.5) * 2 * Math.PI + p;
    const up = (i: number): number => cv * (0.5 - (y0 + i) / H) * Math.PI;
    const sc = Float64Array.from({ length: x1 - x0 }, (_, i) => Math.sin(across(i)));
    const cc = Float64Array.from({ length: x1 - x0 }, (_, i) => Math.cos(across(i)));
    const sr = Float64Array.from({ length: H - y0 }, (_, i) => Math.sin(up(i)));
    const cr = Float64Array.from({ length: H - y0 }, (_, i) => Math.cos(up(i)));
    return (col, row) => sc[col]! * cr[row]! + cc[col]! * sr[row]!;
  };
  const waveA = wave(23, 7, phase[0]!);
  const waveB = wave(-5, 19, phase[1]!);
  const waveC = wave(41, 37, phase[2]!);
  const waveD = wave(13, -17, phase[3]!);
  const blotch = (col: number, row: number): number => (waveA(col, row) * waveB(col, row) + waveC(col, row) * 0.5) / 1.5;
  const tone: RGB = [0, 0, 0];
  const shaved: RGB = mix(mix(hair, [0, 0, 0], 0.45), [70, 78, 88], 0.5);
  // The hair shades the skin just under its edge (more under a long or thick head of hair), and the
  // roots tint the hairline itself; per column, the hairline's elevation there (`hairlineAt`).
  const hairShade = HAIR_SHADE[look.hairStyle];
  const hairline = Float32Array.from({ length: x1 - x0 }, (_, i) => hairlineAt(look, Math.abs(((x0 + i) / W - 0.5) * 2 * Math.PI)));
  const sinFu = Float64Array.from({ length: x1 - x0 }, (_, i) => Math.sin(((x0 + i) / W - 0.5) * 2 * Math.PI));
  const cosFu = Float64Array.from({ length: x1 - x0 }, (_, i) => Math.cos(((x0 + i) / W - 0.5) * 2 * Math.PI));
  // The smooth part (tone, shade, flush, the hair's shade, the beard's cover) at every other pixel both ways,
  // then each pixel from the four round it with its own grain: a quarter of the work, and nothing here is
  // finer than about five pixels across.
  const cols = x1 - x0;
  const rowCount = H - y0;
  const gw = (cols >> 1) + 2;
  const gh = (rowCount >> 1) + 2;
  const grid = new Float32Array(gw * gh * 4);
  const beard = stubble || shadow;
  for (let gj = 0; gj < gh; gj++) {
    const row = Math.min(rowCount - 1, gj * 2);
    const fv = (0.5 - (y0 + row) / H) * Math.PI;
    const sinFv = Math.sin(fv);
    const cosFv = Math.cos(fv);
    const jaw = ramp(fv, -0.9, -1.2);
    for (let gi = 0; gi < gw; gi++) {
      const col = Math.min(cols - 1, gi * 2);
      const underHair = hairShade * ramp(fv, hairline[col]! - 0.24, hairline[col]! + 0.02);
      const shade = 1 - 0.2 * jaw + sum(shades, shadeCols, shadeRows, col, row) - underHair;
      const spot = blotch(col, row);
      const blood = sum(bloods, bloodCols, bloodRows, col, row) + 0.06 * spot;
      const melanin = sum(melanins, melaninCols, melaninRows, col, row) + 0.03 * waveD(col, row);
      absorbInto(tone, skin, melanin, blood);
      const g = (gj * gw + gi) * 4;
      grid[g] = tone[0] * shade;
      grid[g + 1] = tone[1] * shade;
      grid[g + 2] = tone[2] * shade;
      // The beard never reaches above the cheekbones (`beardCover` is nothing past about 0.05 up).
      if (beard && fv < 0.3) {
        d.set(cosFv * sinFu[col]!, sinFv, cosFv * cosFu[col]!);
        grid[g + 3] = beardCover(d);
      }
    }
  }
  const strength = look.beard === 'full' ? 0.6 : stubble ? 0.42 : 0.12;
  const to: RGB = stubble ? [hair[0] * 0.8, hair[1] * 0.8, hair[2] * 0.8] : shaved;
  for (let row = 0; row < rowCount; row++) {
    const fv = (0.5 - (y0 + row) / H) * Math.PI;
    const gj = row >> 1;
    const ty = (row & 1) * 0.5;
    for (let col = 0; col < cols; col++) {
      const gi = col >> 1;
      const tx = (col & 1) * 0.5;
      const a = (gj * gw + gi) * 4;
      const c = a + gw * 4;
      // Bilinear between the four nodes round the pixel (each channel, then the cover).
      const w00 = (1 - tx) * (1 - ty);
      const w10 = tx * (1 - ty);
      const w01 = (1 - tx) * ty;
      const w11 = tx * ty;
      const grain = 1 + (random() - 0.5) * 0.04;
      let r = (grid[a]! * w00 + grid[a + 4]! * w10 + grid[c]! * w01 + grid[c + 4]! * w11) * grain;
      let gr = (grid[a + 1]! * w00 + grid[a + 5]! * w10 + grid[c + 1]! * w01 + grid[c + 5]! * w11) * grain;
      let b = (grid[a + 2]! * w00 + grid[a + 6]! * w10 + grid[c + 2]! * w01 + grid[c + 6]! * w11) * grain;
      const cover = grid[a + 3]! * w00 + grid[a + 7]! * w10 + grid[c + 3]! * w01 + grid[c + 7]! * w11;
      if (cover > 0) {
        const k = cover * strength * (0.45 + 0.55 * random());
        r = THREE.MathUtils.lerp(r, to[0], k);
        gr = THREE.MathUtils.lerp(gr, to[1], k);
        b = THREE.MathUtils.lerp(b, to[2], k);
      }
      if (hairShade > 0) {
        const roots = 0.3 * ramp(fv, hairline[col]! - 0.04, hairline[col]! + 0.06);
        r = THREE.MathUtils.lerp(r, hair[0], roots);
        gr = THREE.MathUtils.lerp(gr, hair[1], roots);
        b = THREE.MathUtils.lerp(b, hair[2], roots);
      }
      const i = (row * cols + col) * 4;
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

  // Age spots: a few faint brown patches on the temples, cheeks and forehead.
  if (look.age === 'elder') {
    for (let i = 0; i < 12; i++) {
      const u = (random() < 0.5 ? -1 : 1) * (0.35 + random() * 0.6);
      const v = -0.25 + random() * 0.85;
      ctx.fillStyle = css(absorb(skin, 0.5 + random() * 0.3, 0), 0.35);
      ctx.beginPath();
      ctx.ellipse(...P(u, v), 1.6 + random() * 2.4, 1.2 + random() * 1.8, random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const shape = faceShapeOf(look);
  farEyes(ctx, look, skin, shape);
  brows(ctx, look, hair, random);
  lips(ctx, skin, shape.mouth);
  // Nostrils, on the underside of the tip (sunk in the skin there too), leaning with the nose.
  const lean = shape.traits.noseTilt * 0.022;
  ctx.fillStyle = css(mix(skin, [30, 15, 12], 0.7), 0.75);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(...P(side * 0.075 + lean, -0.385), 4.5, 2.2, side * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(canvas, 'facing');
}

/** A man's shaved jaw (no beard, short hair, a grown-up): the beard still shows faintly under the skin. */
function shavenShadow(look: PersonLook): boolean {
  return look.beard === undefined && look.figure === 'straight' && look.age !== 'child' && look.age !== 'teen' && look.hairStyle !== 'long' && look.hairStyle !== 'ponytail' && look.hairStyle !== 'bun';
}

/** Canvas pixel of the face angles (`u` across, +x to the right; `v` up). */
function P(u: number, v: number): [number, number] {
  return [W * (0.5 + u / (2 * Math.PI)), H * (0.5 - v / Math.PI)];
}

/**
 * The eyes as seen from afar, painted where the eyeballs sit: a dark almond with the iris in it.
 * The balls and lids hide it close up; past the distance where they dither out (`PersonModel`'s
 * details) it keeps the face from going blank.
 */
function farEyes(ctx: CanvasRenderingContext2D, look: PersonLook, skin: RGB, shape: FaceShape): void {
  for (const side of [-1, 1] as const) {
    const eye = eyeSurface(side, shape);
    const [x, y] = P(Math.atan2(eye.x, eye.z), Math.asin(eye.y / eye.length()));
    ctx.fillStyle = css(mix(skin, [48, 34, 30], 0.5));
    ctx.beginPath();
    ctx.ellipse(x, y, 20, 6, side * -0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = css(mix(rgb(look.eyes), [12, 10, 9], 0.5), 0.9);
    ctx.beginPath();
    ctx.arc(x, y, 5.5, 0, Math.PI * 2);
    ctx.fill();
  }
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

/**
 * The lips on the face's own lines (`MouthLine`, which the skin's vermilion and the jaw follow):
 * the cupid's bow, the fuller lower lip, the dark line between, a fine light roll along the upper
 * lip's border. Neutral for everyone (a smile is the face's morph); the colour fades a little into
 * the corners rather than ending like paint.
 */
function lips(ctx: CanvasRenderingContext2D, skin: RGB, m: MouthLine): void {
  const base = mix(skin, [176, 86, 82], 0.34);
  const STEPS = 28;
  const trace = (line: (u: number) => number, from: number, to: number): void => {
    for (let i = 0; i <= STEPS; i++) {
      const u = from + ((to - from) * i) / STEPS;
      ctx.lineTo(...P(u, line(u)));
    }
  };
  const parting = (u: number): number => partingAt(m, u);
  const upper = (u: number): number => upperLipAt(m, u);
  const lower = (u: number): number => lowerLipAt(m, u);
  const [left] = P(-m.half, 0);
  const [right] = P(m.half, 0);
  const fade = (c: RGB): CanvasGradient => {
    const gradient = ctx.createLinearGradient(left, 0, right, 0);
    gradient.addColorStop(0, css(c, 0.3));
    gradient.addColorStop(0.16, css(c));
    gradient.addColorStop(0.84, css(c));
    gradient.addColorStop(1, css(c, 0.3));
    return gradient;
  };
  // Upper lip, then lower lip.
  ctx.fillStyle = fade(mix(base, [0, 0, 0], 0.16));
  ctx.beginPath();
  trace(parting, -m.half, m.half);
  trace(upper, m.half, -m.half);
  ctx.fill();
  ctx.fillStyle = fade(base);
  ctx.beginPath();
  trace(parting, -m.half, m.half);
  trace(lower, m.half, -m.half);
  ctx.fill();
  // Fine creases across the lower lip, and its sheen.
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = css(mix(base, [40, 12, 12], 0.4), 0.18);
  for (let i = 1; i < 12; i++) {
    const u = -m.half * 0.7 + (m.half * 1.4 * i) / 12;
    ctx.beginPath();
    ctx.moveTo(...P(u, parting(u) - 0.006)); // convention-ok: radians on the face canvas, not a 3D offset
    ctx.lineTo(...P(u * 1.04, lower(u) + 0.008)); // convention-ok: radians on the face canvas, not a 3D offset
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.ellipse(...P(0, (m.middle + m.bottom) / 2 - 0.006), 10, 3, 0, 0, Math.PI * 2); // convention-ok: radians on the face canvas, not a 3D offset
  ctx.fill();
  // The upper lip's border: a fine light roll just above it.
  ctx.lineCap = 'round';
  ctx.strokeStyle = css(mix(skin, [255, 244, 236], 0.35), 0.35);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  trace((u) => upper(u) + 0.006, -m.half * 0.85, m.half * 0.85); // convention-ok: radians on the face canvas, not a 3D offset
  ctx.stroke();
  // The line between them, deepest at the corners: a soft shadow, then the dark parting (the jaw stretches it open, `jawTarget`).
  ctx.strokeStyle = css(mix(base, [20, 8, 8], 0.45), 0.5);
  ctx.lineWidth = 4;
  ctx.beginPath();
  trace(parting, -m.half, m.half);
  ctx.stroke();
  ctx.strokeStyle = css(mix(base, [20, 8, 8], 0.7));
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  trace(parting, -m.half, m.half);
  ctx.stroke();
  ctx.fillStyle = css(mix(base, [20, 8, 8], 0.5), 0.6);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(...P(side * m.half, parting(side * m.half)), 2.2, 0, Math.PI * 2);
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

/** How light a skin tone is (0 dark .. 1 fair): its luma. */
function fairness(rgb: number): number {
  return (0.299 * ((rgb >> 16) & 255) + 0.587 * ((rgb >> 8) & 255) + 0.114 * (rgb & 255)) / 255;
}
