import * as THREE from 'three';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { Prop, part } from '../../props/Prop';
import { paint } from '../../materials/palette';
import { WALL, decal } from '../../surface/layers';
import { cutOut } from './cutout';
import { HAND, POSTER, PRINT, hex, setLines } from './lettering';
import { lcg } from '@/random';

export interface ShopNoticeOptions {
  /** What it says, top first; the first line bigger. */
  lines?: string[];
  /** Outer size, metres. Default an A5 card, 0.15 x 0.21 (a poster: 0.42 x 0.6). */
  width?: number;
  height?: number;
  /** `hand`: felt-tip on a card; `print`: a typed notice; `poster`: a bold printed poster with a coloured band. Default hand. */
  hand?: 'hand' | 'print' | 'poster';
  /** How it is up: drawing pins, strips of tape, or in a thin black frame. Default tape. */
  fixing?: 'pin' | 'tape' | 'frame';
  /** The paper's colour and the ink's. Default off-white and near-black (a poster's band: `accent`). */
  paper?: number;
  ink?: number;
  accent?: number;
  /** Rotation about the wall normal, radians. Default a slight random tilt (none when framed). */
  tilt?: number;
  seed?: number;
}

const PX_PER_M = 1400;
const PINS = ['#c83a3a', '#2f6b8f', '#e6a83a', '#3a9a5a'];
const TAPE = 'rgba(240,232,200,0.75)';
const FRAME = paint(0x1c1a18, 0.45);
const FRAME_BAR = 0.012;

/**
 * Something a shopkeeper put up: a handwritten card ("Back in 5 min", "Please don't tap the glass"), a typed notice
 * (the repair terms, the opening hours), or a printed poster with a coloured band. Taped, pinned or framed; a little
 * askew unless framed. Wall-hung (or on a door, a cabinet's side, a shelf's end): origin at its centre on the
 * surface, +z out of it. Decoration: never collides; its parts merge.
 */
export class ShopNotice extends Prop {
  constructor(options: ShopNoticeOptions = {}) {
    super();
    this.name = 'ShopNotice';
    const hand = options.hand ?? 'hand';
    const poster = hand === 'poster';
    const width = options.width ?? (poster ? 0.42 : 0.15);
    const height = options.height ?? (poster ? 0.6 : 0.21);
    const random = lcg((options.seed ?? 3) * 7919 + 13);
    const fixing = options.fixing ?? 'tape';
    const framed = fixing === 'frame';
    const tilt = options.tilt ?? (framed ? 0 : (random() - 0.5) * 0.08);
    const holder = new THREE.Group();
    holder.rotation.z = tilt;
    this.add(holder);
    let lift = 0;
    if (framed) {
      const d = 0.014;
      for (const y of [-1, 1]) part(holder, width + FRAME_BAR * 2, FRAME_BAR, d, FRAME, { y: (y * (height + FRAME_BAR)) / 2, z: d / 2 });
      for (const x of [-1, 1]) part(holder, FRAME_BAR, height, d, FRAME, { x: (x * (width + FRAME_BAR)) / 2, z: d / 2 });
      part(holder, width, height, 0.004, paint(0xf0ece2, 0.9), { z: 0.002 });
      lift = 0.004;
    }
    const sheet = decal(width, height, cutOut(paintSheet(width, height, options, hand, fixing, random), framed ? 0.35 : 0.85), framed ? WALL.framed : WALL.notice);
    sheet.position.z += lift;
    holder.add(sheet);
    this.traverse((o) => (o.castShadow = false));
  }
}

function paintSheet(wM: number, hM: number, options: ShopNoticeOptions, hand: 'hand' | 'print' | 'poster', fixing: 'pin' | 'tape' | 'frame', random: () => number): THREE.Texture {
  const W = Math.round(wM * PX_PER_M);
  const H = Math.round(hM * PX_PER_M);
  const [canvas, ctx] = createCanvas(W, H);
  const pad = Math.min(W, H) * 0.08;
  const paper = hex(options.paper ?? (hand === 'hand' ? 0xf6f0dc : 0xf4f2ec));
  const ink = hex(options.ink ?? (hand === 'hand' ? 0x1c2a4a : 0x1c1a18));
  // The sheet, a corner a little curled (a darker triangle) unless framed.
  ctx.fillStyle = paper;
  ctx.fillRect(pad * 0.25, pad * 0.25, W - pad * 0.5, H - pad * 0.5);
  if (fixing !== 'frame') {
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath();
    ctx.moveTo(W - pad * 0.25, H - pad * 1.6);
    ctx.lineTo(W - pad * 0.25, H - pad * 0.25);
    ctx.lineTo(W - pad * 1.6, H - pad * 0.25);
    ctx.fill();
  }
  const lines = options.lines ?? ['BACK IN', '5 MINUTES'];
  if (hand === 'poster') {
    const band = hex(options.accent ?? 0xc83a2e);
    ctx.fillStyle = band;
    ctx.fillRect(pad * 0.25, pad * 0.25, W - pad * 0.5, H * 0.3);
    const [title, ...rest] = lines;
    setLines(ctx, { lines: [title ?? ''], x: pad, y: pad * 0.6, w: W - pad * 2, h: H * 0.3 - pad * 0.7, family: POSTER, color: paper, weight: '900' });
    setLines(ctx, { lines: rest, x: pad, y: H * 0.34, w: W - pad * 2, h: H * 0.6, family: PRINT, color: ink, weight: '700', firstScale: 1.3 });
  } else if (hand === 'print') {
    setLines(ctx, { lines, x: pad * 1.2, y: pad * 1.2, w: W - pad * 2.4, h: H - pad * 2.4, family: PRINT, color: ink, weight: '600', firstScale: 1.6, align: lines.length > 3 ? 'left' : 'center' });
  } else {
    setLines(ctx, { lines, x: pad, y: pad, w: W - pad * 2, h: H - pad * 2, family: HAND, color: ink, weight: '700', firstScale: 1.4, wobble: 0.08, random });
    // An underline under the first line, as a felt-tip does it.
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(2, H * 0.008);
    ctx.beginPath();
    const y = pad + (H - pad * 2) / (1.4 + lines.length - 1) * 1.35;
    ctx.moveTo(W * 0.2, y);
    ctx.quadraticCurveTo(W * 0.5, y + H * 0.01 * (random() - 0.5) * 4, W * 0.8, y - H * 0.006);
    if (lines.length > 1) ctx.stroke();
  }
  if (fixing === 'pin') {
    for (const x of [pad * 0.9, W - pad * 0.9]) {
      ctx.fillStyle = PINS[Math.floor(random() * PINS.length)]!;
      ctx.beginPath();
      ctx.arc(x, pad * 0.9, Math.min(W, H) * 0.035, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (fixing === 'tape') {
    ctx.fillStyle = TAPE;
    for (const [x, y, a] of [[W * 0.18, pad * 0.35, -0.5], [W * 0.82, pad * 0.35, 0.5]] as const) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a + (random() - 0.5) * 0.3);
      ctx.fillRect(-W * 0.12, -pad * 0.35, W * 0.24, pad * 0.7);
      ctx.restore();
    }
  }
  return toTexture(canvas);
}
