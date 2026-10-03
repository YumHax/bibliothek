/**
 * An embossing label maker's tape (the DYMO kind): coloured vinyl, the letters pressed up out of it in white, each
 * end cut square. Painted on a canvas: the shelves' atlas (`ShelfLabels`) and the label panel's preview share it.
 */

/** The tapes the label maker takes: their vinyl and the colour the embossed letters whiten to. */
export const TAPES = {
  black: { name: 'Black', vinyl: '#1c1c1f', letters: '#f1f0ea' },
  red: { name: 'Red', vinyl: '#a71f29', letters: '#f6e9e4' },
  blue: { name: 'Blue', vinyl: '#1e4c9f', letters: '#eaf0f8' },
  green: { name: 'Green', vinyl: '#1e6e40', letters: '#e8f3ea' },
  orange: { name: 'Orange', vinyl: '#c8641c', letters: '#fbefe2' },
} as const;

export type TapeColour = keyof typeof TAPES;

export const TAPE_COLOURS = Object.keys(TAPES) as TapeColour[];

/** The tape's real height (m) and the most letters one label holds. */
export const TAPE_HEIGHT = 0.012;
export const MAX_LETTERS = 16;

/** Painted at this many pixels per metre: the tape is `TAPE_PX` tall on the canvas. */
export const TAPE_PX = 40;
export const PX_PER_M = TAPE_PX / TAPE_HEIGHT;
/** Blank tape either side of the letters (px). */
const END_PX = 12;
const FONT = `bold ${Math.round(TAPE_PX * 0.62)}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;
/** The embosser presses one letter at a time: they stand a little apart. */
const SPACING_PX = 2.4;

/** What a label maker prints: capitals only, its own few signs, `MAX_LETTERS` at most. */
export function labelText(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9ÀÂÄÇÉÈÊËÎÏÔÖÙÛÜ&+\-!?'./:#() ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LETTERS);
}

/** How long a label of `text` is on the canvas (px): the letters and the blank ends. */
export function tapeWidthPx(ctx: CanvasRenderingContext2D, text: string): number {
  ctx.font = FONT;
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + SPACING_PX;
  return Math.ceil(w - SPACING_PX + 2 * END_PX);
}

/**
 * Paints a label of `text` on `tape` with its top left at (x, y), `TAPE_PX` tall; returns its width (px). The vinyl
 * has a soft sheen across, each letter a highlight up its top left and a shadow down its bottom right (pressed up
 * out of the tape), the ends cut square with a hair of the backing showing.
 */
export function paintTape(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, tape: TapeColour, maxWidth = Infinity): number {
  const look = TAPES[tape];
  const width = Math.min(maxWidth, tapeWidthPx(ctx, text));
  const h = TAPE_PX;
  ctx.save();
  ctx.clearRect(x, y, width, h);
  // The vinyl, a little narrower than the cell so its edges are cut clean, with a sheen along it.
  ctx.fillStyle = look.vinyl;
  ctx.fillRect(x + 1, y + 2, width - 2, h - 4);
  const sheen = ctx.createLinearGradient(0, y + 2, 0, y + h - 2);
  sheen.addColorStop(0, 'rgba(255,255,255,0.22)');
  sheen.addColorStop(0.35, 'rgba(255,255,255,0.05)');
  sheen.addColorStop(0.7, 'rgba(0,0,0,0.08)');
  sheen.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = sheen;
  ctx.fillRect(x + 1, y + 2, width - 2, h - 4);
  // A thin ridge along both edges, where the tape was pressed flat in the embosser.
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(x + 1, y + 4, width - 2, 1);
  ctx.fillRect(x + 1, y + h - 6, width - 2, 1);
  // The letters, one at a time, pressed up: shadow, highlight, then the whitened plastic.
  ctx.font = FONT;
  ctx.textBaseline = 'middle';
  let cursor = x + END_PX;
  const mid = y + h / 2 + 1;
  for (const ch of text) {
    const w = ctx.measureText(ch).width;
    if (cursor + w > x + width - END_PX + 1) break;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillText(ch, cursor + 1, mid + 1);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(ch, cursor - 0.6, mid - 0.6);
    ctx.fillStyle = look.letters;
    ctx.fillText(ch, cursor, mid);
    cursor += w + SPACING_PX;
  }
  ctx.restore();
  return width;
}
