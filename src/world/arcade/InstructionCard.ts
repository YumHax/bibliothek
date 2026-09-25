import * as THREE from 'three';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { drawText } from './games/ArcadeGame';

export interface InstructionCardOptions {
  /** The machine's name, across the top. */
  title: string;
  /** How to play: one line each, e.g. "A / D  MOVE". Split a `·`-separated hint with `hintLines`. */
  lines: readonly string[];
  /** The stripe and the title's colour. Default the hall's magenta. */
  accent?: number;
  /** Size of the card, metres. Default 0.16 x 0.09. */
  width?: number;
  height?: number;
}

const PX_PER_M = 1600;

/**
 * The printed card every machine has somewhere on its panel: how to play, in a few short lines,
 * so the keys do not have to live in the HUD. A plane (origin at its centre, facing +z) with a
 * yellowed card, a coloured stripe, the title and the lines; worn at the corners. Decoration.
 */
export class InstructionCard extends THREE.Mesh {
  constructor(options: InstructionCardOptions) {
    const width = options.width ?? 0.16;
    const height = options.height ?? 0.09;
    super(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: paintCard(options, width, height), roughness: 0.7 }));
    this.name = 'InstructionCard';
    this.receiveShadow = true;
  }
}

/** "A/D move · Space launch" as card lines: each part upper-cased on its own line. */
export function hintLines(hint: string): string[] {
  return hint
    .split('·')
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);
}

function paintCard(options: InstructionCardOptions, width: number, height: number): THREE.Texture {
  const W = Math.round(width * PX_PER_M);
  const H = Math.round(height * PX_PER_M);
  const [canvas, ctx] = createCanvas(W, H);
  const accent = `#${new THREE.Color(options.accent ?? 0xff2fa0).getHexString()}`;
  ctx.fillStyle = '#efe6cf';
  ctx.fillRect(0, 0, W, H);
  // Yellowed towards the edges, where fingers go.
  const edge = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(120,90,30,0.28)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, H * 0.24);
  drawText(ctx, options.title, W / 2, H * 0.125, Math.round(H * 0.13), '#fffbe6');
  const lines = options.lines.slice(0, 4);
  const rowH = (H * 0.66) / Math.max(3, lines.length);
  lines.forEach((line, i) => {
    const size = Math.min(Math.round(H * 0.095), Math.floor((W * 0.9) / Math.max(8, line.length) / 0.8));
    drawText(ctx, line, W / 2, H * 0.3 + rowH * (i + 0.5), size, '#2a2230');
  });
  drawText(ctx, 'INSERT 1 COIN', W / 2, H * 0.94, Math.round(H * 0.06), '#6a5a70');
  return toTexture(canvas, 4);
}
