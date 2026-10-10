import { clamp } from '@/math/scalar';
import { type ArcadeControls, SCREEN_H, SCREEN_W } from './ArcadeGame';
import { BaseGame, PLAY_TOP } from './BaseGame';
import { Sprite } from './sprite';
import { arcadeHint } from '../arcadeHint';

const ROUND_SECONDS = 15;
const SHIP_Y = SCREEN_H - 20;
const SHIP_W = 16;
const SHIP_SPEED = 260;
const STAR_POINTS = 30;
/** Every this many stars caught, a stage: faster rocks, more of them, two seconds. */
const STARS_PER_STAGE = 12;
const STAGE_SECONDS = 2;
const CLOCK_SECONDS = 2;
/** One falling thing in this many is a clock. */
const CLOCK_EVERY = 9;
const HIT_SECONDS = 1.5;
const INVULNERABLE = 1;
/** Stars caught this close together keep the chain going. */
const CHAIN_HOLD = 2;
/** A star now and then leads a trail: this many more behind it, this far apart (seconds), for a chain to follow. */
const TRAIL_ODDS = 0.25;
const TRAIL_STARS = 2;
const TRAIL_GAP = 0.14;
/** Stars and clocks are caught this much wider than they are drawn (rocks are not: a graze is no hit). */
const CATCH_REACH = 5;

type Kind = 'rock' | 'star' | 'clock';

/** A sprite's rows turned a quarter turn clockwise (a rock's tumble). */
function turned(rows: readonly string[]): string[] {
  const size = rows.length;
  return Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => rows[size - 1 - x]?.[y] ?? '.').join(''));
}

const ROCK_BIG_ROWS = ['.....xxxxx......', '...xxxxxxxxx....', '..xxxooxxxxxx...', '.xxxxooxxxxxxx..', '.xxxxxxxxxoxxxx.', 'xxxxxxxxxxxxxxx.', 'xxxoxxxxxxxxxxxx', 'xxxxxxxxxxxxxxxx', 'xxxxxxxxxooxxxxx', '.xxxxxxxxooxxxx.', '.xxxxxxxxxxxxxx.', '..xxxxxxxxxxxx..', '...xxxxxxxxxx...', '....xxxxxxxx....', '......xxxx......', '................'];
const ROCK_SMALL_ROWS = ['...xxxx...', '.xxxxxxxx.', '.xxoxxxxx.', 'xxxxxxxxxx', 'xxxxxxxoxx', 'xxxxxxxxxx', 'xoxxxxxxxx', '.xxxxxxxx.', '..xxxxxx..', '....xx....'];
export const ROCK_BIG = new Sprite([ROCK_BIG_ROWS, turned(ROCK_BIG_ROWS), turned(turned(ROCK_BIG_ROWS)), turned(turned(turned(ROCK_BIG_ROWS)))]);
const ROCK_SMALL = new Sprite([ROCK_SMALL_ROWS, turned(ROCK_SMALL_ROWS), turned(turned(ROCK_SMALL_ROWS)), turned(turned(turned(ROCK_SMALL_ROWS)))]);
const ROCK_INKS = { x: '#8a6a5a', o: '#5a4238' };
export const STAR = new Sprite([['....x....', '....x....', '...xxx...', 'xxxxoxxxx', '.xxoooxx.', '..xxxxx..', '..xx.xx..', '.xx...xx.', '.x.....x.']]);
const STAR_INKS = { x: '#ffe066', o: '#ffffff' };
const STAR_TWINKLE = { x: '#ffd23a', o: '#ffe066' };
const CLOCK = new Sprite([['...xxxxx...', '..x.....x..', '.x...o...x.', 'x....o....x', 'x....o....x', 'x....ooo..x', 'x.........x', 'x.........x', '.x.......x.', '..x.....x..', '...xxxxx...']]);
const SHIP = new Sprite([['.......xx.......', '.......xx.......', '......xxxx......', '......xoox......', '.....xxooxx.....', '.....xxxxxx.....', '....xxxxxxxx....', '...xxxxxxxxxx...', '..xxxxxxxxxxxx..', '.xxxx.xxxx.xxxx.', 'xxxx..xxxx..xxxx', 'xx....x..x....xx', '................']]);

interface Trail {
  x: number;
  vy: number;
  left: number;
  next: number;
}

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
 * stars (points; caught in quick succession they chain the combo, and some come in a trail of three
 * to follow down), catch the odd clock (two seconds), dodge the rocks (a hit costs a second and a half and the combo, then a moment's shield).
 * Every twelve stars is a stage: faster and thicker rocks, two seconds.
 */
export class Comets extends BaseGame {
  readonly id = 'comets';
  readonly title = 'COMET DASH';
  get hint(): string {
    return arcadeHint('{leftRight} or arrows move · catch the stars, dodge the rocks');
  }
  readonly summary = '15 SEC · CHAIN STARS · CLOCKS +2S';

  private shipX = SCREEN_W / 2;
  private fallers: Faller[] = [];
  private trails: Trail[] = [];
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
    this.trails = [];
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
      const x = 10 + this.rand() * (SCREEN_W - 20);
      this.fallers.push({ kind, x, y: PLAY_TOP - 10, r: kind === 'rock' ? 7 + this.rand() * 6 : 6, vy: speed, spin: this.rand() * 6 });
      if (kind === 'star' && this.rand() < TRAIL_ODDS) this.trails.push({ x, vy: speed, left: TRAIL_STARS, next: TRAIL_GAP });
    }
    for (const trail of this.trails) {
      trail.next -= dt;
      if (trail.next > 0) continue;
      trail.next = TRAIL_GAP;
      trail.left -= 1;
      this.fallers.push({ kind: 'star', x: trail.x, y: PLAY_TOP - 10, r: 6, vy: trail.vy, spin: 0 });
    }
    this.trails = this.trails.filter((t) => t.left > 0);

    for (const f of this.fallers) {
      f.y += f.vy * dt;
      f.spin += dt * 3;
    }
    this.fallers = this.fallers.filter((f) => {
      if (f.y - f.r > SCREEN_H) return false;
      const reach = f.kind === 'rock' ? -2 : CATCH_REACH;
      const touching = Math.abs(f.x - this.shipX) < f.r + SHIP_W / 2 + reach && Math.abs(f.y - SHIP_Y) < f.r + 5 + Math.max(0, reach);
      if (!touching) return true;
      if (f.kind === 'rock') {
        if (this.shield > 0) return true;
        this.shield = INVULNERABLE;
        this.sound('crunch');
        this.sound('shield');
        this.breakCombo();
        this.addTime(-HIT_SECONDS, this.shipX, SHIP_Y - 26);
        this.fx.shake(3, 0.25);
        this.fx.flash('#ff5f5f', 0.12);
        this.fx.burst(f.x, f.y, '#8a6a5a', 18, 110, 2);
        this.fx.burst(f.x, f.y, '#ffb347', 8, 80, 1);
        return false;
      }
      if (f.kind === 'clock') {
        this.addTime(CLOCK_SECONDS, f.x, f.y - 20);
        this.fx.flash('#5ff2e8', 0.06);
        this.fx.burst(f.x, f.y, '#5ff2e8', 12, 80, 2);
        return false;
      }
      this.caught += 1;
      this.bumpCombo(CHAIN_HOLD);
      this.addScore(STAR_POINTS, f.x, f.y - 10, '#ffe066');
      this.fx.burst(f.x, f.y, '#ffe066', 10, 70, 2);
      if (this.caught % STARS_PER_STAGE === 0) {
        this.fx.pop(`STAGE ${this.stage}`, SCREEN_W / 2, SCREEN_H / 2 - 20, '#ffffff', 12);
        this.sound('stage');
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
      const turn = Math.floor(f.spin / (Math.PI / 2));
      if (f.kind === 'rock') {
        // Its fiery wake, then the rock, a quarter turn per frame as it tumbles.
        ctx.fillStyle = 'rgba(255,140,60,0.35)';
        ctx.fillRect(Math.round(f.x) - 1, Math.round(f.y - f.r) - 10, 2, 10);
        ctx.fillStyle = 'rgba(255,200,90,0.5)';
        ctx.fillRect(Math.round(f.x), Math.round(f.y - f.r) - 5, 1, 5);
        // Drawn as big as it hits (`r` runs 7 to 13, the sprites are 10 and 16 px): about 1.8 r across, as the old polygon.
        const rock = f.r < 9 ? ROCK_SMALL : ROCK_BIG;
        rock.drawCentred(ctx, f.x, f.y, ROCK_INKS, turn, (f.r * 1.8) / rock.width);
      } else if (f.kind === 'star') {
        STAR.drawCentred(ctx, f.x, f.y, Math.floor(this.elapsed * 8) % 2 ? STAR_INKS : STAR_TWINKLE);
      } else {
        CLOCK.drawCentred(ctx, f.x, f.y, { x: '#5ff2e8', o: '#ffffff' });
      }
    }
    if (this.shield <= 0 || Math.floor(this.shield * 12) % 2 === 0) {
      SHIP.drawCentred(ctx, this.shipX, SHIP_Y - 1, { x: '#e8f4ff', o: '#63b3ff' });
      ctx.fillStyle = Math.floor(this.elapsed * 20) % 2 ? '#ff8a3a' : '#ffe066';
      ctx.fillRect(Math.round(this.shipX) - 2, SHIP_Y + 5, 4, 3);
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
