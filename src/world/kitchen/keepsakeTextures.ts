import { createCanvas } from '@/graphics/canvas';
import { seededRng, between } from '@/random';
import type { KeepsakeDef, KeepsakeKind } from '@/social/keepsakes';
import { HAND, PRINT } from '../shop/common/lettering';

/*
 * What a friend's keepsake looks like on the fridge (docs/social.md "Keepsakes"): its size in metres, and its face
 * painted on a canvas from its kind (a polaroid, a postcard, an arcade ticket, a crayon drawing, a recipe card, a page of
 * sheet music, a card, a note, a bookmark, a tag, a setlist, a pressed flower), its colour and its mark, the giver's
 * name signing it. Drawn from a seed, so the same keepsake looks the same every time. A photo's picture (a print
 * taken at their door) is drawn in when it has loaded (`paintPhoto`).
 */

/** Width and height (m) of each kind, as stuck on a fridge door. */
const SIZES: Record<KeepsakeKind, [number, number]> = {
  photo: [0.088, 0.106],
  polaroid: [0.088, 0.106],
  postcard: [0.14, 0.095],
  ticket: [0.055, 0.12],
  drawing: [0.13, 0.1],
  recipe: [0.125, 0.08],
  sheet: [0.1, 0.14],
  card: [0.085, 0.055],
  note: [0.085, 0.09],
  bookmark: [0.04, 0.14],
  tag: [0.06, 0.09],
  setlist: [0.09, 0.12],
  pressed: [0.075, 0.1],
};

/** Pixels per metre of a keepsake's face (a 9 cm polaroid is ~200 px across). */
const PX_PER_M = 2200;

export function keepsakeSize(kind: KeepsakeKind): [number, number] {
  return SIZES[kind];
}

function hex(colour: number): string {
  return `#${colour.toString(16).padStart(6, '0')}`;
}

/** Lines of `text` wrapped to `width` px in the current font, at most `max` of them. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, max: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      out.push(line);
      line = word;
      if (out.length === max) return out;
    } else line = next;
  }
  if (line && out.length < max) out.push(line);
  return out;
}

/** A keepsake's face: `def` as given by `giver` ("Inès"), drawn from `seed`. */
export function paintKeepsake(def: KeepsakeDef, giver: string, seed: string): HTMLCanvasElement {
  const [w, h] = SIZES[def.kind];
  const [canvas, ctx] = createCanvas(Math.round(w * PX_PER_M), Math.round(h * PX_PER_M));
  const W = canvas.width;
  const H = canvas.height;
  const random = seededRng(`keepsake:${seed}`);
  const ink = '#2b3a6b';
  ctx.fillStyle = hex(def.colour);
  ctx.fillRect(0, 0, W, H);
  const hand = (px: number): string => `${Math.round(px)}px ${HAND}`;
  const print = (px: number, weight = 'bold'): string => `${weight} ${Math.round(px)}px ${PRINT}`;
  const words = (text: string, x: number, y: number, width: number, px: number, max: number, colour = ink, font = hand(px)): void => {
    ctx.font = font;
    ctx.fillStyle = colour;
    wrap(ctx, text, width, max).forEach((l, i) => ctx.fillText(l, x, y + i * px * 1.05));
  };
  switch (def.kind) {
    case 'photo':
    case 'polaroid': {
      // The white frame, a deeper chin, the picture: a painted scene until the print loads (a photo) or for good.
      const m = W * 0.07;
      const pic = W - 2 * m;
      const sky = ctx.createLinearGradient(0, m, 0, m + pic);
      sky.addColorStop(0, def.kind === 'photo' ? '#3a3330' : '#9cc2d9');
      sky.addColorStop(1, def.kind === 'photo' ? '#6b5a4c' : '#e8d3a6');
      ctx.fillStyle = sky;
      ctx.fillRect(m, m, pic, pic);
      // Two figures, side by side (a print replaces it).
      ctx.fillStyle = 'rgba(40,30,25,0.75)';
      for (const [cx, r] of [[0.38, 0.11], [0.62, 0.1]] as const) {
        ctx.beginPath();
        ctx.arc(m + pic * cx, m + pic * 0.45, pic * r * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(m + pic * (cx - r), m + pic * 0.56, pic * r * 2, pic * 0.44);
      }
      // A warm wash over it all: an old print.
      ctx.fillStyle = 'rgba(255,214,150,0.12)';
      ctx.fillRect(m, m, pic, pic);
      words(def.place ?? giver, m, m + pic + (H - m - pic) * 0.62, pic, H * 0.075, 1);
      break;
    }
    case 'postcard': {
      // The picture side: a sea, a sun, the caption in a fat print.
      const sea = ctx.createLinearGradient(0, 0, 0, H);
      sea.addColorStop(0, '#f6b25a');
      sea.addColorStop(0.55, '#f7d58c');
      sea.addColorStop(0.56, '#2f7fb5');
      sea.addColorStop(1, '#1d4f7a');
      ctx.fillStyle = sea;
      ctx.fillRect(W * 0.04, H * 0.06, W * 0.92, H * 0.88);
      ctx.fillStyle = '#fff4d0';
      ctx.beginPath();
      ctx.arc(W * 0.7, H * 0.38, H * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.font = print(H * 0.13);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#9a2f2f';
      ctx.lineWidth = H * 0.012;
      const caption = def.place ?? 'Greetings';
      ctx.strokeText(caption, W * 0.08, H * 0.24, W * 0.84);
      ctx.fillText(caption, W * 0.08, H * 0.24, W * 0.84);
      ctx.restore();
      break;
    }
    case 'ticket': {
      // A strip with notched ends, a printed header and the mark in marker.
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      for (let i = 0; i < 4; i++) ctx.fillRect(0, (i + 1) * (H / 5), W, H * 0.006);
      ctx.font = print(W * 0.16);
      ctx.fillStyle = 'rgba(60,30,10,0.75)';
      ctx.save();
      ctx.translate(W * 0.62, H * 0.92);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('ADMIT ONE', 0, 0, H * 0.8);
      ctx.restore();
      ctx.save();
      ctx.translate(W * 0.32, H * 0.88);
      ctx.rotate(-Math.PI / 2);
      words(def.mark ?? giver, 0, 0, H * 0.8, W * 0.32, 1, '#151515');
      ctx.restore();
      break;
    }
    case 'drawing': {
      // Crayon: a sun, a house or a cat in loose strokes, the child's name in capitals.
      ctx.lineCap = 'round';
      ctx.lineWidth = W * 0.02;
      ctx.strokeStyle = '#f2a33a';
      ctx.beginPath();
      ctx.arc(W * 0.18, H * 0.2, H * 0.09, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#e46b2b';
      ctx.fillStyle = 'rgba(240,140,50,0.5)';
      ctx.beginPath();
      ctx.ellipse(W * 0.55, H * 0.62, W * 0.2, H * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(W * 0.55, H * 0.35, H * 0.12, 0, Math.PI * 2);
      ctx.stroke();
      // Ears and a crown, more or less.
      ctx.beginPath();
      ctx.moveTo(W * 0.47, H * 0.27);
      ctx.lineTo(W * 0.49, H * 0.17);
      ctx.lineTo(W * 0.53, H * 0.25);
      ctx.moveTo(W * 0.57, H * 0.25);
      ctx.lineTo(W * 0.61, H * 0.17);
      ctx.lineTo(W * 0.63, H * 0.27);
      ctx.stroke();
      ctx.strokeStyle = '#3a8e3a';
      ctx.beginPath();
      ctx.moveTo(0, H * 0.92);
      for (let x = 0; x <= W; x += W / 12) ctx.lineTo(x, H * (0.9 + between(random, -0.03, 0.03)));
      ctx.stroke();
      words(def.mark ?? giver.toUpperCase(), W * 0.05, H * 0.97, W * 0.4, H * 0.12, 1, '#2a5bd7', print(H * 0.11));
      break;
    }
    case 'recipe':
    case 'note':
    case 'setlist': {
      // Ruled paper (a recipe card's red line at the top), their words in their hand.
      ctx.strokeStyle = 'rgba(80,110,170,0.35)';
      ctx.lineWidth = Math.max(1, H * 0.006);
      const step = H / 9;
      for (let y = step * 1.6; y < H; y += step) {
        ctx.beginPath();
        ctx.moveTo(W * 0.04, y);
        ctx.lineTo(W * 0.96, y);
        ctx.stroke();
      }
      if (def.kind === 'recipe') {
        ctx.strokeStyle = 'rgba(200,60,60,0.7)';
        ctx.beginPath();
        ctx.moveTo(0, step * 1.1);
        ctx.lineTo(W, step * 1.1);
        ctx.stroke();
      }
      words(def.words, W * 0.06, step * 1.45, W * 0.88, step * 0.82, 8);
      break;
    }
    case 'sheet': {
      // Staves of five lines, notes on them, a pencilled word in the margin.
      ctx.strokeStyle = 'rgba(30,30,30,0.7)';
      ctx.lineWidth = Math.max(1, H * 0.0035);
      for (let staff = 0; staff < 5; staff++) {
        const top = H * (0.12 + staff * 0.17);
        for (let l = 0; l < 5; l++) {
          ctx.beginPath();
          ctx.moveTo(W * 0.06, top + l * H * 0.018);
          ctx.lineTo(W * 0.94, top + l * H * 0.018);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(20,20,20,0.85)';
        for (let n = 0; n < 9; n++) {
          ctx.beginPath();
          ctx.ellipse(W * (0.14 + n * 0.09), top + H * 0.018 * Math.floor(between(random, 0, 5)), W * 0.018, H * 0.008, -0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.save();
      ctx.translate(W * 0.6, H * 0.96);
      ctx.rotate(-0.08);
      words(`for the 5th, ${giver.charAt(0)}.`, 0, 0, W * 0.4, H * 0.045, 1, 'rgba(90,90,90,0.8)');
      ctx.restore();
      break;
    }
    case 'card':
    case 'tag': {
      // Printed: the mark in capitals; under it a line in their hand.
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = Math.max(1, W * 0.01);
      ctx.strokeRect(W * 0.05, H * 0.07, W * 0.9, H * 0.86);
      if (def.kind === 'tag') {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.arc(W * 0.5, H * 0.12, W * 0.06, 0, Math.PI * 2);
        ctx.fill();
      }
      const mark = def.mark ?? giver.toUpperCase();
      const handwritten = /[a-z.]/.test(mark);
      words(mark, W * 0.1, H * (def.kind === 'tag' ? 0.42 : 0.45), W * 0.8, H * (handwritten ? 0.22 : 0.16), 2, handwritten ? ink : '#1e1e1e', handwritten ? hand(H * 0.24) : print(H * 0.15));
      words(giver, W * 0.1, H * 0.84, W * 0.8, H * 0.12, 1, 'rgba(40,40,40,0.75)');
      break;
    }
    case 'bookmark': {
      ctx.fillStyle = 'rgba(255,240,215,0.9)';
      ctx.fillRect(W * 0.12, H * 0.05, W * 0.76, H * 0.9);
      ctx.save();
      ctx.translate(W * 0.62, H * 0.9);
      ctx.rotate(-Math.PI / 2);
      words(def.mark ?? giver, 0, 0, H * 0.8, W * 0.28, 1, '#6b2f20', print(W * 0.24));
      ctx.restore();
      break;
    }
    case 'pressed': {
      // A flower pressed flat under a strip of tape, a word under it.
      ctx.fillStyle = '#f7f1e2';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#4c7a3a';
      ctx.lineWidth = W * 0.025;
      ctx.beginPath();
      ctx.moveTo(W * 0.5, H * 0.88);
      ctx.quadraticCurveTo(W * 0.45, H * 0.6, W * 0.52, H * 0.38);
      ctx.stroke();
      ctx.fillStyle = hex(def.colour);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(W * 0.52 + Math.cos(a) * W * 0.12, H * 0.3 + Math.sin(a) * H * 0.08, W * 0.1, H * 0.05, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(250,240,200,0.55)';
      ctx.fillRect(W * 0.2, H * 0.52, W * 0.6, H * 0.1);
      words(giver, W * 0.1, H * 0.97, W * 0.8, H * 0.09, 1);
      break;
    }
  }
  return canvas;
}

/** Draws a photo's print into the picture window of a painted photo (`paintKeepsake` of kind `photo`). */
export function paintPhoto(canvas: HTMLCanvasElement, print: CanvasImageSource): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const m = canvas.width * 0.07;
  const pic = canvas.width - 2 * m;
  ctx.drawImage(print, m, m, pic, pic);
  // A print's warm cast and a faint vignette: it reads as a photo on paper, not a screen.
  ctx.fillStyle = 'rgba(255,214,150,0.1)';
  ctx.fillRect(m, m, pic, pic);
}
