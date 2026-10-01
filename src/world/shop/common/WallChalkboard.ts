import * as THREE from 'three';
import { createCanvas, seededRandom, toTexture } from '@/covers/generated/canvasUtils';
import { Prop, part } from '../../props/Prop';
import { paint, timber } from '../../materials/palette';
import { WALL, decal } from '../../surface/layers';
import { CHALK, setLines } from './lettering';

export interface WallChalkboardOptions {
  /** What is chalked on it, the first line bigger. */
  lines?: string[];
  /** Outer size. Default 0.6 x 0.8. */
  width?: number;
  height?: number;
  /** Wood of the frame, the slate's colour. */
  wood?: number;
  slate?: number;
  /** Chalk colours after the first (white) line, CSS, used in turn. Default cream, yellow, pale blue, pink. */
  chalks?: string[];
  seed?: number;
}

const FRAME = 0.035;
const PX_PER_M = 700;
const CHALKS = ['rgba(255,250,235,0.85)', 'rgba(255,225,150,0.88)', 'rgba(190,228,255,0.85)', 'rgba(255,190,210,0.85)'];

/**
 * A slate in a wooden frame hung on a wall: today's specials, the repair queue, the florist's "tulips 3 for 2", in a
 * chalk hand with wiped-off ghosts of older words, a stub of chalk on the ledge. (The A-frame on the floor is
 * `props/Chalkboard`, prop `aFrameBoard`.) Wall-hung: origin at its centre on the wall, +z into the room. Decoration.
 */
export class WallChalkboard extends Prop {
  constructor(options: WallChalkboardOptions = {}) {
    super();
    this.name = 'WallChalkboard';
    const width = options.width ?? 0.6;
    const height = options.height ?? 0.8;
    const wood = timber(options.wood ?? 0x6a4e34, 0.7);
    for (const y of [-1, 1]) part(this, width, FRAME, 0.028, wood, { y: (y * (height - FRAME)) / 2, z: 0.014 });
    for (const x of [-1, 1]) part(this, FRAME, height - 2 * FRAME, 0.028, wood, { x: (x * (width - FRAME)) / 2, z: 0.014 });
    // The chalk ledge along the bottom, and a stub of chalk on it.
    part(this, width * 0.9, 0.012, 0.05, wood, { y: -height / 2 + FRAME * 0.5, z: 0.04 });
    part(this, 0.04, 0.01, 0.01, paint(0xf4f0e6, 0.9), { x: width * 0.25, y: -height / 2 + FRAME * 0.5 + 0.011, z: 0.045 });
    const slate = options.slate ?? 0x1f2a22;
    const inner = [width - 2 * FRAME, height - 2 * FRAME] as const;
    part(this, inner[0], inner[1], 0.01, paint(slate, 0.9), { z: 0.005 });
    const face = decal(inner[0], inner[1], new THREE.MeshStandardMaterial({ map: paintSlate(inner[0], inner[1], options, slate), roughness: 0.92 }), WALL.paper);
    face.position.z += 0.01;
    this.add(face);
    this.traverse((o) => (o.castShadow = false));
  }
}

function paintSlate(wM: number, hM: number, options: WallChalkboardOptions, slate: number): THREE.Texture {
  const W = Math.round(wM * PX_PER_M);
  const H = Math.round(hM * PX_PER_M);
  const [canvas, ctx] = createCanvas(W, H);
  const random = seededRandom((options.seed ?? 4) * 7919 + 3);
  ctx.fillStyle = `#${slate.toString(16).padStart(6, '0')}`;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 50; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.02 + random() * 0.04})`;
    ctx.fillRect(random() * W, random() * H, W * (0.06 + random() * 0.25), 3 + random() * 14);
  }
  const lines = options.lines ?? ['TODAY', 'ask inside'];
  const chalks = options.chalks ?? CHALKS;
  const pad = W * 0.07;
  const unit = (H - pad * 2) / (1.5 + lines.length - 1);
  setLines(ctx, { lines: lines.slice(0, 1), x: pad, y: pad, w: W - pad * 2, h: unit * 1.5, family: CHALK, color: 'rgba(255,252,240,0.93)', weight: '700', wobble: 0.05, random });
  lines.slice(1).forEach((line, i) => {
    setLines(ctx, { lines: [line], x: pad, y: pad + unit * (1.5 + i), w: W - pad * 2, h: unit, family: CHALK, color: chalks[i % chalks.length]!, weight: '500', wobble: 0.05, random });
  });
  // A chalk flourish under the heading.
  ctx.strokeStyle = 'rgba(255,250,235,0.7)';
  ctx.lineWidth = Math.max(2, H * 0.006);
  ctx.beginPath();
  ctx.moveTo(W * 0.25, pad + unit * 1.4);
  ctx.bezierCurveTo(W * 0.4, pad + unit * 1.5, W * 0.6, pad + unit * 1.3, W * 0.75, pad + unit * 1.42);
  ctx.stroke();
  return toTexture(canvas, 4);
}
