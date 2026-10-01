import * as THREE from 'three';
import { createCanvas, toTexture } from '@/graphics/canvas';
import { onSurface, WALL, type SurfaceLayer } from '../../surface/layers';

/** One label: its size on the thing it is stuck to (metres) and how it is painted into its w x h pixel box. */
export interface Label {
  width: number;
  height: number;
  paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
}

/** The sheet's widest row, pixels. */
const MAX_W = 1024;
const GAP = 2;

/**
 * Many small labels painted onto one canvas (the repair tickets on the sets, the drawers' cards, the manuals' spines,
 * the boxes' stencils): every label is a plane of its own size whose UVs pick its box on the sheet, all sharing one
 * material, so a prop's labels merge into a single draw. Each plane lies on its layer (`WALL.print` by default) facing
 * +z, its centre at the origin; the caller moves and turns it onto its face.
 */
export function labelSheet(labels: readonly Label[], pxPerMetre = 1400, layer: SurfaceLayer = WALL.print, roughness = 0.85): THREE.Mesh[] {
  // Shelf-packed rows, left to right.
  const boxes: { x: number; y: number; w: number; h: number }[] = [];
  let x = 0;
  let y = 0;
  let row = 0;
  for (const label of labels) {
    const w = Math.max(8, Math.round(label.width * pxPerMetre));
    const h = Math.max(8, Math.round(label.height * pxPerMetre));
    if (x + w > MAX_W) {
      x = 0;
      y += row + GAP;
      row = 0;
    }
    boxes.push({ x, y, w, h });
    x += w + GAP;
    row = Math.max(row, h);
  }
  const W = MAX_W;
  const H = Math.max(8, y + row);
  const [canvas, ctx] = createCanvas(W, H);
  labels.forEach((label, i) => {
    const box = boxes[i]!;
    ctx.save();
    ctx.translate(box.x, box.y);
    ctx.beginPath();
    ctx.rect(0, 0, box.w, box.h);
    ctx.clip();
    label.paint(ctx, box.w, box.h);
    ctx.restore();
  });
  const material = onSurface(new THREE.MeshStandardMaterial({ map: toTexture(canvas), roughness }), layer);
  return labels.map((label, i) => {
    const box = boxes[i]!;
    const geometry = new THREE.PlaneGeometry(label.width, label.height);
    const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
    const u0 = box.x / W;
    const u1 = (box.x + box.w) / W;
    const v1 = 1 - box.y / H;
    const v0 = 1 - (box.y + box.h) / H;
    // PlaneGeometry's corners: top-left, top-right, bottom-left, bottom-right.
    uv.setXY(0, u0, v1);
    uv.setXY(1, u1, v1);
    uv.setXY(2, u0, v0);
    uv.setXY(3, u1, v0);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.z = layer.lift;
    mesh.receiveShadow = true;
    return mesh;
  });
}

/** A brown repair ticket, string hole and all: a number in red, a name and the fault in biro. */
export function ticket(number: number, lines: readonly string[], paper = '#d8c49a'): Label['paint'] {
  return (ctx, w, h) => {
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(90,60,30,0.18)';
    for (let i = 0; i < 30; i++) ctx.fillRect((i * 37) % w, (i * 53) % h, 2, 1);
    ctx.fillStyle = '#b0302a';
    ctx.font = `700 ${Math.round(h * 0.22)}px "Courier New", monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`No ${String(number).padStart(4, '0')}`, w * 0.08, h * 0.08);
    ctx.fillStyle = '#1c2a4a';
    const size = Math.round(h * (lines.length > 1 ? 0.2 : 0.26));
    ctx.font = `600 ${size}px "Segoe Print", "Bradley Hand", "Comic Sans MS", sans-serif`;
    lines.forEach((line, i) => ctx.fillText(line, w * 0.08, h * 0.38 + i * size * 1.15, w * 0.84));
    // The string's hole, reinforced.
    ctx.fillStyle = '#c8b080';
    ctx.beginPath();
    ctx.arc(w * 0.9, h * 0.2, h * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a2420';
    ctx.beginPath();
    ctx.arc(w * 0.9, h * 0.2, h * 0.04, 0, Math.PI * 2);
    ctx.fill();
  };
}

/** A white card with typed capitals, a thin rule round it: a drawer's label, a box's stencil. */
export function typed(text: string, { paper = '#f2eee2', ink = '#1e1c1a', rule = true, family = '"Courier New", monospace' }: { paper?: string; ink?: string; rule?: boolean; family?: string } = {}): Label['paint'] {
  return (ctx, w, h) => {
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, w, h);
    if (rule) {
      ctx.strokeStyle = ink;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = Math.max(1, h * 0.05);
      ctx.strokeRect(h * 0.08, h * 0.08, w - h * 0.16, h - h * 0.16);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = Math.round(h * 0.55);
    ctx.font = `700 ${size}px ${family}`;
    while (ctx.measureText(text).width > w * 0.86 && size > 6) ctx.font = `700 ${--size}px ${family}`;
    ctx.fillText(text, w / 2, h / 2 + h * 0.03);
  };
}
