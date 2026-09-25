import type { SfxEvent } from '@/audio/ChipSpeaker';

/** What the cabinet reads from the player's keys each frame; `firePressed` is true on the frame the button went down. */
export interface ArcadeControls {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  fire: boolean;
  firePressed: boolean;
  /** Where a light gun points on the screen (logical pixels), null when it points off the glass; absent on cabinets without one. */
  aim?: { x: number; y: number } | null;
}

/** What a play starts with: the score to beat and the payout rate, so the game can show both live. */
export interface RunContext {
  best: number;
  pointsPerTicket: number;
  /** Seeds every random draw that shapes the board, so a play replays exactly from its seed and inputs; default a random one. */
  seed?: number;
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
  /** The sounds the game asked for since the last call (the cabinet's speaker plays them). */
  takeSounds(): SfxEvent[];
  /**
   * What a regular's hands would do this frame: the game playing itself, well but not perfectly
   * (`skill` 0..1), for a cabinet someone else is on. Pure: reads the board, never changes it.
   */
  autopilot(skill: number): ArcadeControls;
  /** A light-gun game: the cabinet fills `controls.aim` from where the player looks, and a click on the glass fires. */
  readonly gun?: boolean;
  /**
   * False for a game that cannot play itself (it runs elsewhere, like LexiPunk in its frame): no
   * demo on the attract screen, no replay, no regular takes it. Default true.
   */
  readonly demoable?: boolean;
  /** A two-player game: who holds the second stick ('CPU' when nobody does) and how well they play (0..1). */
  setOpponent?(name: string, skill: number): void;
  /** What the second player's hands are doing this frame (the cabinet's second stick follows it). */
  opponentControls?(): ArcadeControls;
}

/** No keys down. */
export const NO_CONTROLS: Readonly<ArcadeControls> = { left: false, right: false, up: false, down: false, fire: false, firePressed: false };

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
