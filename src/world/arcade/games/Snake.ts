import { type ArcadeControls, SCREEN_H, SCREEN_W } from './ArcadeGame';
import { BaseGame, PLAY_TOP } from './BaseGame';

const ROUND_SECONDS = 15;
const CELL = 10;
const COLS = Math.floor(SCREEN_W / CELL);
const ROWS = Math.floor((SCREEN_H - PLAY_TOP) / CELL);
const TOP = SCREEN_H - ROWS * CELL;
const START_LENGTH = 4;
/** Cells per second at the start, and what every stage adds. */
const START_SPEED = 9;
const SPEED_PER_STAGE = 1.2;
const MAX_SPEED = 20;
/** Pellets per stage: a stage is faster and pays seconds. */
const PELLETS_PER_STAGE = 6;
const STAGE_SECONDS = 2;
const PELLET_POINTS = 20;
const PELLET_SECONDS = 0.6;
/** Every this many pellets a gold one shows up for a while: points and seconds. */
const GOLD_EVERY = 5;
const GOLD_POINTS = 100;
const GOLD_SECONDS = 3;
const GOLD_LIFE = 4;
/** Pellets eaten this close together keep the chain going. */
const CHAIN_HOLD = 2.2;
const BODY = ['#39ff9e', '#2fe0c0', '#33c0ff', '#7a8cff', '#c98cff'];

type Dir = 'left' | 'right' | 'up' | 'down';
const STEP: Record<Dir, [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
const OPPOSITE: Record<Dir, Dir> = { left: 'right', right: 'left', up: 'down', down: 'up' };

interface Cell {
  x: number;
  y: number;
}

/**
 * NEON SNAKE: fifteen seconds and a snake that grows. Steer onto the pellets; each one pays
 * points and a little time, pellets eaten in quick succession chain the combo, a gold one now
 * and then pays three seconds before it fades. Every six pellets the snake speeds up and the
 * clock gets two seconds. Hitting a wall or yourself ends the play.
 */
export class Snake extends BaseGame {
  readonly id = 'snake';
  readonly title = 'NEON SNAKE';
  readonly hint = 'WASD or arrows steer · eat the pellets, miss the walls';
  readonly summary = '15 SEC · CHAIN PELLETS · GOLD = +3S';

  private body: Cell[] = [];
  private dir: Dir = 'right';
  private queued: Dir[] = [];
  private grow = 0;
  private stepTimer = 0;
  private pellet: Cell = { x: 0, y: 0 };
  private gold: (Cell & { life: number }) | null = null;
  private eaten = 0;

  constructor() {
    super(ROUND_SECONDS);
  }

  protected begin(): void {
    const y = Math.floor(ROWS / 2);
    this.body = [];
    for (let i = 0; i < START_LENGTH; i++) this.body.push({ x: 8 - i, y });
    this.dir = 'right';
    this.queued = [];
    this.grow = 0;
    this.stepTimer = 0;
    this.eaten = 0;
    this.gold = null;
    this.pellet = this.freeCell();
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
    this.stepTimer -= dt;
    while (this.stepTimer <= 0 && this.live) {
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
    const pulse = 2 + Math.sin(this.elapsed * 10);
    ctx.fillStyle = '#ff5fb0';
    ctx.fillRect(this.pellet.x * CELL + 3 - pulse / 2, TOP + this.pellet.y * CELL + 3 - pulse / 2, 4 + pulse, 4 + pulse);
    if (this.gold && (this.gold.life > 1.2 || Math.floor(this.gold.life * 8) % 2 === 0)) {
      ctx.fillStyle = '#ffd23a';
      ctx.fillRect(this.gold.x * CELL + 1, TOP + this.gold.y * CELL + 1, CELL - 2, CELL - 2);
    }
    this.body.forEach((c, i) => {
      ctx.fillStyle = i === 0 ? '#ffffff' : BODY[Math.floor(i / 3) % BODY.length]!;
      ctx.fillRect(c.x * CELL + 1, TOP + c.y * CELL + 1, CELL - 2, CELL - 2);
    });
    this.drawStage(ctx, `STAGE ${this.stage}`);
  }

  /** Shortest safe path to the gold, else the pellet (breadth-first over the board); a lesser player strays. */
  autopilot(skill: number): ArcadeControls {
    const out = { left: false, right: false, up: false, down: false, fire: false, firePressed: false };
    if (!this.live || this.queued.length) return out;
    const head = this.body[0]!;
    const blocked = new Set(this.body.slice(0, -1).map((c) => c.y * COLS + c.x));
    const goal = this.gold && skill > 0.5 ? this.gold : this.pellet;
    const first = this.firstStepTowards(head, goal, blocked);
    let pick: Dir | null = first;
    if (!pick || Math.random() > 0.9 + skill * 0.1) {
      const safe = (['left', 'right', 'up', 'down'] as const).filter((d) => d !== OPPOSITE[this.dir] && this.free(head.x + STEP[d][0], head.y + STEP[d][1], blocked));
      pick = safe.includes(this.dir) && !first ? this.dir : safe[Math.floor(Math.random() * safe.length)] ?? null;
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
      this.fx.flash('#ff5f5f', 0.15);
      this.end('CRASH!');
      return;
    }
    this.body.unshift(cell);
    if (this.grow > 0) this.grow -= 1;
    else this.body.pop();

    const px = cell.x * CELL + CELL / 2;
    const py = TOP + cell.y * CELL;
    if (cell.x === this.pellet.x && cell.y === this.pellet.y) {
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
      this.pellet = this.freeCell();
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
      if (!this.body.some((c) => c.x === cell.x && c.y === cell.y) && !(this.pellet && cell.x === this.pellet.x && cell.y === this.pellet.y)) return cell;
    }
    return { x: 1, y: 1 };
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
