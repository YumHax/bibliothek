import * as THREE from 'three';
import { createCanvas, seededRandom, toTexture } from '@/covers/generated/canvasUtils';
import { paintOnce } from './materials/paintedTiles';

/** Metres of floor covered by one tile of the texture (must be a multiple of `PLANK_LENGTH`). */
const TILE_M = 2.4;
const TILE_PX = 1024;
const PLANK_WIDTH = 0.12;
const PLANK_LENGTH = 1.2;
/** Width of the dark gap between planks, in pixels. */
const GAP_PX = 2;

const PX_PER_M = TILE_PX / TILE_M;

interface Plank {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Oak strip flooring, generated once: staggered planks with their own tint, grain lines and a
 * bevelled gap, tiled seamlessly over the floor. Returns a standard material with a colour and a
 * bump map so the plank edges catch the light. Painted once for the page (`paintOnce`).
 */
export function parquetMaterial(floorWidth: number, floorDepth: number): THREE.MeshStandardMaterial {
  const [map, bumpMap] = paintOnce('parquet', paintParquet);
  for (const tex of [map, bumpMap]) tex.repeat.set(floorWidth / TILE_M, floorDepth / TILE_M);
  return new THREE.MeshStandardMaterial({ map, bumpMap, bumpScale: 0.6, roughness: 0.55, metalness: 0 });
}

/** The colour and bump tiles, repeat-wrapped. */
function paintParquet(): [THREE.Texture, THREE.Texture] {
  const [colorCanvas, color] = createCanvas(TILE_PX, TILE_PX);
  const [bumpCanvas, bump] = createCanvas(TILE_PX, TILE_PX);
  const random = seededRandom(0x9a7452);

  // Gaps first: whatever the planks do not cover.
  color.fillStyle = '#4a3320';
  color.fillRect(0, 0, TILE_PX, TILE_PX);
  bump.fillStyle = '#404040';
  bump.fillRect(0, 0, TILE_PX, TILE_PX);

  const rowPx = PLANK_WIDTH * PX_PER_M;
  const lengthPx = PLANK_LENGTH * PX_PER_M;
  const rows = Math.round(TILE_PX / rowPx);
  for (let row = 0; row < rows; row++) {
    // Each row is shifted by a random fraction of a plank; TILE_PX is a multiple of the plank
    // length, so the plank cut by the right edge continues from the left edge.
    const offset = random() * lengthPx;
    for (let x = offset - lengthPx; x < TILE_PX; x += lengthPx) {
      drawPlank(color, bump, random, { x: x + GAP_PX / 2, y: row * rowPx + GAP_PX / 2, w: lengthPx - GAP_PX, h: rowPx - GAP_PX });
    }
  }

  const map = toTexture(colorCanvas, 8);
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.anisotropy = 8;
  for (const tex of [map, bumpMap]) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return [map, bumpMap];
}

function drawPlank(color: CanvasRenderingContext2D, bump: CanvasRenderingContext2D, random: () => number, p: Plank): void {
  // Base tint: warm oak, each plank a little lighter, darker, redder or greyer than the next.
  const hue = 28 + (random() - 0.5) * 10;
  const sat = 38 + (random() - 0.5) * 16;
  const light = 50 + (random() - 0.5) * 16;
  color.fillStyle = `hsl(${hue.toFixed(1)} ${sat.toFixed(1)}% ${light.toFixed(1)}%)`;
  color.fillRect(p.x, p.y, p.w, p.h);

  // Grain: long wavy strokes along the plank, darker or lighter than the base.
  color.save();
  color.beginPath();
  color.rect(p.x, p.y, p.w, p.h);
  color.clip();
  const lines = 7 + Math.floor(random() * 6);
  for (let i = 0; i < lines; i++) {
    const y = p.y + ((i + 0.5) / lines) * p.h + (random() - 0.5) * 4;
    const dark = random() < 0.65;
    color.strokeStyle = dark ? `rgba(60,35,15,${(0.08 + random() * 0.18).toFixed(3)})` : `rgba(255,230,190,${(0.05 + random() * 0.1).toFixed(3)})`;
    color.lineWidth = 0.6 + random() * 1.6;
    color.beginPath();
    color.moveTo(p.x - 2, y);
    const steps = 6;
    for (let s = 1; s <= steps; s++) {
      const x = p.x + (s / steps) * (p.w + 4);
      color.quadraticCurveTo(x - p.w / steps / 2, y + (random() - 0.5) * 6, x, y + (random() - 0.5) * 3);
    }
    color.stroke();
  }
  // Occasional knot.
  if (random() < 0.18) {
    const kx = p.x + p.w * (0.15 + random() * 0.7);
    const ky = p.y + p.h * (0.3 + random() * 0.4);
    const knot = color.createRadialGradient(kx, ky, 1, kx, ky, 6 + random() * 5);
    knot.addColorStop(0, 'rgba(50,28,12,0.75)');
    knot.addColorStop(0.6, 'rgba(70,40,18,0.35)');
    knot.addColorStop(1, 'rgba(70,40,18,0)');
    color.fillStyle = knot;
    color.fillRect(kx - 12, ky - 12, 24, 24);
  }
  color.restore();

  // Bump: plank surface raised over the gaps, soft bevel on the edges, faint grain relief.
  const bevel = bump.createLinearGradient(0, p.y, 0, p.y + p.h);
  bevel.addColorStop(0, '#909090');
  bevel.addColorStop(0.12, '#c8c8c8');
  bevel.addColorStop(0.88, '#c8c8c8');
  bevel.addColorStop(1, '#909090');
  bump.fillStyle = bevel;
  bump.fillRect(p.x, p.y, p.w, p.h);
  bump.fillStyle = 'rgba(0,0,0,0.12)';
  for (let i = 0; i < 4; i++) bump.fillRect(p.x, p.y + random() * p.h, p.w, 1);
}
