import * as THREE from 'three';
import { createCanvas, toTexture } from '@/graphics/canvas';
import { SHOPFRONTS, type CardId, type FrontKind } from './shopfrontPlan';
import type { UvRect } from './TexQuads';
import { DOOR_CARD_LOOK, paintDoorCard } from '../../shop/common/doorCard';
import { paintGildedLine } from '../../shop/common/gildedLettering';
import { paintTestCard } from '../../shop/snowScreen';

/*
 * The walk-in shops' fronts, painted: one canvas atlas for all of them. Across the top the hanging signs (a board
 * per kind, cut to its shape: an armchair on a gilt-edged board, a television, a paw on a disc, a flower on a
 * scalloped oval), under them the lines lettered on the display glass (gold with a dark edge), then the cards that
 * stand in the windows, each shop's door card (OPEN and CLOSED, painted as the card inside: `shop/common/doorCard`),
 * and the test card on a set in TV REPAIR's window.
 */

const W = 1024;
const SIGN_PX = 256;
const STRIP_H = 64;
const STRIPS_Y = 256;
const CARD_W = 256;
const CARD_H = 160;
const CARDS_Y = STRIPS_Y + 8 * STRIP_H;

const KINDS: readonly FrontKind[] = ['furniture', 'electronics', 'pets', 'florist'];
/** A card, the test card, or a shop's door card (each its own: its accent, its hours). */
type Tile = CardId | 'testcard' | `open:${FrontKind}` | `closed:${FrontKind}`;
const TILES: readonly Tile[] = ['repairs', 'tested', 'adopt', 'paws', 'fresh', 'delivered', 'testcard', ...KINDS.flatMap((k) => [`open:${k}`, `closed:${k}`] as const)];
/** Four tiles a row, as many rows as the tiles need. */
const H = CARDS_Y + Math.ceil(TILES.length / 4) * CARD_H;

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
    SHOPFRONTS[kind].glass.forEach((line, j) => paintGildedLine(ctx, line, 0, STRIPS_Y + (i * 2 + j) * STRIP_H, W, STRIP_H));
  });
  TILES.forEach((id, i) => {
    const [x, y] = tileAt(i);
    ctx.save();
    ctx.translate(x, y);
    if (id === 'testcard') paintTestCard(ctx, CARD_W, CARD_H);
    else if (id.includes(':')) {
      const [side, kind] = id.split(':') as ['open' | 'closed', FrontKind];
      paintDoorCard(ctx, CARD_W, CARD_H, side, kind, { ...DOOR_CARD_LOOK, ink: SHOPFRONTS[kind].accent });
    } else paintCard(ctx, id as CardId);
    ctx.restore();
  });
  const texture = toTexture(canvas, 'grazing');
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

