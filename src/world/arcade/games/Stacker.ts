import { type ArcadeControls, SCREEN_H, SCREEN_W, drawText } from './ArcadeGame';
import { BaseGame, PLAY_TOP } from './BaseGame';

const START_SECONDS = 12;
/** Seconds a landed row puts back; a clean one adds `PERFECT_SECONDS` more. */
const ROW_SECONDS = 1.5;
const PERFECT_SECONDS = 1;
/** A landing that lost cells pays this much less. */
const CUT_SECONDS = 1;
const MINOR_SECONDS = 5;
const JACKPOT_SECONDS = 10;
const COLS = 7;
const ROWS = 15;
const CELL = 14;
const BOARD_W = COLS * CELL;
const BOARD_X = (SCREEN_W - BOARD_W) / 2;
const BOARD_BOTTOM = SCREEN_H - 8;
const MINOR_ROW = 10;
const MINOR_BONUS = 300;
const JACKPOT_BONUS = 1500;
const POINTS_PER_ROW = 25;
const PERFECT_BONUS = 40;
const SETTLE = 0.22;
/** Cells per second on row 1, and the increase per row. */
const BASE_SPEED = 4.5;
const SPEED_PER_ROW = 0.6;
const ROW_COLORS = ['#63b3ff', '#7ee787', '#ffe066', '#ffb347', '#ff5f5f', '#ff7ad9'];

/** How wide the sliding block is on a given row (0-based). */
function widthFor(row: number): number {
  return row < 4 ? 3 : row < 10 ? 2 : 1;
}

/**
 * SKY STACK: the ticket machine of every funfair, played fair. A block slides across; press fire
 * to drop it. Whatever hangs over the row below is cut off, and a row landed with nothing under
 * it ends the play. Every row pays more than the last; a clean landing pays extra and chains the
 * combo. Row ten is the minor prize, the top row the jackpot, after which the tower starts over,
 * faster, keeping the score. A clock runs: every landing puts seconds back (a clean one more, a
 * sloppy one less, the prizes a lot), so waiting for the perfect pass is a choice that costs. Nothing stops a run but
 * the clock or a miss.
 */
export class Stacker extends BaseGame {
  readonly id = 'stacker';
  readonly title = 'SKY STACK';
  readonly hint = 'Space drops the block · line it up with the row below';
  readonly summary = 'ONE BUTTON · EVERY ROW PAYS TIME · JACKPOT';

  /** Landed rows, as bitmasks of occupied columns; index 0 is the bottom row. */
  private rows: number[] = [];
  private row = 0;
  private tower = 0;
  private position = 0;
  private direction = 1;
  private moveTimer = 0;
  private settle = 0;
  private lastLanded: { row: number; kept: number; cut: number } | null = null;

  constructor() {
    super(START_SECONDS);
  }

  protected begin(): void {
    this.rows = [];
    this.row = 0;
    this.tower = 0;
    this.lastLanded = null;
    this.settle = 0;
    this.startRow();
  }

  protected tick(dt: number, controls: ArcadeControls): void {
    if (this.settle > 0) {
      this.settle -= dt;
      if (this.settle <= 0) this.startRow();
      return;
    }
    this.moveTimer -= dt;
    if (this.moveTimer <= 0) {
      this.moveTimer += 1 / this.speed();
      const width = widthFor(this.row);
      this.position += this.direction;
      if (this.position <= 0 || this.position + width >= COLS) this.direction *= -1;
      this.sound('ticket', 0.7 + this.row * 0.04);
    }
    if (controls.firePressed) this.drop();
  }

  /** Drops when the block sits square on the row below; a lesser player now and then goes a step early or late. */
  autopilot(skill: number): ArcadeControls {
    const idle = { left: false, right: false, up: false, down: false, fire: false, firePressed: false };
    if (this.settle > 0 || !this.live) return idle;
    const width = widthFor(this.row);
    const block = this.mask(this.position, width);
    const below = this.row === 0 ? (1 << COLS) - 1 : this.rows[this.row - 1]!;
    const square = (block & below) === block;
    const overlapping = (block & below) !== 0;
    // Waiting costs seconds: a good player takes the first square pass, a lesser one sometimes a sloppy one.
    const drop = square ? Math.random() < 0.25 + skill * 0.5 : overlapping && Math.random() < (1 - skill) * 0.05;
    return { ...idle, fire: drop, firePressed: drop };
  }

  protected paint(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#0a0f1e';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    // Board frame and the prize lines.
    ctx.fillStyle = '#141a30';
    ctx.fillRect(BOARD_X - 4, BOARD_BOTTOM - ROWS * CELL - 4, BOARD_W + 8, ROWS * CELL + 8);
    for (let r = 0; r < ROWS; r++) {
      const y = this.rowY(r);
      ctx.fillStyle = r === MINOR_ROW - 1 ? '#3a2a10' : r === ROWS - 1 ? '#3a1030' : '#0e1326';
      ctx.fillRect(BOARD_X, y, BOARD_W, CELL - 1);
    }
    drawText(ctx, 'MINOR', BOARD_X + BOARD_W + 8, this.rowY(MINOR_ROW - 1) + CELL / 2, 7, '#ffb347', 'left');
    drawText(ctx, 'JACKPOT', BOARD_X + BOARD_W + 8, this.rowY(ROWS - 1) + CELL / 2, 7, '#ff7ad9', 'left');
    drawText(ctx, `ROW ${this.row + 1}`, BOARD_X - 8, this.rowY(this.row) + CELL / 2, 7, '#c9c4ff', 'right');
    if (this.tower > 0) drawText(ctx, `TOWER ${this.tower + 1}`, BOARD_X - 8, PLAY_TOP + 12, 7, '#ffe066', 'right');

    for (let r = 0; r < this.rows.length; r++) this.paintRow(ctx, r, this.rows[r]!, ROW_COLORS[r % ROW_COLORS.length]!);
    if (this.settle <= 0 && this.live) this.paintRow(ctx, this.row, this.mask(this.position, widthFor(this.row)), '#ffffff');
    if (this.settle > 0 && this.lastLanded) {
      const { row, kept, cut } = this.lastLanded;
      this.paintRow(ctx, row, kept, ROW_COLORS[row % ROW_COLORS.length]!);
      ctx.globalAlpha = Math.max(0, this.settle / SETTLE);
      this.paintRow(ctx, row, cut, '#ff5f5f');
      ctx.globalAlpha = 1;
    }
  }

  private paintRow(ctx: CanvasRenderingContext2D, row: number, mask: number, color: string): void {
    const y = this.rowY(row);
    for (let c = 0; c < COLS; c++) {
      if (!(mask & (1 << c))) continue;
      ctx.fillStyle = color;
      ctx.fillRect(BOARD_X + c * CELL + 1, y + 1, CELL - 3, CELL - 3);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(BOARD_X + c * CELL + 1, y + 1, CELL - 3, 2);
    }
  }

  private rowY(row: number): number {
    return BOARD_BOTTOM - (row + 1) * CELL;
  }

  private mask(position: number, width: number): number {
    let m = 0;
    for (let c = 0; c < width; c++) m |= 1 << (position + c);
    return m;
  }

  private speed(): number {
    return (BASE_SPEED + this.row * SPEED_PER_ROW) * (1 + this.tower * 0.25);
  }

  private startRow(): void {
    const width = widthFor(this.row);
    this.direction = this.rand() < 0.5 ? 1 : -1;
    this.position = this.direction > 0 ? 0 : COLS - width;
    this.moveTimer = 1 / this.speed();
  }

  private drop(): void {
    const width = widthFor(this.row);
    const block = this.mask(this.position, width);
    const below = this.row === 0 ? (1 << COLS) - 1 : this.rows[this.row - 1]!;
    const kept = block & below;
    const cut = block & ~below;
    const x = BOARD_X + (this.position + width / 2) * CELL;
    const y = this.rowY(this.row);
    this.sound('drop');
    if (!kept) {
      this.lastLanded = { row: this.row, kept: 0, cut: block };
      this.settle = SETTLE; // keeps the missed block on screen under the end card
      this.fx.flash('#ff5f5f', 0.15);
      this.end('GAME OVER');
      return;
    }
    this.rows.push(kept);
    this.lastLanded = { row: this.row, kept, cut };
    this.fx.shake(1, 0.08);
    this.addScore(POINTS_PER_ROW * (this.row + 1), x, y);
    const perfect = !cut && this.row > 0;
    if (cut) this.breakCombo();
    else if (perfect) {
      this.bumpCombo(Infinity);
      this.fx.pop(`PERFECT +${PERFECT_BONUS}`, x, y - 12, '#7ee787', 9);
      this.score += PERFECT_BONUS;
    }
    this.addTime(ROW_SECONDS + (perfect ? PERFECT_SECONDS : 0) - (cut ? CUT_SECONDS : 0), BOARD_X - 30, y);
    if (this.row + 1 === MINOR_ROW) {
      this.bonus(MINOR_BONUS, 'MINOR PRIZE');
      this.addTime(MINOR_SECONDS, SCREEN_W / 2, SCREEN_H / 2 + 24);
    }
    this.row += 1;
    if (this.row >= ROWS) {
      this.bonus(JACKPOT_BONUS, 'JACKPOT!');
      this.addTime(JACKPOT_SECONDS, SCREEN_W / 2, SCREEN_H / 2 + 24);
      this.fx.shake(5, 0.5);
      this.rows = [];
      this.row = 0;
      this.tower += 1;
      this.lastLanded = null;
    }
    this.settle = SETTLE;
  }
}
