import { SCREEN_H, SCREEN_W, drawText } from './ArcadeGame';
import { random } from '@/random';

interface Pop {
  text: string;
  x: number;
  y: number;
  life: number;
  color: string;
  size: number;
}

const POP_LIFE = 0.8;

/** A square of debris: where it is, how it flies, how long it has left (of `life0`). */
interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  life0: number;
  color: string;
  size: number;
}

/** Debris on screen at once (the oldest go first), its fall (px/s²) and how long a piece lives (s). */
const MAX_BITS = 160;
const GRAVITY = 220;
const BIT_LIFE: [number, number] = [0.35, 0.75];

/**
 * The juice every cabinet game shares: floating score pops, debris bursting from what was hit, a
 * screen shake and a full-screen flash. `begin` / `end` bracket the game's own drawing so the shake
 * moves the playfield (and the debris with it) and the pops and flash land on top of it. Draw-only:
 * it never touches the game's state (its draws are the live `random`, not the play's seed), so a
 * replay plays the same.
 */
export class Fx {
  private pops: Pop[] = [];
  private bits: Bit[] = [];
  private shakeTime = 0;
  private shakeAmount = 0;
  private flashTime = 0;
  private flashColor = '#ffffff';

  clear(): void {
    this.pops = [];
    this.bits = [];
    this.shakeTime = 0;
    this.flashTime = 0;
  }

  /** A short text that rises and fades from (x, y), kept on screen. */
  pop(text: string, x: number, y: number, color = '#fff2a8', size = 8): void {
    this.pops.push({ text, x: Math.min(SCREEN_W - 24, Math.max(24, x)), y: Math.max(30, y), life: POP_LIFE, color, size });
    if (this.pops.length > 12) this.pops.shift();
  }

  /**
   * `count` pixel squares of `color` flying out of (x, y), falling and fading: what was hit breaks
   * apart. `speed` is the spread (px/s); `size` the largest square (px).
   */
  burst(x: number, y: number, color: string, count = 14, speed = 90, size = 2): void {
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2;
      const v = speed * (0.35 + random() * 0.65);
      const life = BIT_LIFE[0] + random() * (BIT_LIFE[1] - BIT_LIFE[0]);
      this.bits.push({ x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v - speed * 0.35, life, life0: life, color, size: random() < 0.4 ? size : Math.max(1, size - 1) });
    }
    if (this.bits.length > MAX_BITS) this.bits.splice(0, this.bits.length - MAX_BITS);
  }

  shake(amount = 3, seconds = 0.18): void {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
    this.shakeTime = Math.max(this.shakeTime, seconds);
  }

  flash(color = '#ffffff', seconds = 0.08): void {
    this.flashColor = color;
    this.flashTime = seconds;
  }

  update(dt: number): void {
    for (const p of this.pops) {
      p.life -= dt;
      p.y -= 28 * dt;
    }
    this.pops = this.pops.filter((p) => p.life > 0);
    for (const b of this.bits) {
      b.life -= dt;
      b.vy += GRAVITY * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    if (this.bits.length) this.bits = this.bits.filter((b) => b.life > 0 && b.y < SCREEN_H + 4);
    this.shakeTime = Math.max(0, this.shakeTime - dt);
    if (this.shakeTime === 0) this.shakeAmount = 0;
    this.flashTime = Math.max(0, this.flashTime - dt);
  }

  begin(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    if (this.shakeTime > 0) ctx.translate((random() - 0.5) * 2 * this.shakeAmount, (random() - 0.5) * 2 * this.shakeAmount);
  }

  end(ctx: CanvasRenderingContext2D): void {
    // The debris belongs to the playfield: drawn before the shake is undone, on whole pixels.
    for (const b of this.bits) {
      ctx.globalAlpha = Math.min(1, (b.life / b.life0) * 1.6);
      ctx.fillStyle = b.color;
      ctx.fillRect(Math.round(b.x), Math.round(b.y), b.size, b.size);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    for (const p of this.pops) {
      ctx.globalAlpha = Math.min(1, p.life / (POP_LIFE * 0.5));
      drawText(ctx, p.text, p.x + 1, p.y + 1, p.size, '#000000');
      drawText(ctx, p.text, p.x, p.y, p.size, p.color);
    }
    ctx.globalAlpha = 1;
    if (this.flashTime > 0) {
      ctx.globalAlpha = Math.min(0.6, this.flashTime * 6);
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
      ctx.globalAlpha = 1;
    }
  }
}
