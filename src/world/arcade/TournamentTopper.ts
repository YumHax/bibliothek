import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { createCanvas } from '@/covers/generated/canvasUtils';
import { boxMesh } from '../meshUtils';
import { markShared, matte, Prop } from '../props/Prop';
import { drawText } from './games/ArcadeGame';

const STAND = markShared(matte(0x121018, 0.5));
/** How often it checks whether today is still tournament day (seconds). */
const POLL_SECONDS = 5;

/**
 * A lit TOURNAMENT sign standing on top of the day's tournament cabinet (the builder adds it as a
 * child of the cabinet, at its roof), showing only while `on()` says so and chasing its border
 * bulbs. No light: an unlit canvas that blinks, like the medal lamps. Never collides.
 */
export class TournamentTopper extends Prop implements Updatable {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private clock = 0;
  private poll = POLL_SECONDS;
  private phase = -1;

  constructor(private readonly on: () => boolean) {
    super();
    this.name = 'TournamentTopper';
    const width = 0.6;
    const height = 0.16;
    this.add(boxMesh(width + 0.03, height + 0.03, 0.03, STAND, { y: height / 2 + 0.015 }));
    const [canvas, ctx] = createCanvas(384, 102);
    this.ctx = ctx;
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false }));
    face.position.set(0, height / 2 + 0.015, 0.016);
    this.add(face);
    this.visible = on();
  }

  update(dt: number): void {
    this.poll += dt;
    if (this.poll >= POLL_SECONDS) {
      this.poll = 0;
      this.visible = this.on();
    }
    if (!this.visible) return;
    this.clock += dt;
    const phase = Math.floor(this.clock * 4) % 3;
    if (phase !== this.phase) {
      this.phase = phase;
      this.paint(phase);
    }
  }

  private paint(phase: number): void {
    const { ctx } = this;
    const { width: W, height: H } = ctx.canvas;
    ctx.fillStyle = '#1a0f05';
    ctx.fillRect(0, 0, W, H);
    // Chasing bulbs round the edge: every third one lit, moving on each phase.
    const bulbs: [number, number][] = [];
    for (let x = 10; x < W; x += 20) bulbs.push([x, 8], [W - x, H - 8]);
    for (let y = 26; y < H - 16; y += 20) bulbs.push([8, y], [W - 8, H - y]);
    bulbs.forEach(([x, y], i) => {
      ctx.fillStyle = i % 3 === phase ? '#fff3b0' : '#6a4a10';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    });
    drawText(ctx, 'TOURNAMENT', W / 2, H * 0.44, 38, '#ffd23a');
    drawText(ctx, 'TODAY', W / 2, H * 0.78, 18, '#ff8a3a');
    this.texture.needsUpdate = true;
  }
}
