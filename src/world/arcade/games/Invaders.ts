import { type ArcadeControls, SCREEN_H, SCREEN_W, clamp } from './ArcadeGame';
import { BaseGame, PLAY_TOP } from './BaseGame';

const ROUND_SECONDS = 15;
const WAVE_TIME_BONUS = 5;
const WAVE_BONUS = 200;
const COLS = 8;
const ROWS = 4;
const MAX_ROWS = 5;
const ALIEN_W = 16;
const ALIEN_H = 10;
const ALIEN_GAP_X = 10;
const ALIEN_GAP_Y = 8;
const SHIP_W = 18;
const SHIP_H = 8;
const SHIP_Y = SCREEN_H - 16;
const SHIP_SPEED = 220;
const SHOT_SPEED = 340;
const FIRE_INTERVAL = 0.14;
const MAX_SHOTS = 4;
const ROW_POINTS = [25, 20, 15, 10, 5];
const ROW_COLORS = ['#ff5f5f', '#ff7ad9', '#ffb347', '#7ee787', '#63b3ff'];
const DIVER_POINTS = 100;
const DIVE_SPEED = 140;
const DIVE_EVERY = 1.8;
/** A diver that gets past the ship costs this. */
const ESCAPE_SECONDS = 1;
const SAUCER_POINTS = 100;
const SAUCER_SECONDS = 3;
const SAUCER_SPEED = 110;
const SAUCER_EVERY = 6;
/** Kills this close together keep the chain going. */
const CHAIN_HOLD = 0.5;

interface Alien {
  col: number;
  row: number;
  alive: boolean;
  /** Set while the alien leaves formation to dive past the ship. */
  dive: { x: number; y: number; t: number } | null;
}

interface Shot {
  x: number;
  y: number;
}

/**
 * STAR RAID: a fifteen-second shooting gallery. Hold fire for a stream of shots (four in the air),
 * mow down the marching fleet; kills in quick succession chain the combo. Aliens peel off and dive
 * for a fat bonus and cost a second if they get past; the saucer crossing the top every six
 * seconds is the clock: shooting it pays three seconds. Nothing shoots back: a cleared wave pays a bonus and five more seconds. Every
 * wave is harder: the fleet marches faster and gains a row, divers come quicker, the saucer flies
 * faster and rarer. Nothing stops a run but the clock.
 */
export class Invaders extends BaseGame {
  readonly id = 'invaders';
  readonly title = 'STAR RAID';
  readonly hint = 'A / D or arrows move the ship · hold Space to fire';
  readonly summary = '15 SEC · CHAIN KILLS · SAUCER = +3S';

  private shipX = SCREEN_W / 2;
  private wave = 1;
  private aliens: Alien[] = [];
  private fleetX = 0;
  private fleetY = 0;
  private direction = 1;
  private stepTimer = 0;
  private fireTimer = 0;
  private shots: Shot[] = [];
  private diveTimer = 0;
  private saucer: Shot | null = null;
  private saucerTimer = 0;

  constructor() {
    super(ROUND_SECONDS);
  }

  protected begin(): void {
    this.shipX = SCREEN_W / 2;
    this.wave = 1;
    this.fireTimer = 0;
    this.shots = [];
    this.saucer = null;
    this.saucerTimer = 2.5;
    this.spawnWave();
  }

  protected tick(dt: number, controls: ArcadeControls): void {
    const dir = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
    this.shipX = clamp(this.shipX + dir * SHIP_SPEED * dt, SHIP_W / 2, SCREEN_W - SHIP_W / 2);

    this.fireTimer -= dt;
    if (controls.fire && this.fireTimer <= 0 && this.shots.length < MAX_SHOTS) {
      this.fireTimer = FIRE_INTERVAL;
      this.shots.push({ x: this.shipX, y: SHIP_Y - SHIP_H });
      this.sound('shoot');
    }

    const alive = this.aliens.filter((a) => a.alive);
    this.marchFleet(dt, alive);
    this.updateDivers(dt, alive);
    this.updateSaucer(dt);
    this.updateShots(dt, alive);

    if (!alive.length) {
      this.wave += 1;
      this.bonus(WAVE_BONUS, 'WAVE CLEAR');
      this.addTime(WAVE_TIME_BONUS, SCREEN_W / 2, SCREEN_H / 2 + 24);
      this.spawnWave();
    }
  }

  protected paint(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#050812';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    ctx.fillStyle = '#334';
    for (let i = 0; i < 40; i++) ctx.fillRect((i * 53) % SCREEN_W, (i * 97 + Math.floor(this.elapsed * 30)) % SCREEN_H, 1, 1);

    for (const a of this.aliens) {
      if (!a.alive) continue;
      const { x, y } = this.alienPos(a);
      ctx.fillStyle = a.dive ? '#ffffff' : ROW_COLORS[a.row % ROW_COLORS.length]!;
      ctx.fillRect(x + 2, y, ALIEN_W - 4, ALIEN_H - 3);
      ctx.fillRect(x, y + 3, ALIEN_W, ALIEN_H - 6);
      ctx.fillStyle = '#050812';
      ctx.fillRect(x + 4, y + 3, 2, 2);
      ctx.fillRect(x + ALIEN_W - 6, y + 3, 2, 2);
    }
    if (this.saucer) {
      ctx.fillStyle = '#ff5f5f';
      ctx.fillRect(this.saucer.x - 10, this.saucer.y - 2, 20, 4);
      ctx.fillRect(this.saucer.x - 5, this.saucer.y - 5, 10, 3);
    }
    ctx.fillStyle = '#e8ffe6';
    ctx.fillRect(this.shipX - SHIP_W / 2, SHIP_Y - SHIP_H / 2 + 3, SHIP_W, SHIP_H - 3);
    ctx.fillRect(this.shipX - 2, SHIP_Y - SHIP_H / 2, 4, 4);
    ctx.fillStyle = '#fff2a8';
    for (const s of this.shots) ctx.fillRect(s.x - 1, s.y, 2, 6);
    this.drawStage(ctx, `WAVE ${this.wave}`);
  }

  /** Fire held; under a diver first, then the saucer, else the nearest column of the fleet. */
  autopilot(skill: number): ArcadeControls {
    const alive = this.aliens.filter((a) => a.alive);
    const divers = alive.filter((a) => a.dive).sort((a, b) => b.dive!.y - a.dive!.y);
    let target: number;
    if (divers[0] && Math.random() < skill + 0.2) target = this.alienPos(divers[0]).x + ALIEN_W / 2;
    else if (this.saucer && this.saucer.x > 0 && skill > 0.5) target = this.saucer.x + 30;
    else {
      const nearest = alive.reduce<Alien | null>((best, a) => {
        const d = Math.abs(this.alienPos(a).x + ALIEN_W / 2 - this.shipX);
        return !best || d < Math.abs(this.alienPos(best).x + ALIEN_W / 2 - this.shipX) ? a : best;
      }, null);
      target = nearest ? this.alienPos(nearest).x + ALIEN_W / 2 : SCREEN_W / 2;
    }
    const diff = target - this.shipX;
    const dead = 3 + (1 - skill) * 10;
    return { left: diff < -dead, right: diff > dead, up: false, down: false, fire: Math.random() < 0.6 + skill * 0.4, firePressed: false };
  }

  private marchFleet(dt: number, alive: Alien[]): void {
    const formation = alive.filter((a) => !a.dive);
    const interval = Math.max(0.05, 0.35 * Math.pow(0.85, this.wave - 1) * (formation.length / (COLS * MAX_ROWS)) + 0.04);
    this.stepTimer += dt;
    if (this.stepTimer < interval || !formation.length) return;
    this.stepTimer = 0;
    let minX = Infinity;
    let maxX = -Infinity;
    for (const a of formation) {
      const { x } = this.alienPos(a);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x + ALIEN_W);
    }
    const stepX = 6;
    if ((this.direction > 0 && maxX + stepX > SCREEN_W - 6) || (this.direction < 0 && minX - stepX < 6)) {
      this.direction *= -1;
      // The fleet never gets near the ship in a play this short; it just creeps down.
      if (this.fleetY < SCREEN_H / 2) this.fleetY += ALIEN_H;
    } else {
      this.fleetX += this.direction * stepX;
    }
  }

  private updateDivers(dt: number, alive: Alien[]): void {
    this.diveTimer -= dt;
    if (this.diveTimer <= 0 && alive.length > 2) {
      this.diveTimer = (DIVE_EVERY / (1 + (this.wave - 1) * 0.15)) * (0.7 + this.rand() * 0.6);
      const candidates = alive.filter((a) => !a.dive);
      const diver = candidates[Math.floor(this.rand() * candidates.length)];
      if (diver) {
        const { x, y } = this.alienPos(diver);
        diver.dive = { x, y, t: 0 };
      }
    }
    for (const a of alive) {
      if (!a.dive) continue;
      a.dive.t += dt;
      a.dive.y += DIVE_SPEED * (1 + (this.wave - 1) * 0.1) * dt;
      a.dive.x += Math.sin(a.dive.t * 4) * 70 * dt;
      if (a.dive.y > SCREEN_H) {
        a.dive = null; // back into formation
        this.breakCombo();
        this.addTime(-ESCAPE_SECONDS, this.shipX, SHIP_Y - 24);
        this.fx.pop('ESCAPED', this.shipX, SHIP_Y - 40, '#ff5f5f', 8);
      }
    }
  }

  private updateSaucer(dt: number): void {
    if (this.saucer) {
      this.saucer.x += SAUCER_SPEED * (1 + (this.wave - 1) * 0.15) * dt;
      if (this.saucer.x > SCREEN_W + 12) this.saucer = null;
      return;
    }
    this.saucerTimer -= dt;
    if (this.saucerTimer <= 0) {
      this.saucerTimer = SAUCER_EVERY + (this.wave - 1) * 0.5;
      this.saucer = { x: -12, y: PLAY_TOP + 8 };
    }
  }

  private updateShots(dt: number, alive: Alien[]): void {
    for (const shot of this.shots) shot.y -= SHOT_SPEED * dt;
    this.shots = this.shots.filter((shot) => {
      if (shot.y < PLAY_TOP - 6) return false;
      if (this.saucer && Math.abs(shot.x - this.saucer.x) <= 10 && Math.abs(shot.y - this.saucer.y) <= 5) {
        this.bumpCombo(CHAIN_HOLD);
        this.addScore(SAUCER_POINTS, this.saucer.x, this.saucer.y + 10, '#ff5f5f');
        this.addTime(SAUCER_SECONDS, this.saucer.x, this.saucer.y + 26);
        this.fx.flash('#ff5f5f', 0.08);
        this.saucer = null;
        return false;
      }
      for (const a of alive) {
        if (!a.alive) continue;
        const { x, y } = this.alienPos(a);
        if (shot.x < x || shot.x > x + ALIEN_W || shot.y < y || shot.y > y + ALIEN_H) continue;
        a.alive = false;
        this.bumpCombo(CHAIN_HOLD);
        if (a.dive) this.addScore(DIVER_POINTS, x + ALIEN_W / 2, y, '#ffffff');
        else this.addScore(ROW_POINTS[a.row] ?? 10, x + ALIEN_W / 2, y);
        a.dive = null;
        return false;
      }
      return true;
    });
  }

  /** Wave `n`: a row more every three waves (to five). */
  private spawnWave(): void {
    const rows = Math.min(MAX_ROWS, ROWS + Math.floor((this.wave - 1) / 3));
    this.aliens = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < COLS; c++) this.aliens.push({ col: c, row: r, alive: true, dive: null });
    this.fleetX = (SCREEN_W - (COLS * (ALIEN_W + ALIEN_GAP_X) - ALIEN_GAP_X)) / 2;
    this.fleetY = PLAY_TOP + 22;
    this.direction = 1;
    this.stepTimer = 0;
    this.diveTimer = 1;
  }

  private alienPos(a: Alien): { x: number; y: number } {
    if (a.dive) return { x: a.dive.x, y: a.dive.y };
    return { x: this.fleetX + a.col * (ALIEN_W + ALIEN_GAP_X), y: this.fleetY + a.row * (ALIEN_H + ALIEN_GAP_Y) };
  }
}
