import * as THREE from 'three';
import { createCanvas, seededRandom, toTexture, FONT } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../Furniture';
import { boxMesh } from '../meshUtils';
import { matte } from './Prop';
import { wood as woodMaterial } from '@/world/materials/finishes';

/** `wood`: a slatted fruit crate; `cardboard`: a taped-up moving box with a marker scrawl. */
export type CrateStyle = 'wood' | 'cardboard';

export interface CrateOptions {
  style?: CrateStyle;
  width?: number;
  height?: number;
  depth?: number;
  /** How many are piled up (each a little askew). Default 1. */
  stack?: number;
  /** Varies the tint, the twist of each level and the scrawl. */
  seed?: number;
  /** What is written on a cardboard box (default a random word from the market's vocabulary). */
  label?: string;
}

const SCRAWLS = ['NES', 'MISC', 'FRAGILE', 'MANUALS', 'CABLES', 'GB', 'PS1', 'MD', 'LOOSE', 'TO SORT', 'SNES', 'N64'];
const TAPE = '#b89a5a';

/**
 * Stock in waiting: a crate or a taped cardboard box, or a short pile of them, the kind that sits
 * under a market table and along the walls of the hall. Origin on the floor under the centre of the
 * pile. Real furniture: collides (a pile of boxes stops you), so a plan lists it where it does not
 * block a walkway.
 */
export class Crate extends THREE.Group implements Furniture {
  private readonly size: { width: number; height: number; depth: number; stack: number };

  constructor(options: CrateOptions = {}) {
    super();
    const style = options.style ?? 'cardboard';
    this.name = `Crate:${style}`;
    const width = options.width ?? (style === 'wood' ? 0.5 : 0.45);
    const height = options.height ?? (style === 'wood' ? 0.28 : 0.34);
    const depth = options.depth ?? (style === 'wood' ? 0.36 : 0.38);
    const stack = options.stack ?? 1;
    this.size = { width, height, depth, stack };
    const random = seededRandom((options.seed ?? 1) * 2654435761);

    for (let level = 0; level < stack; level++) {
      const one = style === 'wood' ? woodCrate(width, height, depth, random) : cardboardBox(width, height, depth, options.label ?? SCRAWLS[Math.floor(random() * SCRAWLS.length)]!, random);
      // Each level sits a touch off-centre and turned, never a perfect pile.
      one.position.set((random() - 0.5) * 0.04, level * height, (random() - 0.5) * 0.04);
      one.rotation.y = (random() - 0.5) * (level ? 0.3 : 0.15);
      this.add(one);
    }
  }

  get footprint(): THREE.Box3 {
    const { width, height, depth, stack } = this.size;
    return new THREE.Box3(new THREE.Vector3(-width / 2 - 0.03, 0, -depth / 2 - 0.03), new THREE.Vector3(width / 2 + 0.03, height * stack, depth / 2 + 0.03));
  }
}

/** Slats on four sides round corner posts, an open top, a plank floor; pale wood, its tint drawn from `random`. */
function woodCrate(w: number, h: number, d: number, random: () => number): THREE.Group {
  const g = new THREE.Group();
  const tint = new THREE.Color().setHSL(0.09 + (random() - 0.5) * 0.02, 0.35 + (random() - 0.5) * 0.1, 0.55 + (random() - 0.5) * 0.12);
  const wood = woodMaterial(tint, 0.85);
  const post = 0.03;
  const slat = 0.012;
  // The posts stand inside the slats, which are nailed on their outside: flush with them, the
  // faces of a post and a slat would share a plane (and the grain of each its own) and z-fight.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(boxMesh(post, h, post, wood, { x: sx * (w / 2 - slat - post / 2), y: h / 2, z: sz * (d / 2 - slat - post / 2) }));
  g.add(boxMesh(w - 2 * post, 0.015, d - 2 * post, wood, { y: 0.03 }));
  // Three slats a side with a finger's gap between them.
  const slats = 3;
  const slatH = (h - 0.02) / slats - 0.02;
  for (let i = 0; i < slats; i++) {
    const y = 0.02 + i * (slatH + 0.02) + slatH / 2;
    g.add(boxMesh(w, slatH, slat, wood, { y, z: d / 2 - slat / 2 }));
    g.add(boxMesh(w, slatH, slat, wood, { y, z: -d / 2 + slat / 2 }));
    g.add(boxMesh(slat, slatH, d - 2 * slat, wood, { x: w / 2 - slat / 2, y }));
    g.add(boxMesh(slat, slatH, d - 2 * slat, wood, { x: -w / 2 + slat / 2, y }));
  }
  return g;
}

/** A tan box, a tape stripe over the closed top flaps, a marker word on the front. */
function cardboardBox(w: number, h: number, d: number, label: string, random: () => number): THREE.Group {
  const g = new THREE.Group();
  const shade = 0.9 + random() * 0.2;
  const card = new THREE.Color(0xc4a26f).multiplyScalar(shade);
  const plain = matte(card, 0.95);
  const top = new THREE.MeshStandardMaterial({ map: paintTop(card, random), roughness: 0.95 });
  const front = new THREE.MeshStandardMaterial({ map: paintFront(card, label, random), roughness: 0.95 });
  // BoxGeometry material order: +x, -x, +y (top), -y, +z (front), -z.
  const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [plain, plain, top, plain, front, plain]);
  box.position.y = h / 2;
  box.castShadow = true;
  box.receiveShadow = true;
  g.add(box);
  return g;
}

function paintTop(card: THREE.Color, random: () => number): THREE.Texture {
  const [canvas, ctx] = createCanvas(256, 256);
  ctx.fillStyle = `#${card.getHexString()}`;
  ctx.fillRect(0, 0, 256, 256);
  // The seam between the flaps, and the tape holding them.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(126, 0, 4, 256);
  ctx.fillStyle = TAPE;
  ctx.fillRect(108, 0, 40, 256);
  if (random() < 0.5) ctx.fillRect(0, 100 + random() * 50, 256, 34);
  return toTexture(canvas, 2);
}

function paintFront(card: THREE.Color, label: string, random: () => number): THREE.Texture {
  const [canvas, ctx] = createCanvas(256, 200);
  ctx.fillStyle = `#${card.getHexString()}`;
  ctx.fillRect(0, 0, 256, 200);
  // A scuff or two.
  ctx.fillStyle = 'rgba(80,60,30,0.15)';
  for (let i = 0; i < 3; i++) ctx.fillRect(random() * 200, random() * 180, 20 + random() * 60, 4 + random() * 10);
  ctx.save();
  ctx.translate(128, 100);
  ctx.rotate((random() - 0.5) * 0.12);
  ctx.fillStyle = '#2a2622';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold 46px ${FONT}`;
  ctx.fillText(label, 0, 0, 220);
  ctx.restore();
  return toTexture(canvas, 2);
}
