import type { SfxEvent } from '@/audio/ChipSpeaker';
import { type ArcadeControls, type ArcadeGame, type RunContext, SCREEN_H, SCREEN_W } from '../arcade/games/ArcadeGame';
import { Comets } from '../arcade/games/Comets';

/** The phosphor's green, and how strong the scanlines are. */
const PHOSPHOR = '#6dff9c';
const SCANLINES = 0.28;

/**
 * STARFALL, the prototype in the attic: the arcade's COMET DASH under another name, on a monochrome
 * green tube (the colours washed out, every other line dark, a faint bloom), as the factory built it
 * before anyone chose a palette. Its scores are its own (`starfall`), its table the collector's.
 */
export class Starfall implements ArcadeGame {
  readonly id = 'starfall';
  readonly title = 'STARFALL';
  readonly hint: string;
  readonly summary = 'PROTOTYPE · 15 SEC · CHAIN STARS';
  private readonly inner = new Comets();

  constructor() {
    this.hint = this.inner.hint;
  }

  get score(): number {
    return this.inner.score;
  }

  get over(): boolean {
    return this.inner.over;
  }

  reset(run: RunContext): void {
    this.inner.reset(run);
  }

  update(dt: number, controls: ArcadeControls): void {
    this.inner.update(dt, controls);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    this.inner.draw(ctx);
    ctx.save();
    // Every colour to its brightness, then that brightness in the tube's green.
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = PHOSPHOR;
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(0, 0, 0, ${SCANLINES})`;
    for (let y = 0; y < SCREEN_H; y += 2) ctx.fillRect(0, y, SCREEN_W, 1);
    ctx.restore();
  }

  takeSounds(): SfxEvent[] {
    return this.inner.takeSounds();
  }

  autopilot(skill: number): ArcadeControls {
    return this.inner.autopilot(skill);
  }
}
