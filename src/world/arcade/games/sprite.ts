import { createCanvas } from '@/covers/generated/canvasUtils';

/** Which colour each letter of a sprite's rows paints ('.' and ' ' stay clear). */
export type SpriteInks = Readonly<Record<string, string>>;

/**
 * A pixel-art sprite for the cabinet games, written as rows of letters (one character a pixel, '.'
 * clear), one block of rows per animation frame. Each frame is painted once per set of inks into
 * its own little canvas and then drawn on whole pixels with smoothing off, so the glass shows hard
 * pixels instead of the grey fringes `arc` and fractional rectangles leave under NearestFilter.
 */
export class Sprite {
  readonly width: number;
  readonly height: number;
  private readonly cache = new Map<string, HTMLCanvasElement[]>();

  constructor(private readonly frames: readonly (readonly string[])[]) {
    const first = frames[0] ?? [];
    this.height = first.length;
    this.width = first.reduce((w, row) => Math.max(w, row.length), 0);
  }

  /**
   * Frame `frame` (wrapped) with its top-left at (x, y); `inks` colours the letters. `scale` (whole-pixel size, still
   * without smoothing) draws it larger or smaller: a thing whose hitbox varies in size (a rock) is drawn as big as it hits.
   */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, inks: SpriteInks, frame = 0, scale = 1): void {
    const canvases = this.painted(inks);
    const image = canvases[((frame % canvases.length) + canvases.length) % canvases.length];
    if (!image) return;
    const smoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    if (scale === 1) ctx.drawImage(image, Math.round(x), Math.round(y));
    else ctx.drawImage(image, Math.round(x), Math.round(y), Math.max(1, Math.round(this.width * scale)), Math.max(1, Math.round(this.height * scale)));
    ctx.imageSmoothingEnabled = smoothing;
  }

  /** The same, centred on (x, y). */
  drawCentred(ctx: CanvasRenderingContext2D, x: number, y: number, inks: SpriteInks, frame = 0, scale = 1): void {
    this.draw(ctx, x - (this.width * scale) / 2, y - (this.height * scale) / 2, inks, frame, scale);
  }

  private painted(inks: SpriteInks): HTMLCanvasElement[] {
    const key = Object.entries(inks)
      .map(([k, v]) => `${k}${v}`)
      .join('|');
    let canvases = this.cache.get(key);
    if (canvases) return canvases;
    canvases = this.frames.map((rows) => {
      const [canvas, ctx] = createCanvas(Math.max(1, this.width), Math.max(1, this.height));
      rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          const ink = inks[row[x]!];
          if (!ink) continue;
          ctx.fillStyle = ink;
          ctx.fillRect(x, y, 1, 1);
        }
      });
      return canvas;
    });
    this.cache.set(key, canvases);
    return canvases;
  }
}
