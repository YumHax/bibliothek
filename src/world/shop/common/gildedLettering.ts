/*
 * Gold leaf lettered on a shop's glass: one way to paint it, seen from the pavement (`street/shopfronts`' atlas) and,
 * backwards, from inside the shop (`shop/ShopWindow`).
 */

/** The signwriter's italic serif of the gilt lines. */
const GILT_FONT = 'Georgia, "Times New Roman", serif';

/**
 * `text` centred in the box (x, y, w, h) of `ctx`, as big as fits its height and 94% of its width: gold leaf shaded
 * top to bottom with a dark edge. `mirrored`: as read from the other side of the glass.
 */
export function paintGildedLine(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, h: number, mirrored = false): void {
  let px = Math.round(h * 0.72);
  const min = Math.max(8, Math.round(h * 0.28));
  ctx.font = `italic bold ${px}px ${GILT_FONT}`;
  while (px > min && ctx.measureText(text).width > w * 0.94) {
    px -= 2;
    ctx.font = `italic bold ${px}px ${GILT_FONT}`;
  }
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  if (mirrored) ctx.scale(-1, 1);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, px * 0.11);
  ctx.strokeStyle = '#2a1e0c';
  ctx.strokeText(text, 0, 0);
  const gold = ctx.createLinearGradient(0, -h / 2 + h * 0.16, 0, h / 2 - h * 0.16);
  gold.addColorStop(0, '#fbe7a8');
  gold.addColorStop(0.5, '#d9a94a');
  gold.addColorStop(1, '#a8782a');
  ctx.fillStyle = gold;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}
