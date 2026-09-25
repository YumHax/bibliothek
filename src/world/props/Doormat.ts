import * as THREE from 'three';
import { createCanvas, seededRandom, toTexture, FONT } from '@/covers/generated/canvasUtils';
import { Prop } from './Prop';

export interface DoormatOptions {
  /** Size, along local x and z. Default 0.62 x 0.4. */
  width?: number;
  depth?: number;
  /** Words stencilled on it, half worn off. Default none. */
  text?: string;
  /** 0 new .. 1 trodden flat: how bald and grubby the middle is. Default 0.7. */
  wear?: number;
  seed?: number;
}

/** Coir is thick: a mat stands this proud of the floor. */
export const DOORMAT_THICKNESS = 0.018;
const PX_PER_M = 900;

/**
 * A coir doormat on a black rubber back: brown bristles, a darker trodden patch in the middle
 * where everybody wipes their feet, stray fibres at the edge, words half worn off if any. Floor
 * placement, local x along the door. Decoration: never collides.
 */
export class Doormat extends Prop {
  constructor(options: DoormatOptions = {}) {
    super();
    this.name = 'Doormat';
    const width = options.width ?? 0.62;
    const depth = options.depth ?? 0.4;
    const map = paintCoir(width, depth, options.text ?? '', options.wear ?? 0.7, seededRandom((options.seed ?? 3) * 7919));
    const top = new THREE.MeshStandardMaterial({ map, roughness: 1, bumpMap: map, bumpScale: 1.5 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x1e1c1a, roughness: 0.9 });
    // BoxGeometry material order: +x, -x, +y (top), -y, +z, -z.
    const slab = new THREE.Mesh(new THREE.BoxGeometry(width, DOORMAT_THICKNESS, depth), [rubber, rubber, top, rubber, rubber, rubber]);
    slab.position.y = DOORMAT_THICKNESS / 2;
    slab.receiveShadow = true;
    this.add(slab);
  }
}

/** Fibre-by-fibre coir: short strokes of browns over a mid tone, a rubber rim, a worn oval, the words scuffed. */
function paintCoir(wM: number, dM: number, text: string, wear: number, random: () => number): THREE.Texture {
  const W = Math.round(wM * PX_PER_M);
  const H = Math.round(dM * PX_PER_M);
  const [canvas, ctx] = createCanvas(W, H);
  const rim = Math.round(W * 0.03);
  ctx.fillStyle = '#1e1c1a';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#8a6437';
  ctx.fillRect(rim, rim, W - 2 * rim, H - 2 * rim);
  const tones = ['#6e4a24', '#9c7440', '#b08650', '#5a3c1e', '#a57a45'];
  for (let i = 0; i < W * H * 0.05; i++) {
    const x = rim + random() * (W - 2 * rim);
    const y = rim + random() * (H - 2 * rim);
    const a = random() * Math.PI;
    const len = 3 + random() * 6;
    ctx.strokeStyle = tones[Math.floor(random() * tones.length)]!;
    ctx.lineWidth = 1 + random();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  if (text) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#2a1c10';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${Math.round(H * 0.28)}px Impact, "Arial Narrow", ${FONT}`;
    ctx.fillText(text, W / 2, H / 2);
    ctx.restore();
  }
  // The trodden middle: grime and flattened bristles, strongest just in front of the door.
  const worn = ctx.createRadialGradient(W / 2, H * 0.55, 0, W / 2, H * 0.55, W * 0.38);
  worn.addColorStop(0, `rgba(40,28,16,${0.55 * wear})`);
  worn.addColorStop(0.6, `rgba(60,42,22,${0.3 * wear})`);
  worn.addColorStop(1, 'rgba(60,42,22,0)');
  ctx.fillStyle = worn;
  ctx.fillRect(rim, rim, W - 2 * rim, H - 2 * rim);
  // Bald patches where the fibres broke off, and a few crumbs of grit.
  for (let i = 0; i < 40 * wear; i++) {
    ctx.fillStyle = `rgba(30,22,14,${0.15 + random() * 0.25})`;
    ctx.beginPath();
    ctx.ellipse(W / 2 + (random() - 0.5) * W * 0.5, H / 2 + (random() - 0.5) * H * 0.5, 2 + random() * 8, 2 + random() * 5, random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = random() < 0.5 ? 'rgba(200,190,170,0.5)' : 'rgba(20,18,16,0.6)';
    ctx.fillRect(rim + random() * (W - 2 * rim), rim + random() * (H - 2 * rim), 2, 2);
  }
  return toTexture(canvas, 4);
}
