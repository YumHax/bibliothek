import * as THREE from 'three';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { Prop, part } from '../../props/Prop';
import { timber } from '../../materials/palette';
import { WALL, decal } from '../../surface/layers';
import { HAND, PRINT, setLines } from './lettering';
import { lcg } from '@/random';

/** One thing pinned on the board: a card of words, or a photo (`photo`: a polaroid of a little painted scene, its caption under it). */
export interface PinnedItem {
  /** A card's lines (the first bigger), or a photo's caption. */
  lines: string[];
  /** A polaroid instead of a card: the scene's two colours (sky/wall, then subject), CSS. */
  photo?: [string, string];
  /** The card's colour, CSS. Default a pale index-card tint in turn. */
  paper?: string;
}

export interface CorkBoardOptions {
  /** Outer size. Default 0.9 x 0.6. */
  width?: number;
  height?: number;
  /** A header card across the top ("ADOPT ME", "SMALL ADS"). */
  heading?: string;
  items?: PinnedItem[];
  seed?: number;
}

const FRAME = 0.028;
const PX_PER_M = 900;
const CARDS = ['#fbf6e4', '#fff3a6', '#ffd9e0', '#d8f0dc', '#dbe8ff'];
const PINS = ['#c83a3a', '#2f6b8f', '#e6a83a', '#3a9a5a', '#8a3a9a'];
const DEFAULT_ITEMS: PinnedItem[] = [
  { lines: ['FOR SALE', 'bike, 3 gears', 'ask inside'] },
  { lines: ['Rex, 3'], photo: ['#9ac0d8', '#b8864a'] },
  { lines: ['LOST: keys', 'blue fob'] },
  { lines: ['Piano lessons', '5 coins / hour'] },
];

/**
 * A cork board in a pine frame, cards and polaroids pinned all over it, each askew with a coloured pin and a shadow:
 * small ads, "adopt me" cards, customers' snapshots, the week's specials. Laid out left to right in rows as fits
 * the board. Wall-hung: origin at its centre on the wall, +z into the room. Decoration: never collides.
 */
export class CorkBoard extends Prop {
  constructor(options: CorkBoardOptions = {}) {
    super();
    this.name = 'CorkBoard';
    const width = options.width ?? 0.9;
    const height = options.height ?? 0.6;
    const pine = timber(0xc9a473, 0.6);
    for (const y of [-1, 1]) part(this, width, FRAME, 0.022, pine, { y: (y * (height - FRAME)) / 2, z: 0.011 });
    for (const x of [-1, 1]) part(this, FRAME, height - 2 * FRAME, 0.022, pine, { x: (x * (width - FRAME)) / 2, z: 0.011 });
    const inner = [width - 2 * FRAME, height - 2 * FRAME] as const;
    part(this, inner[0], inner[1], 0.008, pine, { z: 0.004 });
    const face = decal(inner[0], inner[1], new THREE.MeshStandardMaterial({ map: paintBoard(inner[0], inner[1], options), roughness: 0.95 }), WALL.paper);
    face.position.z += 0.008;
    this.add(face);
    this.traverse((o) => (o.castShadow = false));
  }
}

function paintBoard(wM: number, hM: number, options: CorkBoardOptions): THREE.Texture {
  const W = Math.round(wM * PX_PER_M);
  const H = Math.round(hM * PX_PER_M);
  const [canvas, ctx] = createCanvas(W, H);
  const random = lcg((options.seed ?? 9) * 2654435 + 1);
  ctx.fillStyle = '#b98a58';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < W * H * 0.015; i++) {
    ctx.fillStyle = random() < 0.5 ? 'rgba(90,55,25,0.35)' : 'rgba(230,190,140,0.3)';
    ctx.fillRect(random() * W, random() * H, 1 + random() * 2, 1 + random() * 2);
  }
  // Old pin holes and the pale squares of cards taken down.
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = 'rgba(220,180,130,0.25)';
    ctx.fillRect(random() * W * 0.9, random() * H * 0.9, W * 0.12, H * 0.14);
  }
  let top = H * 0.04;
  if (options.heading) {
    const hw = Math.min(W * 0.7, W - 20);
    const hh = H * 0.16;
    pinned(ctx, random, W / 2, top + hh / 2, hw, hh, () => {
      ctx.fillStyle = '#f4f0e4';
      ctx.fillRect(0, 0, hw, hh);
      setLines(ctx, { lines: [options.heading!], x: hw * 0.05, y: hh * 0.1, w: hw * 0.9, h: hh * 0.8, family: HAND, color: '#b0302a', weight: '800', wobble: 0.04, random });
    });
    top += hh + H * 0.04;
  }
  const items = options.items ?? DEFAULT_ITEMS;
  const columns = Math.max(2, Math.round(Math.sqrt(items.length * (W / Math.max(1, H - top)))));
  const rows = Math.ceil(items.length / columns);
  const cellW = W / columns;
  const cellH = (H - top - H * 0.02) / Math.max(1, rows);
  items.forEach((item, i) => {
    const cx = cellW * (i % columns + 0.5) + (random() - 0.5) * cellW * 0.12;
    const cy = top + cellH * (Math.floor(i / columns) + 0.5) + (random() - 0.5) * cellH * 0.1;
    const w = cellW * (item.photo ? 0.66 : 0.8);
    const h = Math.min(cellH * 0.86, item.photo ? w * 1.18 : cellH * 0.8);
    pinned(ctx, random, cx, cy, w, h, () => (item.photo ? polaroid(ctx, random, w, h, item) : card(ctx, random, w, h, item, CARDS[i % CARDS.length]!)));
  });
  return toTexture(canvas);
}

/** Draws `draw` (in a w x h box from its top-left) turned a little about (x, y), with a shadow and a pin at its top. */
function pinned(ctx: CanvasRenderingContext2D, random: () => number, x: number, y: number, w: number, h: number, draw: () => void): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((random() - 0.5) * 0.22);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(-w / 2 + 4, -h / 2 + 5, w, h);
  ctx.translate(-w / 2, -h / 2);
  draw();
  ctx.fillStyle = PINS[Math.floor(random() * PINS.length)]!;
  ctx.beginPath();
  ctx.arc(w / 2, Math.max(6, h * 0.05), Math.max(4, w * 0.045), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function card(ctx: CanvasRenderingContext2D, random: () => number, w: number, h: number, item: PinnedItem, paper: string): void {
  ctx.fillStyle = item.paper ?? paper;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(80,120,190,0.25)';
  ctx.lineWidth = 1;
  for (let y = h * 0.3; y < h; y += h * 0.14) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  setLines(ctx, { lines: item.lines, x: w * 0.07, y: h * 0.1, w: w * 0.86, h: h * 0.82, family: random() < 0.75 ? HAND : PRINT, color: random() < 0.5 ? '#1c2a4a' : '#2a2420', weight: '700', firstScale: 1.35, wobble: 0.06, random });
}

/** A polaroid: white border, a thicker chin with the caption, a little scene: a ground, a wall, a blob of a subject. */
function polaroid(ctx: CanvasRenderingContext2D, random: () => number, w: number, h: number, item: PinnedItem): void {
  const [back, subject] = item.photo!;
  ctx.fillStyle = '#f7f5ee';
  ctx.fillRect(0, 0, w, h);
  const m = w * 0.07;
  const ph = h - m - h * 0.24;
  ctx.fillStyle = back;
  ctx.fillRect(m, m, w - m * 2, ph);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(m, m + ph * 0.72, w - m * 2, ph * 0.28);
  ctx.fillStyle = subject;
  ctx.beginPath();
  ctx.ellipse(w / 2 + (random() - 0.5) * w * 0.15, m + ph * 0.66, w * 0.24, ph * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(w / 2 + w * 0.16, m + ph * 0.44, w * 0.12, 0, Math.PI * 2);
  ctx.fill();
  // A warm cast and a faded corner, as old prints go.
  ctx.fillStyle = 'rgba(255,200,120,0.12)';
  ctx.fillRect(m, m, w - m * 2, ph);
  setLines(ctx, { lines: item.lines.slice(0, 1), x: m, y: m + ph + h * 0.02, w: w - m * 2, h: h * 0.18, family: HAND, color: '#2a2a44', weight: '600', wobble: 0.05, random });
}
