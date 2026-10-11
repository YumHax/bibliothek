import { type ArcadeControls, SCREEN_H, SCREEN_W, drawText } from './ArcadeGame';
import { BaseGame, PLAY_TOP } from './BaseGame';
import { random } from '@/random';
import { arcadeHint } from '../arcadeHint';

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
/** Clean landings in a row multiply the rows' points, to this (x5 made a clean tower a jackpot on its own). */
const STACK_COMBO_MAX = 3;
const SETTLE = 0.22;
/** A play's one save: the first block that lands on nothing costs this much and the row is tried again. */
const SAVE_SECONDS = 2;
/** At the minor prize the clock stops for the choice; nobody choosing within this long plays on. */
const CHOICE_SECONDS = 6;
/** The minor prize taken: the play ends here, paid this on top. */
const TAKE_BONUS = MINOR_BONUS;
/** Cells per second on row 1, and the increase per row. */
const BASE_SPEED = 4;
const SPEED_PER_ROW = 0.6;
const ROW_COLORS = ['#63b3ff', '#7ee787', '#ffe066', '#ffb347', '#ff5f5f', '#ff7ad9'];

/** Set bits of a row mask: its cells. */
function bits(mask: number): number {
  let n = 0;
  for (let m = mask; m; m &= m - 1) n += 1;
  return n;
}

/** How wide the sliding block is on a given row (0-based) of a given tower (0-based): each tower after the first narrows sooner. */
function widthFor(row: number, tower = 0): number {
  const shift = Math.min(2, tower);
  return row < 4 - shift ? 3 : row < 10 - shift * 2 ? 2 : 1;
}

/**
 * SKY STACK: the ticket machine of every funfair, played fair. A block slides across; press fire
 * to drop it. Whatever hangs over the row below is cut off; a row landed with nothing under it is
 * a miss: the first of a play only costs two seconds and the row is tried again (the SAVE), the
 * second ends the play. Every row pays more than the last; a clean landing pays extra and chains the
 * combo. Row ten is the minor prize, and the funfair's choice with it: TAKE PRIZE ends the play
 * there with the prize paid, KEEP GOING puts the prize on the jackpot's pile (paid only at the top,
 * lost with a miss on the way) and plays on; the clock stops while the player makes up their mind.
 * The top row is the jackpot, after which the tower starts over, faster and narrowing sooner, the
 * block blinking from the third, keeping the score. A clock runs: every landing puts seconds back
 * (a clean one more, a sloppy one less, the prizes a lot), so waiting for the perfect pass is a
 * choice that costs. Nothing stops a run but the clock, a prize taken or a second miss.
 */
export class Stacker extends BaseGame {
  readonly id = 'stacker';
  readonly title = 'SKY STACK';
  get hint(): string {
    return arcadeHint('{fire} drops the block · at the minor prize, {leftRight} and {fire} to take it or play on');
  }
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
  /** Whether the play's one save is still there. */
  private saveLeft = true;
  /** The minor prize's choice on screen: seconds left, and which side is lit (0 take, 1 keep going). */
  private choice: { left: number; pick: 0 | 1 } | null = null;
  /** The minor prize staked on the jackpot by playing on (0 when none is). */
  private staked = 0;

  constructor() {
    super(START_SECONDS, STACK_COMBO_MAX);
  }

  protected begin(): void {
    this.rows = [];
    this.row = 0;
    this.tower = 0;
    this.lastLanded = null;
    this.settle = 0;
    this.saveLeft = true;
    this.choice = null;
    this.staked = 0;
    this.pilotTurn = -1;
    this.pilotChoiceTurn = -1;
    this.startRow();
  }

  protected tick(dt: number, controls: ArcadeControls): void {
    const left = this.keys.pressed(controls, 'left');
    const right = this.keys.pressed(controls, 'right');
    const fire = this.keys.pressed(controls, 'fire');
    if (this.choice) {
      // The clock holds while the player chooses (BaseGame takes `dt` off after this).
      this.timeLeft += dt;
      this.choice.left -= dt;
      if (left && this.choice.pick !== 0) {
        this.choice.pick = 0;
        this.sound('letter');
      } else if (right && this.choice.pick !== 1) {
        this.choice.pick = 1;
        this.sound('letter');
      }
      if (fire || this.choice.left <= 0) this.choose(fire ? this.choice.pick : 1);
      return;
    }
    if (this.settle > 0) {
      this.settle -= dt;
      if (this.settle <= 0) this.startRow();
      return;
    }
    this.moveTimer -= dt;
    if (this.moveTimer <= 0) {
      this.moveTimer += 1 / this.speed();
      const width = widthFor(this.row, this.tower);
      this.position += this.direction;
      if (this.position <= 0 || this.position + width >= COLS) this.direction *= -1;
      this.sound('ticket', 0.7 + this.row * 0.04);
    }
    if (fire) this.drop();
  }

  /** The minor prize's choice made: take it and stop, or stake it on the jackpot and play on. */
  private choose(pick: 0 | 1): void {
    this.choice = null;
    this.sound('confirm');
    if (pick === 0) {
      this.bonus(TAKE_BONUS, 'PRIZE TAKEN');
      this.end('PRIZE TAKEN');
      return;
    }
    this.staked = TAKE_BONUS;
    this.fx.pop('GOING FOR THE JACKPOT', SCREEN_W / 2, SCREEN_H / 2 - 10, '#ff7ad9', 9);
    this.addTime(MINOR_SECONDS, SCREEN_W / 2, SCREEN_H / 2 + 14);
    this.settle = SETTLE;
  }

  /**
   * Drops on the first square pass, now and then a step late (more often up the tower, where the
   * block is fast and thin: a late drop there is a miss), as a person's thumb is.
   */
  autopilot(skill: number): ArcadeControls {
    const idle = { left: false, right: false, up: false, down: false, fire: false, firePressed: false };
    if (this.choice) {
      // A steady hand plays on, a shaky one takes the prize: lean the stick to the side, then press once it is lit.
      if (this.pilotChoiceTurn !== this.tower) {
        this.pilotChoiceTurn = this.tower;
        this.pilotTakes = random() < 0.85 - skill;
      }
      const want: 0 | 1 = this.pilotTakes ? 0 : 1;
      if (this.choice.left > CHOICE_SECONDS - 0.8) return idle;
      if (this.choice.pick !== want) return { ...idle, left: want === 0 && !this.keys.isHeld('left'), right: want === 1 && !this.keys.isHeld('right') };
      const press = !this.keys.isHeld('fire');
      return { ...idle, fire: press, firePressed: press };
    }
    if (this.settle > 0 || !this.live) return idle;
    const turn = this.tower * ROWS + this.row;
    if (this.pilotTurn !== turn) {
      this.pilotTurn = turn;
      this.pilotLate = this.row > 0 && random() < 0.08 + (1 - skill) * 0.3 + this.row * 0.02 + this.tower * 0.1;
      this.pilotWasSquare = false;
    }
    const width = widthFor(this.row, this.tower);
    const block = this.mask(this.position, width);
    const below = this.row === 0 ? (1 << COLS) - 1 : this.rows[this.row - 1]!;
    // Square: as much of the block over the row below as can be (all of it, or all of a narrower row).
    const square = bits(block & below) >= Math.min(width, bits(below));
    const drop = (this.pilotLate ? this.pilotWasSquare && !square : square) && !this.keys.isHeld('fire');
    this.pilotWasSquare = square;
    return { ...idle, fire: drop, firePressed: drop };
  }

  private pilotChoiceTurn = -1;
  private pilotTakes = false;
  private pilotTurn = -1;
  private pilotLate = false;
  private pilotWasSquare = false;

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
    drawText(ctx, this.saveLeft ? 'SAVE: 1' : 'SAVE: USED', BOARD_X - 8, PLAY_TOP + 24, 6, this.saveLeft ? '#7ee787' : 'rgba(201,196,255,0.4)', 'right');
    if (this.staked) drawText(ctx, `+${this.staked} AT STAKE`, BOARD_X + BOARD_W + 8, this.rowY(ROWS - 1) + CELL / 2 + 11, 6, '#ff7ad9', 'left');

    for (let r = 0; r < this.rows.length; r++) this.paintRow(ctx, r, this.rows[r]!, ROW_COLORS[r % ROW_COLORS.length]!);
    // From the third tower the block blinks out now and then: the eye has to keep the beat.
    const blinkOff = this.tower >= 2 && this.elapsed % 0.7 > 0.56;
    if (this.settle <= 0 && this.live && !this.choice && !blinkOff) this.paintRow(ctx, this.row, this.mask(this.position, widthFor(this.row, this.tower)), '#ffffff');
    if (this.settle > 0 && this.lastLanded) {
      const { row, kept, cut } = this.lastLanded;
      this.paintRow(ctx, row, kept, ROW_COLORS[row % ROW_COLORS.length]!);
      ctx.globalAlpha = Math.max(0, this.settle / SETTLE);
      this.paintRow(ctx, row, cut, '#ff5f5f');
      ctx.globalAlpha = 1;
    }
    if (this.choice) this.paintChoice(ctx, this.choice.pick, this.choice.left);
  }

  /** The funfair's question across the board: two lit buttons, the chosen one blinking, a bar running down. */
  private paintChoice(ctx: CanvasRenderingContext2D, pick: 0 | 1, left: number): void {
    const y = SCREEN_H / 2 - 4;
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(0, y - 34, SCREEN_W, 70);
    drawText(ctx, 'MINOR PRIZE!', SCREEN_W / 2, y - 22, 11, '#ffb347');
    const blink = Math.floor(this.elapsed * 6) % 2 === 0;
    const button = (x: number, label: string, lit: boolean, ink: string): void => {
      ctx.fillStyle = lit ? ink : 'rgba(255,255,255,0.12)';
      ctx.fillRect(x - 64, y - 6, 128, 20);
      drawText(ctx, label, x, y + 4, 8, lit ? (blink ? '#0a0f1e' : '#1e1030') : '#c9c4ff');
    };
    button(SCREEN_W / 2 - 74, `TAKE ${TAKE_BONUS}`, pick === 0, '#ffb347');
    button(SCREEN_W / 2 + 74, 'KEEP GOING', pick === 1, '#ff7ad9');
    ctx.fillStyle = '#ff7ad9';
    ctx.fillRect(SCREEN_W / 2 - 60, y + 24, Math.round(120 * Math.max(0, left / CHOICE_SECONDS)), 2);
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
    const width = widthFor(this.row, this.tower);
    this.direction = this.rand() < 0.5 ? 1 : -1;
    this.position = this.direction > 0 ? 0 : COLS - width;
    this.moveTimer = 1 / this.speed();
  }

  private drop(): void {
    const width = widthFor(this.row, this.tower);
    const block = this.mask(this.position, width);
    const below = this.row === 0 ? (1 << COLS) - 1 : this.rows[this.row - 1]!;
    const kept = block & below;
    const cut = block & ~below;
    const x = BOARD_X + (this.position + width / 2) * CELL;
    const y = this.rowY(this.row);
    this.sound('drop');
    if (!kept) {
      this.lastLanded = { row: this.row, kept: 0, cut: block };
      this.settle = SETTLE; // keeps the missed block on screen (under the end card, or while the row restarts)
      this.fx.flash('#ff5f5f', 0.15);
      if (this.staked) {
        this.fx.pop(`-${this.staked} PRIZE LOST`, SCREEN_W / 2, SCREEN_H / 2 - 30, '#ff8a80', 9);
        this.staked = 0;
      }
      if (this.saveLeft) {
        this.saveLeft = false;
        this.breakCombo();
        this.fx.pop('SAVED! TRY AGAIN', x, y - 14, '#7ee787', 9);
        this.addTime(-SAVE_SECONDS, BOARD_X - 30, y);
        return;
      }
      this.end('GAME OVER');
      return;
    }
    this.rows.push(kept);
    this.lastLanded = { row: this.row, kept, cut };
    this.fx.shake(1, 0.08);
    this.addScore(POINTS_PER_ROW * (this.row + 1), x, y);
    const perfect = !cut && this.row > 0;
    if (cut) {
      this.breakCombo();
      // The overhang breaks off in pieces from each column cut.
      for (let c = 0; c < COLS; c++) if (cut & (1 << c)) this.fx.burst(BOARD_X + (c + 0.5) * CELL, y + CELL / 2, '#ff8a80', 6, 50, 2);
    }
    else if (perfect) {
      this.bumpCombo(Infinity);
      this.fx.pop(`PERFECT +${PERFECT_BONUS}`, x, y - 12, '#7ee787', 9);
      this.addFlat(PERFECT_BONUS);
    }
    this.addTime(ROW_SECONDS + (perfect ? PERFECT_SECONDS : 0) - (cut ? CUT_SECONDS : 0), BOARD_X - 30, y);
    this.row += 1;
    if (this.row === MINOR_ROW) {
      // The funfair's question: the prize now, or on to the top with it at stake.
      this.choice = { left: CHOICE_SECONDS, pick: 1 };
      this.fx.flash('#ffb347', 0.1);
      this.sound('bonus');
      return;
    }
    if (this.row >= ROWS) {
      if (this.staked) this.bonus(this.staked, 'MINOR PRIZE TOO', SCREEN_W / 2, SCREEN_H / 2 + 40);
      this.staked = 0;
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
