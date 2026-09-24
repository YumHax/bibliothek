import * as THREE from 'three';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { Prop } from './Prop';
import { fabric } from '@/world/materials/finishes';

export interface RugOptions {
  width?: number;
  depth?: number;
  /** Field, border and motif colours. */
  field?: number;
  border?: number;
  motif?: number;
}

const THICKNESS = 0.012;

/**
 * A flat woven rug: a thin slab (so its edge reads in first person) with a procedural
 * border-and-lozenge pattern on top. Decoration only; never a collider (see `Prop`).
 */
export class Rug extends Prop {
  readonly options: Required<RugOptions>;

  constructor(options: RugOptions = {}) {
    super();
    this.name = 'Rug';
    this.options = { width: 2.4, depth: 1.8, field: 0x6b2f2f, border: 0xd9c9a3, motif: 0x8a3d3d, ...options };
    const { width, depth } = this.options;

    const top = fabric({ map: this.paint(), roughness: 1, sheenTint: 0x8a8580 });
    const edge = fabric({ color: new THREE.Color(this.options.field).multiplyScalar(0.7), roughness: 1 });
    // BoxGeometry material order: +x, -x, +y (top), -y, +z, -z.
    const slab = new THREE.Mesh(new THREE.BoxGeometry(width, THICKNESS, depth), [edge, edge, top, edge, edge, edge]);
    slab.position.y = THICKNESS / 2;
    slab.receiveShadow = true;
    this.add(slab);
  }

  private paint(): THREE.CanvasTexture {
    const { width, depth, field, border, motif } = this.options;
    const W = 1024;
    const H = Math.round((W * depth) / width);
    const [canvas, ctx] = createCanvas(W, H);
    const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

    ctx.fillStyle = hex(border);
    ctx.fillRect(0, 0, W, H);
    const b1 = W * 0.03;
    ctx.fillStyle = hex(field);
    ctx.fillRect(b1, b1, W - 2 * b1, H - 2 * b1);
    const b2 = W * 0.055;
    ctx.strokeStyle = hex(border);
    ctx.lineWidth = W * 0.006;
    ctx.strokeRect(b2, b2, W - 2 * b2, H - 2 * b2);
    const b3 = W * 0.075;
    ctx.fillStyle = hex(motif);
    ctx.fillRect(b3, b3, W - 2 * b3, H - 2 * b3);
    const b4 = W * 0.095;
    ctx.fillStyle = hex(field);
    ctx.fillRect(b4, b4, W - 2 * b4, H - 2 * b4);

    // Lozenge lattice inside the field.
    const cell = W * 0.08;
    ctx.save();
    ctx.beginPath();
    ctx.rect(b4, b4, W - 2 * b4, H - 2 * b4);
    ctx.clip();
    ctx.strokeStyle = hex(motif);
    ctx.lineWidth = W * 0.004;
    for (let x = b4 - cell; x < W; x += cell) {
      ctx.beginPath();
      ctx.moveTo(x, b4);
      ctx.lineTo(x + (H - 2 * b4) / 2, H / 2);
      ctx.lineTo(x, H - b4);
      ctx.moveTo(x + cell, b4);
      ctx.lineTo(x + cell - (H - 2 * b4) / 2, H / 2);
      ctx.lineTo(x + cell, H - b4);
      ctx.stroke();
    }
    // Dots at the lattice crossings along the centre line, and a central medallion.
    ctx.fillStyle = hex(border);
    for (let x = b4 + cell / 2; x < W - b4; x += cell) {
      ctx.beginPath();
      ctx.arc(x, H / 2, W * 0.006, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(Math.PI / 4);
    const m = W * 0.11;
    ctx.fillStyle = hex(motif);
    ctx.fillRect(-m, -m, 2 * m, 2 * m);
    ctx.fillStyle = hex(border);
    ctx.fillRect(-m * 0.72, -m * 0.72, m * 1.44, m * 1.44);
    ctx.fillStyle = hex(field);
    ctx.fillRect(-m * 0.55, -m * 0.55, m * 1.1, m * 1.1);
    ctx.restore();
    // A d-pad cross in the medallion: the room's little wink.
    ctx.fillStyle = hex(motif);
    const arm = W * 0.075;
    const thick = W * 0.028;
    ctx.fillRect(W / 2 - arm / 2, H / 2 - thick / 2, arm, thick);
    ctx.fillRect(W / 2 - thick / 2, H / 2 - arm / 2, thick, arm);

    // Fibre noise.
    for (let i = 0; i < 6000; i++) {
      ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${(Math.random() * 0.08).toFixed(3)})`;
      ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
    }
    return toTexture(canvas, 4);
  }
}
