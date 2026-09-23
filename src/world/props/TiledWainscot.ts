import * as THREE from 'three';
import type { RoomOptions, Wall } from '../Room';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { Prop, part, matte } from './Prop';

export interface TiledWainscotOptions {
  /** Height of the tiling above the floor. Default 1.2. */
  height?: number;
  /** Walls to tile. Default all four. */
  walls?: Wall[];
  /** How far the tiles stop short of each doorway's edge (the door's architrave). Default 0.07. */
  doorClearance?: number;
  /** Other openings to leave untiled, besides the room's doorways: a shut door lying on the wall (its leaf plus architrave), a fitted counter. */
  openings?: { wall: Wall; along: number; width: number }[];
  /** Tile, grout and accent (top row and cap rail) colours. */
  tile?: number;
  grout?: number;
  accent?: number;
  /** Size of one tile. Default metro 0.2 x 0.1; a brick is about 0.22 x 0.07. */
  tileWidth?: number;
  tileHeight?: number;
  /** Bevelled edges on every tile (glazed tiles have them, bricks do not). Default true. */
  bevel?: boolean;
  /** How much one tile's shade may differ from the next (0 = all the same). Default 0.008; bricks want about 0.03. */
  variance?: number;
  /** Roughness of the tiled face: glazed 0.25 (default), fired brick about 0.85. */
  roughness?: number;
}

/** Metro tiles, laid in a running bond, and the canvas resolution they are painted at. */
const TILE_W = 0.2;
const TILE_H = 0.1;
const PX_PER_M = 400;
const GROUT_PX = 3;
/** How far the slab stands off the wall: deep enough to swallow the room's baseboard. Wall-hung fittings below the tiles use it as their placement `offset`. */
export const WAINSCOT_THICKNESS = 0.022;
const THICKNESS = WAINSCOT_THICKNESS;
const CAP_H = 0.03;
const CAP_D = 0.032;

/**
 * Half-height tiling round a room: one slab per stretch of wall (the doorways and their
 * architraves left out), painted with white metro tiles in a running bond, the top row and a
 * cap rail in an accent colour. Built from the `RoomOptions` like the `Room` itself and placed at
 * the zone's origin with `zone.place(item, new THREE.Vector3())`; each wall is painted on its own
 * canvas so the tiles start square at every corner. Decoration: never collides.
 */
export class TiledWainscot extends Prop {
  constructor(room: RoomOptions, options: TiledWainscotOptions = {}) {
    super();
    this.name = 'TiledWainscot';
    const height = options.height ?? 1.2;
    const walls = options.walls ?? ['back', 'front', 'left', 'right'];
    const clearance = options.doorClearance ?? 0.07;
    const colours = { tile: options.tile ?? 0xf6f5f0, grout: options.grout ?? 0xcfd0cc, accent: options.accent ?? 0x9db3a6 };
    const style: TileStyle = { w: options.tileWidth ?? TILE_W, h: options.tileHeight ?? TILE_H, bevel: options.bevel ?? true, variance: options.variance ?? 0.008 };
    const roughness = options.roughness ?? 0.25;
    const capPaint = matte(colours.accent, 0.35);
    const doorways = room.doorways ?? [];

    for (const wall of walls) {
      const along = wall === 'back' || wall === 'front';
      const length = along ? room.width : room.depth;
      const gaps = [
        ...doorways.filter((d) => d.wall === wall).map((d) => ({ centre: wallLocalX(wall, d.along), width: d.width + 2 * clearance })),
        ...(options.openings ?? []).filter((o) => o.wall === wall).map((o) => ({ centre: wallLocalX(wall, o.along), width: o.width })),
      ];
      const map = paintTiles(length, height, colours, style);
      // One group per wall, turned like the Room's wall planes: local +x runs along the wall, +z into the room.
      const face = new THREE.Group();
      const { position, rotationY } = wallFrame(room, wall);
      face.position.copy(position);
      face.rotation.y = rotationY;
      this.add(face);

      for (const seg of segmentsBetween(length, gaps)) {
        // The tiles of this stretch are the matching window of the wall's canvas.
        const tiles = new THREE.MeshStandardMaterial({ map: map.clone(), roughness });
        tiles.map!.repeat.set(seg.length / length, 1);
        tiles.map!.offset.set((seg.centre - seg.length / 2 + length / 2) / length, 0);
        tiles.map!.needsUpdate = true;
        const grout = matte(colours.grout, 0.8);
        // BoxGeometry material order: +x, -x, +y, -y, +z (the face into the room), -z.
        const slab = new THREE.Mesh(new THREE.BoxGeometry(seg.length, height, THICKNESS), [grout, grout, grout, grout, tiles, grout]);
        slab.position.set(seg.centre, height / 2, THICKNESS / 2);
        slab.receiveShadow = true;
        face.add(slab);
        const cap = part(face, seg.length, CAP_H, CAP_D, capPaint, { x: seg.centre, y: height + CAP_H / 2, z: CAP_D / 2 });
        cap.castShadow = false;
      }
    }
  }
}

/** Where a wall's face group stands and how it is turned so that its local +x runs along the wall and +z faces the room (as the `Room`'s wall planes). */
function wallFrame(room: RoomOptions, wall: Wall): { position: THREE.Vector3; rotationY: number } {
  const halfW = room.width / 2;
  const halfD = room.depth / 2;
  switch (wall) {
    case 'back':
      return { position: new THREE.Vector3(0, 0, -halfD), rotationY: 0 };
    case 'front':
      return { position: new THREE.Vector3(0, 0, halfD), rotationY: Math.PI };
    case 'left':
      return { position: new THREE.Vector3(-halfW, 0, 0), rotationY: Math.PI / 2 };
    case 'right':
      return { position: new THREE.Vector3(halfW, 0, 0), rotationY: -Math.PI / 2 };
  }
}

/** A doorway's world coordinate along a wall as the local x of that wall's face (mirrors the `Room`'s wall planes). */
function wallLocalX(wall: Wall, along: number): number {
  return wall === 'front' || wall === 'left' ? -along : along;
}

/** The stretches of a wall of `length` (centred on 0) left once the `gaps` are taken out. */
function segmentsBetween(length: number, gaps: { centre: number; width: number }[]): { centre: number; length: number }[] {
  const cuts = gaps.map((g) => [g.centre - g.width / 2, g.centre + g.width / 2] as const).sort((a, b) => a[0] - b[0]);
  const segments: { centre: number; length: number }[] = [];
  let from = -length / 2;
  for (const [a, b] of cuts) {
    if (a > from) segments.push({ centre: (from + a) / 2, length: a - from });
    from = Math.max(from, b);
  }
  if (length / 2 > from) segments.push({ centre: (from + length / 2) / 2, length: length / 2 - from });
  return segments;
}

/** Size of one tile, whether its edges are bevelled, how much its shade may vary from its neighbours'. */
interface TileStyle {
  w: number;
  h: number;
  bevel: boolean;
  variance: number;
}

/** Tiles (or bricks) over grout, offset half a tile every other row; the top row in the accent colour. */
function paintTiles(lengthM: number, heightM: number, colours: { tile: number; grout: number; accent: number }, style: TileStyle): THREE.CanvasTexture {
  const W = Math.round(lengthM * PX_PER_M);
  const H = Math.round(heightM * PX_PER_M);
  const [canvas, ctx] = createCanvas(W, H);
  const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
  ctx.fillStyle = hex(colours.grout);
  ctx.fillRect(0, 0, W, H);

  const tw = style.w * PX_PER_M;
  const th = style.h * PX_PER_M;
  const rows = Math.ceil(H / th);
  for (let row = 0; row < rows; row++) {
    // Canvas y runs down while the wall's v runs up: row 0 is the top row, the accent one.
    const y = row * th;
    const base = new THREE.Color(row === 0 ? colours.accent : colours.tile);
    const shift = row % 2 ? tw / 2 : 0;
    for (let x = -shift; x < W; x += tw) {
      const shade = 1 + ((((row * 31 + Math.round(x)) * 2654435761) % 7) - 3) * style.variance;
      ctx.fillStyle = `#${base.clone().multiplyScalar(shade).getHexString()}`;
      ctx.fillRect(x + GROUT_PX / 2, y + GROUT_PX / 2, tw - GROUT_PX, th - GROUT_PX);
      if (!style.bevel) continue;
      // The bevel: light along the top and left edges, shadow along the bottom and right.
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(x + GROUT_PX / 2, y + GROUT_PX / 2, tw - GROUT_PX, 3);
      ctx.fillRect(x + GROUT_PX / 2, y + GROUT_PX / 2, 3, th - GROUT_PX);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(x + GROUT_PX / 2, y + th - GROUT_PX / 2 - 3, tw - GROUT_PX, 3);
      ctx.fillRect(x + tw - GROUT_PX / 2 - 3, y + GROUT_PX / 2, 3, th - GROUT_PX);
    }
  }
  return toTexture(canvas, 4);
}
