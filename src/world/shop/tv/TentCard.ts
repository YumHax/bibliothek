import * as THREE from 'three';
import { Prop, part } from '../../props/Prop';
import { paint } from '../../materials/palette';
import { createCanvas, toTexture } from '@/graphics/canvas';
import { decal, WALL } from '../../surface/layers';
import { HAND, SIGNWRITER, setLines } from '../common/lettering';

export interface TentCardOptions {
  /** What its front says (+z), top first, the first line bigger; and its back. Default REPAIRS / ALL MAKES / 3 DAYS. */
  front?: string[];
  back?: string[];
  width?: number;
  height?: number;
  /** The card's colour, and the first line's. */
  paper?: number;
  ink?: string;
}

const PX_PER_M = 1200;
/** How far each leaf leans off the upright. */
const LEAN = 0.28;

/**
 * A folded card standing on a surface like a tent, lettered on both leaves: the window's REPAIRS · ALL MAKES card, its
 * front to the street and its back to the shop. Origin on the surface under the fold, the front +z. Decoration: never
 * collides.
 */
export class TentCard extends Prop {
  readonly contactShadow = false;

  constructor(options: TentCardOptions = {}) {
    super();
    this.name = 'TentCard';
    const w = options.width ?? 0.32;
    const h = options.height ?? 0.2;
    const paper = paint(options.paper ?? 0xf4f0e4, 0.85);
    const faces: [string[], number][] = [
      [options.front ?? ['REPAIRS', 'ALL MAKES · TV · RADIO · VIDEO', 'most jobs in 3 days'], 1],
      [options.back ?? ['REPAIRS', 'turn me round if you move me!'], -1],
    ];
    // Each leaf hangs from the fold at the top, turned to its side, its foot kicked out by the lean.
    for (const [lines, side] of faces) {
      const holder = new THREE.Group();
      holder.position.y = h * Math.cos(LEAN);
      holder.rotation.y = side > 0 ? 0 : Math.PI;
      const leaf = new THREE.Group();
      leaf.rotation.x = -LEAN;
      part(leaf, w, h, 0.003, paper, { y: -h / 2 });
      const face = decal(w * 0.96, h * 0.94, new THREE.MeshStandardMaterial({ map: paintLeaf(w, h, lines, options.ink ?? '#b0302a'), roughness: 0.85 }), WALL.print);
      face.position.set(0, -h / 2, 0.0015 + face.position.z);
      leaf.add(face);
      holder.add(leaf);
      this.add(holder);
    }
  }
}

function paintLeaf(wM: number, hM: number, lines: readonly string[], ink: string): THREE.Texture {
  const W = Math.round(wM * PX_PER_M);
  const H = Math.round(hM * PX_PER_M);
  const [canvas, ctx] = createCanvas(W, H);
  ctx.fillStyle = '#f4f0e4';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(2, H * 0.02);
  ctx.strokeRect(H * 0.05, H * 0.05, W - H * 0.1, H - H * 0.1);
  setLines(ctx, { lines: [lines[0]!], x: W * 0.08, y: H * 0.1, w: W * 0.84, h: H * 0.42, family: SIGNWRITER, color: ink, weight: '800' });
  if (lines.length > 1) setLines(ctx, { lines: lines.slice(1), x: W * 0.08, y: H * 0.55, w: W * 0.84, h: H * 0.36, family: HAND, color: '#1e1c1a', firstScale: 1 });
  return toTexture(canvas);
}
