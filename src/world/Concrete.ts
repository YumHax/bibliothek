import * as THREE from 'three';
import { createCanvas, seededRandom, toTexture } from '@/covers/generated/canvasUtils';
import { paintOnce } from './materials/paintedTiles';

/** Metres of floor covered by one tile of the texture: two slabs each way, so the joints tile seamlessly. */
const TILE_M = 4;
const TILE_PX = 1024;
/** The slabs are cast this big, with a saw-cut joint between them. */
const SLAB_M = 2;
const JOINT_PX = 6;
const PX_PER_M = TILE_PX / TILE_M;

/**
 * A poured concrete slab for a hall or a shop: mottled grey, faint trowel arcs, saw-cut joints
 * every `SLAB_M`, a few dark stains and hairline cracks, tiled over the floor. Returns a standard
 * material with a colour and a bump map so the joints and the cracks catch the light. Painted once
 * for the page (`paintOnce`); the flat's rooms keep their parquet (`Parquet.ts`).
 */
export function concreteMaterial(floorWidth: number, floorDepth: number): THREE.MeshStandardMaterial {
  const [map, bumpMap] = paintOnce('concrete', paintConcrete);
  for (const t of [map, bumpMap]) {
    t.repeat.set(floorWidth / TILE_M, floorDepth / TILE_M);
    // Joints line up with the room's centre: half a tile's offset puts a slab edge on the origin.
    t.offset.set(0.5 - floorWidth / TILE_M / 2, 0.5 - floorDepth / TILE_M / 2);
  }
  return new THREE.MeshStandardMaterial({ map, bumpMap, bumpScale: 0.4, roughness: 0.92, metalness: 0 });
}

/** The colour and bump tiles, repeat-wrapped. */
function paintConcrete(): [THREE.Texture, THREE.Texture] {
  const [colorCanvas, color] = createCanvas(TILE_PX, TILE_PX);
  const [bumpCanvas, bump] = createCanvas(TILE_PX, TILE_PX);
  const random = seededRandom(0x5c0c8e7e);

  color.fillStyle = '#8d8a84';
  color.fillRect(0, 0, TILE_PX, TILE_PX);
  bump.fillStyle = '#808080';
  bump.fillRect(0, 0, TILE_PX, TILE_PX);

  // Mottling: many soft translucent blotches, light and dark, so no two square metres match.
  for (let i = 0; i < 900; i++) {
    const r = 20 + random() * 90;
    const x = random() * TILE_PX;
    const y = random() * TILE_PX;
    const light = random() < 0.5;
    const g = color.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.04 + random() * 0.07;
    g.addColorStop(0, light ? `rgba(200,198,190,${a})` : `rgba(60,58,54,${a})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    color.fillStyle = g;
    // Draw wrapped so the blotches crossing an edge continue on the other side.
    for (const dx of [-TILE_PX, 0, TILE_PX]) for (const dy of [-TILE_PX, 0, TILE_PX]) color.fillRect(x - r + dx, y - r + dy, 2 * r, 2 * r);
  }
  // Fine grain: speckles of aggregate showing through.
  for (let i = 0; i < 14000; i++) {
    const v = 110 + Math.floor(random() * 80);
    color.fillStyle = `rgba(${v},${v - 2},${v - 6},${0.25 + random() * 0.3})`;
    color.fillRect(random() * TILE_PX, random() * TILE_PX, 1 + random() * 2, 1 + random() * 2);
  }
  // Trowel arcs: faint sweeping strokes left by the float.
  color.lineWidth = 1.2;
  for (let i = 0; i < 60; i++) {
    const cx = random() * TILE_PX;
    const cy = random() * TILE_PX;
    const r = 80 + random() * 260;
    const from = random() * Math.PI * 2;
    color.strokeStyle = random() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    color.beginPath();
    color.arc(cx, cy, r, from, from + 0.6 + random() * 1.2);
    color.stroke();
  }
  // Stains: a few larger dark patches, oil and old water.
  for (let i = 0; i < 7; i++) {
    const r = 60 + random() * 120;
    const x = random() * TILE_PX;
    const y = random() * TILE_PX;
    const g = color.createRadialGradient(x, y, r * 0.2, x, y, r);
    g.addColorStop(0, 'rgba(50,45,40,0.22)');
    g.addColorStop(0.7, 'rgba(50,45,40,0.08)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    color.fillStyle = g;
    color.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  // Hairline cracks: a wandering polyline, darker in colour and sunk in the bump.
  for (let i = 0; i < 5; i++) {
    let x = random() * TILE_PX;
    let y = random() * TILE_PX;
    let angle = random() * Math.PI * 2;
    color.strokeStyle = 'rgba(40,36,32,0.55)';
    color.lineWidth = 1.5;
    bump.strokeStyle = '#303030';
    bump.lineWidth = 2;
    color.beginPath();
    bump.beginPath();
    color.moveTo(x, y);
    bump.moveTo(x, y);
    const steps = 12 + Math.floor(random() * 20);
    for (let s = 0; s < steps; s++) {
      angle += (random() - 0.5) * 1.2;
      const len = 8 + random() * 22;
      x += Math.cos(angle) * len;
      y += Math.sin(angle) * len;
      color.lineTo(x, y);
      bump.lineTo(x, y);
    }
    color.stroke();
    bump.stroke();
  }
  // Saw-cut joints between the slabs: a dark line with a lighter chamfer either side, sunk in the bump.
  const slabPx = SLAB_M * PX_PER_M;
  for (let k = 0; k < TILE_M / SLAB_M; k++) {
    const p = k * slabPx;
    for (const vertical of [true, false]) {
      const rect = (offset: number, w: number, style: string, ctx: CanvasRenderingContext2D): void => {
        ctx.fillStyle = style;
        if (vertical) ctx.fillRect(p + offset, 0, w, TILE_PX);
        else ctx.fillRect(0, p + offset, TILE_PX, w);
      };
      rect(-JOINT_PX * 1.5, JOINT_PX * 3, 'rgba(210,208,200,0.35)', color);
      rect(-JOINT_PX / 2, JOINT_PX, '#4a4744', color);
      rect(-JOINT_PX * 1.5, JOINT_PX * 3, '#909090', bump);
      rect(-JOINT_PX / 2, JOINT_PX, '#202020', bump);
    }
  }

  const map = toTexture(colorCanvas, 8);
  // The bump map is data, not colour: no sRGB decoding.
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.anisotropy = 4;
  for (const t of [map, bumpMap]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return [map, bumpMap];
}
