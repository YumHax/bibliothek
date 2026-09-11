import type * as THREE from 'three';
import { createCanvas, roundRect, toTexture, FONT } from './canvasUtils';

const W = 128;
const H = 180;

/** A cream paper tag with a reinforced hole, bold `lines` of text and two blank fields. */
export function createPaperTagTexture(lines: string[], anisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(W, H);
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = '#f4ecd6';
  roundRect(ctx, 1, 1, W - 2, H - 2, 8);
  ctx.fill();
  ctx.strokeStyle = '#c9b98f';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Reinforced hole.
  ctx.fillStyle = '#b5a27a';
  ctx.beginPath();
  ctx.arc(W / 2, 22, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a2a2a';
  ctx.beginPath();
  ctx.arc(W / 2, 22, 7, 0, Math.PI * 2);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#8b1e1e';
  ctx.font = `bold 34px ${FONT}`;
  lines.forEach((line, i) => ctx.fillText(line, W / 2, 68 + i * 36));

  // Blank fields.
  ctx.fillStyle = '#6b6357';
  ctx.font = `11px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.setLineDash([2, 2]);
  ctx.strokeStyle = '#8f8574';
  ctx.lineWidth = 1;
  for (const [label, y] of [['to', 146], ['on', 166]] as const) {
    ctx.fillText(label, 12, y);
    ctx.beginPath();
    ctx.moveTo(30, y + 1);
    ctx.lineTo(W - 12, y + 1);
    ctx.stroke();
  }

  return toTexture(canvas, anisotropy);
}
