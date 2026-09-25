import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { createCanvas } from '@/covers/generated/canvasUtils';
import { boxMesh } from '../meshUtils';
import { matte, Prop } from '../props/Prop';
import { drawText } from './games/ArcadeGame';
import type { TodaysChallenge } from './scoreTable';

export interface ChallengeBoardOptions {
  /** Today's challenge, read again every second (it changes when paid, and at midnight). */
  challenge: () => TodaysChallenge;
  /** A machine's title by its game id, for the sign. */
  titleOf: (gameId: string) => string;
  width?: number;
  height?: number;
}

const PX_PER_M = 700;
const POLL_SECONDS = 1;
const FRAME = matte(0x1a1208, 0.5);

/**
 * TODAY'S CHALLENGE: a lit sign by the way in with the day's game, the score to reach and the
 * tickets it pays on top, stamped BEATEN once paid. The challenge itself is `ArcadeDaily`'s (the
 * same for everyone all day); the Session pays it. Wall-hung, +z into the room. Never collides.
 */
export class ChallengeBoard extends Prop implements Updatable {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly options: Required<ChallengeBoardOptions>;
  private shown = '';
  private pollClock = 0;
  private clock = 0;

  constructor(options: ChallengeBoardOptions) {
    super();
    this.name = 'ChallengeBoard';
    this.options = { width: 1.0, height: 0.62, ...options };
    const { width, height } = this.options;
    const frame = boxMesh(width + 0.06, height + 0.06, 0.04, FRAME, { z: 0.02 });
    frame.castShadow = false;
    this.add(frame);
    this.canvas = createCanvas(Math.round(width * PX_PER_M), Math.round(height * PX_PER_M))[0];
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false, color: 0xd8d8d8 }));
    face.position.z = 0.042;
    this.add(face);
    this.repaint();
  }

  update(dt: number): void {
    this.clock += dt;
    this.pollClock += dt;
    if (this.pollClock < POLL_SECONDS) return;
    this.pollClock = 0;
    this.repaint();
  }

  private repaint(): void {
    const c = this.options.challenge();
    // The chaser round the edge moves every repaint; the rest only when the challenge does.
    const key = `${c.gameId}|${c.target}|${c.done}|${Math.floor(this.clock) % 2}`;
    if (key === this.shown) return;
    this.shown = key;
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.fillStyle = '#1c0f24';
    ctx.fillRect(0, 0, W, H);
    // Bulbs round the edge, every other one lit, alternating each second.
    const phase = Math.floor(this.clock) % 2;
    for (let i = 0, x = 16; x < W - 8; x += 28, i++) {
      for (const y of [14, H - 14]) {
        ctx.fillStyle = (i + phase) % 2 ? '#ffe680' : '#6a4a2a';
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    drawText(ctx, "TODAY'S CHALLENGE", W / 2, H * 0.17, Math.round(H * 0.08), '#ffd23a');
    drawText(ctx, this.options.titleOf(c.gameId), W / 2, H * 0.36, Math.round(H * 0.11), '#ffffff');
    drawText(ctx, `SCORE ${c.target.toLocaleString('en-US')}`, W / 2, H * 0.54, Math.round(H * 0.085), '#9ad6ff');
    drawText(ctx, `+${c.reward} TICKETS ON TOP`, W / 2, H * 0.7, Math.round(H * 0.07), '#7ee787');
    drawText(ctx, 'ONE PRIZE A DAY · NEW ONE AT MIDNIGHT', W / 2, H * 0.84, Math.round(H * 0.04), '#b09ac0');
    if (c.done) {
      ctx.save();
      ctx.translate(W / 2, H * 0.5);
      ctx.rotate(-0.18);
      ctx.strokeStyle = '#ff3a5a';
      ctx.lineWidth = 10;
      ctx.strokeRect(-W * 0.3, -H * 0.12, W * 0.6, H * 0.24);
      drawText(ctx, 'BEATEN!', 0, 4, Math.round(H * 0.16), '#ff3a5a');
      ctx.restore();
    }
    this.texture.needsUpdate = true;
  }
}
