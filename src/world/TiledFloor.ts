import * as THREE from 'three';
import { createCanvas, seededRandom, toTexture } from '@/covers/generated/canvasUtils';

/** A tiled floor's look (`RoomFinish.floorTiles`); every field has a default. */
export interface FloorTiles {
  /** `square` (default), `checker` (square tiles alternating `tile` and `alt`) or `hex` (a honeycomb mosaic). */
  pattern?: 'square' | 'checker' | 'hex';
  /** Width of one tile in metres: a square's side, a hexagon across its flats. Default 0.2 (square), 0.09 (hex). */
  size?: number;
  /** Tile colour; `alt` is the checker's second colour. Defaults: glazed white, a charcoal alt. */
  tile?: number;
  alt?: number;
  /** Grout colour. Default a pale grey. */
  grout?: number;
  /** Grout line width in metres. Default 3 mm. */
  groutWidth?: number;
  /** How much one tile's shade may differ from the next (0 = all the same). Default 0.03. */
  variance?: number;
  /** Roughness of the tiles: glazed 0.35 (default), terracotta about 0.8. */
  roughness?: number;
}

/** The texture covers about this many metres each way, rounded to whole periods of the pattern so it tiles seamlessly. */
const REGION_M = 1;
const PX_PER_M = 600;

/**
 * A tiled floor: square tiles, a checkerboard or a hexagon mosaic, each tile a shade off its
 * neighbours, the grout sunk in a bump map. Painted once per call over a region of whole pattern
 * periods and repeated over the floor, the joints lined up on the room's centre. Returns a standard
 * material like `parquetMaterial` (colour and bump; the `Room` adds the wear and the edge shading).
 */
export function tiledFloorMaterial(floorWidth: number, floorDepth: number, options: FloorTiles = {}): THREE.MeshStandardMaterial {
  const pattern = options.pattern ?? 'square';
  const size = options.size ?? (pattern === 'hex' ? 0.09 : 0.2);
  const tile = new THREE.Color(options.tile ?? 0xf2f1ec);
  const alt = new THREE.Color(options.alt ?? 0x2f3134);
  const grout = new THREE.Color(options.grout ?? 0xc4c5c0);
  const groutPx = Math.max(1.5, (options.groutWidth ?? 0.003) * PX_PER_M);
  const variance = options.variance ?? 0.03;
  const random = seededRandom(0x7113f100 + Math.round(size * 1000));

  // One period of the pattern, in metres: a square (two for the checker), or two columns by one row of hexagons.
  const radius = size / Math.sqrt(3);
  const period = pattern === 'hex' ? { x: 3 * radius, y: size } : pattern === 'checker' ? { x: 2 * size, y: 2 * size } : { x: size, y: size };
  const regionX = Math.max(1, Math.round(REGION_M / period.x)) * period.x;
  const regionY = Math.max(1, Math.round(REGION_M / period.y)) * period.y;
  const w = Math.round(regionX * PX_PER_M);
  const h = Math.round(regionY * PX_PER_M);
  const [colorCanvas, color] = createCanvas(w, h);
  const [bumpCanvas, bump] = createCanvas(w, h);
  color.fillStyle = `#${grout.getHexString()}`;
  color.fillRect(0, 0, w, h);
  bump.fillStyle = '#202020';
  bump.fillRect(0, 0, w, h);
  const sx = w / regionX;
  const sy = h / regionY;

  const shade = (base: THREE.Color): string => {
    const c = base.clone().offsetHSL(0, 0, (random() - 0.5) * 2 * variance);
    return `#${c.getHexString()}`;
  };
  // A tile face: filled, then its bump raised; the grout stays where the fill leaves off.
  const face = (path: (ctx: CanvasRenderingContext2D) => void, base: THREE.Color): void => {
    color.fillStyle = shade(base);
    bump.fillStyle = '#b0b0b0';
    for (const ctx of [color, bump]) {
      ctx.beginPath();
      path(ctx);
      ctx.closePath();
      ctx.fill();
    }
  };

  if (pattern === 'hex') {
    // Flat-topped hexagons: columns 1.5 R apart, every other one half a tile down; drawn one beyond each edge so the
    // tiles the region's border cuts continue on the far side (the region is whole periods, so they match).
    const inset = groutPx / 2;
    const cols = Math.round(regionX / (1.5 * radius));
    const rows = Math.round(regionY / size);
    for (let c = -1; c <= cols; c++) {
      for (let r = -1; r <= rows; r++) {
        const cx = c * 1.5 * radius * sx;
        const cy = (r + (((c % 2) + 2) % 2) * 0.5) * size * sy;
        const rx = radius * sx - inset;
        const ry = radius * sy - inset;
        face((ctx) => {
          for (let k = 0; k < 6; k++) {
            const a = (k * Math.PI) / 3;
            ctx.lineTo(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
          }
        }, tile);
      }
    }
  } else {
    const n = Math.round(regionX / size);
    const m = Math.round(regionY / size);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) {
        const base = pattern === 'checker' && (i + j) % 2 === 1 ? alt : tile;
        const x0 = i * size * sx + groutPx / 2;
        const y0 = j * size * sy + groutPx / 2;
        const tw = size * sx - groutPx;
        const th = size * sy - groutPx;
        face((ctx) => ctx.rect(x0, y0, tw, th), base);
      }
    }
  }

  const map = toTexture(colorCanvas, 8);
  // The bump map is data, not colour: no sRGB decoding.
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.anisotropy = 4;
  for (const t of [map, bumpMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(floorWidth / regionX, floorDepth / regionY);
    // A joint on the room's centre lines: the pattern starts at the origin.
    t.offset.set(-floorWidth / regionX / 2, -floorDepth / regionY / 2);
  }
  return new THREE.MeshStandardMaterial({ map, bumpMap, bumpScale: 0.5, roughness: options.roughness ?? 0.35, metalness: 0 });
}
