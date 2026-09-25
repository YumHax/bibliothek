import { type ArcadeControls, NO_CONTROLS, SCREEN_H, SCREEN_W, clamp, drawText } from './ArcadeGame';
import { BaseGame, PLAY_TOP } from './BaseGame';

const ROUND_SECONDS = 20;
const PADDLE_W = 5;
const PADDLE_H = 34;
const PADDLE_X = 14;
const PADDLE_SPEED = 210;
const BALL = 5;
const BALL_SPEED = 170;
const SPEED_PER_SET = 0.12;
/** Each return speeds the ball up a little, to this many times its serve speed. */
const RALLY_SPEEDUP = 1.045;
const MAX_RALLY_SPEED = 1.9;
const RETURN_POINTS = 10;
const GOAL_POINTS = 100;
const GOAL_SECONDS = 3;
const CONCEDE_SECONDS = 2;
/** Goals per set; a new set pays seconds and speeds everything up. */
const GOALS_PER_SET = 3;
const SET_SECONDS = 2;
/** The machine's (or the partner's) paddle: how fast it may move, how late it reacts, how far off it aims. */
const OPPONENT = { speed: 140, speedPerSet: 12, error: 22 };
/** Player two only goes for the ball once it has crossed this far (a fraction of the court), else drifts back to the middle. */
const OPPONENT_REACTS = 0.42;
/** A return with fire held: a smash, faster and worth a little more. */
const SMASH_SPEED = 1.3;
const SMASH_POINTS = 10;
const SERVE_DELAY = 0.8;

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * PADDLE WARS: table tennis on a screen against whoever holds the second stick (the machine, or
 * the kid when they come over; they play the same, only the name on the screen changes, so a run
 * replays exactly). Twenty seconds; every return chains the combo, a goal pays points and three
 * seconds, one conceded costs two and the combo. Every three goals is a set: faster ball, sharper
 * opponent, two more seconds. W / S move; the ball comes back off the paddle at an angle that
 * depends on where it hits (the edges send it steep, which player two struggles to follow), and
 * holding Space as it comes back smashes it.
 */
export class Duel extends BaseGame {
  readonly id = 'duel';
  readonly title = 'PADDLE WARS';
  readonly hint = 'W / S move the paddle · hold Space to smash · beat player two';
  readonly summary = '20 SEC · 2 PLAYERS · RETURNS CHAIN · GOALS +3S';

  private you = 0;
  private them = 0;
  private goals = 0;
  private p1 = SCREEN_H / 2;
  private p2 = SCREEN_H / 2;
  private p2Dir = 0;
  private ball: Ball = { x: SCREEN_W / 2, y: SCREEN_H / 2, vx: 0, vy: 0 };
  private rally = 1;
  private serveIn = 0;
  /** Who serves next: 1 the player, 2 the opponent. */
  private server: 1 | 2 = 1;
  private opponentName = 'CPU';
  private aimError = 0;

  constructor() {
    super(ROUND_SECONDS);
  }

  setOpponent(name: string): void {
    if (name === this.opponentName) return;
    const joining = name !== 'CPU';
    this.opponentName = name;
    this.fx.pop(joining ? `${name} JOINS!` : 'CPU TAKES OVER', SCREEN_W * 0.75, PLAY_TOP + 40, '#63b3ff', 8);
  }

  opponentControls(): ArcadeControls {
    return { ...NO_CONTROLS, up: this.p2Dir < 0, down: this.p2Dir > 0 };
  }

  protected begin(): void {
    this.you = 0;
    this.them = 0;
    this.goals = 0;
    this.p1 = (PLAY_TOP + SCREEN_H) / 2;
    this.p2 = this.p1;
    this.p2Dir = 0;
    this.rally = 1;
    this.server = 1;
    this.aimError = 0;
    this.newServe();
  }

  protected tick(dt: number, controls: ArcadeControls): void {
    const dir = (controls.down ? 1 : 0) - (controls.up ? 1 : 0);
    this.p1 = clamp(this.p1 + dir * PADDLE_SPEED * dt, PLAY_TOP + PADDLE_H / 2, SCREEN_H - PADDLE_H / 2);
    this.moveOpponent(dt);

    if (this.serveIn > 0) {
      this.serveIn -= dt;
      const b = this.ball;
      b.y = this.server === 1 ? this.p1 : this.p2;
      b.x = this.server === 1 ? PADDLE_X + PADDLE_W + BALL : SCREEN_W - PADDLE_X - PADDLE_W - BALL;
      if (this.serveIn <= 0 || (this.server === 1 && controls.firePressed)) this.serve();
      return;
    }

    const b = this.ball;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.y < PLAY_TOP + BALL / 2) {
      b.y = PLAY_TOP + BALL / 2;
      b.vy = Math.abs(b.vy);
      this.sound('blip');
    } else if (b.y > SCREEN_H - BALL / 2) {
      b.y = SCREEN_H - BALL / 2;
      b.vy = -Math.abs(b.vy);
      this.sound('blip');
    }
    // The paddles.
    if (b.vx < 0 && b.x - BALL / 2 <= PADDLE_X + PADDLE_W && b.x > PADDLE_X - 4 && Math.abs(b.y - this.p1) <= PADDLE_H / 2 + BALL / 2) {
      const smash = controls.fire;
      this.bounce(this.p1, 1, smash ? SMASH_SPEED : 1);
      this.bumpCombo(3);
      this.addScore(RETURN_POINTS + (smash ? SMASH_POINTS : 0), PADDLE_X + 20, b.y);
      if (smash) this.fx.pop('SMASH', PADDLE_X + 30, b.y - 14, '#ffe066', 7);
    } else if (b.vx > 0 && b.x + BALL / 2 >= SCREEN_W - PADDLE_X - PADDLE_W && b.x < SCREEN_W - PADDLE_X + 4 && Math.abs(b.y - this.p2) <= PADDLE_H / 2 + BALL / 2) {
      this.bounce(this.p2, -1);
      this.aimError = (this.rand() - 0.5) * 2 * OPPONENT.error;
    }
    // A goal either way.
    if (b.x < -BALL) {
      this.them += 1;
      this.breakCombo();
      this.addTime(-CONCEDE_SECONDS, SCREEN_W / 2, PLAY_TOP + 60);
      this.fx.shake(2, 0.15);
      this.server = 1;
      this.newServe();
    } else if (b.x > SCREEN_W + BALL) {
      this.you += 1;
      this.goals += 1;
      this.addScore(GOAL_POINTS, SCREEN_W - 50, b.y, '#7ee787');
      this.fx.flash('#7ee787', 0.08);
      this.addTime(GOAL_SECONDS, SCREEN_W / 2, PLAY_TOP + 60);
      if (this.goals % GOALS_PER_SET === 0) {
        this.fx.pop(`SET ${this.set}`, SCREEN_W / 2, SCREEN_H / 2 - 24, '#ffffff', 12);
        this.addTime(SET_SECONDS, SCREEN_W / 2, SCREEN_H / 2);
      }
      this.server = 2;
      this.newServe();
    }
  }

  protected paint(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#05080f';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (let y = PLAY_TOP + 4; y < SCREEN_H; y += 12) ctx.fillRect(SCREEN_W / 2 - 1, y, 2, 6);
    drawText(ctx, `${this.you}`, SCREEN_W / 2 - 34, PLAY_TOP + 22, 20, 'rgba(126,231,135,0.8)');
    drawText(ctx, `${this.them}`, SCREEN_W / 2 + 34, PLAY_TOP + 22, 20, 'rgba(99,179,255,0.8)');
    drawText(ctx, 'YOU', PADDLE_X + 18, PLAY_TOP + 8, 7, '#7ee787', 'left');
    drawText(ctx, `P2 ${this.opponentName}`, SCREEN_W - PADDLE_X - 18, PLAY_TOP + 8, 7, '#63b3ff', 'right');
    this.drawStage(ctx, `SET ${this.set}`);
    ctx.fillStyle = '#7ee787';
    ctx.fillRect(PADDLE_X, this.p1 - PADDLE_H / 2, PADDLE_W, PADDLE_H);
    ctx.fillStyle = '#63b3ff';
    ctx.fillRect(SCREEN_W - PADDLE_X - PADDLE_W, this.p2 - PADDLE_H / 2, PADDLE_W, PADDLE_H);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(this.ball.x - BALL / 2, this.ball.y - BALL / 2, BALL, BALL);
    if (this.serveIn > 0 && this.server === 1) drawText(ctx, 'SPACE TO SERVE', SCREEN_W / 2, SCREEN_H - 14, 7, 'rgba(255,255,255,0.6)');
  }

  /** Follows the ball when it comes this way, meeting it off-centre to angle the return (a lesser player a little behind), smashes now and then. */
  autopilot(skill: number): ArcadeControls {
    const b = this.ball;
    const edge = (this.you + this.them) % 2 ? 1 : -1;
    const target = b.vx < 0 || this.serveIn > 0 ? b.y - edge * PADDLE_H * 0.3 * skill + (1 - skill) * 14 * Math.sin(b.x * 0.05) : (PLAY_TOP + SCREEN_H) / 2;
    const diff = target - this.p1;
    const dead = 3 + (1 - skill) * 6;
    const smash = b.vx < 0 && b.x < PADDLE_X + 30 && skill > 0.5 && this.rally < 1.3;
    return { ...NO_CONTROLS, up: diff < -dead, down: diff > dead, fire: this.serveIn > 0 || smash, firePressed: this.serveIn > 0 && Math.random() < 0.1 };
  }

  private get set(): number {
    return Math.floor(this.goals / GOALS_PER_SET) + 1;
  }

  /** Player two: after the ball when it comes their way, at a capped speed, aiming a little off. */
  private moveOpponent(dt: number): void {
    const b = this.ball;
    const coming = (b.vx > 0 && b.x > SCREEN_W * OPPONENT_REACTS) || (this.serveIn > 0 && this.server === 2);
    const target = coming ? b.y + this.aimError : (PLAY_TOP + SCREEN_H) / 2;
    const speed = OPPONENT.speed + OPPONENT.speedPerSet * (this.set - 1);
    const diff = target - this.p2;
    const step = clamp(diff, -speed * dt, speed * dt);
    this.p2Dir = Math.abs(diff) > 2 ? Math.sign(diff) : 0;
    this.p2 = clamp(this.p2 + step, PLAY_TOP + PADDLE_H / 2, SCREEN_H - PADDLE_H / 2);
  }

  /** Off a paddle at `paddleY` towards `dir` (+1 right): the angle from where it hit, a little faster than before (`boost`: a smash). */
  private bounce(paddleY: number, dir: 1 | -1, boost = 1): void {
    const b = this.ball;
    const off = clamp((b.y - paddleY) / (PADDLE_H / 2), -1, 1);
    this.rally = Math.min(MAX_RALLY_SPEED, this.rally * RALLY_SPEEDUP);
    const speed = this.serveSpeed * this.rally * boost;
    const angle = off * 0.9;
    b.vx = Math.cos(angle) * speed * dir;
    b.vy = Math.sin(angle) * speed;
    b.x = dir > 0 ? PADDLE_X + PADDLE_W + BALL / 2 + 0.5 : SCREEN_W - PADDLE_X - PADDLE_W - BALL / 2 - 0.5;
    this.sound('hit', 1 + (this.rally - 1) * 0.6);
  }

  private get serveSpeed(): number {
    return BALL_SPEED * (1 + (this.set - 1) * SPEED_PER_SET);
  }

  private newServe(): void {
    this.serveIn = SERVE_DELAY + (this.server === 1 ? 1.2 : 0);
    this.rally = 1;
    this.ball.vx = 0;
    this.ball.vy = 0;
  }

  private serve(): void {
    this.serveIn = 0;
    const angle = (this.rand() - 0.5) * 0.8;
    const dir = this.server === 1 ? 1 : -1;
    this.ball.vx = Math.cos(angle) * this.serveSpeed * dir;
    this.ball.vy = Math.sin(angle) * this.serveSpeed;
    this.aimError = (this.rand() - 0.5) * 2 * OPPONENT.error;
    this.sound('shoot');
  }
}
