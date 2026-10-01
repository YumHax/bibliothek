import * as THREE from 'three';
import { createCanvas, toTexture } from '@/graphics/canvas';
import { SHOPFRONTS, type CardId, type FrontKind } from './shopfrontPlan';
import type { UvRect } from './TexQuads';

/*
 * The walk-in shops' fronts, painted: one canvas atlas for all of them. Across the top the hanging signs (a board
 * per kind, cut to its shape: an armchair on a gilt-edged board, a television, a paw on a disc, a flower on a
 * scalloped oval), under them the lines lettered on the display glass (gold with a dark edge), then the cards that
 * stand in the windows, the door's OPEN and CLOSED, and the test card on a set in TV REPAIR's window.
 */

const W = 1024;
const H = 1088;
const SIGN_PX = 256;
const STRIP_H = 64;
const STRIPS_Y = 256;
const CARD_W = 256;
const CARD_H = 160;
const CARDS_Y = STRIPS_Y + 8 * STRIP_H;

const KINDS: readonly FrontKind[] = ['furniture', 'electronics', 'pets', 'florist'];
type Tile = CardId | 'testcard' | 'open' | 'closed';
const TILES: readonly Tile[] = ['repairs', 'tested', 'adopt', 'paws', 'fresh', 'delivered', 'testcard', 'open', 'closed'];

const SERIF = 'Georgia, "Times New Roman", serif';
const HAND = '"Comic Sans MS", "Marker Felt", "Segoe Print", cursive';
const PAPER = '#f4efe2';
const INK = '#2a2622';

export interface ShopfrontAtlas {
  texture: THREE.CanvasTexture;
  sign(kind: FrontKind): UvRect;
  glass(kind: FrontKind, line: 0 | 1): UvRect;
  tile(id: Tile): UvRect;
}

function uv(x: number, y: number, w: number, h: number): UvRect {
  return { u0: x / W, u1: (x + w) / W, v0: 1 - (y + h) / H, v1: 1 - y / H };
}

function tileAt(i: number): [x: number, y: number] {
  return [(i % 4) * CARD_W, CARDS_Y + Math.floor(i / 4) * CARD_H];
}

/** Paints the atlas (every sign, line and card) and hands out where each is. */
export function paintShopfrontAtlas(): ShopfrontAtlas {
  const [canvas, ctx] = createCanvas(W, H);
  ctx.clearRect(0, 0, W, H);
  KINDS.forEach((kind, i) => {
    ctx.save();
    ctx.translate(i * SIGN_PX, 0);
    SIGN_PAINTERS[kind](ctx);
    ctx.restore();
    SHOPFRONTS[kind].glass.forEach((line, j) => paintGlassLine(ctx, line, STRIPS_Y + (i * 2 + j) * STRIP_H));
  });
  TILES.forEach((id, i) => {
    const [x, y] = tileAt(i);
    ctx.save();
    ctx.translate(x, y);
    if (id === 'testcard') paintTestCard(ctx);
    else if (id === 'open' || id === 'closed') paintDoorCard(ctx, id);
    else paintCard(ctx, id);
    ctx.restore();
  });
  const texture = toTexture(canvas, 8);
  return {
    texture,
    sign: (kind) => uv(KINDS.indexOf(kind) * SIGN_PX + 2, 2, SIGN_PX - 4, SIGN_PX - 4),
    glass: (kind, line) => uv(0, STRIPS_Y + (KINDS.indexOf(kind) * 2 + line) * STRIP_H, W, STRIP_H),
    tile: (id) => {
      const [x, y] = tileAt(TILES.indexOf(id));
      return uv(x + 2, y + 2, CARD_W - 4, CARD_H - 4);
    },
  };
}

/** The aspect (width over height) of a glass line and of a card, for the quads that show them. */
export const GLASS_ASPECT = W / STRIP_H;
export const CARD_ASPECT = CARD_W / CARD_H;

const SIGN_PAINTERS: Record<FrontKind, (ctx: CanvasRenderingContext2D) => void> = {
  // An armchair in cream on a dark wooden board with a gilt edge.
  furniture: (ctx) => {
    board(ctx, 18, 30, 220, 196, 10, '#c9a24a', '#4a3624');
    ctx.fillStyle = '#efe6d2';
    roundRect(ctx, 82, 62, 92, 74, 26);
    ctx.fill();
    roundRect(ctx, 58, 104, 34, 62, 14);
    ctx.fill();
    roundRect(ctx, 164, 104, 34, 62, 14);
    ctx.fill();
    ctx.fillRect(84, 130, 88, 30);
    ctx.fillRect(70, 160, 10, 22);
    ctx.fillRect(176, 160, 10, 22);
    word(ctx, 'FURNITURE', 128, 205, 22, '#c9a24a');
  },
  // A television set: cyan-edged cabinet, a pale screen with scanlines, the aerial and two knobs.
  electronics: (ctx) => {
    ctx.strokeStyle = '#8fe6ff';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(128, 64);
    ctx.lineTo(84, 14);
    ctx.moveTo(128, 64);
    ctx.lineTo(176, 18);
    ctx.stroke();
    ctx.fillStyle = '#8fe6ff';
    for (const [x, y] of [[84, 14], [176, 18]] as const) {
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    board(ctx, 16, 60, 224, 172, 26, '#8fe6ff', '#23303a');
    ctx.fillStyle = '#9ab8c8';
    roundRect(ctx, 38, 82, 142, 104, 22);
    ctx.fill();
    ctx.fillStyle = 'rgba(30,40,50,0.18)';
    for (let y = 86; y < 184; y += 6) ctx.fillRect(40, y, 138, 2);
    ctx.fillStyle = '#8fe6ff';
    for (const y of [104, 150]) {
      ctx.beginPath();
      ctx.arc(208, y, 11, 0, Math.PI * 2);
      ctx.fill();
    }
    word(ctx, 'REPAIRS', 110, 212, 22, '#8fe6ff');
  },
  // A cream paw on a teal disc ringed in cream.
  pets: (ctx) => {
    ctx.fillStyle = '#f0ead8';
    ctx.beginPath();
    ctx.arc(128, 128, 122, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2f6a6a';
    ctx.beginPath();
    ctx.arc(128, 128, 110, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f0ead8';
    ctx.beginPath();
    ctx.ellipse(128, 142, 40, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    for (const [x, y, r] of [[80, 98, 0.35], [108, 74, 0.1], [148, 74, -0.1], [176, 98, -0.35]] as const) {
      ctx.beginPath();
      ctx.ellipse(x, y, 15, 20, r, 0, Math.PI * 2);
      ctx.fill();
    }
    word(ctx, 'PETS', 128, 206, 24, '#f0ead8');
  },
  // A flower on a plum oval with a scalloped edge.
  florist: (ctx) => {
    ctx.fillStyle = '#e8e0d4';
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(128 + Math.cos(a) * 104, 128 + Math.sin(a) * 110, 18, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(128, 128, 106, 112, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5a3f6a';
    ctx.beginPath();
    ctx.ellipse(128, 128, 94, 100, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#6fa35e';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(128, 120);
    ctx.quadraticCurveTo(122, 160, 128, 186);
    ctx.stroke();
    ctx.fillStyle = '#6fa35e';
    ctx.beginPath();
    ctx.ellipse(146, 160, 18, 8, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e0567a';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.ellipse(128 + Math.cos(a) * 24, 96 + Math.sin(a) * 24, 18, 13, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#f0c94a';
    ctx.beginPath();
    ctx.arc(128, 96, 13, 0, Math.PI * 2);
    ctx.fill();
    word(ctx, 'FLOWERS', 128, 206, 22, '#e8e0d4');
  },
};

/** A board: an edge of `edge` colour round a `fill` face. */
function board(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, edge: string, fill: string): void {
  ctx.fillStyle = edge;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.fillStyle = fill;
  roundRect(ctx, x + 8, y + 8, w - 16, h - 16, Math.max(2, r - 6));
  ctx.fill();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function word(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, color: string, font = SERIF): void {
  ctx.fillStyle = color;
  ctx.font = `bold ${px}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

/** A line on the glass: gold leaf shaded top to bottom, outlined dark, fitted to the strip. */
function paintGlassLine(ctx: CanvasRenderingContext2D, text: string, y: number): void {
  let px = 46;
  ctx.font = `italic bold ${px}px ${SERIF}`;
  while (px > 18 && ctx.measureText(text).width > W * 0.94) {
    px -= 2;
    ctx.font = `italic bold ${px}px ${SERIF}`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#2a1e0c';
  ctx.strokeText(text, W / 2, y + STRIP_H / 2);
  const gold = ctx.createLinearGradient(0, y + 10, 0, y + STRIP_H - 10);
  gold.addColorStop(0, '#fbe7a8');
  gold.addColorStop(0.5, '#d9a94a');
  gold.addColorStop(1, '#a8782a');
  ctx.fillStyle = gold;
  ctx.fillText(text, W / 2, y + STRIP_H / 2);
}

const CARD_TEXT: Record<CardId, { lines: [string, string]; accent: string; small?: string }> = {
  repairs: { lines: ['REPAIRS', 'while you wait*'], accent: '#b8302a', small: '*mostly' },
  tested: { lines: ['ALL SETS', 'TESTED'], accent: '#2e5a8a' },
  adopt: { lines: ['ASK ABOUT', 'our rescue cat'], accent: '#2f6a6a', small: '♥' },
  paws: { lines: ['FOOD · TOYS', 'aquaria'], accent: '#2f6a6a' },
  fresh: { lines: ['FRESH', 'today'], accent: '#5a3f6a' },
  delivered: { lines: ['DELIVERED', 'the same day'], accent: '#7a5234' },
};

/** A card of the shop's: cream paper, a coloured rule, two lines in hand, a small word. */
function paintCard(ctx: CanvasRenderingContext2D, id: CardId): void {
  const { lines, accent, small } = CARD_TEXT[id];
  ctx.fillStyle = PAPER;
  ctx.fillRect(4, 4, CARD_W - 8, CARD_H - 8);
  ctx.fillStyle = accent;
  ctx.fillRect(4, 4, CARD_W - 8, 12);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(5, 5, CARD_W - 10, CARD_H - 10);
  word(ctx, lines[0], CARD_W / 2, 62, 36, accent, SERIF);
  word(ctx, lines[1], CARD_W / 2, 108, 30, INK, HAND);
  if (small) word(ctx, small, CARD_W - 40, CARD_H - 24, 18, INK, HAND);
}

/** The door's card on its string: OPEN in green, CLOSED in red, "come in" and the hours under. */
function paintDoorCard(ctx: CanvasRenderingContext2D, id: 'open' | 'closed'): void {
  const open = id === 'open';
  ctx.fillStyle = open ? '#f2f0e6' : '#f2ece6';
  roundRect(ctx, 6, 6, CARD_W - 12, CARD_H - 12, 14);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = open ? '#2f7a4a' : '#a82a2a';
  roundRect(ctx, 14, 14, CARD_W - 28, CARD_H - 28, 10);
  ctx.stroke();
  word(ctx, open ? 'OPEN' : 'CLOSED', CARD_W / 2, 70, open ? 64 : 52, open ? '#2f7a4a' : '#a82a2a', 'Arial, Helvetica, sans-serif');
  word(ctx, open ? 'come in' : 'open 9 – 21', CARD_W / 2, 118, 26, INK, HAND);
}

/** The test card: colour bars, a grey scale, a circle and a cross. */
function paintTestCard(ctx: CanvasRenderingContext2D): void {
  const bars = ['#f0f0f0', '#f0f040', '#40f0f0', '#40f040', '#f040f0', '#f04040', '#4040f0', '#202020'];
  const bw = CARD_W / bars.length;
  bars.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(i * bw, 0, bw + 1, CARD_H * 0.7);
  });
  for (let i = 0; i < 8; i++) {
    const g = Math.round((i / 7) * 230);
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.fillRect(i * bw, CARD_H * 0.7, bw + 1, CARD_H * 0.3);
  }
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(CARD_W / 2, CARD_H / 2, CARD_H * 0.38, 0, Math.PI * 2);
  ctx.moveTo(CARD_W / 2 - 30, CARD_H / 2);
  ctx.lineTo(CARD_W / 2 + 30, CARD_H / 2);
  ctx.moveTo(CARD_W / 2, CARD_H / 2 - 30);
  ctx.lineTo(CARD_W / 2, CARD_H / 2 + 30);
  ctx.stroke();
}
