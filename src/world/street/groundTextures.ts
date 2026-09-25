import * as THREE from 'three';
import { createCanvas, seededRandom, toTexture } from '@/covers/generated/canvasUtils';

/** A tiling texture and how many metres one tile covers. */
export interface Tile {
  texture: THREE.CanvasTexture;
  metres: number;
}

function tiling(canvas: HTMLCanvasElement, metres: number, anisotropy: number): Tile {
  const texture = toTexture(canvas, anisotropy);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return { texture, metres };
}

/** Speckles of lighter and darker grit over what is painted. */
function grit(ctx: CanvasRenderingContext2D, size: number, random: () => number, count: number, light: string, dark: string): void {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = random() < 0.5 ? light : dark;
    const s = 1 + random() * 2;
    ctx.fillRect(random() * size, random() * size, s, s);
  }
}

/** Asphalt: dark grey grain with lighter aggregate, a few tar seams and patches. 4 m a tile. */
export function asphaltTile(anisotropy: number): Tile {
  const size = 512;
  const [canvas, ctx] = createCanvas(size, size);
  const random = seededRandom(4242);
  ctx.fillStyle = '#4a4b4d';
  ctx.fillRect(0, 0, size, size);
  // Patches of newer and older surface.
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = random() < 0.5 ? 'rgba(30,30,32,0.18)' : 'rgba(120,118,112,0.12)';
    const w = 60 + random() * 180;
    const h = 40 + random() * 140;
    ctx.fillRect(random() * size - w / 2, random() * size - h / 2, w, h);
  }
  grit(ctx, size, random, 9000, 'rgba(150,148,142,0.55)', 'rgba(20,20,22,0.5)');
  // A tar seam or two.
  ctx.strokeStyle = 'rgba(18,18,20,0.7)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 2; i++) {
    ctx.beginPath();
    let x = random() * size;
    let y = 0;
    ctx.moveTo(x, y);
    while (y < size) {
      x += (random() - 0.5) * 30;
      y += 20 + random() * 30;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return tiling(canvas, 4, anisotropy);
}

/** Paving: concrete slabs 0.6 m square in rows, each a slightly different grey, dark joints. 2.4 m a tile. */
export function pavingTile(anisotropy: number): Tile {
  const size = 512;
  const slabs = 4;
  const slab = size / slabs;
  const [canvas, ctx] = createCanvas(size, size);
  const random = seededRandom(1717);
  ctx.fillStyle = '#6f6b64';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < slabs; i++) {
    for (let j = 0; j < slabs; j++) {
      const g = 150 + Math.floor(random() * 22);
      ctx.fillStyle = `rgb(${g}, ${g - 4}, ${g - 11})`;
      ctx.fillRect(i * slab + 2, j * slab + 2, slab - 4, slab - 4);
      // Stains.
      if (random() < 0.3) {
        ctx.fillStyle = 'rgba(60,55,50,0.12)';
        ctx.beginPath();
        ctx.arc(i * slab + random() * slab, j * slab + random() * slab, 6 + random() * 18, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  grit(ctx, size, random, 5000, 'rgba(200,196,188,0.35)', 'rgba(70,66,60,0.3)');
  return tiling(canvas, 2.4, anisotropy);
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
