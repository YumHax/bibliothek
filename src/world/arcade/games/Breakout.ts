import { clamp } from '@/math/scalar';
import { type ArcadeControls, SCREEN_H, SCREEN_W, drawText } from './ArcadeGame';
import { BaseGame, PLAY_TOP } from './BaseGame';
import { random } from '@/random';
import { Sprite } from './sprite';
import { arcadeHint } from '../arcadeHint';
import { REPLAY_STEP } from '../replay/Replay';
import { WALL_PATTERNS } from './breakoutWalls';

/** Longer than the other cabinets: a ball at 200 px/s needs about 25 s to take a whole wall down. */
const ROUND_SECONDS = 30;
/** A cleared wall's seconds: the first pays this, each after one less (never under `WALL_TIME_MIN`). */
const WALL_TIME_BONUS = 5;
const WALL_TIME_MIN = 2;
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
/** A two-hit brick pays half as much again when it finally breaks. */
const TOUGH_FACTOR = 1.5;
const TOUGH_COLOR = '#b07aff';
const STEEL_COLOR = '#9aa4b8';
const LOST_SECONDS = 3;
const SERVE_DELAY = 0.8;
/** How far above its place a new wall starts as it drops in (px). */
const DROP_HEIGHT = 70;
/** Every this many bricks, one more ball joins from the paddle. */
const BALL_EVERY = 5;
const MAX_BALLS = 4;
/** Balls a cleared wall is served with, and the spread between two served together (radians). */
const WALL_BALLS = 2;
const SERVE_SPREAD = 0.45;
/** Bricks hit this close together keep the chain going. */
const CHAIN_HOLD = 1.2;
/** Clock bricks per wall, and what one puts back on the clock. */
const CLOCK_BRICKS = 3;
const CLOCK_SECONDS = 3;
const CLOCK_COLOR = '#5ff2e8';
/** A broken brick drops a capsule this often; it falls this fast (px/s). */
const CAPSULE_CHANCE = 0.08;
const CAPSULE_SPEED = 70;
/** What each capsule does and for how long (s). */
const WIDE_EXTRA = 26;
const WIDE_SECONDS = 6;
const PIERCE_SECONDS = 5;
const SLOW_SECONDS = 5;
const SLOW_PACE = 0.75;
/** The ball (round on whole pixels, a highlight) and the clock brick's face; a capsule's shell. */
const BALL = new Sprite([['.xxxx.', 'xxoxxx', 'xoxxxx', 'xxxxxx', 'xxxxxx', '.xxxx.']]);
const CLOCK = new Sprite([['..xxx..', '.x...x.', 'x..x..x', 'x..x..x', 'x...x.x', '.x...x.', '..xxx..']]);
const CAPSULE = new Sprite([['..xxxxxxxxxxxx..', '.xccccccccccccx.', 'xccccccccccccccx', 'xccccccccccccccx', 'xccccccccccccccx', '.xccccccccccccx.', '..xxxxxxxxxxxx..']]);

type CapsuleKind = 'wide' | 'pierce' | 'slow';
const CAPSULES: readonly CapsuleKind[] = ['wide', 'pierce', 'slow'];
const CAPSULE_LOOK: Record<CapsuleKind, { letter: string; color: string; word: string }> = {
  wide: { letter: 'W', color: '#7ee787', word: 'WIDE PADDLE' },
  pierce: { letter: 'P', color: '#ff7ad9', word: 'FIREBALL' },
  slow: { letter: 'S', color: '#63b3ff', word: 'SLOW BALL' },
};

interface Brick {
  x: number;
  y: number;
  row: number;
  alive: boolean;
  /** A clock brick pays seconds on top of its points. */
  clock: boolean;
  /** Hits still needed (2 on a tough brick until it cracks). */
  hits: number;
  tough: boolean;
  /** Steel never breaks and is not needed to clear the wall. */
  steel: boolean;
}

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Capsule {
  x: number;
  y: number;
  kind: CapsuleKind;
}

/**
 * BRICK STORM: thirty seconds, a wide paddle, a wall of big bricks, and balls that multiply: one
 * to start, one more from the paddle every five bricks (up to four), two served after a cleared
 * wall. Bricks hit in quick succession chain the combo (up to x5), as long as no ball is lost:
 * any ball down the bottom breaks it, and the last one costs three seconds before a new one is
 * served. Clock bricks pay three seconds each; clearing the wall pays a bonus and five more seconds.
 * Walls come in shapes (`breakoutWalls`), with tough bricks that take two hits and steel ones that
 * never break; a broken brick now and then drops a capsule to catch: a wider paddle, a fireball
 * that ploughs through bricks, a slower ball. Every wall is harder: a faster ball, a narrower
 * paddle, more rows, fewer clock bricks, more tough and steel. Nothing stops a run but the clock.
 */
export class Breakout extends BaseGame {
  readonly id = 'breakout';
  readonly title = 'BRICK STORM';
  get hint(): string {
    return arcadeHint('{leftRight} or arrows move the paddle · catch the capsules');
  }
  readonly summary = '30 SEC · CLOCK BRICKS +3S · EARN BALLS';

  private paddleX = SCREEN_W / 2;
  private balls: Ball[] = [];
  private serveTimer = 0;
  private wall = 1;
  private bricks: Brick[] = [];
  private destroyed = 0;
  private pendingBalls = 0;
  private capsules: Capsule[] = [];
  private wideTimer = 0;
  private pierceTimer = 0;
  private slowTimer = 0;
  /** Set while a new wall drops into place (drawing only follows `serveTimer`). */
  private dropping = false;

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
    this.capsules = [];
    this.wideTimer = 0;
    this.pierceTimer = 0;
    this.slowTimer = 0;
    this.dropping = false;
    this.buildWall();
  }

  protected tick(dt: number, controls: ArcadeControls): void {
    const dir = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
    const half = this.paddleW / 2;
    this.paddleX = clamp(this.paddleX + dir * PADDLE_SPEED * dt, half, SCREEN_W - half);
    this.wideTimer = Math.max(0, this.wideTimer - dt);
    this.pierceTimer = Math.max(0, this.pierceTimer - dt);
    this.slowTimer = Math.max(0, this.slowTimer - dt);
    this.updateCapsules(dt);

    if (!this.balls.length) {
      this.serveTimer -= dt;
      if (this.serveTimer <= 0) {
        this.dropping = false;
        this.serve(this.pendingBalls || 1);
      }
      return;
    }

    // Sub-step so a fast ball never tunnels through a brick.
    const speed = this.ballSpeed() * this.pace;
    const steps = Math.max(1, Math.ceil((speed * dt) / BALL_R));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) for (const ball of this.balls) this.stepBall(ball, h);

    // Balls earned during the sub-steps join now, off the paddle.
    while (this.pendingBalls > 0 && this.balls.length < MAX_BALLS) {
      this.pendingBalls -= 1;
      this.balls.push(this.newBall(0));
      this.fx.pop('+BALL', this.paddleX, PADDLE_Y - 18, '#9ad6ff', 9);
      this.fx.flash('#9ad6ff', 0.06);
    }
    this.pendingBalls = 0;

    const before = this.balls.length;
    this.balls = this.balls.filter((b) => b.y <= SCREEN_H + BALL_R);
    // Any ball lost breaks the chain; the last one costs seconds too.
    if (this.balls.length < before) this.breakCombo();
    if (before && !this.balls.length) {
      this.addTime(-LOST_SECONDS, this.paddleX, PADDLE_Y - 20);
      this.fx.shake(3, 0.2);
      this.fx.flash('#ff5f5f', 0.1);
      this.serveTimer = SERVE_DELAY;
    }

    if (this.bricks.every((b) => !b.alive || b.steel)) {
      this.wall += 1;
      this.bonus(WALL_BONUS, 'WALL CLEAR');
      this.addTime(Math.max(WALL_TIME_MIN, WALL_TIME_BONUS - (this.wall - 2)), SCREEN_W / 2, SCREEN_H / 2 + 24);
      // The balls in play burst where they are; the next wall drops in while two are readied.
      for (const ball of this.balls) this.fx.burst(ball.x, ball.y, '#fff2a8', 10, 90, 2);
      this.buildWall();
      this.balls = [];
      this.capsules = [];
      this.pendingBalls = WALL_BALLS;
      this.serveTimer = SERVE_DELAY;
      this.dropping = true;
    }
  }

  protected paint(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#0b0818';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    const drop = this.dropping ? Math.round(DROP_HEIGHT * Math.pow(Math.max(0, this.serveTimer) / SERVE_DELAY, 2)) : 0;
    for (const b of this.bricks) {
      if (!b.alive) continue;
      const bx = Math.round(b.x);
      const by = Math.round(b.y) - drop;
      const w = BRICK_W - BRICK_GAP;
      const h = BRICK_H - BRICK_GAP;
      ctx.fillStyle = b.steel ? STEEL_COLOR : b.clock ? CLOCK_COLOR : b.tough ? TOUGH_COLOR : ROW_COLORS[b.row % ROW_COLORS.length]!;
      ctx.fillRect(bx, by, w, h);
      // A bevel: lit top edge, shaded bottom edge.
      ctx.fillStyle = b.steel ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.3)';
      ctx.fillRect(bx, by, w, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(bx, by + h - 2, w, 2);
      if (b.steel) {
        // Rivets at the corners.
        ctx.fillStyle = '#5a6274';
        for (const [rx, ry] of [[2, 3], [w - 4, 3], [2, h - 4], [w - 4, h - 4]] as const) ctx.fillRect(bx + rx, by + ry, 2, 2);
      } else if (b.tough && b.hits === 1) {
        // Cracked: a zigzag across it.
        ctx.fillStyle = '#2a1840';
        for (let i = 0; i < 6; i++) ctx.fillRect(bx + 6 + i * 4, by + 3 + (i % 2) * 3, 4, 1);
      }
      // A little clock face, blinking so it reads as a pickup.
      if (b.clock) CLOCK.drawCentred(ctx, bx + w / 2, by + h / 2, { x: Math.floor(this.elapsed * 4) % 2 === 0 ? '#ffffff' : '#0b0818' });
    }
    for (const c of this.capsules) {
      const look = CAPSULE_LOOK[c.kind];
      CAPSULE.drawCentred(ctx, c.x, c.y, { x: '#ffffff', c: look.color });
      drawText(ctx, look.letter, c.x, c.y + 1, 5, '#0b0818');
    }
    const fire = this.pierceTimer > 0;
    ctx.fillStyle = this.wideTimer > 0 ? '#c8ffd0' : '#e8e6ff';
    const px = Math.round(this.paddleX - this.paddleW / 2);
    ctx.fillRect(px, PADDLE_Y - PADDLE_H / 2, Math.round(this.paddleW), PADDLE_H);
    ctx.fillStyle = '#9a96c0';
    ctx.fillRect(px, PADDLE_Y + PADDLE_H / 2 - 2, Math.round(this.paddleW), 2);
    this.drawStage(ctx, `WALL ${this.wall}`);
    for (const ball of this.balls) BALL.drawCentred(ctx, ball.x, ball.y, fire ? { x: '#ff7a3a', o: '#ffe066' } : this.slowTimer > 0 ? { x: '#9ad6ff', o: '#ffffff' } : { x: '#fff2a8', o: '#ffffff' });
  }

  /**
   * Under the lowest ball coming down, off by an error that a lesser player carries longer; a good
   * hand lands it off-centre to send it at the thickest column, and fetches a capsule when no ball
   * is about to land.
   */
  autopilot(skill: number): ArcadeControls {
    const falling = this.balls.filter((b) => b.vy > 0);
    const ball = (falling.length ? falling : this.balls).reduce<Ball | null>((low, b) => (!low || b.y > low.y ? b : low), null);
    this.pilotTimer -= REPLAY_STEP;
    if (this.pilotTimer <= 0) {
      this.pilotTimer = 0.4 + random() * 0.6;
      this.pilotError = (random() - 0.5) * this.paddleW * (1.4 - skill);
      this.pilotAims = random() < skill;
    }
    let target = ball ? ball.x : SCREEN_W / 2;
    const capsule = this.capsules.reduce<Capsule | null>((low, c) => (!low || c.y > low.y ? c : low), null);
    const landing = ball && ball.vy > 0 && ball.y > PADDLE_Y - 110;
    if (capsule && capsule.y > PADDLE_Y - 80 && !landing) target = capsule.x;
    else if (ball && ball.vy > 0 && this.pilotAims && ball.y > PADDLE_Y - 50) {
      const offset = clamp((this.thickestColumnX() - ball.x) / (SCREEN_W * 0.6), -0.6, 0.6);
      target = ball.x - (offset * this.paddleW) / 2;
    }
    target += this.pilotError * (landing ? 0.5 : 1);
    const diff = target - this.paddleX;
    return { left: diff < -4, right: diff > 4, up: false, down: false, fire: false, firePressed: false };
  }

  private pilotTimer = 0;
  private pilotError = 0;
  private pilotAims = false;

  /** The middle of the column with the most to break (a clock brick counts thrice). */
  private thickestColumnX(): number {
    const left = (SCREEN_W - COLS * BRICK_W) / 2;
    const weight = new Array<number>(COLS).fill(0);
    for (const b of this.bricks) {
      if (!b.alive || b.steel) continue;
      const col = Math.round((b.x - left) / BRICK_W);
      weight[col] = (weight[col] ?? 0) + (b.clock ? 3 : 1);
    }
    let best = 0;
    for (let c = 1; c < COLS; c++) if ((weight[c] ?? 0) > (weight[best] ?? 0)) best = c;
    return left + best * BRICK_W + BRICK_W / 2;
  }

  /** How fast the balls move against their speed: slower under a SLOW capsule. */
  private get pace(): number {
    return this.slowTimer > 0 ? SLOW_PACE : 1;
  }

  private stepBall(ball: Ball, dt: number): void {
    ball.x += ball.vx * dt * this.pace;
    ball.y += ball.vy * dt * this.pace;
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
      const fire = this.pierceTimer > 0 && !b.steel;
      if (b.steel) {
        this.sound('steel');
        this.fx.burst(ball.x, ball.y, '#ffffff', 4, 50, 1);
      } else if (b.hits > 1 && !fire) {
        b.hits -= 1;
        this.sound('hit');
        this.fx.burst(ball.x, ball.y, TOUGH_COLOR, 6, 60, 1);
      } else {
        this.breakBrick(b, w, hgt);
        // A fireball ploughs on through.
        if (fire) break;
      }
      const dx = ball.x - (b.x + w / 2);
      const dy = ball.y - (b.y + hgt / 2);
      if (Math.abs(dx) / (w / 2) > Math.abs(dy) / (hgt / 2)) ball.vx = Math.sign(dx || 1) * Math.abs(ball.vx);
      else ball.vy = Math.sign(dy || 1) * Math.abs(ball.vy);
      break;
    }
  }

  private breakBrick(b: Brick, w: number, hgt: number): void {
    b.alive = false;
    const points = ROW_POINTS[Math.min(b.row, ROW_POINTS.length - 1)] ?? 10;
    this.addScore(b.tough ? Math.round(points * TOUGH_FACTOR) : points, b.x + w / 2, b.y);
    if (b.clock) this.addTime(CLOCK_SECONDS, b.x + w / 2, b.y - 12);
    this.bumpCombo(CHAIN_HOLD);
    this.destroyed += 1;
    if (this.destroyed % BALL_EVERY === 0) this.pendingBalls += 1;
    if (this.rand() < CAPSULE_CHANCE) this.capsules.push({ x: b.x + w / 2, y: b.y + hgt / 2, kind: CAPSULES[Math.floor(this.rand() * CAPSULES.length)]! });
    const brickColor = b.clock ? CLOCK_COLOR : b.tough ? TOUGH_COLOR : ROW_COLORS[b.row % ROW_COLORS.length]!;
    this.fx.flash(brickColor, 0.04);
    this.fx.burst(b.x + w * 0.25, b.y + hgt / 2, brickColor, 9, 80, 2);
    this.fx.burst(b.x + w * 0.75, b.y + hgt / 2, brickColor, 9, 80, 2);
  }

  /** Capsules fall; the paddle catches one by touching it. */
  private updateCapsules(dt: number): void {
    const half = this.paddleW / 2;
    this.capsules = this.capsules.filter((c) => {
      c.y += CAPSULE_SPEED * dt;
      if (c.y >= PADDLE_Y - PADDLE_H && c.y <= PADDLE_Y + PADDLE_H && Math.abs(c.x - this.paddleX) <= half + 8) {
        this.catchCapsule(c);
        return false;
      }
      return c.y < SCREEN_H + 6;
    });
  }

  private catchCapsule(c: Capsule): void {
    if (c.kind === 'wide') this.wideTimer = WIDE_SECONDS;
    else if (c.kind === 'pierce') this.pierceTimer = PIERCE_SECONDS;
    else this.slowTimer = SLOW_SECONDS;
    const look = CAPSULE_LOOK[c.kind];
    this.fx.pop(look.word, c.x, PADDLE_Y - 24, look.color, 9);
    this.fx.flash(look.color, 0.06);
    this.sound('capsule');
  }

  /** `count` balls off the paddle, into play at once, fanned out so they part ways. */
  private serve(count: number): void {
    this.balls = [];
    for (let i = 0; i < count; i++) this.balls.push(this.newBall((i - (count - 1) / 2) * SERVE_SPREAD));
    this.pendingBalls = 0;
  }

  /** A ball leaving the paddle near enough vertical to come straight back, `lean` radians off. */
  private newBall(lean: number): Ball {
    const speed = this.ballSpeed();
    const angle = -Math.PI / 2 + lean + (this.rand() - 0.5) * 0.4;
    return { x: this.paddleX, y: PADDLE_Y - PADDLE_H / 2 - BALL_R - 1, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
  }

  private get paddleW(): number {
    return Math.max(MIN_PADDLE_W, PADDLE_W - (this.wall - 1) * PADDLE_SHRINK) + (this.wideTimer > 0 ? WIDE_EXTRA : 0);
  }

  private ballSpeed(): number {
    return BALL_SPEED * (1 + (this.wall - 1) * 0.1);
  }

  /**
   * Wall `n`: the first a plain block, then a shape drawn from `WALL_PATTERNS`; a row more every two walls (to six),
   * a clock brick fewer every two walls (to one), a tough brick more each wall from the second (to six), steel from
   * the third (to three).
   */
  private buildWall(): void {
    const left = (SCREEN_W - COLS * BRICK_W) / 2;
    const rows = Math.min(MAX_ROWS, ROWS + Math.floor((this.wall - 1) / 2));
    const clocks = Math.max(1, CLOCK_BRICKS - Math.floor((this.wall - 1) / 2));
    const pattern = this.wall === 1 ? WALL_PATTERNS[0]! : WALL_PATTERNS[1 + Math.floor(this.rand() * (WALL_PATTERNS.length - 1))]!;
    this.bricks = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!pattern(r, c, rows, COLS)) continue;
        this.bricks.push({ x: left + c * BRICK_W, y: BRICK_TOP + r * BRICK_H, row: r, alive: true, clock: false, hits: 1, tough: false, steel: false });
      }
    }
    const tough = this.wall >= 2 ? Math.min(6, this.wall) : 0;
    const steel = this.wall >= 3 ? Math.min(3, Math.floor((this.wall - 1) / 2)) : 0;
    this.pick(steel, (b) => { b.steel = true; });
    this.pick(tough, (b) => { b.tough = true; b.hits = 2; });
    this.pick(clocks, (b) => { b.clock = true; });
  }

  /** Marks `count` plain bricks (not yet steel, tough or clock), drawn from the run's seed. */
  private pick(count: number, mark: (b: Brick) => void): void {
    for (let n = 0; n < count; n++) {
      const plain = this.bricks.filter((b) => !b.clock && !b.tough && !b.steel);
      // A wall too thin for more keeps what it has.
      if (plain.length < 4) return;
      const pick = plain[Math.floor(this.rand() * plain.length)];
      if (pick) mark(pick);
    }
  }
}
