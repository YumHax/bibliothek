import type * as THREE from 'three';
import { createCanvas } from '@/covers/generated/canvasUtils';
import { fabric } from './finishes';
import { shared } from './palette';
import { sharedCanvasTexture } from './sharedResources';

/**
 * Upholstery and bedding with a weave you can see up close: a near-white tile of warp and weft threads (colour) and
 * the same tile as a bump, multiplied by the cloth's colour, so one pair of textures serves every colour. The tile is
 * `TILE` metres of cloth: the mesh's uvs are in metres (`props/softBlock`), or the material's repeat makes up for it.
 * One map and one bump: a lit fabric stays inside the texture-unit budget (CLAUDE.md "Gotchas").
 */
const TILE = 0.12;
const PX = 128;

function weaveCanvas(): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas(PX, PX);
  ctx.fillStyle = '#f4f2ee';
  ctx.fillRect(0, 0, PX, PX);
  // Weft rows and warp columns, every other thread over and under (a plain weave), a few slubs.
  for (let y = 0; y < PX; y += 2) {
    ctx.fillStyle = y % 4 ? 'rgba(0,0,0,0.07)' : 'rgba(0,0,0,0.035)';
    ctx.fillRect(0, y, PX, 1);
  }
  for (let x = 0; x < PX; x += 2) {
    ctx.fillStyle = x % 4 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(x, 0, 1, PX);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  for (let i = 0; i < 18; i++) ctx.fillRect((i * 53) % PX, (i * 37) % PX, 5 + (i % 4), 1);
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  for (let i = 0; i < 12; i++) ctx.fillRect((i * 71 + 9) % PX, (i * 23 + 5) % PX, 1, 4 + (i % 3));
  return canvas;
}

/** Ticking: the classic mattress cover, off-white with narrow and broad blue stripes running down its length. */
function tickingCanvas(): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas(PX, PX);
  ctx.fillStyle = '#f1ede4';
  ctx.fillRect(0, 0, PX, PX);
  ctx.fillStyle = '#5d7391';
  // One repeat across: a broad stripe flanked by two hairlines.
  for (const [x, w] of [
    [10, 14],
    [30, 3],
    [38, 3],
    [74, 14],
    [94, 3],
    [102, 3],
  ] as const)
    ctx.fillRect(x, 0, w, PX);
  // The weave over it.
  ctx.globalAlpha = 0.5;
  ctx.drawImage(weaveCanvas(), 0, 0);
  return canvas;
}

function maps(kind: 'weave' | 'ticking'): { map: THREE.Texture; bumpMap: THREE.Texture } {
  const map = sharedCanvasTexture(`cloth-${kind}`, kind === 'weave' ? weaveCanvas : tickingCanvas, { repeat: [1 / TILE, 1 / TILE] });
  const bumpMap = sharedCanvasTexture('cloth-weave-bump', weaveCanvas, { data: true, repeat: [1 / TILE, 1 / TILE] });
  return { map, bumpMap };
}

/** A woven cloth of `color` (armchairs, cushions, bedding, a throw): the shared twin of `fabric()` with the weave. */
export function wovenCloth(color: THREE.ColorRepresentation, roughness = 1): THREE.MeshStandardMaterial {
  const hex = typeof color === 'number' ? color.toString(16) : String(color);
  return shared(`woven|${hex}|${roughness}`, () => fabric({ color, roughness, ...maps('weave'), bumpScale: 0.0025 }));
}

/** A woven cloth whose colour the caller changes at runtime (a garment dyed by the day): its own material, shared textures. */
export function ownWovenCloth(color: THREE.ColorRepresentation, roughness = 1): THREE.MeshStandardMaterial {
  return fabric({ color, roughness, ...maps('weave'), bumpScale: 0.0025 });
}

/** The mattress's striped ticking (its stripes run along the uv's v: down a soft block's length in z). */
export function ticking(): THREE.MeshStandardMaterial {
  return shared('woven|ticking', () => fabric({ roughness: 0.92, ...maps('ticking'), bumpScale: 0.0025 }));
}
