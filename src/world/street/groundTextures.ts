import * as THREE from 'three';
import { createCanvas, seededRandom, toTexture } from '@/covers/generated/canvasUtils';
import { QUALITY } from '@/graphics/quality';

/**
 * A tiling texture and how many metres one tile covers; the road's and the pavement's also carry a
 * height map (`bump`: the aggregate standing proud, the joints and seams sunk) and a roughness map
 * (G: polished stones, rough binder and joints), same tiling.
 */
export interface Tile {
  texture: THREE.CanvasTexture;
  metres: number;
  bump?: THREE.CanvasTexture;
  roughness?: THREE.CanvasTexture;
}

function repeating(texture: THREE.CanvasTexture): THREE.CanvasTexture {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function tiling(canvas: HTMLCanvasElement, metres: number, anisotropy: number, bump?: HTMLCanvasElement, roughness?: HTMLCanvasElement): Tile {
  const data = (c: HTMLCanvasElement): THREE.CanvasTexture => {
    const t = repeating(toTexture(c, anisotropy));
    t.colorSpace = THREE.NoColorSpace;
    return t;
  };
  return { texture: repeating(toTexture(canvas, anisotropy)), metres, bump: bump && data(bump), roughness: roughness && data(roughness) };
}

/** Speckles of lighter and darker grit over what is painted. */
function grit(ctx: CanvasRenderingContext2D, size: number, random: () => number, count: number, light: string, dark: string, scale = 1): void {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = random() < 0.5 ? light : dark;
    const s = (1 + random() * 2) * scale;
    ctx.fillRect(random() * size, random() * size, s, s);
  }
}

/**
 * The road's and the pavement's maps: this many texels a side (256 a metre on the road, ~430 on the
 * slabs) on high; half on the others (three maps each, painted stone by stone when the street is
 * built: a quarter of the canvas work and of the memory where the frame is tightest).
 */
const DETAIL_SIZE = QUALITY.level === 'high' ? 1024 : 512;

/** A grey fill (0..255) for the height and roughness maps. */
const grey = (v: number, a = 1): string => `rgba(${v}, ${v}, ${v}, ${a})`;

/**
 * Asphalt: dark grey grain with lighter aggregate, a few tar seams and patches. 4 m a tile. The
 * aggregate stands proud and is polished by the tyres (height up, roughness down), the seams are
 * sunk and smooth with tar, the worn patches a little lower and smoother.
 */
export function asphaltTile(anisotropy: number): Tile {
  const size = DETAIL_SIZE;
  const k = size / 512;
  const [canvas, ctx] = createCanvas(size, size);
  const [bumpCanvas, bump] = createCanvas(size, size);
  const [roughCanvas, rough] = createCanvas(size, size);
  const random = seededRandom(4242);
  ctx.fillStyle = '#4a4b4d';
  ctx.fillRect(0, 0, size, size);
  bump.fillStyle = grey(128);
  bump.fillRect(0, 0, size, size);
  rough.fillStyle = grey(235);
  rough.fillRect(0, 0, size, size);
  // Patches of newer and older surface.
  for (let i = 0; i < 7; i++) {
    const newer = random() < 0.5;
    ctx.fillStyle = newer ? 'rgba(30,30,32,0.18)' : 'rgba(120,118,112,0.12)';
    const w = (60 + random() * 180) * k;
    const h = (40 + random() * 140) * k;
    const x = random() * size - w / 2;
    const y = random() * size - h / 2;
    ctx.fillRect(x, y, w, h);
    // Older surface is worn lower and smoother; newer is rougher.
    bump.fillStyle = newer ? grey(140, 0.5) : grey(112, 0.5);
    bump.fillRect(x, y, w, h);
    rough.fillStyle = newer ? grey(250, 0.6) : grey(205, 0.6);
    rough.fillRect(x, y, w, h);
  }
  // The aggregate: stones in the colour, proud in the height, polished smooth.
  for (let i = 0; i < 9000 * k * k; i++) {
    const lightStone = random() < 0.5;
    const s = (1 + random() * 2) * k * 0.6;
    const x = random() * size;
    const y = random() * size;
    ctx.fillStyle = lightStone ? 'rgba(150,148,142,0.55)' : 'rgba(20,20,22,0.5)';
    ctx.fillRect(x, y, s, s);
    if (!lightStone && random() < 0.6) continue;
    bump.fillStyle = grey(170 + Math.floor(random() * 60), 0.8);
    bump.fillRect(x, y, s, s);
    rough.fillStyle = grey(150 + Math.floor(random() * 50), 0.7);
    rough.fillRect(x, y, s, s);
  }
  // A tar seam or two: dark, sunk, smooth.
  for (let i = 0; i < 2; i++) {
    const points: [number, number][] = [];
    let x = random() * size;
    let y = 0;
    points.push([x, y]);
    while (y < size) {
      x += (random() - 0.5) * 30 * k;
      y += (20 + random() * 30) * k;
      points.push([x, y]);
    }
    for (const [c, style, width] of [[ctx, 'rgba(18,18,20,0.7)', 3], [bump, grey(70, 0.9), 4], [rough, grey(120, 0.9), 3]] as const) {
      c.strokeStyle = style;
      c.lineWidth = width * k;
      c.beginPath();
      points.forEach(([px, py], n) => (n === 0 ? c.moveTo(px, py) : c.lineTo(px, py)));
      c.stroke();
    }
  }
  return tiling(canvas, 4, anisotropy, bumpCanvas, roughCanvas);
}

/**
 * Paving: concrete slabs 0.6 m square in rows, each a slightly different grey, dark joints. 2.4 m a
 * tile. In the height map the joints are sunk and each slab sits a little proud of its neighbours,
 * tilted (a slab settles); the joints are rough, the slabs' faces worn smoother, their stains too.
 */
export function pavingTile(anisotropy: number): Tile {
  const size = DETAIL_SIZE;
  const k = size / 512;
  const slabs = 4;
  const slab = size / slabs;
  const joint = 2 * k;
  const [canvas, ctx] = createCanvas(size, size);
  const [bumpCanvas, bump] = createCanvas(size, size);
  const [roughCanvas, rough] = createCanvas(size, size);
  const random = seededRandom(1717);
  ctx.fillStyle = '#6f6b64';
  ctx.fillRect(0, 0, size, size);
  bump.fillStyle = grey(60);
  bump.fillRect(0, 0, size, size);
  rough.fillStyle = grey(255);
  rough.fillRect(0, 0, size, size);
  for (let i = 0; i < slabs; i++) {
    for (let j = 0; j < slabs; j++) {
      const g = 150 + Math.floor(random() * 22);
      const [x, y, w] = [i * slab + joint, j * slab + joint, slab - 2 * joint];
      ctx.fillStyle = `rgb(${g}, ${g - 4}, ${g - 11})`;
      ctx.fillRect(x, y, w, w);
      // Each slab settled at its own height and tilt.
      const base = 150 + Math.floor(random() * 30);
      const tilt = bump.createLinearGradient(x, y, x + w * random(), y + w);
      tilt.addColorStop(0, grey(base + 12));
      tilt.addColorStop(1, grey(base - 12));
      bump.fillStyle = tilt;
      bump.fillRect(x, y, w, w);
      // Its arris rounded a little: a darker rim just inside the joint.
      bump.strokeStyle = grey(base - 30, 0.6);
      bump.lineWidth = 2 * k;
      bump.strokeRect(x + k, y + k, w - 2 * k, w - 2 * k);
      rough.fillStyle = grey(205 + Math.floor(random() * 30));
      rough.fillRect(x, y, w, w);
      // Stains: darker, and smoother where something was spilt and trodden in.
      if (random() < 0.3) {
        const cx = i * slab + random() * slab;
        const cy = j * slab + random() * slab;
        const r = (6 + random() * 18) * k;
        ctx.fillStyle = 'rgba(60,55,50,0.12)';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        rough.fillStyle = grey(170, 0.5);
        rough.beginPath();
        rough.arc(cx, cy, r, 0, Math.PI * 2);
        rough.fill();
      }
    }
  }
  grit(ctx, size, random, 5000 * k * k, 'rgba(200,196,188,0.35)', 'rgba(70,66,60,0.3)', k * 0.6);
  grit(bump, size, random, 3000 * k * k, grey(200, 0.25), grey(90, 0.25), k * 0.6);
  return tiling(canvas, 2.4, anisotropy, bumpCanvas, roughCanvas);
}

/** Granite kerb stones: light speckled grey, a joint every metre. 1 m a tile (u along the kerb, v up its face). */
export function kerbTile(anisotropy: number): Tile {
  const size = 256;
  const [canvas, ctx] = createCanvas(size, size);
  const random = seededRandom(99);
  ctx.fillStyle = '#9c9a95';
  ctx.fillRect(0, 0, size, size);
  grit(ctx, size, random, 3000, 'rgba(220,218,214,0.6)', 'rgba(50,50,52,0.5)');
  ctx.fillStyle = 'rgba(40,40,40,0.6)';
  ctx.fillRect(0, 0, 3, size);
  return tiling(canvas, 1, anisotropy);
}

/** Lawn: mottled grass in `color`, a few clover patches and bare spots. 3 m a tile. */
export function lawnTile(color: string, anisotropy: number): Tile {
  const size = 256;
  const [canvas, ctx] = createCanvas(size, size);
  const random = seededRandom(515);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = random() < 0.5 ? 'rgba(20,40,10,0.12)' : 'rgba(180,200,120,0.1)';
    ctx.beginPath();
    ctx.arc(random() * size, random() * size, 8 + random() * 30, 0, Math.PI * 2);
    ctx.fill();
  }
  grit(ctx, size, random, 6000, 'rgba(160,190,100,0.35)', 'rgba(20,40,15,0.35)');
  return tiling(canvas, 3, anisotropy);
}

/** Gravel: pale buff grit with darker and lighter stones. 2 m a tile. */
export function gravelTile(anisotropy: number): Tile {
  const size = 256;
  const [canvas, ctx] = createCanvas(size, size);
  const random = seededRandom(313);
  ctx.fillStyle = '#b5a88e';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = random() < 0.5 ? 'rgba(90,80,60,0.1)' : 'rgba(230,220,200,0.12)';
    ctx.beginPath();
    ctx.arc(random() * size, random() * size, 6 + random() * 24, 0, Math.PI * 2);
    ctx.fill();
  }
  grit(ctx, size, random, 7000, 'rgba(235,228,210,0.55)', 'rgba(80,70,55,0.5)');
  return tiling(canvas, 2, anisotropy);
}
