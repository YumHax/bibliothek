import { type ArcadeControls, SCREEN_H, SCREEN_W, clamp } from './ArcadeGame';
import { BaseGame, PLAY_TOP } from './BaseGame';

/** Longer than the other cabinets: a ball at 200 px/s needs about 25 s to take a whole wall down. */
const ROUND_SECONDS = 30;
const WALL_TIME_BONUS = 5;
const WALL_BONUS = 300;
const PADDLE_W = 80;
const MIN_PADDLE_W = 52;
/** The paddle loses this much per wall cleared. */
const PADDLE_SHRINK = 5;
const PADDLE_H = 6;
const PADDLE_Y = SCREEN_H - 14;
const PADDLE_SPEED = 320;
const BALL_R = 3;
const BALL_SPEED = 200;
const COLS = 8;
const ROWS = 4;
const MAX_ROWS = 6;
const BRICK_W = 38;
const BRICK_H = 12;
const BRICK_GAP = 2;
const BRICK_TOP = PLAY_TOP + 16;
const ROW_POINTS = [100, 80, 60, 40, 30, 30];
const ROW_COLORS = ['#ff5f5f', '#ffb347', '#ffe066', '#7ee787', '#63b3ff', '#c98cff'];
const LOST_SECONDS = 2;
const SERVE_DELAY = 0.35;
/** Every this many bricks, one more ball joins from the paddle. */
const BALL_EVERY = 5;
const MAX_BALLS = 4;
/** Balls a cleared wall is served with. */
const WALL_BALLS = 2;
/** Bricks hit this close together keep the chain going. */
const CHAIN_HOLD = 1.2;
/** Clock bricks per wall, and what one puts back on the clock. */
const CLOCK_BRICKS = 3;
const CLOCK_SECONDS = 3;
const CLOCK_COLOR = '#5ff2e8';

interface Brick {
  x: number;
  y: number;
  row: number;
  alive: boolean;
  /** A clock brick pays seconds on top of its points. */
  clock: boolean;
}

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * BRICK STORM: thirty seconds, a wide paddle, a wall of big bricks, and balls that multiply: one
 * to start, one more from the paddle every five bricks (up to four), two served after a cleared
 * wall. Bricks hit in quick succession chain the combo (up to x5). Extra balls are free to lose;
 * only the last one costs two seconds before a new one is served. Clock bricks pay two seconds
 * each; clearing the wall pays a bonus and five more seconds. Every wall is harder: a faster
 * ball, a narrower paddle, more rows, fewer clock bricks. Nothing stops a run but the clock.
 */
export class Breakout extends BaseGame {
  readonly id = 'breakout';
  readonly title = 'BRICK STORM';
  readonly hint = 'A / D or arrows move the paddle · every 5 bricks adds a ball';
  readonly summary = '30 SEC · CLOCK BRICKS +3S · EARN BALLS';

  private paddleX = SCREEN_W / 2;
  private balls: Ball[] = [];
  private serveTimer = 0;
  private wall = 1;
  private bricks: Brick[] = [];
  private destroyed = 0;
  private pendingBalls = 0;

  constructor() {
    super(ROUND_SECONDS);
  }

  protected begin(): void {
    this.paddleX = SCREEN_W / 2;
    this.wall = 1;
    this.balls = [];
    this.serveTimer = 0;
    this.destroyed = 0;
    this.pendingBalls = 0;
    this.buildWall();
  }

  protected tick(dt: number, controls: ArcadeControls): void {
    const dir = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
    const half = this.paddleW / 2;
    this.paddleX = clamp(this.paddleX + dir * PADDLE_SPEED * dt, half, SCREEN_W - half);

    if (!this.balls.length) {
      this.serveTimer -= dt;
      if (this.serveTimer <= 0) this.serve(this.pendingBalls || 1);
      return;
    }

    // Sub-step so a fast ball never tunnels through a brick.
    const speed = this.ballSpeed();
    const steps = Math.max(1, Math.ceil((speed * dt) / BALL_R));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) for (const ball of this.balls) this.stepBall(ball, h);

    // Balls earned during the sub-steps join now, off the paddle.
    while (this.pendingBalls > 0 && this.balls.length < MAX_BALLS) {
      this.pendingBalls -= 1;
      this.balls.push(this.newBall());
      this.fx.pop('+BALL', this.paddleX, PADDLE_Y - 18, '#9ad6ff', 9);
      this.fx.flash('#9ad6ff', 0.06);
    }
    this.pendingBalls = 0;

    const before = this.balls.length;
    this.balls = this.balls.filter((b) => b.y <= SCREEN_H + BALL_R);
    if (before && !this.balls.length) {
      this.breakCombo();
      this.addTime(-LOST_SECONDS, this.paddleX, PADDLE_Y - 20);
      this.fx.shake(3, 0.2);
      this.fx.flash('#ff5f5f', 0.1);
      this.serveTimer = SERVE_DELAY;
    }

    if (this.bricks.every((b) => !b.alive)) {
      this.wall += 1;
      this.bonus(WALL_BONUS, 'WALL CLEAR');
      this.addTime(WALL_TIME_BONUS, SCREEN_W / 2, SCREEN_H / 2 + 24);
      this.buildWall();
      this.balls = [];
      this.pendingBalls = WALL_BALLS;
      this.serveTimer = SERVE_DELAY;
    }
  }

  protected paint(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#0b0818';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    for (const b of this.bricks) {
      if (!b.alive) continue;
      ctx.fillStyle = b.clock ? CLOCK_COLOR : ROW_COLORS[b.row % ROW_COLORS.length]!;
      ctx.fillRect(b.x, b.y, BRICK_W - BRICK_GAP, BRICK_H - BRICK_GAP);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(b.x, b.y, BRICK_W - BRICK_GAP, 2);
      if (b.clock) {
        // A little clock face: a ring with a hand, blinking so it reads as a pickup.
        const cx = b.x + (BRICK_W - BRICK_GAP) / 2;
        const cy = b.y + (BRICK_H - BRICK_GAP) / 2;
        ctx.strokeStyle = Math.floor(this.elapsed * 4) % 2 === 0 ? '#ffffff' : '#0b0818';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx, cy - 2);
        ctx.stroke();
      }
    }
    ctx.fillStyle = '#e8e6ff';
    ctx.fillRect(this.paddleX - this.paddleW / 2, PADDLE_Y - PADDLE_H / 2, this.paddleW, PADDLE_H);
    this.drawStage(ctx, `WALL ${this.wall}`);
    ctx.fillStyle = '#fff2a8';
    for (const ball of this.balls) {
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Under the lowest ball coming down, off by an error that a lesser player carries longer. */
  autopilot(skill: number): ArcadeControls {
    const falling = this.balls.filter((b) => b.vy > 0);
    const ball = (falling.length ? falling : this.balls).reduce<Ball | null>((low, b) => (!low || b.y > low.y ? b : low), null);
    this.pilotTimer -= 1 / 60;
    if (this.pilotTimer <= 0) {
      this.pilotTimer = 0.4 + Math.random() * 0.6;
      this.pilotError = (Math.random() - 0.5) * this.paddleW * (1.4 - skill);
    }
    const target = (ball ? ball.x : SCREEN_W / 2) + this.pilotError;
    const diff = target - this.paddleX;
    return { left: diff < -4, right: diff > 4, up: false, down: false, fire: false, firePressed: false };
  }

  private pilotTimer = 0;
  private pilotError = 0;

  private stepBall(ball: Ball, dt: number): void {
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    if (ball.x < BALL_R) { ball.x = BALL_R; ball.vx = Math.abs(ball.vx); }
    if (ball.x > SCREEN_W - BALL_R) { ball.x = SCREEN_W - BALL_R; ball.vx = -Math.abs(ball.vx); }
    if (ball.y < PLAY_TOP + BALL_R) { ball.y = PLAY_TOP + BALL_R; ball.vy = Math.abs(ball.vy); }

    // Paddle: the further from the centre the ball lands, the flatter it leaves.
    const half = this.paddleW / 2;
    if (ball.vy > 0 && ball.y + BALL_R >= PADDLE_Y - PADDLE_H / 2 && ball.y - BALL_R <= PADDLE_Y + PADDLE_H / 2 && Math.abs(ball.x - this.paddleX) <= half + BALL_R) {
      const offset = (ball.x - this.paddleX) / half;
      const angle = -Math.PI / 2 + offset * 1.1;
      const speed = this.ballSpeed();
      ball.vx = Math.cos(angle) * speed;
      ball.vy = Math.sin(angle) * speed;
      ball.y = PADDLE_Y - PADDLE_H / 2 - BALL_R;
      this.sound('blip');
      return;
    }

    for (const b of this.bricks) {
      if (!b.alive) continue;
      const w = BRICK_W - BRICK_GAP;
      const hgt = BRICK_H - BRICK_GAP;
      if (ball.x + BALL_R < b.x || ball.x - BALL_R > b.x + w || ball.y + BALL_R < b.y || ball.y - BALL_R > b.y + hgt) continue;
      b.alive = false;
      this.addScore(ROW_POINTS[Math.min(b.row, ROW_POINTS.length - 1)] ?? 10, b.x + w / 2, b.y);
      if (b.clock) this.addTime(CLOCK_SECONDS, b.x + w / 2, b.y - 12);
      this.bumpCombo(CHAIN_HOLD);
      this.destroyed += 1;
      if (this.destroyed % BALL_EVERY === 0) this.pendingBalls += 1;
      this.fx.flash(b.clock ? CLOCK_COLOR : ROW_COLORS[b.row % ROW_COLORS.length]!, 0.04);
      const dx = ball.x - (b.x + w / 2);
      const dy = ball.y - (b.y + hgt / 2);
      if (Math.abs(dx) / (w / 2) > Math.abs(dy) / (hgt / 2)) ball.vx = Math.sign(dx || 1) * Math.abs(ball.vx);
      else ball.vy = Math.sign(dy || 1) * Math.abs(ball.vy);
      break;
    }
  }

  /** `count` balls off the paddle, into play at once. */
  private serve(count: number): void {
    this.balls = [];
    for (let i = 0; i < count; i++) this.balls.push(this.newBall());
    this.pendingBalls = 0;
  }

  /** A ball leaving the paddle near enough vertical to come straight back. */
  private newBall(): Ball {
    const speed = this.ballSpeed();
    const angle = -Math.PI / 2 + (this.rand() - 0.5) * 0.7;
    return { x: this.paddleX, y: PADDLE_Y - PADDLE_H / 2 - BALL_R - 1, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
  }

  private get paddleW(): number {
    return Math.max(MIN_PADDLE_W, PADDLE_W - (this.wall - 1) * PADDLE_SHRINK);
  }

  private ballSpeed(): number {
    return BALL_SPEED * (1 + (this.wall - 1) * 0.1);
  }

  /** Wall `n`: a row more every two walls (to six), a clock brick fewer every two walls (to one). */
  private buildWall(): void {
    const left = (SCREEN_W - COLS * BRICK_W) / 2;
    const rows = Math.min(MAX_ROWS, ROWS + Math.floor((this.wall - 1) / 2));
    const clocks = Math.max(1, CLOCK_BRICKS - Math.floor((this.wall - 1) / 2));
    this.bricks = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < COLS; c++) this.bricks.push({ x: left + c * BRICK_W, y: BRICK_TOP + r * BRICK_H, row: r, alive: true, clock: false });
    for (let n = 0; n < clocks; n++) {
      const plain = this.bricks.filter((b) => !b.clock);
      const pick = plain[Math.floor(this.rand() * plain.length)];
      if (pick) pick.clock = true;
    }
  }
}
