import * as THREE from 'three';
import type { Furniture } from '../../Furniture';
import { Prop, part } from '../../props/Prop';
import { paint, scuffedPaint } from '../../materials/palette';
import { seededRandom } from '@/graphics/canvas';
import { labelSheet, typed } from './labels';

export interface PartsCabinetOptions {
  width?: number;
  height?: number;
  /** Columns and rows of drawers. Default 4 x 10. */
  columns?: number;
  rows?: number;
  /** A row of service manuals in binders along its top. Default true. */
  manuals?: boolean;
  seed?: number;
}

const DEPTH = 0.3;
const DRAWER = paint(0xd8ccb0, 0.55);
const PULL = paint(0x2a2a2c, 0.4);
const BINDERS: readonly number[] = [0x2a4a8a, 0x8a2a22, 0x1e1e20, 0x3a6a3a, 0xc8a040, 0x5a3a6a];
const PARTS: readonly string[] = [
  'FUSES 1A', 'FUSES 3A', 'ECC83', 'PCL82', 'EF80', 'PY88', 'BC547', 'BC557', '1K', '4K7', '10K', '47K', '100K', '1M', '220µF', '470µF',
  'KNOBS', 'BELTS', 'LAMPS', 'CROCS', 'JACKS', 'PLUGS', 'SCREWS', 'NUTS', 'DIODES', 'SWITCHES', 'SPRINGS', 'MAINS', 'FERRITE', 'AERIALS',
  'SCART', 'HEADS', 'IDLERS', 'LEDs', 'POTS', 'XTALS', 'RELAYS', 'MISC', 'MISC', '???',
];
const MANUALS: readonly string[] = ['GRUNDIG', 'PHILIPS', 'SABA', 'LUMINA', 'SONY', 'TELEFUNKEN', 'NORDMENDE', 'BUSH'];

/**
 * The repairer's parts cabinet: a grey steel carcass full of little beige drawers, each with its card (FUSES 3A,
 * ECC83, 4K7, KNOBS, MISC), one or two pulled out a little; on its top a row of service manuals in their binders, the
 * makers on their spines. Floor-standing against a wall (`y: 0`): origin on the floor at the wall, +z into the room.
 * Collides as its box.
 */
export class PartsCabinet extends Prop implements Furniture {
  private readonly box: THREE.Box3;

  constructor(options: PartsCabinetOptions = {}) {
    super();
    this.name = 'PartsCabinet';
    const W = options.width ?? 0.6;
    const H = options.height ?? 1.25;
    const columns = options.columns ?? 4;
    const rows = options.rows ?? 10;
    const random = seededRandom(options.seed ?? 3);
    const steel = scuffedPaint(0x6a7074, 0.5);
    const T = 0.02;
    part(this, W, T, DEPTH, steel, { y: H - T / 2, z: DEPTH / 2 });
    part(this, W, 0.08, DEPTH, steel, { y: 0.04, z: DEPTH / 2 });
    for (const s of [-1, 1]) part(this, T, H - T - 0.08, DEPTH, steel, { x: (s * (W - T)) / 2, y: 0.08 + (H - T - 0.08) / 2, z: DEPTH / 2 });
    part(this, W - 2 * T, H - T - 0.08, T, steel, { y: 0.08 + (H - T - 0.08) / 2, z: T / 2 });
    // The drawers, a millimetre or two apart; now and then one left pulled out.
    const cellW = (W - 2 * T) / columns;
    const cellH = (H - T - 0.08) / rows;
    const labels: { x: number; y: number; z: number }[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        const x = -W / 2 + T + cellW * (c + 0.5);
        const y = 0.08 + cellH * (r + 0.5);
        const out = random() < 0.06 ? 0.04 + random() * 0.08 : 0;
        const z = DEPTH - 0.005 + out;
        part(this, cellW - 0.006, cellH - 0.006, 0.02, DRAWER, { x, y, z: z - 0.01 });
        part(this, cellW * 0.4, 0.008, 0.012, PULL, { x, y: y - cellH * 0.25, z: z + 0.006 });
        labels.push({ x, y: y + cellH * 0.1, z });
      }
    }
    const cards = labelSheet(
      labels.map((_, i) => ({ width: cellW * 0.7, height: cellH * 0.34, paint: typed(PARTS[(i * 7 + (options.seed ?? 3)) % PARTS.length]!, { paper: '#f4f0e2', ink: '#1a2a4a', rule: false }) })),
      1600,
    );
    cards.forEach((card, i) => {
      const at = labels[i]!;
      card.position.set(at.x, at.y, at.z + card.position.z);
      this.add(card);
    });
    // The manuals along the top, leaning a little at the end of the row.
    if (options.manuals ?? true) {
      const spines: { x: number; w: number; h: number }[] = [];
      let x = -W / 2 + 0.03;
      for (let i = 0; x < W / 2 - 0.08; i++) {
        const w = 0.04 + random() * 0.025;
        const h = 0.26 + random() * 0.06;
        part(this, w, h, 0.22, paint(BINDERS[i % BINDERS.length]!, 0.55), { x: x + w / 2, y: H + h / 2, z: DEPTH - 0.13 });
        spines.push({ x: x + w / 2, w, h });
        x += w + 0.002;
      }
      const names = labelSheet(spines.map((s, i) => ({ width: s.w * 0.7, height: s.h * 0.55, paint: spine(MANUALS[i % MANUALS.length]!) })), 1200);
      names.forEach((name, i) => {
        const s = spines[i]!;
        name.position.set(s.x, H + s.h * 0.55, DEPTH - 0.02 + name.position.z);
        this.add(name);
      });
    }
    this.box = new THREE.Box3(new THREE.Vector3(-W / 2, 0, 0), new THREE.Vector3(W / 2, H, DEPTH));
  }

  override get footprint(): THREE.Box3 {
    return this.box;
  }
}

/** A binder's spine card: the maker's name written down it, a service-manual number under. */
function spine(name: string): (ctx: CanvasRenderingContext2D, w: number, h: number) => void {
  return (ctx, w, h) => {
    ctx.fillStyle = '#efe8d4';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#1e1c1a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = Math.round(w * 0.6);
    ctx.font = `700 ${size}px "Courier New", monospace`;
    while (ctx.measureText(name).width > h * 0.9 && size > 5) ctx.font = `700 ${--size}px "Courier New", monospace`;
    ctx.fillText(name, 0, 0);
    ctx.restore();
  };
}
