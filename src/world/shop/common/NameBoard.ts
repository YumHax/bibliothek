import * as THREE from 'three';
import { createCanvas, seededRandom, toTexture } from '@/covers/generated/canvasUtils';
import { Prop, part } from '../../props/Prop';
import { paint, timber } from '../../materials/palette';
import { WALL, decal } from '../../surface/layers';
import { SIGNWRITER, hex, setLines } from './lettering';

export interface NameBoardOptions {
  /** What it says, the first line biggest. Default the shop's name. */
  lines?: string[];
  /** Outer size. Default 1.6 x 0.36. */
  width?: number;
  height?: number;
  /** The board's paint and its lettering (CSS). Default the shop's accent and lettering. */
  color?: number;
  letters?: string;
  /** `painted`: a signwriter's board with a gilt line round it; `enamel`: a white enamel plate, rounded, the letters in the colour. Default painted. */
  style?: 'painted' | 'enamel';
  seed?: number;
}

const PX_PER_M = 500;
const DEPTH = 0.025;
const MOULDING = 0.03;
const MOULDING_WOOD = timber(0x6a4a30, 0.5);

/**
 * The shop's name over the counter or along the back wall, as it is on its fascia in the street: a painted board in a
 * moulded frame (the letters shaded, a gilt line inside the edge), or an enamel plate. Wall-hung: origin at its
 * centre on the wall, +z into the room. Decoration: never collides.
 */
export class NameBoard extends Prop {
  constructor(options: NameBoardOptions & { lines: string[]; color: number; letters: string; family?: string }) {
    super();
    this.name = 'NameBoard';
    const width = options.width ?? 1.6;
    const height = options.height ?? 0.36;
    const enamel = options.style === 'enamel';
    const board = paint(enamel ? 0xf2efe6 : options.color, enamel ? 0.25 : 0.55);
    part(this, width, height, DEPTH, board, { z: DEPTH / 2 });
    if (!enamel) {
      for (const y of [-1, 1]) part(this, width + MOULDING, MOULDING, DEPTH + 0.012, MOULDING_WOOD, { y: (y * (height + MOULDING)) / 2, z: (DEPTH + 0.012) / 2 });
      for (const x of [-1, 1]) part(this, MOULDING, height, DEPTH + 0.012, MOULDING_WOOD, { x: (x * (width + MOULDING)) / 2, z: (DEPTH + 0.012) / 2 });
    }
    const face = decal(width, height, new THREE.MeshStandardMaterial({ map: paintFace(width, height, options, enamel), roughness: enamel ? 0.3 : 0.6 }), WALL.sign);
    face.position.z += DEPTH;
    this.add(face);
    this.traverse((o) => (o.castShadow = false));
  }
}

function paintFace(wM: number, hM: number, options: NameBoardOptions & { lines: string[]; color: number; letters: string; family?: string }, enamel: boolean): THREE.Texture {
  const W = Math.round(wM * PX_PER_M);
  const H = Math.round(hM * PX_PER_M);
  const [canvas, ctx] = createCanvas(W, H);
  const random = seededRandom(options.seed ?? 7);
  const inset = H * 0.1;
  const edge = enamel ? options.letters : '#c9a44a';
  ctx.fillStyle = enamel ? '#f4f1e8' : hex(options.color);
  ctx.fillRect(0, 0, W, H);
  if (enamel) {
    ctx.fillStyle = '#f4f1e8';
    ctx.fillRect(0, 0, W, H);
    // A few chips of the enamel near the screw holes.
    for (const [x, y] of [[inset * 0.5, inset * 0.5], [W - inset * 0.5, inset * 0.5], [inset * 0.5, H - inset * 0.5], [W - inset * 0.5, H - inset * 0.5]] as const) {
      ctx.fillStyle = '#2a2622';
      ctx.beginPath();
      ctx.arc(x, y, H * 0.025, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.strokeStyle = edge;
  ctx.lineWidth = Math.max(2, H * 0.025);
  ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
  const block = { lines: options.lines, x: inset * 2, y: inset * 1.4, w: W - inset * 4, h: H - inset * 2.8, family: options.family ?? SIGNWRITER, weight: '700', firstScale: 1.8 };
  // The signwriter's drop shadow, then the letters.
  if (!enamel) {
    ctx.save();
    ctx.translate(H * 0.018, H * 0.018);
    setLines(ctx, { ...block, color: 'rgba(0,0,0,0.45)', random: seededRandom(1) });
    ctx.restore();
  }
  setLines(ctx, { ...block, color: enamel ? hex(options.color) : options.letters, random: seededRandom(1) });
  // The weather indoors: a little dust and fading, heavier at the bottom edge.
  for (let i = 0; i < W * 0.6; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.02 + random() * 0.04})`;
    ctx.fillRect(random() * W, H * (0.4 + random() * 0.6), 1 + random() * 3, 1);
  }
  return toTexture(canvas);
}
