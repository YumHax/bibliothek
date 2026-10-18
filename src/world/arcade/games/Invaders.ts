import { clamp } from '@/math/scalar';
import { type ArcadeControls, SCREEN_H, SCREEN_W } from './ArcadeGame';
import { BaseGame, PLAY_TOP } from './BaseGame';
import { random } from '@/random';
import { Sprite } from './sprite';
import { arcadeHint } from '../arcadeHint';

const ROUND_SECONDS = 15;
const WAVE_TIME_BONUS = 5;
const WAVE_BONUS = 200;
const COLS = 8;
/** The first wave's rows (a careful hand can clear it on the opening clock: the PERFECT WAVE is reachable), a row more each wave to `ROWS`, then one every three waves to `MAX_ROWS`. */
const FIRST_ROWS = 2;
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
const FIRE_INTERVAL = 0.22;
const MAX_SHOTS = 2;
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
/** Kills this close together keep the chain going; a shot that hits nothing breaks it. */
const CHAIN_HOLD = 1.5;
/** The fleet drops bombs: one every this many seconds at first (quicker each wave), this fast (px/s), so many at once. */
const BOMB_EVERY = 2.4;
const BOMB_SPEED = 72;
const MAX_BOMBS = 3;
/** A bomb on the ship costs this, and the ship blinks this long, shrugging off the next. */
const BOMB_SECONDS = 1;
const SHIP_SHIELD = 0.9;
/** A bomb shot down pays a little. */
const BOMB_POINTS = 15;
/** A wave cleared without a wasted shot, a bomb taken or a diver let past: this much, more each wave. */
const PERFECT_WAVE = 400;
const PERFECT_WAVE_STEP = 100;
/** A diver flies back to its place in the fleet this fast (px/s). */
const RETURN_SPEED = 170;
/** The march's four notes, a step down each. */
const MARCH_PITCH = [1, 0.94, 0.89, 0.84];
const BOMB = new Sprite([['.x.', 'xxx', '.x.', 'x.x'], ['x.x', '.x.', 'xxx', '.x.']]);

/* The fleet's three kinds (by row), two frames each, stepping with the march; the ship; the saucer. 16 x 8 in a 16 x 10 cell. */
export const CRAB = new Sprite([
  ['...x........x...', '....x......x....', '...xxxxxxxxxx...', '..xx.xxxxxx.xx..', '.xxxxxxxxxxxxxx.', '.x.xxxxxxxxxx.x.', '.x.x........x.x.', '....xx....xx....'],
  ['...x........x...', '.x..x......x..x.', '.x.xxxxxxxxxx.x.', '.xxx.xxxxxx.xxx.', '.xxxxxxxxxxxxxx.', '...xxxxxxxxxx...', '....x......x....', '...x........x...'],
]);
export const SQUID = new Sprite([
  ['......xxxx......', '....xxxxxxxx....', '...xxxxxxxxxx...', '..xxx.xxxx.xxx..', '..xxxxxxxxxxxx..', '.....x....x.....', '....x.xxxx.x....', '...x.x....x.x...'],
  ['......xxxx......', '....xxxxxxxx....', '...xxxxxxxxxx...', '..xxx.xxxx.xxx..', '..xxxxxxxxxxxx..', '....xx.xx.xx....', '...x........x...', '....x......x....'],
]);
const OCTOPUS = new Sprite([
  ['.....xxxxxx.....', '..xxxxxxxxxxxx..', '.xxxxxxxxxxxxxx.', '.xxx..xxxx..xxx.', '.xxxxxxxxxxxxxx.', '....xxx..xxx....', '...xx..xx..xx...', '.xx..........xx.'],
  ['.....xxxxxx.....', '..xxxxxxxxxxxx..', '.xxxxxxxxxxxxxx.', '.xxx..xxxx..xxx.', '.xxxxxxxxxxxxxx.', '...xxxx..xxxx...', '..xx...xx...xx..', '...xx......xx...'],
]);
const KINDS = [SQUID, CRAB, CRAB, OCTOPUS, OCTOPUS];
const SHIP = new Sprite([['........xx........', '.......xxxx.......', '.......xoox.......', '..x...xxxxxx...x..', '..x.xxxxxxxxxx.x..', '.xxxxxxxxxxxxxxxx.', 'xxxxxxxxxxxxxxxxxx', 'xxx.xxx....xxx.xxx']]);
const SAUCER = new Sprite([
  ['......xxxxxxxx......', '...xxxxxxxxxxxxxx...', '..xxoxxoxxoxxoxxoxx.', 'xxxxxxxxxxxxxxxxxxxx', '...xxx...xx...xxx...', '....x..........x....'],
  ['......xxxxxxxx......', '...xxxxxxxxxxxxxx...', '..xxxxoxxoxxoxxoxxx.', 'xxxxxxxxxxxxxxxxxxxx', '...xxx...xx...xxx...', '....x..........x....'],
]);

interface Alien {
  col: number;
  row: number;
  alive: boolean;
  /** Set while the alien leaves formation to dive past the ship (`back` once it flies home from the top). */
  dive: { x: number; y: number; t: number; back: boolean } | null;
}

interface Shot {
  x: number;
  y: number;
}

/**
 * STAR RAID: a fifteen-second shooting gallery. Fire (two shots in the air) to mow down the
 * marching fleet; kills in quick succession chain the combo, and a shot that hits nothing breaks
 * it, so aiming pays and spraying does not. Aliens peel off and dive for a fat bonus and cost a
 * second if they get past (they fly back into the fleet from the top); the fleet drops slow bombs
 * that cost a second (shoot them for a little); the saucer crossing the top, either way, at a height
 * of its own, is the clock: shooting it pays three seconds. A cleared wave pays a bonus and five more
 * seconds, and a wave cleared clean (no wasted shot, no bomb taken, no diver past) a PERFECT WAVE
 * bonus that grows each wave: what a careful hand earns over a spraying one. Every wave is harder: the
 * fleet marches faster and gains a row, divers and bombs come quicker, the saucer flies faster and
 * rarer. Nothing stops a run but the clock.
 */
export class Invaders extends BaseGame {
  readonly id = 'invaders';
  readonly title = 'STAR RAID';
  get hint(): string {
    return arcadeHint('{leftRight} or arrows move the ship · {fire} fires: make every shot count');
  }
  readonly summary = '15 SEC · AIM TO CHAIN · SAUCER = +3S';

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
  private saucer: (Shot & { dir: number }) | null = null;
  private saucerTimer = 0;
  private saucerSound = 0;
  private bombs: Shot[] = [];
  private bombTimer = 0;
  private shield = 0;
  /** Whether this wave has gone without a wasted shot, a bomb taken or a diver let past. */
  private clean = true;
  /** The fleet's steps so far: the aliens' two frames alternate with it (drawing only). */
  private marchStep = 0;

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
    this.saucerSound = 0;
    this.shield = 0;
    this.marchStep = 0;
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
    this.updateBombs(dt, alive);
    this.updateShots(dt, alive);

    if (!this.aliens.some((a) => a.alive)) {
      if (this.clean) this.bonus(PERFECT_WAVE + (this.wave - 1) * PERFECT_WAVE_STEP, 'PERFECT WAVE', SCREEN_W / 2, SCREEN_H / 2 - 18);
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
      const kind = KINDS[a.row % KINDS.length]!;
      // Divers flap twice as fast as the march.
      kind.draw(ctx, x, y + 1, { x: a.dive ? '#ffffff' : ROW_COLORS[a.row % ROW_COLORS.length]! }, a.dive ? Math.floor(a.dive.t * 8) : this.marchStep);
    }
    if (this.saucer) SAUCER.drawCentred(ctx, this.saucer.x, this.saucer.y - 1, { x: '#ff5f5f', o: '#fff2a8' }, Math.floor(this.elapsed * 6));
    for (const b of this.bombs) BOMB.drawCentred(ctx, b.x, b.y, { x: '#ff8a3a' }, Math.floor(this.elapsed * 8));
    // The ship blinks while a bomb's hit still shields it.
    if (this.shield <= 0 || Math.floor(this.shield * 12) % 2 === 0) SHIP.drawCentred(ctx, this.shipX, SHIP_Y, { x: '#e8ffe6', o: '#63b3ff' });
    ctx.fillStyle = '#fff2a8';
    for (const s of this.shots) ctx.fillRect(s.x - 1, s.y, 2, 6);
    this.drawStage(ctx, this.clean ? `WAVE ${this.wave} · CLEAN` : `WAVE ${this.wave}`);
  }

  /** Fire held; under a diver first, then the saucer, else the nearest column of the fleet. */
  autopilot(skill: number): ArcadeControls {
    const alive = this.aliens.filter((a) => a.alive);
    // A diver is chased once it is low enough to get past (a steady hand keeps clearing the fleet till then; a poor one chases every one).
    const divers = alive.filter((a) => a.dive && (skill < 0.5 || this.alienPos(a).y > SCREEN_H * 0.45)).sort((a, b) => b.dive!.y - a.dive!.y);
    let target: number;
    if (divers[0] && random() < skill + 0.2) target = this.alienPos(divers[0]).x + ALIEN_W / 2;
    else if (this.saucer && this.saucer.x > 0 && this.saucer.x < SCREEN_W && skill > 0.5) target = this.saucer.x + this.saucer.dir * 30;
    else {
      const nearest = alive.reduce<Alien | null>((best, a) => {
        const d = Math.abs(this.alienPos(a).x + ALIEN_W / 2 - this.shipX);
        return !best || d < Math.abs(this.alienPos(best).x + ALIEN_W / 2 - this.shipX) ? a : best;
      }, null);
      target = nearest ? this.alienPos(nearest).x + ALIEN_W / 2 : SCREEN_W / 2;
    }
    // A bomb about to land on the ship: step aside first.
    const bomb = this.bombs.find((b) => b.y > SHIP_Y - 50 && Math.abs(b.x - this.shipX) < SHIP_W);
    if (bomb && random() < skill + 0.2) target = this.shipX + (bomb.x > this.shipX ? -30 : 30);
    const diff = target - this.shipX;
    const dead = 3 + (1 - skill) * 10;
    // A good hand fires when something is over the gun; a poor one sprays.
    const lined = alive.some((a) => Math.abs(this.alienPos(a).x + ALIEN_W / 2 - this.shipX) < ALIEN_W / 2) || (this.saucer !== null && Math.abs(this.saucer.x + this.saucer.dir * 30 - this.shipX) < 8);
    const fire = lined ? random() < 0.5 + skill * 0.5 : random() < (1 - skill) * 0.8;
    return { left: diff < -dead, right: diff > dead, up: false, down: false, fire, firePressed: false };
  }

  private marchFleet(dt: number, alive: Alien[]): void {
    const formation = alive.filter((a) => !a.dive);
    const interval = Math.max(0.05, 0.35 * Math.pow(0.85, this.wave - 1) * (formation.length / (COLS * MAX_ROWS)) + 0.04);
    this.stepTimer += dt;
    if (this.stepTimer < interval || !formation.length) return;
    this.stepTimer = 0;
    this.marchStep += 1;
    this.sound('march', MARCH_PITCH[this.marchStep % MARCH_PITCH.length]);
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
        diver.dive = { x, y, t: 0, back: false };
      }
    }
    for (const a of alive) {
      if (!a.dive) continue;
      a.dive.t += dt;
      if (a.dive.back) {
        // Home to its place in the fleet, from the top.
        const home = this.formationPos(a);
        const dx = home.x - a.dive.x;
        const dy = home.y - a.dive.y;
        const d = Math.hypot(dx, dy);
        const step = RETURN_SPEED * dt;
        if (d <= step) a.dive = null;
        else {
          a.dive.x += (dx / d) * step;
          a.dive.y += (dy / d) * step;
        }
        continue;
      }
      a.dive.y += DIVE_SPEED * (1 + (this.wave - 1) * 0.1) * dt;
      a.dive.x += Math.sin(a.dive.t * 4) * 70 * dt;
      if (a.dive.y > SCREEN_H) {
        a.dive.back = true;
        a.dive.y = PLAY_TOP - ALIEN_H;
        this.clean = false;
        this.breakCombo();
        this.addTime(-ESCAPE_SECONDS, this.shipX, SHIP_Y - 24);
        this.fx.pop('ESCAPED', this.shipX, SHIP_Y - 40, '#ff5f5f', 8);
      }
    }
  }

  /** The fleet's bottom aliens drop bombs now and then; one on the ship costs a second, a shot can stop one. */
  private updateBombs(dt: number, alive: Alien[]): void {
    this.shield = Math.max(0, this.shield - dt);
    this.bombTimer -= dt;
    if (this.bombTimer <= 0) {
      this.bombTimer = (BOMB_EVERY / (1 + (this.wave - 1) * 0.2)) * (0.6 + this.rand() * 0.8);
      const formation = alive.filter((a) => !a.dive);
      // The lowest alien of a column drawn at random.
      const col = formation[Math.floor(this.rand() * formation.length)]?.col;
      const bottom = formation.filter((a) => a.col === col).reduce<Alien | null>((low, a) => (!low || a.row > low.row ? a : low), null);
      if (bottom && this.bombs.length < MAX_BOMBS) {
        const { x, y } = this.alienPos(bottom);
        this.bombs.push({ x: x + ALIEN_W / 2, y: y + ALIEN_H });
      }
    }
    const speed = BOMB_SPEED * (1 + (this.wave - 1) * 0.08);
    this.bombs = this.bombs.filter((b) => {
      b.y += speed * dt;
      if (b.y >= SHIP_Y - SHIP_H / 2 && b.y <= SHIP_Y + SHIP_H / 2 && Math.abs(b.x - this.shipX) <= SHIP_W / 2) {
        if (this.shield <= 0) {
          this.shield = SHIP_SHIELD;
          this.clean = false;
          this.breakCombo();
          this.addTime(-BOMB_SECONDS, this.shipX, SHIP_Y - 24);
          this.fx.shake(3, 0.2);
          this.fx.flash('#ff5f5f', 0.1);
          this.fx.burst(this.shipX, SHIP_Y, '#ff8a3a', 14, 90, 2);
        }
        return false;
      }
      return b.y < SCREEN_H + 4;
    });
  }

  private updateSaucer(dt: number): void {
    if (this.saucer) {
      this.saucer.x += this.saucer.dir * SAUCER_SPEED * (1 + (this.wave - 1) * 0.15) * dt;
      this.saucerSound -= dt;
      if (this.saucerSound <= 0) {
        this.saucerSound = 0.22;
        this.sound('saucer');
      }
      if (this.saucer.x > SCREEN_W + 12 || this.saucer.x < -12) this.saucer = null;
      return;
    }
    this.saucerTimer -= dt;
    if (this.saucerTimer <= 0) {
      this.saucerTimer = SAUCER_EVERY + (this.wave - 1) * 0.5;
      // Either way across, a little higher or lower each time (never into the fleet).
      const dir = this.rand() < 0.5 ? 1 : -1;
      this.saucer = { x: dir > 0 ? -12 : SCREEN_W + 12, y: PLAY_TOP + 6 + Math.round(this.rand() * 6), dir };
    }
  }

  private updateShots(dt: number, alive: Alien[]): void {
    for (const shot of this.shots) shot.y -= SHOT_SPEED * dt;
    this.shots = this.shots.filter((shot) => {
      if (shot.y < PLAY_TOP - 6) {
        this.clean = false;
        this.breakCombo();
        return false;
      }
      const bomb = this.bombs.find((b) => Math.abs(shot.x - b.x) <= 3 && Math.abs(shot.y - b.y) <= 5);
      if (bomb) {
        this.bombs = this.bombs.filter((b) => b !== bomb);
        this.addScore(BOMB_POINTS, bomb.x, bomb.y, '#ff8a3a');
        this.fx.burst(bomb.x, bomb.y, '#ff8a3a', 8, 60, 1);
        return false;
      }
      if (this.saucer && Math.abs(shot.x - this.saucer.x) <= 10 && Math.abs(shot.y - this.saucer.y) <= 5) {
        this.bumpCombo(CHAIN_HOLD);
        this.addScore(SAUCER_POINTS, this.saucer.x, this.saucer.y + 10, '#ff5f5f');
        this.addTime(SAUCER_SECONDS, this.saucer.x, this.saucer.y + 26);
        this.fx.flash('#ff5f5f', 0.08);
        this.fx.burst(this.saucer.x, this.saucer.y, '#ff5f5f', 26, 120, 2);
        this.fx.burst(this.saucer.x, this.saucer.y, '#fff2a8', 10, 70, 2);
        this.saucer = null;
        return false;
      }
      for (const a of alive) {
        if (!a.alive) continue;
        const { x, y } = this.alienPos(a);
        if (shot.x < x || shot.x > x + ALIEN_W || shot.y < y || shot.y > y + ALIEN_H) continue;
        a.alive = false;
        this.fx.burst(x + ALIEN_W / 2, y + ALIEN_H / 2, a.dive ? '#ffffff' : ROW_COLORS[a.row % ROW_COLORS.length]!, 16, 90, 2);
        this.bumpCombo(CHAIN_HOLD);
        if (a.dive) this.addScore(DIVER_POINTS, x + ALIEN_W / 2, y, '#ffffff');
        else this.addScore(ROW_POINTS[a.row] ?? 10, x + ALIEN_W / 2, y);
        a.dive = null;
        return false;
      }
      return true;
    });
  }

  /** Wave `n`: `FIRST_ROWS` rows, a row more each wave to `ROWS`, then a row more every three waves (to five). */
  private spawnWave(): void {
    const growing = FIRST_ROWS + this.wave - 1;
    const rows = Math.min(MAX_ROWS, growing < ROWS ? growing : ROWS + Math.floor((this.wave - 1) / 3));
    this.aliens = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < COLS; c++) this.aliens.push({ col: c, row: r, alive: true, dive: null });
    this.fleetX = (SCREEN_W - (COLS * (ALIEN_W + ALIEN_GAP_X) - ALIEN_GAP_X)) / 2;
    this.fleetY = PLAY_TOP + 22;
    this.direction = 1;
    this.stepTimer = 0;
    this.diveTimer = 1;
    this.bombTimer = 1.5;
    this.bombs = [];
    this.clean = true;
  }

  private alienPos(a: Alien): { x: number; y: number } {
    if (a.dive) return { x: a.dive.x, y: a.dive.y };
    return this.formationPos(a);
  }

  /** Where `a` stands in the marching fleet. */
  private formationPos(a: Alien): { x: number; y: number } {
    return { x: this.fleetX + a.col * (ALIEN_W + ALIEN_GAP_X), y: this.fleetY + a.row * (ALIEN_H + ALIEN_GAP_Y) };
  }
}
