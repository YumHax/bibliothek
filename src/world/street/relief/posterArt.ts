import { LETTERING, letteringFont } from '../../city/shopLooks';

/*
 * The neighbourhood's fly-posters: gig bills, the games fair, a lost cat, a club night, a circus. One picture each,
 * painted the same whether a far facade paints it into its atlas at a few pixels a metre (`facadePainter`) or a near
 * one pastes it as a sheet of its own, sharp (`WallPosters`): a print is an index into `PRINTS`.
 */

interface Print {
  paper: string;
  ink: string;
  /** The headline, its font and colour; a second line under it; the small print at the foot. */
  title: string;
  font: string;
  sub: string;
  foot: string;
  /** What fills the middle: a block of colour, stripes, a pixel invader, a photo, tear-off tabs at the foot. */
  art: 'block' | 'stripes' | 'invader' | 'photo' | 'tabs' | 'none';
  accent: string;
}

const PRINTS: readonly Print[] = [
  { paper: '#16161c', ink: '#f6d23a', title: 'THE STATIC KIDS', font: LETTERING.condensed, sub: 'LIVE AT THE ANCHOR', foot: 'THURSDAY · 9PM · FREE', art: 'block', accent: '#e83a8a' },
  { paper: '#f0e8d0', ink: '#1f3f7a', title: 'RETRO GAMES FAIR', font: LETTERING.slab, sub: 'BUY · SELL · SWAP', foot: 'SUNDAY 10-17 · FRONT ST', art: 'invader', accent: '#d9383a' },
  { paper: '#f4f4ee', ink: '#141418', title: 'LOST CAT', font: LETTERING.sans, sub: 'GINGER · ANSWERS TO TROUBLE', foot: 'PLEASE CALL', art: 'tabs', accent: '#c88a4a' },
  { paper: '#2a1a4a', ink: '#5fe6ff', title: '8-BIT NIGHT', font: LETTERING.condensed, sub: 'CHIPTUNE · DJS · ARCADE', foot: 'SAT · LATE', art: 'stripes', accent: '#ff2fa0' },
  { paper: '#f6d23a', ink: '#8a1a1a', title: 'CIRQUE ROSSI', font: LETTERING.serif, sub: 'ONE WEEK ONLY', foot: 'THE PARK · FROM THE 12TH', art: 'stripes', accent: '#d9383a' },
  { paper: '#e8e2d2', ink: '#2a2a2e', title: 'GRAND FLEA FAIR', font: LETTERING.serif, sub: 'BEHIND RETRO GAMES', foot: 'EVERY FIFTH MARKET DAY', art: 'block', accent: '#3f6b4f' },
  { paper: '#ff6a3a', ink: '#16161c', title: 'DJANGO & THE TAPES', font: LETTERING.condensed, sub: 'NEW CASSETTE OUT NOW', foot: 'HISS INCLUDED', art: 'photo', accent: '#16161c' },
  { paper: '#fbfaf4', ink: '#2a3450', title: 'ROOM TO LET', font: LETTERING.script, sub: 'QUIET · SUNNY · 2ND FLOOR', foot: 'ASK AT THE CAFE', art: 'tabs', accent: '#2a3450' },
  { paper: '#9ad0e8', ink: '#14304a', title: 'OPEN-AIR CINEMA', font: LETTERING.sans, sub: 'THE BANDSTAND · FRIDAYS', foot: 'BRING A BLANKET', art: 'photo', accent: '#14304a' },
  { paper: '#e8e8e8', ink: '#3a6a2a', title: 'SAVE THE BANDSTAND', font: LETTERING.slab, sub: 'PUBLIC MEETING', foot: 'TUESDAY · TOWN HALL', art: 'none', accent: '#3a6a2a' },
];

/** How many prints there are (a poster's `print` is taken modulo this). */
export const PRINT_COUNT = PRINTS.length;

/** A poster's shape: about A2, upright, metres. */
export const POSTER = { width: 0.6, height: 0.84 } as const;

/**
 * Paints print `index` into `ctx`'s rect (x, y, w, h: pixels, y down), at any size: under ~40 px across only its paper,
 * its colour blocks and its headline as a bar; past it the lettering itself. `torn`: a corner torn off and the paper
 * weathered.
 */
export function paintPoster(ctx: CanvasRenderingContext2D, index: number, x: number, y: number, w: number, h: number, torn = false): void {
  const print = PRINTS[((index % PRINT_COUNT) + PRINT_COUNT) % PRINT_COUNT]!;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = print.paper;
  ctx.fillRect(x, y, w, h);
  const sharp = w >= 40;
  const art = { x: x + w * 0.1, y: y + h * 0.36, w: w * 0.8, h: h * 0.36 };
  switch (print.art) {
    case 'block':
      ctx.fillStyle = print.accent;
      ctx.fillRect(art.x, art.y, art.w, art.h);
      break;
    case 'stripes':
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = i % 2 ? print.accent : print.ink;
        ctx.fillRect(art.x + (art.w / 6) * i, art.y, art.w / 6 + 0.5, art.h);
      }
      break;
    case 'invader': {
      const cells = ['00100000100', '00010001000', '00111111100', '01101110110', '11111111111', '10111111101', '10100000101', '00011011000'];
      const c = Math.min(art.w / 11, art.h / 8);
      const ox = art.x + (art.w - c * 11) / 2;
      ctx.fillStyle = print.accent;
      cells.forEach((row, j) => [...row].forEach((on, i) => on === '1' && ctx.fillRect(ox + i * c, art.y + j * c, c + 0.3, c + 0.3)));
      break;
    }
    case 'photo': {
      const g = ctx.createLinearGradient(art.x, art.y, art.x + art.w, art.y + art.h);
      g.addColorStop(0, '#5a5650');
      g.addColorStop(1, '#2a2826');
      ctx.fillStyle = g;
      ctx.fillRect(art.x, art.y, art.w, art.h);
      ctx.fillStyle = 'rgba(240,232,210,0.5)';
      ctx.beginPath();
      ctx.ellipse(art.x + art.w * 0.5, art.y + art.h * 0.42, art.w * 0.14, art.h * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(art.x + art.w * 0.3, art.y + art.h * 0.65, art.w * 0.4, art.h * 0.35);
      break;
    }
    case 'tabs':
      ctx.fillStyle = print.accent;
      ctx.fillRect(art.x + art.w * 0.2, art.y, art.w * 0.6, art.h * 0.8);
      break;
    case 'none':
      break;
  }
  if (sharp) {
    ctx.fillStyle = print.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fit(ctx, print.title, print.font, x + w / 2, y + h * 0.16, w * 0.88, h * 0.13);
    fit(ctx, print.sub, LETTERING.sans, x + w / 2, y + h * 0.29, w * 0.86, h * 0.055);
    fit(ctx, print.foot, LETTERING.condensed, x + w / 2, y + h * (print.art === 'tabs' ? 0.78 : 0.84), w * 0.84, h * 0.06);
  } else {
    ctx.fillStyle = print.ink;
    ctx.fillRect(x + w * 0.1, y + h * 0.1, w * 0.8, h * 0.12);
    ctx.fillRect(x + w * 0.15, y + h * 0.82, w * 0.7, h * 0.05);
  }
  if (print.art === 'tabs') {
    // Tear-off tabs with the number, a few already taken.
    const tabs = 8;
    for (let i = 0; i < tabs; i++) {
      if ((index * 7 + i * 3) % 5 === 0) continue;
      const tx = x + (w / tabs) * i;
      ctx.fillStyle = print.paper;
      ctx.fillRect(tx + 0.5, y + h * 0.86, w / tabs - 1, h * 0.14);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(tx + w / tabs - 1, y + h * 0.86, 1, h * 0.14);
    }
  }
  // Weathering: the paper's grain, a damp line at the foot.
  const damp = ctx.createLinearGradient(0, y + h, 0, y + h * 0.7);
  damp.addColorStop(0, 'rgba(60,52,40,0.22)');
  damp.addColorStop(1, 'rgba(60,52,40,0)');
  ctx.fillStyle = damp;
  ctx.fillRect(x, y + h * 0.7, w, h * 0.3);
  if (torn) {
    // A corner torn away, a crease across.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(x + w, y);
    ctx.lineTo(x + w * 0.72, y);
    ctx.lineTo(x + w * 0.8, y + h * 0.06);
    ctx.lineTo(x + w * 0.9, y + h * 0.09);
    ctx.lineTo(x + w, y + h * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(x, y + h * 0.55, w, Math.max(1, h * 0.008));
  }
  ctx.restore();
}

/** `text` centred at (x, y) in `font`, as large as fits `maxW` by `maxH` pixels. */
function fit(ctx: CanvasRenderingContext2D, text: string, font: string, x: number, y: number, maxW: number, maxH: number): void {
  let px = Math.max(4, Math.floor(maxH));
  ctx.font = letteringFont(font, px);
  const width = ctx.measureText(text).width;
  if (width > maxW) {
    px = Math.max(4, Math.floor((px * maxW) / width));
    ctx.font = letteringFont(font, px);
  }
  ctx.fillText(text, x, y);
}
