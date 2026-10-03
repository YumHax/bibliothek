import * as THREE from 'three';
import { createCanvas, toTexture } from '@/graphics/canvas';
import { QUALITY } from '@/graphics/quality';
import { letteringFont } from '../../city/shopLooks';
import { FACADE, onSurface } from '../../surface/layers';
import type { FacadeFrame } from '../relief/facadeFrame';
import { TexQuads } from './TexQuads';

/** One shop's name on its fascia: where (facade frame, s along, y up, `board`: from the wall to the board's face), how tall and how wide at most. */
export interface FasciaSign {
  frame: FacadeFrame;
  s: number;
  y: number;
  board: number;
  /** The letters' height (metres). */
  size: number;
  /** The widest the lettering may run (metres): it is squeezed to fit. */
  maxWidth: number;
  text: string;
  color: string;
  font: string;
  /** The colour it burns in at night (a neon name), if it does. */
  neon?: string;
}

/** Texels per metre: a 0.5 m letter is 128 texels tall (64 on low), sharp from the pavement. */
const PX_PER_METRE = QUALITY.level === 'low' ? 128 : 256;
const ATLAS_WIDTH = 2048;
/** The quad's height over the letters' (the ascenders and the script's flourishes). */
const LINE = 1.15;

/** Where one sign went in the atlas (pixels) and its quad's size (metres). */
interface Cell {
  sign: FasciaSign;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Measured width of the words at full size (pixels), squeezed into `w` when wider. */
  textWidth: number;
  fontPx: number;
}

/**
 * The names on the fascias of the fronts built in 3D (`Shopfronts`), out of the facade atlas (whose 34-46 px per
 * metre blur a 0.5 m letter into 20 px): every name painted once into an atlas of its own at `PX_PER_METRE`, a quad
 * each on its board, as a facade layer (`FACADE.lettering`). Blended rather than cut out, so the letters thin out
 * with distance instead of breaking up. A neon name glows in its neon's colour from dusk (`setNight`). A draw call
 * for the plain names and one per neon colour.
 */
export class FasciaLettering extends THREE.Group {
  private readonly neon: THREE.MeshStandardMaterial[] = [];

  constructor(signs: readonly FasciaSign[]) {
    super();
    this.name = 'FasciaLettering';
    if (!signs.length) return;
    const [canvas, cells] = paint(signs);
    const texture = toTexture(canvas);
    // The plain names under '', the neon ones under their colour.
    const groups = new Map<string, TexQuads>();
    const tw = canvas.width;
    const th = canvas.height;
    for (const cell of cells) {
      const { sign } = cell;
      const uv = { u0: cell.x / tw, u1: (cell.x + cell.w) / tw, v0: 1 - (cell.y + cell.h) / th, v1: 1 - cell.y / th };
      let quads = groups.get(sign.neon ?? '');
      if (!quads) groups.set(sign.neon ?? '', (quads = new TexQuads()));
      quads.quad(sign.frame.matrix(0, 0), sign.s, sign.y, sign.board + FACADE.lettering.lift, cell.w / PX_PER_METRE, cell.h / PX_PER_METRE, uv);
    }
    const material = (neon: string): THREE.MeshStandardMaterial =>
      onSurface(
        new THREE.MeshStandardMaterial({
          map: texture,
          transparent: true,
          alphaTest: 0.02,
          roughness: 0.55,
          // The ink times the neon's colour: white letters burn green on the pharmacy, cream ones red on the newsagent.
          ...(neon ? { emissive: new THREE.Color(neon), emissiveMap: texture, emissiveIntensity: 0 } : {}),
        }),
        FACADE.lettering,
        { depthWrite: false },
      );
    for (const [neon, quads] of groups) {
      const m = material(neon);
      if (neon) this.neon.push(m);
      this.add(mesh(quads.build(), m));
    }
  }

  /** How dark it is (0 day .. 1 night): the neon names burn brighter as the light goes. */
  setNight(night: number): void {
    for (const material of this.neon) material.emissiveIntensity = 0.1 + 1.5 * night;
  }
}

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const out = new THREE.Mesh(geometry, material);
  out.receiveShadow = true;
  out.name = 'Lettering';
  return out;
}

/** Packs the names in shelves across the atlas and paints each, squeezed to its width, in its ink with a faint dark edge. */
function paint(signs: readonly FasciaSign[]): [HTMLCanvasElement, Cell[]] {
  const [, measure] = createCanvas(1, 1);
  const cells: Cell[] = [];
  let x = 0;
  let y = 0;
  let row = 0;
  for (const sign of signs) {
    const fontPx = Math.max(8, Math.round(sign.size * PX_PER_METRE));
    measure.font = letteringFont(sign.font, fontPx);
    const pad = Math.ceil(fontPx * 0.12);
    const textWidth = measure.measureText(sign.text).width;
    const w = Math.min(ATLAS_WIDTH, Math.ceil(Math.min(textWidth, sign.maxWidth * PX_PER_METRE) + 2 * pad));
    const h = Math.ceil(fontPx * LINE);
    if (x + w > ATLAS_WIDTH) {
      x = 0;
      y += row + 2;
      row = 0;
    }
    cells.push({ sign, x, y, w, h, textWidth, fontPx });
    x += w + 2;
    row = Math.max(row, h);
  }
  const [canvas, ctx] = createCanvas(ATLAS_WIDTH, Math.max(4, Math.ceil((y + row) / 4) * 4));
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const cell of cells) {
    const { sign, fontPx } = cell;
    const pad = Math.ceil(fontPx * 0.12);
    const room = cell.w - 2 * pad;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cell.x, cell.y, cell.w, cell.h);
    ctx.clip();
    ctx.translate(cell.x + cell.w / 2, cell.y + cell.h / 2);
    if (cell.textWidth > room) ctx.scale(room / cell.textWidth, 1);
    ctx.font = letteringFont(sign.font, fontPx);
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1, fontPx * 0.05);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.strokeText(sign.text, 0, 0);
    ctx.fillStyle = sign.color;
    ctx.fillText(sign.text, 0, 0);
    ctx.restore();
  }
  return [canvas, cells];
}
