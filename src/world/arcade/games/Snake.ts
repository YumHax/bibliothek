import { type ArcadeControls, SCREEN_H, SCREEN_W } from './ArcadeGame';
import { BaseGame, PLAY_TOP } from './BaseGame';
import { random } from '@/random';
import { arcadeHint } from '../arcadeHint';

const ROUND_SECONDS = 15;
const CELL = 10;
const COLS = Math.floor(SCREEN_W / CELL);
const ROWS = Math.floor((SCREEN_H - PLAY_TOP) / CELL);
const TOP = SCREEN_H - ROWS * CELL;
const START_LENGTH = 4;
/** Cells per second at the start, and what every stage adds. */
const START_SPEED = 7.5;
const SPEED_PER_STAGE = 0.9;
const MAX_SPEED = 17;
/** Pellets on the board at once: the next one is never across the whole board. */
const PELLETS = 2;
/** A crash: the seconds it costs, and how long the snake blinks before it sets off again, short. */
const CRASH_SECONDS = 2;
const CRASH_PAUSE = 0.7;
/** Pellets per stage: a stage is faster and pays seconds. */
const PELLETS_PER_STAGE = 6;
const STAGE_SECONDS = 2;
const PELLET_POINTS = 20;
const PELLET_SECONDS = 0.4;
/** Every this many pellets a gold one shows up for a while: points and seconds. */
const GOLD_EVERY = 5;
const GOLD_POINTS = 100;
const GOLD_SECONDS = 2;
const GOLD_LIFE = 4;
/** Pellets eaten this close together keep the chain going. */
const CHAIN_HOLD = 2.5;
/** The chain's top multiplier: a long snake already scores fast, x5 on top made the best runs pay six times an ordinary one. */
const SNAKE_COMBO_MAX = 4;
const BODY = ['#39ff9e', '#2fe0c0', '#33c0ff', '#7a8cff', '#c98cff'];

type Dir = 'left' | 'right' | 'up' | 'down';
const STEP: Record<Dir, [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
const OPPOSITE: Record<Dir, Dir> = { left: 'right', right: 'left', up: 'down', down: 'up' };

interface Cell {
  x: number;
  y: number;
}

/**
 * NEON SNAKE: fifteen seconds and a snake that grows. Steer onto the pellets (two on the board at
 * once); each one pays points and a little time, pellets eaten in quick succession chain the
 * combo, a gold one now and then pays two seconds before it fades. Every six pellets the snake
 * speeds up and the clock gets two seconds. Hitting a wall or yourself costs two seconds and the
 * combo, and the snake starts again short from the middle: only the clock ends the play.
 */
export class Snake extends BaseGame {
  readonly id = 'snake';
  readonly title = 'NEON SNAKE';
  get hint(): string {
    return arcadeHint('{stick} or arrows steer · eat the pellets, miss the walls');
  }
  readonly summary = '15 SEC · CHAIN PELLETS · CRASH = -2S';

  private body: Cell[] = [];
  private dir: Dir = 'right';
  private queued: Dir[] = [];
  private grow = 0;
  private stepTimer = 0;
  private pellets: Cell[] = [];
  /** Seconds the snake still blinks after a crash before it moves again. */
  private crashed = 0;
  private gold: (Cell & { life: number }) | null = null;
  private eaten = 0;

  constructor() {
    super(ROUND_SECONDS, SNAKE_COMBO_MAX);
  }

  protected begin(): void {
    this.eaten = 0;
    this.gold = null;
    this.crashed = 0;
    this.pellets = [];
    this.startSnake();
    while (this.pellets.length < PELLETS) this.pellets.push(this.freeCell());
  }

  /** A short snake in the middle row, heading right from the left third (the start, and after a crash). */
  private startSnake(): void {
    const y = Math.floor(ROWS / 2);
    this.body = [];
    for (let i = 0; i < START_LENGTH; i++) this.body.push({ x: 8 - i, y });
    this.dir = 'right';
    this.queued = [];
    this.grow = 0;
    this.stepTimer = 0;
  }

  protected tick(dt: number, controls: ArcadeControls): void {
    // Turns are queued on the press, so two quick taps between steps both count.
    for (const d of ['left', 'right', 'up', 'down'] as const) {
      if (this.keys.pressed(controls, d)) {
        const last = this.queued[this.queued.length - 1] ?? this.dir;
        if (d !== last && d !== OPPOSITE[last] && this.queued.length < 2) this.queued.push(d);
      }
    }
    if (this.gold) {
      this.gold.life -= dt;
      if (this.gold.life <= 0) this.gold = null;
    }
    if (this.crashed > 0) {
      this.crashed -= dt;
      if (this.crashed <= 0) {
        this.startSnake();
        // Nothing to eat under the new body: a pellet there moves.
        const under = (c: Cell): boolean => this.body.some((b) => b.x === c.x && b.y === c.y);
        this.pellets = this.pellets.map((p) => (under(p) ? this.freeCell() : p));
        if (this.gold && under(this.gold)) this.gold = { ...this.freeCell(), life: this.gold.life };
      }
      return;
    }
    this.stepTimer -= dt;
    while (this.stepTimer <= 0 && this.live && this.crashed <= 0) {
      this.stepTimer += 1 / this.speed;
      this.step();
    }
  }

  protected paint(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#060a12';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    ctx.fillStyle = 'rgba(80,255,190,0.05)';
    for (let x = 0; x < COLS; x++) for (let y = 0; y < ROWS; y++) if ((x + y) % 2 === 0) ctx.fillRect(x * CELL, TOP + y * CELL, CELL, CELL);
    ctx.strokeStyle = '#1f6f5a';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, TOP + 1, COLS * CELL - 2, ROWS * CELL - 2);
    // The pellet pulses; the gold one blinks as it runs out.
    const pulse = Math.round(2 + Math.sin(this.elapsed * 10)); // whole pixels: 1, 2 or 3
    ctx.fillStyle = '#ff5fb0';
    for (const p of this.pellets) ctx.fillRect(p.x * CELL + 3 - pulse / 2, TOP + p.y * CELL + 3 - pulse / 2, 4 + pulse, 4 + pulse);
    if (this.gold && (this.gold.life > 1.2 || Math.floor(this.gold.life * 8) % 2 === 0)) {
      ctx.fillStyle = '#ffd23a';
      ctx.fillRect(this.gold.x * CELL + 1, TOP + this.gold.y * CELL + 1, CELL - 2, CELL - 2);
    }
    const blink = this.crashed > 0 && Math.floor(this.crashed * 10) % 2 === 0;
    if (!blink) this.body.forEach((c, i) => {
      ctx.fillStyle = this.crashed > 0 ? '#ff5f5f' : i === 0 ? '#ffffff' : BODY[Math.floor(i / 3) % BODY.length]!;
      ctx.fillRect(c.x * CELL + 1, TOP + c.y * CELL + 1, CELL - 2, CELL - 2);
    });
    this.drawStage(ctx, `STAGE ${this.stage}`);
  }

  /** Shortest safe path to the gold, else the pellet (breadth-first over the board); a lesser player strays. */
  autopilot(skill: number): ArcadeControls {
    const out = { left: false, right: false, up: false, down: false, fire: false, firePressed: false };
    if (!this.live || this.queued.length || this.crashed > 0) return out;
    const head = this.body[0]!;
    const blocked = new Set(this.body.slice(0, -1).map((c) => c.y * COLS + c.x));
    const goal = this.gold && skill > 0.5 ? this.gold : this.nearestPellet(head);
    const first = this.firstStepTowards(head, goal, blocked);
    let pick: Dir | null = first;
    if (!pick || random() > 0.9 + skill * 0.1) {
      const safe = (['left', 'right', 'up', 'down'] as const).filter((d) => d !== OPPOSITE[this.dir] && this.free(head.x + STEP[d][0], head.y + STEP[d][1], blocked));
      pick = safe.includes(this.dir) && !first ? this.dir : safe[Math.floor(random() * safe.length)] ?? null;
    }
    if (pick && pick !== this.dir && !this.keys.isHeld(pick)) out[pick] = true;
    return out;
  }

  private get stage(): number {
    return Math.floor(this.eaten / PELLETS_PER_STAGE) + 1;
  }

  private get speed(): number {
    return Math.min(MAX_SPEED, START_SPEED + (this.stage - 1) * SPEED_PER_STAGE);
  }

  private step(): void {
    const next = this.queued.shift();
    if (next) this.dir = next;
    const head = this.body[0]!;
    const [dx, dy] = STEP[this.dir];
    const cell = { x: head.x + dx, y: head.y + dy };
    const tailMoves = this.grow === 0;
    const hitsSelf = this.body.some((c, i) => c.x === cell.x && c.y === cell.y && !(tailMoves && i === this.body.length - 1));
    if (cell.x < 0 || cell.y < 0 || cell.x >= COLS || cell.y >= ROWS || hitsSelf) {
      this.crash();
      return;
    }
    this.body.unshift(cell);
    if (this.grow > 0) this.grow -= 1;
    else this.body.pop();

    const px = cell.x * CELL + CELL / 2;
    const py = TOP + cell.y * CELL;
    const eatenAt = this.pellets.findIndex((p) => p.x === cell.x && p.y === cell.y);
    if (eatenAt >= 0) {
      this.grow += 2;
      this.eaten += 1;
      this.bumpCombo(CHAIN_HOLD);
      this.addScore(PELLET_POINTS, px, py);
      this.sound('eat', 1 + this.combo * 0.08);
      this.timeLeft += PELLET_SECONDS;
      if (this.eaten % PELLETS_PER_STAGE === 0) {
        this.fx.pop(`STAGE ${this.stage}`, SCREEN_W / 2, SCREEN_H / 2 - 20, '#ffffff', 12);
        this.addTime(STAGE_SECONDS, SCREEN_W / 2, SCREEN_H / 2);
      }
      if (this.eaten % GOLD_EVERY === 0 && !this.gold) this.gold = { ...this.freeCell(), life: GOLD_LIFE };
      this.pellets.splice(eatenAt, 1);
      this.pellets.push(this.freeCell());
    } else if (this.gold && cell.x === this.gold.x && cell.y === this.gold.y) {
      this.gold = null;
      this.grow += 1;
      this.bumpCombo(CHAIN_HOLD);
      this.addScore(GOLD_POINTS, px, py, '#ffd23a');
      this.addTime(GOLD_SECONDS, px, py - 14);
      this.fx.flash('#ffd23a', 0.08);
    }
  }

  private freeCell(): Cell {
    for (let tries = 0; tries < 200; tries++) {
      const cell = { x: 1 + Math.floor(this.rand() * (COLS - 2)), y: 1 + Math.floor(this.rand() * (ROWS - 2)) };
      if (!this.body.some((c) => c.x === cell.x && c.y === cell.y) && !this.pellets.some((p) => p.x === cell.x && p.y === cell.y)) return cell;
    }
    return { x: 1, y: 1 };
  }

  /** A wall or the tail: seconds and the combo go, and the snake starts again short once it has blinked. */
  private crash(): void {
    this.crashed = CRASH_PAUSE;
    this.breakCombo();
    this.fx.flash('#ff5f5f', 0.15);
    this.fx.shake(3, 0.2);
    this.fx.pop('CRASH!', SCREEN_W / 2, SCREEN_H / 2 - 20, '#ff5f5f', 12);
    this.addTime(-CRASH_SECONDS, SCREEN_W / 2, SCREEN_H / 2);
  }

  private nearestPellet(from: Cell): Cell {
    let best = this.pellets[0]!;
    for (const p of this.pellets) if (Math.abs(p.x - from.x) + Math.abs(p.y - from.y) < Math.abs(best.x - from.x) + Math.abs(best.y - from.y)) best = p;
    return best;
  }

  private free(x: number, y: number, blocked: Set<number>): boolean {
    return x >= 0 && y >= 0 && x < COLS && y < ROWS && !blocked.has(y * COLS + x);
  }

  private firstStepTowards(from: Cell, goal: Cell, blocked: Set<number>): Dir | null {
    const start = from.y * COLS + from.x;
    const firstOf = new Map<number, Dir>();
    const queue: number[] = [];
    for (const d of ['left', 'right', 'up', 'down'] as const) {
      if (d === OPPOSITE[this.dir]) continue;
      const x = from.x + STEP[d][0];
      const y = from.y + STEP[d][1];
      if (!this.free(x, y, blocked)) continue;
      const k = y * COLS + x;
      firstOf.set(k, d);
      queue.push(k);
    }
    firstOf.set(start, this.dir);
    for (let i = 0; i < queue.length; i++) {
      const k = queue[i]!;
      const x = k % COLS;
      const y = Math.floor(k / COLS);
      if (x === goal.x && y === goal.y) return firstOf.get(k)!;
      for (const d of ['left', 'right', 'up', 'down'] as const) {
        const nx = x + STEP[d][0];
        const ny = y + STEP[d][1];
        const nk = ny * COLS + nx;
        if (!this.free(nx, ny, blocked) || firstOf.has(nk)) continue;
        firstOf.set(nk, firstOf.get(k)!);
        queue.push(nk);
      }
    }
    return null;
  }
}
