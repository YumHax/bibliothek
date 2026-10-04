import { SCREEN_H, SCREEN_W } from '../arcade/games/ArcadeGame';
import { Comets } from '../arcade/games/Comets';
import { WrappedGame } from '../arcade/games/WrappedGame';

/** The phosphor's green, and how strong the scanlines are. */
const PHOSPHOR = '#6dff9c';
const SCANLINES = 0.28;

/**
 * STARFALL, the prototype in the attic: the arcade's COMET DASH under another name, on a monochrome
 * green tube (the colours washed out, every other line dark, a faint bloom), as the factory built it
 * before anyone chose a palette. Its scores are its own (`starfall`), its table the collector's.
 */
export class Starfall extends WrappedGame {
  readonly id = 'starfall';
  readonly title = 'STARFALL';
  readonly summary = 'PROTOTYPE · 15 SEC · CHAIN STARS';

  constructor() {
    super(new Comets());
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    super.draw(ctx);
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
}
