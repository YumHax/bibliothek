import { SCREEN_H, SCREEN_W, drawText } from './ArcadeGame';

interface Pop {
  text: string;
  x: number;
  y: number;
  life: number;
  color: string;
  size: number;
}

const POP_LIFE = 0.8;

/**
 * The juice every cabinet game shares: floating score pops, a screen shake and a full-screen
 * flash. `begin` / `end` bracket the game's own drawing so the shake moves the playfield and the
 * pops and flash land on top of it.
 */
export class Fx {
  private pops: Pop[] = [];
  private shakeTime = 0;
  private shakeAmount = 0;
  private flashTime = 0;
  private flashColor = '#ffffff';

  clear(): void {
    this.pops = [];
    this.shakeTime = 0;
    this.flashTime = 0;
  }

  /** A short text that rises and fades from (x, y), kept on screen. */
  pop(text: string, x: number, y: number, color = '#fff2a8', size = 8): void {
    this.pops.push({ text, x: Math.min(SCREEN_W - 24, Math.max(24, x)), y: Math.max(30, y), life: POP_LIFE, color, size });
    if (this.pops.length > 12) this.pops.shift();
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
    this.shakeTime = Math.max(0, this.shakeTime - dt);
    if (this.shakeTime === 0) this.shakeAmount = 0;
    this.flashTime = Math.max(0, this.flashTime - dt);
  }

  begin(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    if (this.shakeTime > 0) ctx.translate((Math.random() - 0.5) * 2 * this.shakeAmount, (Math.random() - 0.5) * 2 * this.shakeAmount);
  }

  end(ctx: CanvasRenderingContext2D): void {
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
