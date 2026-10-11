import { clamp } from '@/math/scalar';
import { type ArcadeControls, NO_CONTROLS, SCREEN_H, SCREEN_W } from './ArcadeGame';
import { BaseGame } from './BaseGame';
import { random } from '@/random';
import { Sprite } from './sprite';
import { arcadeHint } from '../arcadeHint';
import { carSprite, logSprite, turtleSprite } from './frogSprites';

/** The frog sitting and mid-leap (legs stretched), 13 px: spots, white eyes with their pupils. */
export const FROG_SPRITE = new Sprite([
  ['..xx.....xx..', '.xwkx...xwkx.', '.xxxx...xxxx.', '..xxxxxxxxx..', '.xxxxxxxxxxx.', 'xxxxdxxxdxxxx', 'xxxxxxxxxxxxx', '.xxxxxxxxxxx.', '..xxxxxxxxx..', '.xx.xxxxx.xx.', 'xx..xx.xx..xx', 'x...........x', '.............'],
  ['..xx.....xx..', '.xwkx...xwkx.', '.xxxx...xxxx.', '..xxxxxxxxx..', '.xxxxxxxxxxx.', '.xxxdxxxdxxx.', '..xxxxxxxxx..', '..xxxxxxxxx..', '...xxxxxxx...', '...xx...xx...', '..xx.....xx..', '..x.......x..', '.xx.......xx.'],
]);
const FROG_INKS = { x: '#39ff9e', d: '#1f6f5a', w: '#ffffff', k: '#060a12' };

const ROUND_SECONDS = 15;
const CELL = 16;
const ROWS = 13;
/** Row 0 the kerb the frog starts on, 1-5 the road, 6 the verge between, 7-11 the river, 12 the far bank. */
const VERGE = 6;
const BANK = ROWS - 1;
/** The frog's half-width for what hits it, and how long a hop takes. */
const FROG = 6;
const HOP_SECONDS = 0.09;
/** Where the frog starts across (the middle cell). */
const START_X = SCREEN_W / 2;
/** A hop to a row not reached yet on this crossing pays this and chains (hops this close together keep the chain). */
const HOP_POINTS = 10;
const HOP_CHAIN = 1.4;
/** Reaching the far bank: points (times the chain) and seconds, fewer each crossing after the first (never under `CROSS_MIN`). */
const CROSS_POINTS = 100;
const CROSS_SECONDS = 5;
const CROSS_FADE = 0.6;
const CROSS_MIN = 2;
/** Run over, drowned or carried off the screen: seconds lost, and the frog waits this long before it is back on the kerb (or the verge, once past it). */
const DEATH_SECONDS = 1.5;
const RESPAWN = 0.5;
/** Every crossing the traffic and the river run this much faster. */
const SPEED_PER_LEVEL = 0.14;
/** Objects run round a loop wider than the screen by `OFF` either side, so they come in and go out unseen. */
const OFF = 80;
const LOOP = SCREEN_W + OFF * 2;
/** Turtles surface for most of this cycle (s), dive for its last `TURTLE_DIVE`, and show they are going for `TURTLE_WARN` before. */
const TURTLE_CYCLE = 4.2;
const TURTLE_DIVE = 1.2;
const TURTLE_WARN = 0.5;
/** The far bank's bays (centres across), what one pays filled, and all of them. */
const BAYS = [32, 96, 160, 224, 288];
const BAY_REACH = 9;
const BAY_POINTS = 50;
const ALL_BAYS_POINTS = 500;
/** A fly sits in an empty bay for this long, every this often: landing there pays. */
const FLY_POINTS = 200;
const FLY_STAY = 3.5;
const FLY_EVERY = 5;

type LaneKind = 'car' | 'truck' | 'log' | 'turtle';

/** One lane's traffic: its row, which way and how fast (px/s at level 1), how long its things are and how many. */
const LANES: readonly { row: number; kind: LaneKind; dir: 1 | -1; speed: number; w: number; count: number; color: string }[] = [
  { row: 1, kind: 'car', dir: -1, speed: 38, w: 22, count: 3, color: '#ffd23a' },
  { row: 2, kind: 'car', dir: 1, speed: 52, w: 22, count: 3, color: '#ff7ad9' },
  { row: 3, kind: 'truck', dir: -1, speed: 30, w: 42, count: 2, color: '#e8e6ff' },
  { row: 4, kind: 'car', dir: 1, speed: 66, w: 20, count: 2, color: '#63b3ff' },
  { row: 5, kind: 'car', dir: -1, speed: 46, w: 24, count: 3, color: '#ff5f5f' },
  { row: 7, kind: 'log', dir: 1, speed: 28, w: 64, count: 3, color: '#a0703a' },
  { row: 8, kind: 'turtle', dir: -1, speed: 40, w: 48, count: 3, color: '#3fbf8a' },
  { row: 9, kind: 'log', dir: 1, speed: 50, w: 80, count: 2, color: '#a0703a' },
  { row: 10, kind: 'log', dir: -1, speed: 34, w: 56, count: 3, color: '#8a5a2a' },
  { row: 11, kind: 'log', dir: 1, speed: 44, w: 72, count: 2, color: '#a0703a' },
];

interface Lane {
  row: number;
  kind: LaneKind;
  /** Signed speed at level 1, px/s. */
  v: number;
  w: number;
  color: string;
  /** Left edges along the loop (0..LOOP; on screen at `u - OFF`). */
  us: number[];
  /** Turtles: where in its dive cycle each group starts (s). */
  phases: number[];
}

type Dir = 'up' | 'down' | 'left' | 'right';
const DIRS: readonly Dir[] = ['up', 'down', 'left', 'right'];
const STEP: Record<Dir, [dx: number, dRow: number]> = { up: [0, 1], down: [0, -1], left: [-CELL, 0], right: [CELL, 0] };

/**
 * LEAP FROG: fifteen seconds to get a frog across a road and a river as many times as it will go.
 * Each hop is one press (WASD or arrows). The road's cars and trucks run the frog over; on the
 * river it has to land on a log or a raft of turtles and ride it (off the edge of the screen is a
 * swim too; the turtles dive now and then, going pale first). A hop onto a row not reached yet on
 * this crossing pays and chains the combo, as long as the hops keep coming; the far bank pays a
 * crossing (times the chain) and seconds, landing in one of its five bays pays more (all five, a
 * fat bonus, then they empty), a fly sitting in a bay more again; everything runs faster the next
 * time over. Run over or drowned costs a second and a half and the combo, and the frog starts
 * again from the kerb (from the verge once it got that far). The lanes are laid from the run's seed, so a run replays exactly.
 */
export class LeapFrog extends BaseGame {
  readonly id = 'frog';
  readonly title = 'LEAP FROG';
  get hint(): string {
    return arcadeHint('{stick} or arrows hop · cross the road, ride the logs, home into a bay');
  }
  readonly summary = '15 SEC · HOP ACROSS · EACH CROSSING +TIME';

  private lanes: Lane[] = [];
  private frogX = START_X;
  private frogRow = 0;
  private hop: { fromX: number; fromRow: number; t: number } | null = null;
  /** A press seen while a hop is under way, taken as soon as it lands. */
  private queued: Dir | null = null;
  /** The furthest row reached on this crossing (only new rows pay). */
  private reached = 0;
  private level = 1;
  private crossings = 0;
  /** Seconds before the frog is back on the kerb after dying, and where it died (for the splat). */
  private dead = 0;
  private deadAt: { x: number; row: number; water: boolean } | null = null;
  /** Which bays on the far bank hold a frog already. */
  private bays: boolean[] = BAYS.map(() => false);
  /** The fly: its bay and how long it stays, or the wait for the next one. */
  private fly: { bay: number; left: number } | null = null;
  private flyTimer = 0;

  constructor() {
    super(ROUND_SECONDS);
  }

  protected begin(): void {
    this.lanes = LANES.map((l) => {
      const spacing = LOOP / l.count;
      const start = this.rand() * spacing;
      const us = Array.from({ length: l.count }, (_, i) => (start + i * spacing + (this.rand() - 0.5) * spacing * 0.3 + LOOP) % LOOP);
      const phases = us.map(() => this.rand() * TURTLE_CYCLE);
      return { row: l.row, kind: l.kind, v: l.dir * l.speed, w: l.w, color: l.color, us, phases };
    });
    this.level = 1;
    this.crossings = 0;
    this.dead = 0;
    this.deadAt = null;
    this.bays = BAYS.map(() => false);
    this.fly = null;
    this.flyTimer = FLY_EVERY * 0.6;
    this.pilotBay = -1;
    this.toKerb();
  }

  protected tick(dt: number, controls: ArcadeControls): void {
    const factor = this.speedFactor;
    for (const lane of this.lanes) for (let i = 0; i < lane.us.length; i++) lane.us[i] = (((lane.us[i]! + lane.v * factor * dt) % LOOP) + LOOP) % LOOP;
    this.updateFly(dt);

    for (const d of DIRS) if (this.keys.pressed(controls, d)) this.queued = d;

    if (this.dead > 0) {
      this.dead -= dt;
      this.queued = null;
      if (this.dead <= 0) this.toKerb(this.reached >= VERGE);
      return;
    }

    if (this.hop) {
      this.hop.t += dt;
      if (this.hop.t < HOP_SECONDS) return;
      this.land();
      if (this.dead > 0) return;
    }

    // Riding a log.
    const log = this.logUnder(this.frogRow, this.frogX);
    if (log) this.frogX += log.v * factor * dt;
    if (!this.safe(this.frogRow, this.frogX, 0)) {
      this.die();
      return;
    }

    if (this.queued) {
      const d = this.queued;
      this.queued = null;
      const [dx, dRow] = STEP[d];
      const row = this.frogRow + dRow;
      const x = this.frogX + dx;
      if (row < 0 || x < FROG || x > SCREEN_W - FROG) return;
      this.hop = { fromX: this.frogX, fromRow: this.frogRow, t: 0 };
      this.frogX = x;
      this.frogRow = row;
      this.sound('lane', 1 + row * 0.04);
    }
  }

  protected paint(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#060a12';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    for (let row = 0; row < ROWS; row++) {
      const y = this.rowY(row);
      ctx.fillStyle = row === 0 || row === VERGE ? '#2a1f4a' : row === BANK ? '#14462e' : row < VERGE ? '#15151f' : '#0c2a52';
      ctx.fillRect(0, y, SCREEN_W, CELL);
      if (row > 0 && row < VERGE - 1) {
        // The road's dashes between lanes.
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        for (let x = 4; x < SCREEN_W; x += 24) ctx.fillRect(x, y, 10, 1);
      } else if (row > VERGE && row < BANK) {
        // Ripples drifting on the river.
        ctx.fillStyle = 'rgba(120,190,255,0.18)';
        for (let x = (this.elapsed * 12 * (row % 2 ? 1 : -1)) % 32; x < SCREEN_W; x += 32) ctx.fillRect(x + 8, y + 7 + (row % 3), 6, 1);
      }
    }
    this.paintBays(ctx);

    for (const lane of this.lanes) {
      const y = this.rowY(lane.row);
      lane.us.forEach((u, i) => {
        const x = u - OFF;
        if (x > SCREEN_W || x + lane.w < 0) return;
        if (lane.kind === 'log') logSprite(lane.w).draw(ctx, x, y + 2, { x: lane.color, d: '#5a3a1a', r: '#d0a060' });
        else if (lane.kind === 'turtle') {
          const state = this.turtleState(lane, i, 0);
          if (state === 'under') {
            // Only rings on the water where they went down.
            ctx.fillStyle = 'rgba(160,210,255,0.35)';
            for (let k = 0; k < lane.w; k += 16) ctx.fillRect(Math.round(x + k + 4), y + 8, 8, 1);
            return;
          }
          const inks = state === 'warn' ? { x: '#a8d8c0', s: '#6a8a7a' } : { x: lane.color, s: '#1f6f5a' };
          for (let k = 0; k < lane.w; k += 16) turtleSprite(lane.v > 0 ? 1 : -1).draw(ctx, x + k + 1, y + 2, inks, Math.floor(this.elapsed * 3 + k) % 2);
        } else carSprite(lane.kind, lane.w, lane.v > 0 ? 1 : -1).draw(ctx, x, y + 3, { x: lane.color, w: '#9ad6ff', t: '#20202a', h: '#fff2a8', r: '#ff5f5f' });
      });
    }

    if (this.deadAt && this.dead > 0) {
      const y = this.rowY(this.deadAt.row) + CELL / 2;
      ctx.fillStyle = this.deadAt.water ? '#9ad6ff' : '#ff5f5f';
      const r = 4 + (RESPAWN - this.dead) * 16;
      ctx.fillRect(this.deadAt.x - r, y - 1, r * 2, 2);
      ctx.fillRect(this.deadAt.x - 1, y - r / 2, 2, r);
    } else {
      this.paintFrog(ctx);
    }
    this.drawStage(ctx, `CROSSING ${this.crossings + 1}`);
  }

  /** Hops up when the landing is safe a moment on, sidesteps or backs off when where it sits is about to go; a lesser player now and then hops blind. */
  autopilot(skill: number): ArcadeControls {
    const out = { ...NO_CONTROLS };
    if (this.counting || this.hop || this.dead > 0 || !this.live) return out;
    const margin = 0.12 + skill * 0.2;
    const lands = (d: Dir): boolean => {
      const [dx, dRow] = STEP[d];
      const row = this.frogRow + dRow;
      const x = this.frogX + dx;
      if (row < 0 || x < FROG + 4 || x > SCREEN_W - FROG - 4) return false;
      for (let t = HOP_SECONDS; t <= HOP_SECONDS + margin; t += 0.06) if (!this.safe(row, this.rideX(row, x, t - HOP_SECONDS), t)) return false;
      return true;
    };
    const pick = (d: Dir): ArcadeControls => (this.keys.isHeld(d) ? out : { ...out, [d]: true });
    // A person's thumb: a short hesitation now and then before the next hop.
    if (random() < (1 - skill) * 0.05) return out;
    // Close to the far bank, line up with a bay (the fly's first): a hop sideways when it is safe.
    if (this.frogRow >= BANK - 2) {
      if (this.pilotBay < 0 || this.bays[this.pilotBay]) this.pilotBay = this.fly ? this.fly.bay : this.bays.findIndex((full, i) => !full && Math.abs((BAYS[i] ?? 0) - this.frogX) < 70);
      const bayX = BAYS[this.pilotBay];
      if (bayX !== undefined && skill > 0.4) {
        const off = bayX - this.frogX;
        // A step sideways towards it when that is safe and the hop up would miss it; else on up all the same (a bay is a bonus).
        if (Math.abs(off) > BAY_REACH && random() < skill) {
          const side: Dir = off < 0 ? 'left' : 'right';
          if (lands(side)) return pick(side);
        }
      }
    }
    if (lands('up') || random() < (1 - skill) * 0.002) return pick('up');
    let staying = true;
    for (let t = 0; t <= margin + 0.1; t += 0.06) if (!this.safe(this.frogRow, this.rideX(this.frogRow, this.frogX, t), t)) staying = false;
    // On a log drifting to the edge: step back towards the middle.
    const drifting = Math.abs(this.frogX - SCREEN_W / 2) > SCREEN_W / 2 - 40;
    if (staying && !drifting) return out;
    const toward: Dir = this.frogX > SCREEN_W / 2 ? 'left' : 'right';
    const away: Dir = toward === 'left' ? 'right' : 'left';
    for (const d of [toward, away, 'down'] as const) if (lands(d)) return pick(d);
    return out;
  }

  private pilotBay = -1;

  private get speedFactor(): number {
    return 1 + (this.level - 1) * SPEED_PER_LEVEL;
  }

  private rowY(row: number): number {
    return SCREEN_H - (row + 1) * CELL;
  }

  /** Back to the start; after a death past the verge, back to the verge (the road stays crossed, its hops paid). */
  private toKerb(verge = false): void {
    this.frogX = START_X;
    this.frogRow = verge ? VERGE : 0;
    this.hop = null;
    this.queued = null;
    this.reached = verge ? VERGE : 0;
  }

  /** The hop's end: a new row pays (the far bank a whole crossing), then whatever is there decides. */
  private land(): void {
    this.hop = null;
    const x = this.frogX;
    const y = this.rowY(this.frogRow);
    if (!this.safe(this.frogRow, x, 0)) {
      this.die();
      return;
    }
    if (this.frogRow <= this.reached) return;
    this.reached = this.frogRow;
    this.bumpCombo(HOP_CHAIN);
    if (this.frogRow === BANK) {
      this.crossings += 1;
      this.addScore(CROSS_POINTS, x, y, '#7ee787');
      this.homeIntoBay(x, y);
      this.fx.pop('HOME!', SCREEN_W / 2, SCREEN_H / 2 - 24, '#7ee787', 14);
      this.fx.flash('#7ee787', 0.1);
      this.sound('perfect');
      this.addTime(Math.max(CROSS_MIN, CROSS_SECONDS - CROSS_FADE * (this.crossings - 1)), SCREEN_W / 2, SCREEN_H / 2);
      this.level += 1;
      this.toKerb();
      return;
    }
    this.addScore(HOP_POINTS, x, y - 4);
    if (this.frogRow === VERGE) this.sound('good');
  }

  private die(): void {
    const water = this.frogRow > VERGE && this.frogRow < BANK;
    this.deadAt = { x: clamp(this.frogX, 8, SCREEN_W - 8), row: this.frogRow, water };
    this.dead = RESPAWN;
    this.hop = null;
    this.breakCombo();
    this.sound(water ? 'drain' : 'crunch');
    this.sound('miss');
    this.fx.shake(2.5, 0.2);
    this.fx.flash(water ? '#63b3ff' : '#ff5f5f', 0.1);
    this.fx.burst(this.deadAt.x, this.rowY(this.frogRow) + CELL / 2, water ? '#9ad6ff' : '#39ff9e', 20, 100, 2);
    this.fx.pop(water ? 'SPLASH!' : 'SPLAT!', this.deadAt.x, this.rowY(this.frogRow) - 8, water ? '#9ad6ff' : '#ff5f5f', 10);
    this.addTime(-DEATH_SECONDS, SCREEN_W / 2, SCREEN_H / 2);
  }

  /** A frog home at `x`: into the bay there if it is empty (and the fly's bonus if it sits in it); all five, a big bonus and they empty. */
  private homeIntoBay(x: number, y: number): void {
    const bay = BAYS.findIndex((bx, i) => !this.bays[i] && Math.abs(bx - x) <= BAY_REACH);
    if (bay < 0) return;
    this.bays[bay] = true;
    this.bonus(BAY_POINTS, 'BAY', x, y - 18);
    if (this.fly?.bay === bay) {
      this.fly = null;
      this.flyTimer = FLY_EVERY;
      this.bonus(FLY_POINTS, 'FLY', x, y - 34);
      this.sound('eat');
    }
    if (this.bays.every(Boolean)) {
      this.bays = BAYS.map(() => false);
      this.bonus(ALL_BAYS_POINTS, 'ALL HOME', SCREEN_W / 2, SCREEN_H / 2 + 30);
      this.fx.shake(3, 0.3);
    }
  }

  /** The fly comes to an empty bay now and then, stays a while, goes. */
  private updateFly(dt: number): void {
    if (this.fly) {
      this.fly.left -= dt;
      if (this.fly.left <= 0) {
        this.fly = null;
        this.flyTimer = FLY_EVERY;
      }
      return;
    }
    this.flyTimer -= dt;
    if (this.flyTimer > 0) return;
    const empty = BAYS.map((_, i) => i).filter((i) => !this.bays[i]);
    const bay = empty[Math.floor(this.rand() * empty.length)];
    if (bay === undefined) this.flyTimer = FLY_EVERY;
    else this.fly = { bay, left: FLY_STAY };
  }

  /** The bays along the far bank: dark notches, a frog in each filled one, the fly buzzing in its own. */
  private paintBays(ctx: CanvasRenderingContext2D): void {
    const y = this.rowY(BANK);
    BAYS.forEach((bx, i) => {
      ctx.fillStyle = '#0a2a1c';
      ctx.fillRect(bx - CELL / 2, y + 1, CELL, CELL - 1);
      if (this.bays[i]) FROG_SPRITE.drawCentred(ctx, bx, y + CELL / 2, { ...FROG_INKS, x: '#2fbf7e' });
      else if (this.fly?.bay === i) {
        const wing = Math.floor(this.elapsed * 16) % 2;
        ctx.fillStyle = '#e8e6ff';
        ctx.fillRect(bx - 3, y + 5 - wing, 2, 2);
        ctx.fillRect(bx + 1, y + 5 - wing, 2, 2);
        ctx.fillStyle = '#ffe066';
        ctx.fillRect(bx - 1, y + 7, 2, 3);
      }
    });
  }

  /** Where turtle group `i` of `lane` is in its dive, `t` seconds from now. */
  private turtleState(lane: Lane, i: number, t: number): 'up' | 'warn' | 'under' {
    const at = (this.elapsed + t + (lane.phases[i] ?? 0)) % TURTLE_CYCLE;
    if (at > TURTLE_CYCLE - TURTLE_DIVE) return 'under';
    return at > TURTLE_CYCLE - TURTLE_DIVE - TURTLE_WARN ? 'warn' : 'up';
  }

  /** Where a lane's thing starts on screen at `t` seconds from now. */
  private edgeAt(lane: Lane, u: number, t: number): number {
    return ((((u + lane.v * this.speedFactor * t) % LOOP) + LOOP) % LOOP) - OFF;
  }

  private lane(row: number): Lane | undefined {
    return this.lanes.find((l) => l.row === row);
  }

  /** The log or turtles the frog at `x` stands on in `row` (now), if any. */
  private logUnder(row: number, x: number): Lane | null {
    const lane = this.lane(row);
    if (!lane || (lane.kind !== 'log' && lane.kind !== 'turtle')) return null;
    return lane.us.some((u) => x >= u - OFF && x <= u - OFF + lane.w) ? lane : null;
  }

  /** Where a frog at `x` in `row` will be `t` seconds on, carried by the river. */
  private rideX(row: number, x: number, t: number): number {
    const lane = this.lane(row);
    return lane?.kind === 'log' || lane?.kind === 'turtle' ? x + lane.v * this.speedFactor * t : x;
  }

  /** Whether a frog at `x` in `row` is alive `t` seconds from now: clear of the traffic, on a log over the river, on the screen. */
  private safe(row: number, x: number, t: number): boolean {
    if (x < 2 || x > SCREEN_W - 2) return false;
    const lane = this.lane(row);
    if (!lane) return true;
    if (lane.kind === 'log') return lane.us.some((u) => {
      const left = this.edgeAt(lane, u, t);
      return x >= left && x <= left + lane.w;
    });
    if (lane.kind === 'turtle') return lane.us.some((u, i) => {
      const left = this.edgeAt(lane, u, t);
      return x >= left && x <= left + lane.w && this.turtleState(lane, i, t) !== 'under';
    });
    return lane.us.every((u) => {
      const left = this.edgeAt(lane, u, t);
      return x + FROG < left || x - FROG > left + lane.w;
    });
  }

  private paintFrog(ctx: CanvasRenderingContext2D): void {
    let x = this.frogX;
    let y = this.rowY(this.frogRow) + CELL / 2;
    let lift = 0;
    if (this.hop) {
      const k = Math.min(1, this.hop.t / HOP_SECONDS);
      x = this.hop.fromX + (this.frogX - this.hop.fromX) * k;
      y = this.rowY(this.hop.fromRow) + CELL / 2 + (this.rowY(this.frogRow) - this.rowY(this.hop.fromRow)) * k;
      lift = Math.sin(k * Math.PI) * 3;
    }
    // Its shadow stays on the ground while it leaps; the frog sits, or stretches its legs mid-hop.
    if (lift > 0.5) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(Math.round(x) - FROG + 1, Math.round(y) + FROG - 2, FROG * 2 - 2, 2);
    }
    FROG_SPRITE.drawCentred(ctx, x, y - lift, FROG_INKS, this.hop ? 1 : 0);
    // On the verge and the bank a faint cell outline shows where the next hop lands.
    if (!this.hop && (this.frogRow === 0 || this.frogRow === VERGE)) {
      ctx.strokeStyle = 'rgba(126,231,135,0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - CELL / 2 + 0.5, this.rowY(this.frogRow + 1) + 0.5, CELL - 1, CELL - 1);
    }
  }
}
