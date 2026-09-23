import * as THREE from 'three';
import { createCanvas, fitFontSize, seededRandom, toTexture, FONT } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../Furniture';
import { boxMesh } from '../meshUtils';
import { matte } from './Prop';

export interface ChalkboardOptions {
  /** What is chalked on it, the first line bigger. Default a welcome. */
  lines?: string[];
  width?: number;
  height?: number;
  /** Wood of the frame and colour of the slate. */
  wood?: number;
  slate?: number;
  /** Varies the hand: slant of each line, smudges. */
  seed?: number;
}

/** How far each leaf leans off vertical (the A of the frame). */
const LEAN = 0.2;
const BAR = 0.04;
const BOARD_T = 0.012;

/**
 * A pavement A-frame chalkboard, the kind a shop stands by its door: two framed slates hinged at
 * the top, the same words chalked on both faces. Origin on the floor under the middle of the A,
 * the faces along local x (a face reads from +z and from -z). Real furniture: the player walks
 * round it, not through.
 */
export class Chalkboard extends THREE.Group implements Furniture {
  private readonly width: number;
  private readonly height: number;

  constructor(options: ChalkboardOptions = {}) {
    super();
    this.name = 'Chalkboard';
    this.width = options.width ?? 0.55;
    this.height = options.height ?? 0.95;
    const lines = options.lines ?? ['WELCOME', 'prices as marked', 'haggling welcome'];
    const wood = matte(options.wood ?? 0x5a4632, 0.8);
    const random = seededRandom((options.seed ?? 1) * 7919);
    const map = paintSlate(this.width, this.height, lines, options.slate ?? 0x1f2a22, random);
    const slate = new THREE.MeshStandardMaterial({ map, roughness: 0.9 });
    const { width: w, height: h } = this;

    for (const side of [1, -1] as const) {
      // Each leaf pivots about the top hinge and leans away from the other.
      const leaf = new THREE.Group();
      leaf.position.y = h;
      leaf.rotation.x = side * LEAN;
      // Frame bars, then the slate set into them, its face towards the leaf's outside.
      leaf.add(boxMesh(BAR, h, BAR, wood, { x: -w / 2 + BAR / 2, y: -h / 2 }));
      leaf.add(boxMesh(BAR, h, BAR, wood, { x: w / 2 - BAR / 2, y: -h / 2 }));
      leaf.add(boxMesh(w - 2 * BAR, BAR, BAR, wood, { y: -BAR / 2 }));
      leaf.add(boxMesh(w - 2 * BAR, BAR, BAR, wood, { y: -h + BAR / 2 }));
      const dark = matte(0x111511, 0.9);
      // BoxGeometry material order: +x, -x, +y, -y, +z, -z. A positive lean about x swings the leaf's foot
      // towards -z, so that leaf's outside is its -z face: that is where the chalk goes.
      const board = new THREE.Mesh(new THREE.BoxGeometry(w - 2 * BAR, h - 2 * BAR, BOARD_T), side > 0 ? [dark, dark, dark, dark, dark, slate] : [dark, dark, dark, dark, slate, dark]);
      board.position.set(0, -h / 2, 0);
      board.castShadow = true;
      board.receiveShadow = true;
      leaf.add(board);
      this.add(leaf);
    }
    // The hinge along the top, and a chain holding the leaves apart halfway down.
    this.add(boxMesh(w - BAR, 0.02, 0.02, matte(0x3a3632, 0.4), { y: h + 0.005 }));
    const chain = boxMesh(0.008, 0.008, 2 * (h / 2) * Math.sin(LEAN), matte(0x6a6660, 0.4), { x: -w / 2 + BAR / 2, y: h / 2 });
    chain.castShadow = false;
    this.add(chain);
  }

  get footprint(): THREE.Box3 {
    const spread = this.height * Math.sin(LEAN) + BAR;
    return new THREE.Box3(new THREE.Vector3(-this.width / 2 - 0.02, 0, -spread), new THREE.Vector3(this.width / 2 + 0.02, this.height, spread));
  }
}

/** Slate with chalk dust, the lines in a chalk hand (white, a little uneven), an underline under the first. */
function paintSlate(wM: number, hM: number, lines: string[], slate: number, random: () => number): THREE.Texture {
  const W = 512;
  const H = Math.round((W * hM) / wM);
  const [canvas, ctx] = createCanvas(W, H);
  ctx.fillStyle = `#${slate.toString(16).padStart(6, '0')}`;
  ctx.fillRect(0, 0, W, H);
  // Dust: wiped-off ghosts of older words.
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.02 + random() * 0.04})`;
    ctx.fillRect(random() * W, random() * H, 30 + random() * 120, 4 + random() * 16);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const slotH = H / (lines.length + 1);
  lines.forEach((line, i) => {
    const y = slotH * (i + 1);
    const big = i === 0;
    ctx.save();
    ctx.translate(W / 2, y);
    ctx.rotate((random() - 0.5) * 0.06);
    ctx.fillStyle = big ? 'rgba(255,250,235,0.92)' : ['rgba(255,250,235,0.85)', 'rgba(255,225,160,0.85)', 'rgba(190,230,255,0.85)'][i % 3]!;
    fitFontSize(ctx, line, W * 0.84, big ? slotH * 0.7 : slotH * 0.5, 20, `"Comic Sans MS", "Chalkboard SE", "Segoe Print", ${FONT}`, big ? 'bold' : 'normal');
    ctx.fillText(line, 0, 0);
    if (big) {
      const width = ctx.measureText(line).width;
      ctx.fillRect(-width / 2, slotH * 0.32, width, 3);
    }
    ctx.restore();
  });
  return toTexture(canvas, 4);
}
