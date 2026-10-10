import { clamp } from '@/math/scalar';
import type { MotifPainter } from '../props/PictureFrame';

/*
 * MÉMÉ'S FAMILY PHOTOS (docs/story.md "Mémé"): the prints in her frames, painted as the camera of their year took them
 * and as the years have left them (a sepia wedding, a grey boy in shorts, a seaside gone magenta, a school portrait, a
 * flash photo at Christmas). The people are the family of `familyLooks`: the same hair and jumpers in every print.
 * Each painter draws into the frame's mat opening (`PictureFrame`'s custom painter): a white print border, the scene,
 * the toning, a little wear.
 */

/** The prints there are. */
export type FamilyPhoto = 'wedding' | 'felixBoy' | 'seaside' | 'felixYoung' | 'school' | 'felixAndMeme' | 'christmas95';

/** How the print has aged: a sepia toning, a grey silver print, a 70s colour print gone warm and magenta, a newer one. */
type Toning = 'sepia' | 'mono' | 'faded' | 'colour';

/** One person in a print: their colours and what they wear. */
interface Figure {
  skin: number;
  hair: number;
  top: number;
  bottom: number;
  /** A dress or skirt from the waist (`bottom` its colour), else trousers or shorts. */
  dress?: boolean;
  shorts?: boolean;
  /** Short hair, a bun, long hair, or none (grey and thin). */
  hairStyle?: 'short' | 'bun' | 'long' | 'bald';
  glasses?: boolean;
}

/** The family's colours (`familyLooks`): the same people in every print. */
const SKIN = 0xe0b49a;
const MEME_YOUNG: Figure = { skin: SKIN, hair: 0x6a5240, top: 0xf2efe8, bottom: 0xf2efe8, dress: true, hairStyle: 'bun' };
const GRANDPA: Figure = { skin: SKIN, hair: 0x2a2018, top: 0x22242a, bottom: 0x22242a, hairStyle: 'short' };
const FELIX_BOY: Figure = { skin: SKIN, hair: 0x3a2a1c, top: 0xd8d2c4, bottom: 0x4a4a52, shorts: true, hairStyle: 'short' };
const FELIX: Figure = { skin: SKIN, hair: 0x2a1d14, top: 0x8f3b3b, bottom: 0x2b3a5a, hairStyle: 'short', glasses: true };
const FELIX_GREY: Figure = { ...FELIX, hair: 0x8a8278, top: 0x5a6a4a };
const MEME_NOW: Figure = { skin: SKIN, hair: 0xd9d3c8, top: 0x8a5a6a, bottom: 0x3a3a52, dress: true, hairStyle: 'bun', glasses: true };
const CHILD: Figure = { skin: SKIN, hair: 0x4a3222, top: 0x2f6b8f, bottom: 0x3a4a6a, hairStyle: 'short' };

/** The toning applied to a colour: what the years left of it. */
function toned(color: number, toning: Toning, shade = 1): string {
  let r = ((color >> 16) & 255) / 255;
  let g = ((color >> 8) & 255) / 255;
  let b = (color & 255) / 255;
  const lum = 0.3 * r + 0.59 * g + 0.11 * b;
  if (toning === 'sepia') [r, g, b] = [lum * 1.02 + 0.1, lum * 0.9 + 0.06, lum * 0.7 + 0.03];
  else if (toning === 'mono') [r, g, b] = [lum * 0.92 + 0.05, lum * 0.92 + 0.05, lum * 0.9 + 0.06];
  else if (toning === 'faded') {
    // Half the saturation gone, the blacks lifted, the cyan dye faded first: warm and a little magenta.
    [r, g, b] = [lum + (r - lum) * 0.55, lum + (g - lum) * 0.5, lum + (b - lum) * 0.45];
    [r, g, b] = [r * 0.82 + 0.16, g * 0.74 + 0.1, b * 0.72 + 0.12];
  } else [r, g, b] = [r * 0.96 + 0.03, g * 0.95 + 0.02, b * 0.9 + 0.02];
  const c = (v: number) => Math.round(clamp(v * shade, 0, 1) * 255);
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

/**
 * Someone standing, their feet at (`x`, `foot`), `height` px tall, facing the camera: legs (or a skirt), a body, arms
 * down, a head with its hair. Simple shapes, as a figure reads at a frame's size across a room.
 */
function drawFigure(ctx: CanvasRenderingContext2D, f: Figure, toning: Toning, x: number, foot: number, height: number): void {
  const head = height * 0.14;
  const shoulders = height * 0.27;
  const waist = foot - height * 0.47;
  const neck = foot - height + head * 1.9;
  // Legs, or the skirt over them.
  if (f.dress) {
    ctx.fillStyle = toned(f.bottom, toning, 0.95);
    ctx.beginPath();
    ctx.moveTo(x - shoulders * 0.42, waist);
    ctx.lineTo(x + shoulders * 0.42, waist);
    ctx.lineTo(x + shoulders * 0.62, foot - height * 0.12);
    ctx.lineTo(x - shoulders * 0.62, foot - height * 0.12);
    ctx.fill();
    ctx.fillStyle = toned(f.skin, toning, 0.9);
    for (const s of [-1, 1]) ctx.fillRect(x + s * shoulders * 0.18 - height * 0.025, foot - height * 0.12, height * 0.05, height * 0.1);
  } else {
    ctx.fillStyle = toned(f.bottom, toning);
    const legTop = waist;
    const legBottom = f.shorts ? waist + height * 0.16 : foot - height * 0.02;
    for (const s of [-1, 1]) ctx.fillRect(x + s * shoulders * 0.22 - height * 0.045, legTop, height * 0.09, legBottom - legTop);
    if (f.shorts) {
      ctx.fillStyle = toned(f.skin, toning, 0.9);
      for (const s of [-1, 1]) ctx.fillRect(x + s * shoulders * 0.22 - height * 0.035, legBottom, height * 0.07, foot - legBottom - height * 0.02);
    }
  }
  // Shoes.
  ctx.fillStyle = toned(0x1e1a18, toning);
  for (const s of [-1, 1]) ctx.fillRect(x + s * shoulders * 0.22 - height * 0.05, foot - height * 0.03, height * 0.1, height * 0.03);
  // The body and the arms down its sides.
  ctx.fillStyle = toned(f.top, toning);
  ctx.beginPath();
  ctx.moveTo(x - shoulders * 0.5, neck);
  ctx.lineTo(x + shoulders * 0.5, neck);
  ctx.lineTo(x + shoulders * 0.42, waist + height * 0.03);
  ctx.lineTo(x - shoulders * 0.42, waist + height * 0.03);
  ctx.fill();
  for (const s of [-1, 1]) {
    ctx.fillRect(x + s * shoulders * 0.5 - (s > 0 ? height * 0.06 : 0), neck + height * 0.01, height * 0.06, height * 0.3);
    ctx.fillStyle = toned(f.skin, toning, 0.92);
    ctx.fillRect(x + s * shoulders * 0.5 - (s > 0 ? height * 0.055 : -height * 0.005), neck + height * 0.3, height * 0.05, height * 0.05);
    ctx.fillStyle = toned(f.top, toning);
  }
  // The head.
  const cy = neck - head * 0.85;
  ctx.fillStyle = toned(f.skin, toning);
  ctx.beginPath();
  ctx.ellipse(x, cy, head * 0.72, head * 0.88, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = toned(f.hair, toning);
  const style = f.hairStyle ?? 'short';
  if (style !== 'bald') {
    ctx.beginPath();
    ctx.ellipse(x, cy - head * 0.35, head * 0.78, head * 0.58, 0, Math.PI, 0);
    ctx.fill();
  }
  if (style === 'bun') {
    ctx.beginPath();
    ctx.arc(x, cy - head * 0.95, head * 0.32, 0, Math.PI * 2);
    ctx.fill();
  } else if (style === 'long') {
    for (const s of [-1, 1]) ctx.fillRect(x + s * head * 0.62 - head * 0.16, cy - head * 0.4, head * 0.32, head * 1.6);
  }
  // Two dark eyes, the glasses round them.
  ctx.fillStyle = toned(0x2a201a, toning);
  for (const s of [-1, 1]) ctx.fillRect(x + s * head * 0.28 - 1, cy - head * 0.05, Math.max(2, head * 0.1), Math.max(2, head * 0.1));
  if (f.glasses) {
    ctx.strokeStyle = toned(0x2a201a, toning);
    ctx.lineWidth = Math.max(1, head * 0.06);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(x + s * head * 0.3, cy, head * 0.2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

/** A filled rectangle in a toned colour. */
function block(ctx: CanvasRenderingContext2D, color: number, toning: Toning, x: number, y: number, w: number, h: number, shade = 1): void {
  ctx.fillStyle = toned(color, toning, shade);
  ctx.fillRect(x, y, w, h);
}

/** A vertical gradient between two toned colours. */
function gradient(ctx: CanvasRenderingContext2D, top: number, bottom: number, toning: Toning, y0: number, y1: number, w: number): void {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, toned(top, toning));
  g.addColorStop(1, toned(bottom, toning));
  ctx.fillStyle = g;
  ctx.fillRect(0, y0, w, y1 - y0);
}

/**
 * The print round the scene: a white border (yellowed with its age), the corners' wear, a darkening at the edges and
 * the grain of the paper; `scene` paints inside the border.
 */
function print(toning: Toning, scene: (ctx: CanvasRenderingContext2D, w: number, h: number, random: () => number) => void): MotifPainter {
  return (ctx, w, h, random) => {
    const border = Math.round(Math.min(w, h) * (toning === 'colour' ? 0.03 : 0.06));
    ctx.fillStyle = toning === 'colour' ? '#f4f1ea' : toning === 'faded' ? '#efe6d6' : '#e8dcc2';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(border, border);
    ctx.beginPath();
    ctx.rect(0, 0, w - 2 * border, h - 2 * border);
    ctx.clip();
    scene(ctx, w - 2 * border, h - 2 * border, random);
    // The edges darker, as old paper and a cheap lens leave them.
    const iw = w - 2 * border;
    const ih = h - 2 * border;
    const v = ctx.createRadialGradient(iw / 2, ih / 2, Math.min(iw, ih) * 0.3, iw / 2, ih / 2, Math.max(iw, ih) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, toning === 'colour' ? 'rgba(0,0,0,0.18)' : 'rgba(40,24,8,0.35)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, iw, ih);
    ctx.restore();
    // Grain and the odd scratch.
    for (let i = 0; i < 1800; i++) {
      ctx.fillStyle = `rgba(${random() < 0.5 ? '30,20,10' : '255,250,240'},${(random() * 0.08).toFixed(3)})`;
      ctx.fillRect(random() * w, random() * h, 2, 2);
    }
    ctx.strokeStyle = 'rgba(255,250,240,0.25)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const x = random() * w;
      ctx.beginPath();
      ctx.moveTo(x, random() * h);
      ctx.lineTo(x + (random() - 0.5) * 30, random() * h);
      ctx.stroke();
    }
  };
}

/** 1958, sepia: the two of them on the town hall's steps, her veil, his dark suit, the stone arch behind. */
const wedding = print('sepia', (ctx, w, h) => {
  const t: Toning = 'sepia';
  block(ctx, 0xb8ad98, t, 0, 0, w, h);
  // The arch and its door.
  block(ctx, 0x8a8070, t, w * 0.25, h * 0.08, w * 0.5, h * 0.7);
  ctx.fillStyle = toned(0x4a3a2a, t);
  ctx.beginPath();
  ctx.moveTo(w * 0.33, h * 0.78);
  ctx.lineTo(w * 0.33, h * 0.32);
  ctx.arc(w * 0.5, h * 0.32, w * 0.17, Math.PI, 0);
  ctx.lineTo(w * 0.67, h * 0.78);
  ctx.fill();
  // The steps.
  for (let i = 0; i < 3; i++) block(ctx, 0xc8bea8, t, 0, h * (0.78 + i * 0.075), w, h * 0.07, 1 - i * 0.06);
  drawFigure(ctx, GRANDPA, t, w * 0.4, h * 0.95, h * 0.62);
  drawFigure(ctx, MEME_YOUNG, t, w * 0.6, h * 0.95, h * 0.58);
  // The veil over her shoulders, the bouquet in her hands.
  ctx.fillStyle = toned(0xffffff, t);
  ctx.globalAlpha = 0.6;
  ctx.fillRect(w * 0.6 - h * 0.08, h * 0.37, h * 0.16, h * 0.32);
  ctx.globalAlpha = 1;
  ctx.fillStyle = toned(0xe8e0d0, t, 0.8);
  ctx.beginPath();
  ctx.arc(w * 0.6, h * 0.62, h * 0.04, 0, Math.PI * 2);
  ctx.fill();
});

/** 1966, grey: Félix at six in the garden in his shorts, a ball under his arm, the fence and the pear tree. */
const felixBoy = print('mono', (ctx, w, h) => {
  const t: Toning = 'mono';
  gradient(ctx, 0xdcdcdc, 0xb0b0b0, t, 0, h * 0.55, w);
  block(ctx, 0x6a7a5a, t, 0, h * 0.55, w, h * 0.45);
  // The fence's palings.
  for (let x = 0; x < w; x += w * 0.06) block(ctx, 0xd0c8b8, t, x, h * 0.36, w * 0.035, h * 0.22);
  block(ctx, 0xd0c8b8, t, 0, h * 0.42, w, h * 0.02);
  // The tree.
  block(ctx, 0x4a3a2a, t, w * 0.78, h * 0.15, w * 0.05, h * 0.45);
  ctx.fillStyle = toned(0x4a5a3a, t);
  ctx.beginPath();
  ctx.arc(w * 0.8, h * 0.15, h * 0.2, 0, Math.PI * 2);
  ctx.fill();
  drawFigure(ctx, FELIX_BOY, t, w * 0.42, h * 0.92, h * 0.6);
  ctx.fillStyle = toned(0xf0f0f0, t);
  ctx.beginPath();
  ctx.arc(w * 0.54, h * 0.6, h * 0.07, 0, Math.PI * 2);
  ctx.fill();
});

/** 1974, a colour print gone magenta: the beach, the striped parasol, Mémé in her straw hat, Félix at fourteen. */
const seaside = print('faded', (ctx, w, h, random) => {
  const t: Toning = 'faded';
  gradient(ctx, 0x6aa0d0, 0xb8d4e8, t, 0, h * 0.42, w);
  block(ctx, 0x2a6a9a, t, 0, h * 0.42, w, h * 0.12);
  block(ctx, 0xf2f2f2, t, 0, h * 0.53, w, h * 0.015);
  block(ctx, 0xe0c890, t, 0, h * 0.545, w, h * 0.46);
  // The parasol: a pole and a striped dome.
  block(ctx, 0x8a6a4a, t, w * 0.22, h * 0.22, w * 0.012, h * 0.55);
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = toned(i % 2 ? 0xf0f0f0 : 0xd03a2a, t);
    ctx.beginPath();
    ctx.moveTo(w * 0.226, h * 0.2);
    ctx.arc(w * 0.226, h * 0.3, w * 0.2, Math.PI + (i * Math.PI) / 6, Math.PI + ((i + 1) * Math.PI) / 6);
    ctx.fill();
  }
  drawFigure(ctx, { ...MEME_YOUNG, hair: 0x7a5a40, top: 0x1a6a8a, bottom: 0x1a6a8a }, t, w * 0.52, h * 0.94, h * 0.5);
  // Her straw hat.
  ctx.fillStyle = toned(0xe8d090, t);
  ctx.beginPath();
  ctx.ellipse(w * 0.52, h * 0.47, h * 0.09, h * 0.02, 0, 0, Math.PI * 2);
  ctx.fill();
  drawFigure(ctx, { ...FELIX_BOY, top: 0xe0a030, bottom: 0x2a3a6a }, t, w * 0.74, h * 0.95, h * 0.56);
  // Shells and a bucket in the sand.
  block(ctx, 0xd04a2a, t, w * 0.86, h * 0.86, w * 0.05, h * 0.06);
  for (let i = 0; i < 6; i++) block(ctx, 0xf0e8e0, t, random() * w, h * (0.7 + random() * 0.28), 4, 3);
});

/** 1983, warm colour: Félix at twenty-three in his room, his first console under the set, a cartridge held up. */
const felixYoung = print('faded', (ctx, w, h) => {
  const t: Toning = 'faded';
  block(ctx, 0xc8a878, t, 0, 0, w, h);
  // Wallpaper stripes, a poster, the set on its stand.
  for (let x = 0; x < w; x += w * 0.08) block(ctx, 0xb89868, t, x, 0, w * 0.04, h * 0.7);
  block(ctx, 0x2a2a4a, t, w * 0.62, h * 0.1, w * 0.26, h * 0.3);
  block(ctx, 0xe0c040, t, w * 0.66, h * 0.16, w * 0.18, h * 0.04);
  block(ctx, 0x6a4a2a, t, 0, h * 0.7, w, h * 0.3);
  block(ctx, 0x4a3a2a, t, w * 0.58, h * 0.52, w * 0.34, h * 0.24);
  block(ctx, 0x3a3a3a, t, w * 0.62, h * 0.3, w * 0.26, h * 0.22);
  block(ctx, 0x5a8ab0, t, w * 0.65, h * 0.33, w * 0.2, h * 0.16);
  block(ctx, 0x1a1a1a, t, w * 0.64, h * 0.56, w * 0.18, h * 0.05);
  drawFigure(ctx, FELIX, t, w * 0.32, h * 0.97, h * 0.72);
  // The cartridge held up by his face.
  block(ctx, 0x8a8a8a, t, w * 0.43, h * 0.32, w * 0.07, h * 0.09);
  block(ctx, 0xd04030, t, w * 0.44, h * 0.34, w * 0.05, h * 0.04);
});

/** 1996, a school portrait: the child at seven against the mottled blue, head and shoulders, a gap in the smile. */
const school = print('colour', (ctx, w, h, random) => {
  const t: Toning = 'colour';
  gradient(ctx, 0x4a7ab0, 0x2a4a7a, t, 0, h, w);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(255,255,255,${(random() * 0.07).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(random() * w, random() * h, 6 + random() * 18, 0, Math.PI * 2);
    ctx.fill();
  }
  drawFigure(ctx, CHILD, t, w * 0.5, h * 2.05, h * 2.0);
  block(ctx, 0xffffff, t, w * 0.47, h * 0.38, w * 0.06, h * 0.012);
});

/** 2014, colour: Félix grey at the temples beside Mémé at her table, a birthday cake with its candles. */
const felixAndMeme = print('colour', (ctx, w, h) => {
  const t: Toning = 'colour';
  block(ctx, 0xe9dcc0, t, 0, 0, w, h);
  block(ctx, 0xd2c4a6, t, 0, h * 0.6, w, h * 0.02);
  drawFigure(ctx, FELIX_GREY, t, w * 0.32, h * 1.25, h * 0.95);
  drawFigure(ctx, MEME_NOW, t, w * 0.68, h * 1.25, h * 0.85);
  // The table's edge and the cake.
  block(ctx, 0xf4f0e8, t, 0, h * 0.8, w, h * 0.2);
  block(ctx, 0xf0d8e0, t, w * 0.4, h * 0.68, w * 0.2, h * 0.12);
  for (let i = 0; i < 5; i++) {
    block(ctx, 0x6aa0e0, t, w * (0.42 + i * 0.04), h * 0.62, w * 0.008, h * 0.06);
    block(ctx, 0xffd060, t, w * (0.418 + i * 0.04), h * 0.6, w * 0.012, h * 0.02);
  }
});

/** Christmas 1995, a flash photo: the child on the rug with the Game Boy just unwrapped, the tree's lights behind. */
const christmas95 = print('colour', (ctx, w, h, random) => {
  const t: Toning = 'colour';
  block(ctx, 0x6a5a48, t, 0, 0, w, h);
  // The tree in the corner, its lights.
  ctx.fillStyle = toned(0x2a5a32, t);
  ctx.beginPath();
  ctx.moveTo(w * 0.18, h * 0.05);
  ctx.lineTo(w * 0.42, h * 0.7);
  ctx.lineTo(-w * 0.06, h * 0.7);
  ctx.fill();
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = ['#ffd060', '#ff6a5a', '#7ac0ff'][i % 3]!;
    ctx.fillRect(w * (0.02 + random() * 0.32), h * (0.15 + random() * 0.5), 4, 4);
  }
  block(ctx, 0x8a3a32, t, 0, h * 0.72, w, h * 0.28);
  // Wrapping paper on the rug: the sports pages.
  block(ctx, 0xe8e4da, t, w * 0.62, h * 0.82, w * 0.3, h * 0.1);
  ctx.fillStyle = toned(0x3a3a3a, t);
  for (let i = 0; i < 5; i++) ctx.fillRect(w * 0.64, h * (0.835 + i * 0.016), w * 0.24, 2);
  drawFigure(ctx, { ...CHILD, top: 0x2f6b8f }, t, w * 0.55, h * 1.02, h * 0.82);
  // The Game Boy, held up to the camera.
  block(ctx, 0xc8c8c0, t, w * 0.5, h * 0.48, w * 0.1, h * 0.16);
  block(ctx, 0x8a9a5a, t, w * 0.515, h * 0.5, w * 0.07, h * 0.06);
  // The flash's hot spot.
  const flash = ctx.createRadialGradient(w * 0.55, h * 0.45, 0, w * 0.55, h * 0.45, h * 0.5);
  flash.addColorStop(0, 'rgba(255,255,240,0.25)');
  flash.addColorStop(1, 'rgba(255,255,240,0)');
  ctx.fillStyle = flash;
  ctx.fillRect(0, 0, w, h);
});

/** The painter of each print. */
export const FAMILY_PHOTOS: Record<FamilyPhoto, MotifPainter> = { wedding, felixBoy, seaside, felixYoung, school, felixAndMeme, christmas95 };
