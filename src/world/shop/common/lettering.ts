import { FONT, fitFontSize } from '@/covers/generated/canvasUtils';

/*
 * The hands the shops' signs are written in, and a helper that sets lines of text in a box on a canvas. Shared by the
 * name boards, notices, cork-board cards and chalkboards of `common/`, and by each shop's own props.
 */

/** A felt-tip or biro hand (the price tags' too). */
export const HAND = `"Segoe Print", "Bradley Hand", "Chalkboard SE", "Comic Sans MS", ${FONT}`;
/** Chalk on a slate. */
export const CHALK = `"Chalkboard SE", "Segoe Print", "Bradley Hand", "Comic Sans MS", ${FONT}`;
/** A signwriter's painted serif (name boards, enamel plates). */
export const SIGNWRITER = `Georgia, "Times New Roman", serif`;
/** A printed notice's plain type. */
export const PRINT = FONT;
/** A poster's bold condensed headline. */
export const POSTER = `Impact, "Arial Narrow Bold", "Arial Narrow", ${FONT}`;

export interface TextBlock {
  /** The lines, top first; the first may be set bigger (`firstScale`). */
  lines: readonly string[];
  x: number;
  y: number;
  w: number;
  h: number;
  family: string;
  color: string;
  weight?: string;
  /** The first line's size over the others'. Default 1.5 (1 for all alike). */
  firstScale?: number;
  align?: CanvasTextAlign;
  /** Per-line tilt in radians and a sideways wobble (a hand is never straight), from `random`. */
  wobble?: number;
  random?: () => number;
}

/** Sets `lines` in the box, each as big as fits (the first `firstScale` bigger), spread evenly down it. */
export function setLines(ctx: CanvasRenderingContext2D, block: TextBlock): void {
  const { lines, x, y, w, h, family, color } = block;
  if (!lines.length) return;
  const first = lines.length > 1 ? (block.firstScale ?? 1.5) : 1;
  const weight = block.weight ?? '600';
  const units = first + (lines.length - 1);
  const unit = h / units;
  const random = block.random ?? Math.random;
  const align = block.align ?? 'center';
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  let top = y;
  lines.forEach((line, i) => {
    const lineH = i === 0 ? unit * first : unit;
    const size = fitFontSize(ctx, line, w, lineH * 0.78, Math.max(6, lineH * 0.25), family, weight);
    ctx.font = `${weight} ${size}px ${family}`;
    const ax = align === 'center' ? x + w / 2 : align === 'right' || align === 'end' ? x + w : x;
    const tilt = block.wobble ? (random() - 0.5) * block.wobble : 0;
    ctx.save();
    ctx.translate(ax + (block.wobble ? (random() - 0.5) * w * 0.03 : 0), top + lineH / 2);
    ctx.rotate(tilt);
    ctx.fillText(line, 0, 0);
    ctx.restore();
    top += lineH;
  });
}

/** `#rrggbb` of a colour number. */
export function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
