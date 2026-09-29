import * as THREE from 'three';
import { createCanvas, toTexture, wrapLines } from '@/covers/generated/canvasUtils';

/** Canvas width of the card (px); its height follows the card's proportions. */
const PX = 160;
/** A pen hand, whichever the system has. */
const HAND = '"Segoe Print", "Bradley Hand", "Chalkboard SE", "Comic Sans MS", cursive';
/** How far the card leans back against the air behind it (radians). */
const LEAN = 0.14;

/**
 * What stands in a wishlist game's place on the shelf: not the game (the player does not have it)
 * but the gap it will fill, and in it a little cream index card with its title written in pen,
 * leaning back a touch. Built in the box's own frame (centred on where the box would stand, cover
 * towards +z), sized to the gap; its own material (a per-card texture), casts no shadow.
 */
export class WishCard extends THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial> {
  constructor(title: string, boxWidth: number, boxHeight: number, anisotropy: number) {
    const w = Math.min(boxWidth * 0.82, 0.11);
    const h = Math.min(boxHeight * 0.55, w * 1.3);
    super(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: paintCard(title, h / w, anisotropy), roughness: 0.92, side: THREE.DoubleSide }),
    );
    this.name = 'WishCard';
    // Standing on the board (the box's bottom), a little back from where its cover would be, its foot held there as it leans.
    this.position.set(0, -boxHeight / 2 + (h / 2) * Math.cos(LEAN), -(h / 2) * Math.sin(LEAN));
    this.rotation.x = -LEAN;
    this.castShadow = false;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.map?.dispose();
    this.material.dispose();
  }
}

/** Cream card, a faint ruled line or two, "wanted" in pencil and the title in blue-black ink. */
function paintCard(title: string, aspect: number, anisotropy: number): THREE.CanvasTexture {
  const W = PX;
  const H = Math.round(PX * aspect);
  const [canvas, ctx] = createCanvas(W, H);
  ctx.fillStyle = '#f3ecda';
  ctx.fillRect(0, 0, W, H);
  // The card's own rules: a red header line, pale blue lines under it.
  ctx.strokeStyle = 'rgba(190,60,60,0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, H * 0.24);
  ctx.lineTo(W, H * 0.24);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(80,120,190,0.3)';
  ctx.lineWidth = 1;
  for (let y = H * 0.24 + 22; y < H - 6; y += 22) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(90,90,90,0.8)';
  ctx.font = `15px ${HAND}`;
  ctx.fillText('wanted', W / 2, H * 0.24 - 6);

  // The title, in pen, slightly askew; as big as it fits on three lines.
  ctx.save();
  ctx.translate(W / 2, H * 0.24);
  ctx.rotate(-0.04);
  ctx.fillStyle = '#1d2a4a';
  let size = 26;
  let lines: string[] = [];
  for (; size >= 12; size -= 2) {
    ctx.font = `${size}px ${HAND}`;
    lines = wrapLines(ctx, title, W - 16, 3);
    if (lines.length * size * 1.05 <= H * 0.7) break;
  }
  lines.forEach((line, i) => ctx.fillText(line, 0, 18 + size * 0.9 + i * size * 1.05));
  ctx.restore();
  return toTexture(canvas, anisotropy);
}
