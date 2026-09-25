import * as THREE from 'three';
import { createCanvas } from '@/covers/generated/canvasUtils';

const PX_W = 256;
const PX_H = 96;
/** Size in the world, metres (it always faces the camera). */
const WIDTH = 0.5;
const FADE = 0.3;

/**
 * A comic speech bubble over someone's head: a word or two ("WHOA!", "Aww...") that pops up,
 * stays a moment and fades. A camera-facing sprite on a small canvas, repainted per line.
 * Add it to the person and place it above the head; `say()` shows a line, `update()` fades it.
 */
export class SpeechBubble extends THREE.Sprite {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private left = 0;

  constructor() {
    const [canvas, ctx] = createCanvas(PX_W, PX_H);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    super(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
    this.ctx = ctx;
    this.texture = texture;
    this.scale.set(WIDTH, (WIDTH * PX_H) / PX_W, 1);
    this.visible = false;
    this.renderOrder = 10;
  }

  say(text: string, seconds = 2.2): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, PX_W, PX_H);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#1a1a22';
    ctx.lineWidth = 5;
    const r = 26;
    const x = 6;
    const y = 6;
    const w = PX_W - 12;
    const h = PX_H - 30;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.lineTo(PX_W / 2 + 14, y + h);
    ctx.lineTo(PX_W / 2 - 4, PX_H - 4);
    ctx.lineTo(PX_W / 2 - 6, y + h);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1a1a22';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = 34;
    do {
      ctx.font = `bold ${size}px "Comic Sans MS", "Chalkboard SE", sans-serif`;
      size -= 2;
    } while (ctx.measureText(text).width > w - 24 && size > 14);
    ctx.fillText(text, PX_W / 2, y + h / 2 + 2);
    this.texture.needsUpdate = true;
    this.left = seconds;
    this.visible = true;
    this.material.opacity = 1;
  }

  update(dt: number): void {
    if (this.left <= 0) return;
    this.left -= dt;
    this.material.opacity = Math.min(1, Math.max(0, this.left / FADE));
    if (this.left <= 0) this.visible = false;
  }
}
