import { type ArcadeControls, SCREEN_H, SCREEN_W, drawText } from './ArcadeGame';
import { BaseGame, PLAY_TOP } from './BaseGame';

const ROUND_SECONDS = 15;
const LANES = ['left', 'down', 'up', 'right'] as const;
type Lane = (typeof LANES)[number];
const LANE_W = 44;
const LANES_X = (SCREEN_W - LANES.length * LANE_W) / 2;
const TARGET_Y = SCREEN_H - 34;
const ARROW = 14;
const PERFECT_WINDOW = 9;
const GOOD_WINDOW = 20;
const PERFECT_POINTS = 20;
const GOOD_POINTS = 8;
/** One arrow in this many is gold: hitting it pays seconds. */
const GOLD_EVERY = 7;
const GOLD_SECONDS = 2;
const GOLD_COLOR = '#ffd23a';
const START_SPEED = 150;
const SPEED_PER_LEVEL = 22;
const START_GAP = 0.55;
const GAP_PER_LEVEL = 0.045;
const MIN_GAP = 0.15;
/** Hits per level; a new level pays seconds. */
const HITS_PER_LEVEL = 10;
const LEVEL_SECONDS = 3;
/** A late arrow or a wrong press costs this; spamming the lanes loses more than it wins. */
const MISS_SECONDS = 1;
const LANE_COLORS: Record<Lane, string> = { left: '#ff7ad9', down: '#63b3ff', up: '#7ee787', right: '#ffb347' };
const GLYPH: Record<Lane, string> = { left: '<', down: 'v', up: '^', right: '>' };

interface Arrow {
  lane: Lane;
  y: number;
  gold: boolean;
}

/**
 * ARROW RUSH: fifteen seconds of falling arrows in four lanes; press the matching direction as
 * each one crosses the target line. Perfect hits pay more than good ones, every hit chains the
 * combo, a miss (a late arrow or a wrong press) breaks it and costs a second. Gold arrows pay two
 * seconds when hit.
 * Every ten hits is a level: three seconds, faster and denser arrows, rarer gold. Nothing stops a
 * run but the clock.
 */
export class ArrowRush extends BaseGame {
  readonly id = 'arrows';
  readonly title = 'ARROW RUSH';
  readonly hint = 'WASD or arrows · press the direction as the arrow hits the line';
  readonly summary = '15 SEC · HIT THE BEAT · GOLD +2S · LEVELS +3S';

  private arrows: Arrow[] = [];
  private spawnTimer = 0;
  private lastLane: Lane | null = null;
  private spawned = 0;
  private hits = 0;
  private flashLane: Partial<Record<Lane, number>> = {};

  constructor() {
    super(ROUND_SECONDS);
  }

  protected begin(): void {
    this.arrows = [];
    this.spawnTimer = 0.2;
    this.lastLane = null;
    this.spawned = 0;
    this.hits = 0;
    this.flashLane = {};
  }

  protected tick(dt: number, controls: ArcadeControls): void {
    for (const lane of LANES) this.flashLane[lane] = Math.max(0, (this.flashLane[lane] ?? 0) - dt);
    const level = this.level;
    const speed = START_SPEED + SPEED_PER_LEVEL * (level - 1);

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = Math.max(MIN_GAP, START_GAP - GAP_PER_LEVEL * (level - 1));
      let lane = LANES[Math.floor(this.rand() * LANES.length)]!;
      if (lane === this.lastLane) lane = LANES[(LANES.indexOf(lane) + 1 + Math.floor(this.rand() * 3)) % LANES.length]!;
      this.lastLane = lane;
      this.spawned += 1;
      this.arrows.push({ lane, y: PLAY_TOP - ARROW, gold: this.spawned % (GOLD_EVERY + level - 1) === 0 });
    }

    for (const a of this.arrows) a.y += speed * dt;
    const late = this.arrows.filter((a) => a.y > TARGET_Y + GOOD_WINDOW);
    if (late.length) {
      this.arrows = this.arrows.filter((a) => !late.includes(a));
      this.miss(late[0]!.lane);
    }

    for (const lane of LANES) {
      if (!this.keys.pressed(controls, lane)) continue;
      this.flashLane[lane] = 0.12;
      // The arrow in this lane nearest the line decides the judgement.
      let nearest: Arrow | null = null;
      for (const a of this.arrows) if (a.lane === lane && (!nearest || Math.abs(a.y - TARGET_Y) < Math.abs(nearest.y - TARGET_Y))) nearest = a;
      const off = nearest ? Math.abs(nearest.y - TARGET_Y) : Infinity;
      if (!nearest || off > GOOD_WINDOW) {
        this.miss(lane);
        continue;
      }
      this.arrows = this.arrows.filter((a) => a !== nearest);
      const x = this.laneX(lane) + LANE_W / 2;
      this.bumpCombo(Infinity);
      if (nearest.gold) this.addTime(GOLD_SECONDS, x, TARGET_Y - 56);
      this.hits += 1;
      if (this.hits % HITS_PER_LEVEL === 0) {
        this.fx.pop(`LEVEL ${this.level}`, SCREEN_W / 2, SCREEN_H / 2 - 20, '#ffffff', 12);
        this.addTime(LEVEL_SECONDS, SCREEN_W / 2, SCREEN_H / 2);
      }
      if (off <= PERFECT_WINDOW) {
        this.addScore(PERFECT_POINTS, x, TARGET_Y - 24, '#7ee787');
        this.fx.pop('PERFECT', x, TARGET_Y - 40, '#7ee787', 7);
      } else {
        this.addScore(GOOD_POINTS, x, TARGET_Y - 24, '#ffe066');
        this.fx.pop('GOOD', x, TARGET_Y - 40, '#ffe066', 7);
      }
      this.fx.flash(LANE_COLORS[lane], 0.04);
    }
  }

  protected paint(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#0d0a1a';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    for (const lane of LANES) {
      const x = this.laneX(lane);
      ctx.fillStyle = (this.flashLane[lane] ?? 0) > 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)';
      ctx.fillRect(x + 1, PLAY_TOP, LANE_W - 2, SCREEN_H - PLAY_TOP);
      // The target: an outlined arrow on the line.
      ctx.strokeStyle = LANE_COLORS[lane];
      ctx.lineWidth = 2;
      ctx.strokeRect(x + LANE_W / 2 - ARROW / 2 - 4, TARGET_Y - ARROW / 2 - 4, ARROW + 8, ARROW + 8);
      drawText(ctx, GLYPH[lane], x + LANE_W / 2, TARGET_Y + 1, 12, 'rgba(255,255,255,0.35)');
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(LANES_X, TARGET_Y, LANES.length * LANE_W, 1);
    this.drawStage(ctx, `LEVEL ${this.level}`);

    for (const a of this.arrows) {
      const x = this.laneX(a.lane) + LANE_W / 2;
      ctx.fillStyle = a.gold ? GOLD_COLOR : LANE_COLORS[a.lane];
      ctx.fillRect(x - ARROW / 2 - 3, a.y - ARROW / 2 - 3, ARROW + 6, ARROW + 6);
      if (a.gold) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - ARROW / 2 - 4.5, a.y - ARROW / 2 - 4.5, ARROW + 9, ARROW + 9);
      }
      drawText(ctx, GLYPH[a.lane], x, a.y + 1, 12, '#0d0a1a');
    }
  }

  /** Presses a lane as its arrow reaches the line (a lesser player a little off, now and then not at all); one frame down, one up. */
  autopilot(skill: number): ArcadeControls {
    const out = { left: false, right: false, up: false, down: false, fire: false, firePressed: false };
    for (const lane of LANES) {
      if (this.keys.isHeld(lane)) continue; // let go first, so the next press registers
      const arrow = this.arrows.find((a) => a.lane === lane && Math.abs(a.y - TARGET_Y) <= GOOD_WINDOW);
      if (!arrow) continue;
      const off = arrow.y - TARGET_Y;
      const aim = (1 - skill) * GOOD_WINDOW * 0.9;
      if (off >= -aim && Math.random() < 0.35 + skill * 0.5) out[lane] = true;
    }
    return out;
  }

  private get level(): number {
    return Math.floor(this.hits / HITS_PER_LEVEL) + 1;
  }

  private laneX(lane: Lane): number {
    return LANES_X + LANES.indexOf(lane) * LANE_W;
  }

  private miss(lane: Lane): void {
    this.breakCombo();
    this.fx.pop('MISS', this.laneX(lane) + LANE_W / 2, TARGET_Y - 24, '#ff5f5f', 8);
    this.addTime(-MISS_SECONDS, this.laneX(lane) + LANE_W / 2, TARGET_Y - 40);
    this.fx.shake(1.5, 0.1);
  }
}
