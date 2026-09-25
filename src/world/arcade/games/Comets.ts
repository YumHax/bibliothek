import { type ArcadeControls, SCREEN_H, SCREEN_W, clamp } from './ArcadeGame';
import { BaseGame, PLAY_TOP } from './BaseGame';

const ROUND_SECONDS = 15;
const SHIP_Y = SCREEN_H - 20;
const SHIP_W = 16;
const SHIP_SPEED = 230;
const STAR_POINTS = 30;
/** Every this many stars caught, a stage: faster rocks, more of them, two seconds. */
const STARS_PER_STAGE = 8;
const STAGE_SECONDS = 2;
const CLOCK_SECONDS = 2;
/** One falling thing in this many is a clock. */
const CLOCK_EVERY = 9;
const HIT_SECONDS = 2;
const INVULNERABLE = 1;
/** Stars caught this close together keep the chain going. */
const CHAIN_HOLD = 2;

type Kind = 'rock' | 'star' | 'clock';

interface Faller {
  kind: Kind;
  x: number;
  y: number;
  r: number;
  vy: number;
  spin: number;
}

/**
 * COMET DASH: fifteen seconds under a meteor shower. Slide the ship left and right: catch the
 * stars (points; caught in quick succession they chain the combo), catch the odd clock (two
 * seconds), dodge the rocks (a hit costs two seconds and the combo, then a moment's shield).
 * Every eight stars is a stage: faster and thicker rocks, two seconds.
 */
export class Comets extends BaseGame {
  readonly id = 'comets';
  readonly title = 'COMET DASH';
  readonly hint = 'A / D or arrows move · catch the stars, dodge the rocks';
  readonly summary = '15 SEC · CHAIN STARS · CLOCKS +2S';

  private shipX = SCREEN_W / 2;
  private fallers: Faller[] = [];
  private spawnTimer = 0;
  private spawned = 0;
  private caught = 0;
  private shield = 0;

  constructor() {
    super(ROUND_SECONDS);
  }

  protected begin(): void {
    this.shipX = SCREEN_W / 2;
    this.fallers = [];
    this.spawnTimer = 0.3;
    this.spawned = 0;
    this.caught = 0;
    this.shield = 0;
  }

  protected tick(dt: number, controls: ArcadeControls): void {
    const dir = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
    this.shipX = clamp(this.shipX + dir * SHIP_SPEED * dt, SHIP_W / 2, SCREEN_W - SHIP_W / 2);
    this.shield = Math.max(0, this.shield - dt);

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = Math.max(0.12, 0.34 - (this.stage - 1) * 0.03) * (0.6 + this.rand() * 0.8);
      this.spawned += 1;
      const kind: Kind = this.spawned % CLOCK_EVERY === 0 ? 'clock' : this.rand() < 0.45 ? 'star' : 'rock';
      const speed = 90 + (this.stage - 1) * 16 + this.rand() * 50;
      this.fallers.push({ kind, x: 10 + this.rand() * (SCREEN_W - 20), y: PLAY_TOP - 10, r: kind === 'rock' ? 7 + this.rand() * 6 : 6, vy: speed, spin: this.rand() * 6 });
    }

    for (const f of this.fallers) {
      f.y += f.vy * dt;
      f.spin += dt * 3;
    }
    this.fallers = this.fallers.filter((f) => {
      if (f.y - f.r > SCREEN_H) return false;
      const touching = Math.abs(f.x - this.shipX) < f.r + SHIP_W / 2 - 2 && Math.abs(f.y - SHIP_Y) < f.r + 5;
      if (!touching) return true;
      if (f.kind === 'rock') {
        if (this.shield > 0) return true;
        this.shield = INVULNERABLE;
        this.breakCombo();
        this.addTime(-HIT_SECONDS, this.shipX, SHIP_Y - 26);
        this.fx.shake(3, 0.25);
        this.fx.flash('#ff5f5f', 0.12);
        return false;
      }
      if (f.kind === 'clock') {
        this.addTime(CLOCK_SECONDS, f.x, f.y - 20);
        this.fx.flash('#5ff2e8', 0.06);
        return false;
      }
      this.caught += 1;
      this.bumpCombo(CHAIN_HOLD);
      this.addScore(STAR_POINTS, f.x, f.y - 10, '#ffe066');
      if (this.caught % STARS_PER_STAGE === 0) {
        this.fx.pop(`STAGE ${this.stage}`, SCREEN_W / 2, SCREEN_H / 2 - 20, '#ffffff', 12);
        this.addTime(STAGE_SECONDS, SCREEN_W / 2, SCREEN_H / 2);
      }
      return false;
    });
  }

  protected paint(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#070512';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    // Streaking background stars.
    ctx.fillStyle = '#2a2a4a';
    for (let i = 0; i < 50; i++) ctx.fillRect((i * 67) % SCREEN_W, (i * 131 + Math.floor(this.elapsed * 120 * (1 + (i % 3)))) % SCREEN_H, 1, 3);
    for (const f of this.fallers) {
      if (f.kind === 'rock') {
        ctx.fillStyle = '#8a6a5a';
        ctx.beginPath();
        for (let k = 0; k < 7; k++) {
          const a = f.spin + (k / 7) * Math.PI * 2;
          const rr = f.r * (0.75 + ((k * 37) % 5) * 0.07);
          if (k === 0) ctx.moveTo(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr);
          else ctx.lineTo(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,140,60,0.35)';
        ctx.fillRect(f.x - 1, f.y - f.r - 10, 2, 10);
      } else if (f.kind === 'star') {
        ctx.fillStyle = '#ffe066';
        ctx.beginPath();
        for (let k = 0; k < 10; k++) {
          const a = f.spin + (k / 10) * Math.PI * 2;
          const rr = k % 2 ? f.r * 0.45 : f.r;
          if (k === 0) ctx.moveTo(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr);
          else ctx.lineTo(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.strokeStyle = '#5ff2e8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.moveTo(f.x, f.y);
        ctx.lineTo(f.x, f.y - f.r + 2);
        ctx.moveTo(f.x, f.y);
        ctx.lineTo(f.x + f.r - 3, f.y);
        ctx.stroke();
      }
    }
    if (this.shield <= 0 || Math.floor(this.shield * 12) % 2 === 0) {
      ctx.fillStyle = '#e8f4ff';
      ctx.beginPath();
      ctx.moveTo(this.shipX, SHIP_Y - 8);
      ctx.lineTo(this.shipX + SHIP_W / 2, SHIP_Y + 5);
      ctx.lineTo(this.shipX - SHIP_W / 2, SHIP_Y + 5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = Math.floor(this.elapsed * 20) % 2 ? '#ff8a3a' : '#ffe066';
      ctx.fillRect(this.shipX - 2, SHIP_Y + 5, 4, 3);
    }
    this.drawStage(ctx, `STAGE ${this.stage}`);
  }

  /** Scores each x along the bottom (stars and clocks pull, rocks near the ship's height push) and heads for the best. */
  autopilot(skill: number): ArcadeControls {
    let bestX = this.shipX;
    let bestValue = -Infinity;
    for (let x = SHIP_W; x <= SCREEN_W - SHIP_W; x += 8) {
      let value = -Math.abs(x - this.shipX) * 0.02;
      for (const f of this.fallers) {
        const dy = SHIP_Y - f.y;
        if (dy < -10) continue;
        const closeness = Math.max(0, 1 - Math.abs(f.x - x) / 24);
        if (f.kind === 'rock') value -= closeness * (dy < 90 ? 6 : 1) * skill;
        else value += closeness * (dy < 150 ? 2 : 0.5) * (f.kind === 'clock' ? 1.5 : 1);
      }
      if (value > bestValue) {
        bestValue = value;
        bestX = x;
      }
    }
    const diff = bestX - this.shipX;
    const dead = 4 + (1 - skill) * 8;
    return { left: diff < -dead, right: diff > dead, up: false, down: false, fire: false, firePressed: false };
  }

  private get stage(): number {
    return Math.floor(this.caught / STARS_PER_STAGE) + 1;
  }
}
