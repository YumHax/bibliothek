import { PIXEL_FONT, drawText } from '@/world/arcade/games/ArcadeGame';

/*
 * What the set shows over a program that is not running (docs/media.md "Programs on the screen"): the power-on roll
 * while the cart loads (the emulator's own chunk, the ROM), PAUSED over the frozen frame while the pointer is
 * unlocked (the arcade cabinets' look, `CabinetScreens.drawPaused`), and the cart's "SAVED" mark in the corner after
 * it wrote to its battery. Drawn on the program's own canvas, at its size, in the cabinets' pixel face.
 */

const OSD_GREEN = '#46ff78';
const PAUSE_INK = '#fff2a8';
const PAUSE_NOTE = '#9ad6ff';

/**
 * The set warming up while the cart loads, `t` seconds in: a bright line opening from the middle to the full picture
 * (a tube's warm-up), then the channel OSD and the cart's title with dots walking under it.
 */
export function paintStarting(ctx: CanvasRenderingContext2D, w: number, h: number, title: string, t: number): void {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  const open = Math.min(1, t / 0.45);
  if (open < 1) {
    // The beam: a thin bright band growing to a dim full raster.
    const band = Math.max(2, h * open * open);
    const glow = ctx.createLinearGradient(0, h / 2 - band / 2, 0, h / 2 + band / 2);
    glow.addColorStop(0, 'rgba(200,220,255,0)');
    glow.addColorStop(0.5, `rgba(220,235,255,${0.9 - open * 0.6})`);
    glow.addColorStop(1, 'rgba(200,220,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, h / 2 - band / 2, w, band);
    return;
  }
  // A faint raster with scanlines, the OSD over it.
  ctx.fillStyle = '#0b0f18';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  osd(ctx, 'AV', w - 14, 14, 10, 'right');
  drawText(ctx, title.toUpperCase(), w / 2, h / 2 - 8, 10, '#e8eefc');
  const dots = '.'.repeat(1 + (Math.floor(t * 3) % 3));
  drawText(ctx, `LOADING${dots}`.padEnd(10, ' '), w / 2, h / 2 + 14, 8, OSD_GREEN);
}

/** PAUSED over the frozen frame (already on `ctx`), blinking on `phase`, and how to go on, in words. */
export function paintPaused(ctx: CanvasRenderingContext2D, w: number, h: number, phase: number): void {
  ctx.fillStyle = 'rgba(5,5,10,0.6)';
  ctx.fillRect(0, h / 2 - 24, w, 48);
  if (phase % 2 === 0) drawText(ctx, 'PAUSED', w / 2, h / 2 - 6, 16, PAUSE_INK);
  drawText(ctx, 'CLICK TO PLAY ON', w / 2, h / 2 + 14, 8, PAUSE_NOTE);
}

/** The battery's mark in the top-left corner, faded by `alpha` (0..1): "SAVED" in the tuner's green. */
export function paintSavedMark(ctx: CanvasRenderingContext2D, alpha: number): void {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(6, 6, 58, 16);
  osd(ctx, 'SAVED', 11, 14, 8, 'left');
  ctx.restore();
}

/** On-screen display text: bright green with a hard black drop, like a tuner's. */
function osd(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, align: CanvasTextAlign): void {
  ctx.font = `${size}px ${PIXEL_FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';
  ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = OSD_GREEN;
  ctx.fillText(text, x, y);
}
