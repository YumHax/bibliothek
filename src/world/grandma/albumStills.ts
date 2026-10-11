import { seededRng } from '@/random';
import type { MotifPainter } from '../props/PictureFrame';
import {
  CHILD,
  FAMILY_PHOTOS,
  FELIX,
  FELIX_BOY,
  FELIX_GREY,
  GRANDPA,
  MEME_YOUNG,
  block,
  drawFigure,
  gradient,
  print,
  toned,
  type FamilyPhoto,
  type Figure,
  type Toning,
} from './familyPhotos';

/*
 * THE STILLS OF MÉMÉ'S OTHER PHOTOS (docs/grandma.md "The album's other photos"): the snapshots she finds and the
 * family's prints, drawn as `familyPhotos` draws her frames (the same people, the same tonings by year), once each and
 * kept as a data URL for the album's pages.
 */

const SIZE = { w: 360, h: 270 } as const;

/** Gaspard as a boy (a year older than Félix, tidier, his money box), and the player's mother at thirteen. */
const GASPARD_BOY: Figure = { ...FELIX_BOY, hair: 0x2a1c12, top: 0x3a4a6a, bottom: 0x2a2a32 };
const MOTHER_GIRL: Figure = { ...CHILD, hair: 0x4a3020, top: 0xd07040, bottom: 0x3a4a7a, dress: true, hairStyle: 'long' };
const TODDLER: Figure = { ...CHILD, top: 0xf0c040, bottom: 0x6a9ad0 };

/** A sky over a ground at `horizon` (0..1 of the height). */
function outdoors(ctx: CanvasRenderingContext2D, w: number, h: number, t: Toning, sky: [number, number], ground: number, horizon: number): void {
  gradient(ctx, sky[0], sky[1], t, 0, h * horizon, w);
  block(ctx, ground, t, 0, h * horizon, w, h * (1 - horizon));
}

/** A round shape (a tree's crown, a ball, a cake). */
function disc(ctx: CanvasRenderingContext2D, color: number, t: Toning, x: number, y: number, r: number): void {
  ctx.fillStyle = toned(color, t);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

const SNAPSHOT_STILLS: Readonly<Record<string, MotifPainter>> = {
  // 1965: the two boys on the garden steps, Gaspard's money box under his arm, Félix's stick of a sword.
  theBoys: print('mono', (ctx, w, h) => {
    const t: Toning = 'mono';
    outdoors(ctx, w, h, t, [0xe0e0e0, 0xb8b8b8], 0x6a7a5a, 0.5);
    for (let i = 0; i < 3; i++) block(ctx, 0xc8c0b0, t, w * 0.2, h * (0.72 + i * 0.08), w * 0.6, h * 0.07, 1 - i * 0.08);
    drawFigure(ctx, GASPARD_BOY, t, w * 0.38, h * 0.9, h * 0.6);
    drawFigure(ctx, FELIX_BOY, t, w * 0.62, h * 0.92, h * 0.54);
    block(ctx, 0x8a3a2a, t, w * 0.41, h * 0.55, w * 0.07, h * 0.06);
    block(ctx, 0x6a5a4a, t, w * 0.68, h * 0.3, w * 0.012, h * 0.34);
  }),
  // 1968: autumn in the park, Félix's hands full of conkers, the leaves down.
  conkers: print('faded', (ctx, w, h, random) => {
    const t: Toning = 'faded';
    outdoors(ctx, w, h, t, [0xc8d0d8, 0xe0d8c8], 0x8a6a3a, 0.55);
    block(ctx, 0x4a3a2a, t, w * 0.15, h * 0.1, w * 0.05, h * 0.5);
    disc(ctx, 0xb06a2a, t, w * 0.17, h * 0.15, h * 0.2);
    for (let i = 0; i < 40; i++) block(ctx, random() < 0.5 ? 0xc0702a : 0xa05020, t, random() * w, h * (0.6 + random() * 0.4), 6, 4);
    drawFigure(ctx, { ...FELIX_BOY, bottom: 0x3a3a52, shorts: false }, t, w * 0.55, h * 0.95, h * 0.62);
    for (let i = 0; i < 4; i++) disc(ctx, 0x6a3a1a, t, w * (0.6 + i * 0.02), h * 0.55, h * 0.02);
  }),
  // 1971: this flat on moving day, boxes stacked in the hall, the sideboard on its end.
  movingDay: print('faded', (ctx, w, h) => {
    const t: Toning = 'faded';
    block(ctx, 0xd8c8a0, t, 0, 0, w, h);
    for (let x = 0; x < w; x += w * 0.1) block(ctx, 0xc8b088, t, x, 0, w * 0.05, h * 0.7);
    block(ctx, 0x8a6a4a, t, 0, h * 0.7, w, h * 0.3);
    for (const [x, y, s] of [[0.08, 0.5, 0.2], [0.1, 0.32, 0.16], [0.3, 0.55, 0.18], [0.72, 0.52, 0.2], [0.75, 0.34, 0.15]] as const) block(ctx, 0xb8945a, t, w * x, h * y, w * s, h * s * 1.1);
    block(ctx, 0x5a3a24, t, w * 0.5, h * 0.2, w * 0.14, h * 0.62);
    drawFigure(ctx, GRANDPA, t, w * 0.44, h * 0.95, h * 0.62);
    drawFigure(ctx, FELIX_BOY, t, w * 0.86, h * 0.97, h * 0.42);
  }),
  // 1976: the player's mother at thirteen on the balcony, arms crossed, the railings behind.
  yourMother: print('faded', (ctx, w, h) => {
    const t: Toning = 'faded';
    outdoors(ctx, w, h, t, [0x8ab0d0, 0xc8d8e0], 0xa89880, 0.7);
    for (let x = 0; x < w; x += w * 0.05) block(ctx, 0x3a3a3a, t, x, h * 0.45, 3, h * 0.3);
    block(ctx, 0x3a3a3a, t, 0, h * 0.45, w, 4);
    drawFigure(ctx, MOTHER_GIRL, t, w * 0.5, h * 1.0, h * 0.72);
  }),
  // 1977: Félix at seventeen kneeling by the set, the little white box of the television game, two bars on the screen.
  pongBox: print('faded', (ctx, w, h) => {
    const t: Toning = 'faded';
    block(ctx, 0xc8a878, t, 0, 0, w, h);
    block(ctx, 0x6a4a2a, t, 0, h * 0.72, w, h * 0.28);
    block(ctx, 0x4a3a2a, t, w * 0.5, h * 0.25, w * 0.36, h * 0.47);
    block(ctx, 0x1a1a1a, t, w * 0.54, h * 0.3, w * 0.28, h * 0.25);
    block(ctx, 0xf0f0f0, t, w * 0.57, h * 0.36, w * 0.012, h * 0.08);
    block(ctx, 0xf0f0f0, t, w * 0.78, h * 0.4, w * 0.012, h * 0.08);
    block(ctx, 0xf0f0f0, t, w * 0.68, h * 0.42, w * 0.012, h * 0.016);
    block(ctx, 0xe8e0d0, t, w * 0.55, h * 0.76, w * 0.14, h * 0.06);
    drawFigure(ctx, { ...FELIX, glasses: false }, t, w * 0.28, h * 1.0, h * 0.75);
  }),
  // 1980: her dahlias at the allotment, as tall as she is, the prize card pinned on.
  garden: print('faded', (ctx, w, h, random) => {
    const t: Toning = 'faded';
    outdoors(ctx, w, h, t, [0x80b0e0, 0xc0d8e8], 0x5a7a3a, 0.45);
    for (let i = 0; i < 9; i++) {
      const x = w * (0.05 + i * 0.1 + random() * 0.03);
      block(ctx, 0x3a6a2a, t, x, h * 0.4, 3, h * 0.5);
      disc(ctx, [0xd03a5a, 0xe08a2a, 0xf0d040][i % 3]!, t, x, h * (0.36 + random() * 0.08), h * 0.06);
    }
    drawFigure(ctx, { ...MEME_YOUNG, hair: 0x7a5a40, top: 0x6a8a5a, bottom: 0x4a4a5a }, t, w * 0.62, h * 0.98, h * 0.62);
    block(ctx, 0xf0f0e8, t, w * 0.8, h * 0.5, w * 0.06, h * 0.05);
  }),
  // 1984: the sagging tent in the rain, Félix in the car with his folding handheld.
  camping: print('faded', (ctx, w, h) => {
    const t: Toning = 'faded';
    outdoors(ctx, w, h, t, [0x9aa0a8, 0xb8bcc0], 0x4a6a3a, 0.5);
    ctx.fillStyle = toned(0xd07a2a, t);
    ctx.beginPath();
    ctx.moveTo(w * 0.05, h * 0.82);
    ctx.lineTo(w * 0.25, h * 0.45);
    ctx.lineTo(w * 0.45, h * 0.82);
    ctx.fill();
    block(ctx, 0x6a8ab0, t, w * 0.5, h * 0.42, w * 0.45, h * 0.32);
    block(ctx, 0xa0c0d8, t, w * 0.55, h * 0.46, w * 0.18, h * 0.12);
    drawFigure(ctx, { ...FELIX, top: 0x3a6a8a }, t, w * 0.64, h * 0.9, h * 0.42);
    block(ctx, 0xc84030, t, w * 0.62, h * 0.6, w * 0.04, h * 0.03);
    ctx.strokeStyle = 'rgba(220,225,235,0.35)';
    for (let i = 0; i < 60; i++) {
      const x = (i * 37) % w;
      const y = (i * 53) % h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 4, y + 14);
      ctx.stroke();
    }
  }),
  // 1985: one plank on two bricks, every box in order, Félix proud beside it.
  firstShelf: print('faded', (ctx, w, h, random) => {
    const t: Toning = 'faded';
    block(ctx, 0xe0d0b0, t, 0, 0, w, h);
    block(ctx, 0x9a7a5a, t, 0, h * 0.78, w, h * 0.22);
    block(ctx, 0xa04a3a, t, w * 0.08, h * 0.66, w * 0.08, h * 0.12);
    block(ctx, 0xa04a3a, t, w * 0.5, h * 0.66, w * 0.08, h * 0.12);
    block(ctx, 0xc8a070, t, w * 0.05, h * 0.62, w * 0.56, h * 0.04);
    for (let i = 0; i < 14; i++) block(ctx, [0xd03a2a, 0x2a4a9a, 0xe0c040, 0x3a8a4a][Math.floor(random() * 4)]!, t, w * (0.07 + i * 0.038), h * 0.48, w * 0.03, h * 0.14);
    drawFigure(ctx, FELIX, t, w * 0.8, h * 0.98, h * 0.72);
  }),
  // 1986: Linden Avenue under snow, Félix by a snowman with a cartridge for a nose.
  snowDay: print('colour', (ctx, w, h, random) => {
    const t: Toning = 'colour';
    outdoors(ctx, w, h, t, [0xc8ccd4, 0xe0e4e8], 0xf4f6f8, 0.5);
    for (let x = 0; x < w; x += w * 0.2) block(ctx, 0xb8a890, t, x, h * 0.05, w * 0.17, h * 0.45);
    disc(ctx, 0xffffff, t, w * 0.35, h * 0.75, h * 0.14);
    disc(ctx, 0xffffff, t, w * 0.35, h * 0.53, h * 0.1);
    block(ctx, 0x6a6a6a, t, w * 0.36, h * 0.52, w * 0.04, h * 0.03);
    drawFigure(ctx, { ...FELIX, top: 0x2a5a3a }, t, w * 0.66, h * 0.97, h * 0.66);
    for (let i = 0; i < 120; i++) disc(ctx, 0xffffff, t, random() * w, random() * h, 1.2);
  }),
  // 1988: the kitchen table under squared paper, the map in pencil, Félix bent over it.
  zeldaMap: print('colour', (ctx, w, h) => {
    const t: Toning = 'colour';
    block(ctx, 0xd8c8a8, t, 0, 0, w, h);
    block(ctx, 0x8a5a3a, t, 0, h * 0.55, w, h * 0.45);
    block(ctx, 0xf4f4f0, t, w * 0.1, h * 0.6, w * 0.7, h * 0.34);
    ctx.strokeStyle = toned(0x8aa0c0, t);
    ctx.lineWidth = 1;
    for (let x = w * 0.1; x < w * 0.8; x += 8) {
      ctx.beginPath();
      ctx.moveTo(x, h * 0.6);
      ctx.lineTo(x, h * 0.94);
      ctx.stroke();
    }
    for (let i = 0; i < 6; i++) block(ctx, 0x4a4a4a, t, w * (0.15 + i * 0.1), h * (0.66 + (i % 3) * 0.08), w * 0.06, h * 0.05);
    block(ctx, 0xd0a030, t, w * 0.82, h * 0.62, w * 0.1, h * 0.14);
    drawFigure(ctx, FELIX, t, w * 0.45, h * 1.25, h * 0.95);
  }),
  // 1990: his thirtieth at this table, the leaning chocolate cake, thirty candles.
  thirtieth: print('colour', (ctx, w, h) => {
    const t: Toning = 'colour';
    block(ctx, 0xe9dcc0, t, 0, 0, w, h);
    drawFigure(ctx, FELIX, t, w * 0.5, h * 1.25, h * 0.95);
    block(ctx, 0xf4f0e8, t, 0, h * 0.78, w, h * 0.22);
    ctx.fillStyle = toned(0x5a3a22, t);
    ctx.beginPath();
    ctx.moveTo(w * 0.36, h * 0.82);
    ctx.lineTo(w * 0.64, h * 0.82);
    ctx.lineTo(w * 0.62, h * 0.68);
    ctx.lineTo(w * 0.39, h * 0.66);
    ctx.fill();
    for (let i = 0; i < 12; i++) block(ctx, 0xffd060, t, w * (0.4 + i * 0.019), h * 0.62, 2, h * 0.04);
  }),
  // Christmas 1990: Félix by her tree with the box he wrapped for himself.
  marioChristmas: print('colour', (ctx, w, h, random) => {
    const t: Toning = 'colour';
    block(ctx, 0x6a5a48, t, 0, 0, w, h);
    ctx.fillStyle = toned(0x2a5a32, t);
    ctx.beginPath();
    ctx.moveTo(w * 0.8, h * 0.05);
    ctx.lineTo(w * 1.02, h * 0.72);
    ctx.lineTo(w * 0.58, h * 0.72);
    ctx.fill();
    for (let i = 0; i < 14; i++) block(ctx, [0xffd060, 0xff6a5a, 0x7ac0ff][i % 3]!, t, w * (0.62 + random() * 0.32), h * (0.2 + random() * 0.45), 4, 4);
    block(ctx, 0x8a3a32, t, 0, h * 0.74, w, h * 0.26);
    drawFigure(ctx, FELIX, t, w * 0.36, h * 1.02, h * 0.82);
    block(ctx, 0xd03a2a, t, w * 0.3, h * 0.46, w * 0.12, h * 0.16);
    block(ctx, 0xf0d040, t, w * 0.31, h * 0.48, w * 0.1, h * 0.03);
  }),
  // Easter 1992: the player at three with a basket on the park's lawn, Félix crouched behind a bush.
  easter: print('colour', (ctx, w, h, random) => {
    const t: Toning = 'colour';
    outdoors(ctx, w, h, t, [0x8ac0e8, 0xd0e4f0], 0x6aa04a, 0.45);
    disc(ctx, 0x3a7a3a, t, w * 0.78, h * 0.62, h * 0.18);
    drawFigure(ctx, { ...FELIX, top: 0xe0d8c8 }, t, w * 0.8, h * 0.9, h * 0.45);
    drawFigure(ctx, TODDLER, t, w * 0.35, h * 0.95, h * 0.38);
    block(ctx, 0xb08a4a, t, w * 0.38, h * 0.78, w * 0.08, h * 0.06);
    for (let i = 0; i < 6; i++) disc(ctx, [0xf06a8a, 0x6ab0f0, 0xf0d050][i % 3]!, t, w * (0.1 + random() * 0.5), h * (0.75 + random() * 0.2), h * 0.02);
  }),
  // 1994: Félix on the Lyon train by the window, head down over the grey handheld.
  onTheTrain: print('colour', (ctx, w, h) => {
    const t: Toning = 'colour';
    block(ctx, 0x5a6a7a, t, 0, 0, w, h);
    block(ctx, 0x9ab8c8, t, w * 0.05, h * 0.1, w * 0.4, h * 0.4);
    block(ctx, 0x6a8a5a, t, w * 0.05, h * 0.35, w * 0.4, h * 0.15);
    block(ctx, 0x2a4a8a, t, w * 0.5, h * 0.3, w * 0.45, h * 0.7);
    drawFigure(ctx, { ...FELIX, top: 0x6a5a4a }, t, w * 0.62, h * 1.15, h * 0.85);
    block(ctx, 0xc8c8c0, t, w * 0.58, h * 0.6, w * 0.08, h * 0.12);
  }),
  // December 1998: the queue in the rain at dawn, Félix third with his umbrella, her thermos in his hand.
  queue: print('colour', (ctx, w, h) => {
    const t: Toning = 'colour';
    outdoors(ctx, w, h, t, [0x3a4050, 0x6a7080], 0x4a4a50, 0.62);
    block(ctx, 0xe0c060, t, w * 0.62, h * 0.2, w * 0.34, h * 0.42);
    block(ctx, 0x2a2a3a, t, w * 0.6, h * 0.14, w * 0.38, h * 0.06);
    for (const [x, f] of [[0.15, { ...FELIX_GREY, hair: 0x2a1d14, top: 0x3a3a4a }], [0.3, { ...CHILD, top: 0x8a2a2a, bottom: 0x2a2a3a }], [0.47, { ...FELIX, top: 0x2a3a5a }]] as const) drawFigure(ctx, f, t, w * x, h * 0.97, h * 0.62);
    ctx.fillStyle = toned(0x1a1a1a, t);
    ctx.beginPath();
    ctx.arc(w * 0.47, h * 0.38, h * 0.12, Math.PI, 0);
    ctx.fill();
    block(ctx, 0xb8b8c0, t, w * 0.51, h * 0.62, w * 0.025, h * 0.08);
  }),
  // 1999: the café on the square, two grown men heads together over two little handhelds.
  cafeSwap: print('colour', (ctx, w, h) => {
    const t: Toning = 'colour';
    block(ctx, 0x8a5a3a, t, 0, 0, w, h);
    block(ctx, 0xe8d8b0, t, 0, 0, w, h * 0.12);
    drawFigure(ctx, FELIX, t, w * 0.32, h * 1.18, h * 0.9);
    drawFigure(ctx, { ...FELIX_GREY, hair: 0x6a4a2a, top: 0x3a6a4a, glasses: false }, t, w * 0.68, h * 1.18, h * 0.9);
    block(ctx, 0xd8d0c0, t, w * 0.1, h * 0.8, w * 0.8, h * 0.2);
    block(ctx, 0xc03030, t, w * 0.4, h * 0.66, w * 0.06, h * 0.1);
    block(ctx, 0xc8c8c0, t, w * 0.54, h * 0.66, w * 0.06, h * 0.1);
    block(ctx, 0xf4f4f0, t, w * 0.2, h * 0.74, w * 0.06, h * 0.06);
  }),
  // 2001: the player and Félix on a bench by the river, one handheld each.
  park: print('colour', (ctx, w, h) => {
    const t: Toning = 'colour';
    outdoors(ctx, w, h, t, [0x9ac8f0, 0xd8ecf8], 0x5a9a4a, 0.5);
    block(ctx, 0x4a7aa0, t, 0, h * 0.42, w, h * 0.1);
    block(ctx, 0x6a4a2a, t, w * 0.2, h * 0.66, w * 0.6, h * 0.05);
    block(ctx, 0x6a4a2a, t, w * 0.2, h * 0.5, w * 0.6, h * 0.04);
    drawFigure(ctx, FELIX, t, w * 0.38, h * 0.95, h * 0.62);
    drawFigure(ctx, CHILD, t, w * 0.62, h * 0.95, h * 0.5);
    block(ctx, 0xc8c8c0, t, w * 0.36, h * 0.55, w * 0.05, h * 0.07);
    block(ctx, 0xc8c8c0, t, w * 0.6, h * 0.65, w * 0.05, h * 0.07);
  }),
  // 1952: Odette at the dance, the bunting, the band's stand behind her.
  odette: print('mono', (ctx, w, h, random) => {
    const t: Toning = 'mono';
    block(ctx, 0x5a5a5a, t, 0, 0, w, h);
    block(ctx, 0x8a8a8a, t, 0, h * 0.75, w, h * 0.25);
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = toned(i % 2 ? 0xe0e0e0 : 0xa0a0a0, t);
      ctx.beginPath();
      ctx.moveTo(i * w * 0.07, h * 0.08);
      ctx.lineTo(i * w * 0.07 + w * 0.035, h * 0.18);
      ctx.lineTo(i * w * 0.07 + w * 0.07, h * 0.08);
      ctx.fill();
    }
    for (let i = 0; i < 30; i++) disc(ctx, 0xf0f0e0, t, random() * w, h * (0.25 + random() * 0.3), 1.5);
    drawFigure(ctx, { ...MEME_YOUNG, top: 0xe8e8e8, bottom: 0x9a9a9a }, t, w * 0.5, h * 0.98, h * 0.72);
  }),
  // Last spring: Félix grey at his window, from the street below, the curtain half drawn.
  lastFelix: print('colour', (ctx, w, h) => {
    const t: Toning = 'colour';
    block(ctx, 0xb8a890, t, 0, 0, w, h);
    block(ctx, 0x2a3040, t, w * 0.3, h * 0.15, w * 0.4, h * 0.7);
    block(ctx, 0x8a3a3a, t, w * 0.3, h * 0.15, w * 0.12, h * 0.7);
    drawFigure(ctx, FELIX_GREY, t, w * 0.56, h * 1.2, h * 0.9);
    block(ctx, 0x6a5a4a, t, w * 0.26, h * 0.84, w * 0.48, h * 0.04);
    disc(ctx, 0x4a7a3a, t, w * 0.3, h * 0.82, h * 0.05);
  }),
};

const stills = new Map<string, string>();

/** Paints `painter` on a print-sized canvas (seeded by `id`, so a print's grain never changes): a data URL, or '' without a canvas. */
function render(id: string, painter: MotifPainter): string {
  const cached = stills.get(id);
  if (cached !== undefined) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE.w;
  canvas.height = SIZE.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  painter(ctx, SIZE.w, SIZE.h, seededRng(`album-still-${id}`));
  const url = canvas.toDataURL('image/jpeg', 0.82);
  stills.set(id, url);
  return url;
}

/** The still of snapshot `id`, or null when it has none drawn. */
export function snapshotStill(id: string): string | null {
  const painter = SNAPSHOT_STILLS[id];
  return painter ? render(id, painter) : null;
}

/** The still of the family's print `id` (a print of her walls'). */
export function familyStill(id: FamilyPhoto): string {
  return render(`family-${id}`, FAMILY_PHOTOS[id]);
}

/** Whether `id` is one of the family's prints. */
export function isFamilyPhoto(id: string): id is FamilyPhoto {
  return id in FAMILY_PHOTOS;
}
