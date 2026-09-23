/** What the cabinet reads from the player's keys each frame; `firePressed` is true on the frame the button went down. */
export interface ArcadeControls {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  fire: boolean;
  firePressed: boolean;
}

/** What a play starts with: the score to beat and the payout rate, so the game can show both live. */
export interface RunContext {
  best: number;
  pointsPerTicket: number;
}

/** Logical screen of every cabinet game, in pixels (4:3); the cabinet scales it onto the glass. */
export const SCREEN_W = 320;
export const SCREEN_H = 240;

/**
 * A game that runs on an `ArcadeCabinet`: pure simulation + 2D drawing on a canvas, driven by the
 * cabinet every frame. No DOM, no three.js, no input handling of its own. `over` ends the play;
 * the cabinet pays `score` out in tickets. Games extend `BaseGame` for the shared run lifecycle.
 */
export interface ArcadeGame {
  readonly id: string;
  readonly title: string;
  /** One line of controls shown when a play starts, e.g. "A/D move · Space launch". */
  readonly hint: string;
  /** One line for the attract screen: what a play is, e.g. "60 SEC · CHAIN BRICKS". */
  readonly summary: string;
  readonly score: number;
  readonly over: boolean;
  reset(run: RunContext): void;
  update(dt: number, controls: ArcadeControls): void;
  draw(ctx: CanvasRenderingContext2D): void;
}

export const PIXEL_FONT = '"Press Start 2P", "Courier New", monospace';

/** Centred pixel-style text helper shared by the games and the cabinet's attract screen. */
export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center'): void {
  ctx.font = `bold ${size}px ${PIXEL_FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
