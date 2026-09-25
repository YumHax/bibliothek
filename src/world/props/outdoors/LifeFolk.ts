import * as THREE from 'three';
import { type Rng, SCENE_WIDTH } from './Sheet';
import { between, pick } from './paint';
import { FRONTAGE } from './plan';
import { FLAT_IN_STREET, shopDoors } from '../../street/streetPlan';
import { SHOP_HOURS } from '../../street/shops/shopHours';
import { GROUND } from './Facades';
import type { GoodsRect } from './Shopfront';
import { type AtlasPens, type Cell, type LifeEnv, type LifeLayer, type Push, glowDot, hoursRamp, pushStanding } from './sprites';
import { FIGURE_MARGIN, FIGURE_SCALE, FOLK_SHIRTS, HAIRS, type Look, SKINS, TROUSERS, figurePen } from './figures';

/** Pixels per metre of the figures painted here (the walkers' scale), and the feet margin in their cells. */
const SCALE = FIGURE_SCALE;
const MARGIN = FIGURE_MARGIN;
/** Floor-to-floor height of Front Street's blocks (their first floor's balcony slab is at `GROUND` + 0.1). */
const FLOOR = 3.1;
/** How far out from the wall a figure on a balcony stands, and how much nearer than that it is sorted (the facade's depth is coarse). */
const BALCONY_OUT = 0.6;
const BALCONY_DEPTH_MARGIN = 0.9;
/** Where the retro games shop's door is until `setShop` says otherwise: where the walkable street has it (see `paintFrontBlock`). */
const RETRO_X = (shopDoors().find((door) => door.shop.kind === 'retro')?.at[0] ?? 3) - FLAT_IN_STREET.x;
/** Opening hours of the shop (game hours, the street's), and the morning sweep before it opens. */
const SHOP_OPEN: [number, number] = [SHOP_HOURS.retro?.open ?? 8, SHOP_HOURS.retro?.close ?? 23];
const SWEEP: [number, number] = [7.5, 9];
/** The queue: at most this many, this far apart along the pavement, this far out from the wall. */
export const MAX_QUEUE = 6;
const QUEUE_SPACING = 0.72;
const QUEUE_OUT = 0.9;

const RAILING = '#1e1f22';

/** Someone who comes out onto a balcony now and then within their hours: where, when, and for how long each time. */
interface BalconyFigure {
  kind: 'smoker' | 'waterer';
  x: number;
  floor: number;
  hours: [number, number];
  /** Out on the balcony (or in), and the seconds before that changes. */
  outside: boolean;
  stint: number;
  out: number;
  clock: number;
  variant: number;
}

/**
 * The people of Front Street's facades and the retro games shop across the street: a smoker or two
 * leaning on a balcony rail in the evening, the tip of the cigarette glowing after dark; someone
 * watering the flower box in the morning; the shopkeeper sweeping the pavement before opening; the
 * rack of games put out on the pavement while the shop is open, and the queue `setQueue` asks for.
 */
export class Folk implements LifeLayer {
  /** Per variant: seen from behind, two idle poses. */
  private readonly queueCells: Cell[][] = [];
  private readonly sweeperCells: Cell[] = [];
  /** Per variant: two poses each (the cigarette at the lips or lowered; the can tipped or level). */
  private readonly smokerCells: Cell[][] = [];
  private readonly watererCells: Cell[][] = [];
  private rackCell: Cell = { x: 0, y: 0, w: 1, h: 1 };
  private readonly balcony: BalconyFigure[];
  private readonly queue: { alpha: number; phase: number; variant: number; jitter: number }[] = [];
  private queueWanted = 0;
  private shop: [number, number] = [RETRO_X - 4, RETRO_X + 4];
  private sweeper = { x: RETRO_X, dir: 1 as 1 | -1, clock: 0 };
  private clock = 0;

  constructor(private readonly random: Rng) {
    const figure = (kind: BalconyFigure['kind'], x: number, floor: number, hours: [number, number]): BalconyFigure => ({ kind, x, floor, hours, outside: false, stint: between(random, 5, 60), out: 0, clock: random() * 10, variant: Math.floor(random() * 3) });
    this.balcony = [figure('smoker', -4.5, 2, [18.5, 23.8]), figure('smoker', 11.5, 1, [19, 1]), figure('waterer', 6.5, 3, [7, 9.5]), figure('waterer', -9.5, 1, [8, 10])];
    for (let i = 0; i < MAX_QUEUE; i++) this.queue.push({ alpha: 0, phase: random() * 10, variant: i % FOLK_SHIRTS.length, jitter: between(random, -0.15, 0.15) });
  }

  /** How many people queue at the shop door (0..`MAX_QUEUE`), during opening hours. */
  setQueue(count: number): void {
    this.queueWanted = THREE.MathUtils.clamp(Math.round(count), 0, MAX_QUEUE);
  }

  /** The shop's real extent along Front Street, from the boxes in its windows (scenery pixels). */
  setShop(goods: readonly GoodsRect[]): void {
    if (goods.length === 0) return;
    const xOf = (px: number): number => FRONTAGE * Math.tan((px / SCENE_WIDTH - 0.5) * Math.PI * 2);
    const x0 = Math.min(...goods.map((g) => xOf(g.x)));
    const x1 = Math.max(...goods.map((g) => xOf(g.x + g.w)));
    if (x1 - x0 > 1) this.shop = [x0, x1];
  }

  paint({ place, color, glow }: AtlasPens): void {
    const looks: Look[] = FOLK_SHIRTS.map((shirt) => ({ shirt, trousers: pick(this.random, TROUSERS), skin: pick(this.random, SKINS), hair: pick(this.random, HAIRS) }));
    const w = 46;
    const h = Math.ceil(2 * SCALE) + MARGIN * 2;
    for (const look of looks) {
      this.queueCells.push(
        [0, 1].map((pose) => {
          const cell = place(w, h);
          paintBack(color, cell, look, pose);
          return cell;
        }),
      );
    }
    for (let pose = 0; pose < 3; pose++) {
      const cell = place(64, h);
      paintSweeper(color, cell, pose);
      this.sweeperCells.push(cell);
    }
    // Balcony figures: from the knees up behind a stretch of railing, the balcony floor at the cell's bottom margin.
    for (let v = 0; v < 3; v++) {
      this.smokerCells.push(
        [0, 1].map((pose) => {
          const cell = place(56, h);
          paintSmoker(color, glow, cell, looks[v + 2], pose);
          return cell;
        }),
      );
      this.watererCells.push(
        [0, 1].map((pose) => {
          const cell = place(64, h);
          paintWaterer(color, cell, looks[(v + 5) % looks.length], pose);
          return cell;
        }),
      );
    }
    this.rackCell = place(Math.ceil(1.2 * SCALE), Math.ceil(1.05 * SCALE) + MARGIN * 2);
    paintRack(color, this.rackCell, this.random);
  }

  update(dt: number, env: LifeEnv, push: Push): void {
    this.clock += dt;
    const dry = 1 - THREE.MathUtils.smoothstep(env.rain, 0.2, 0.45);
    for (const f of this.balcony) {
      f.clock += dt;
      // Out for a while, back in for a while; out only when it is the hour for it.
      f.stint -= dt;
      if (f.stint <= 0) {
        f.outside = !f.outside;
        f.stint = f.outside ? between(this.random, 45, 140) : between(this.random, 40, 160);
      }
      const want = f.outside ? hoursRamp(env.hours, f.hours[0], f.hours[1], 0.2) * (f.kind === 'waterer' ? dry : 1) : 0;
      f.out += THREE.MathUtils.clamp(want - f.out, -dt, dt);
      if (f.out <= 0.01) continue;
      const z = FRONTAGE - BALCONY_OUT;
      const lift = GROUND + 0.1 + (f.floor - 1) * FLOOR;
      const pose = f.kind === 'smoker' ? (Math.sin(f.clock * 0.45) > 0.75 ? 0 : 1) : Math.sin(f.clock * 0.3) > -0.2 ? 0 : 1;
      const cell = (f.kind === 'smoker' ? this.smokerCells : this.watererCells)[f.variant][pose];
      pushStanding(push, cell, SCALE, MARGIN, f.x, z, f.out, lift, Math.hypot(f.x, z) - BALCONY_DEPTH_MARGIN);
    }

    const [x0, x1] = this.shop;
    const mid = (x0 + x1) / 2;
    // The shopkeeper, sweeping to and fro in front of the shop before it opens.
    const sweeping = hoursRamp(env.hours, SWEEP[0], SWEEP[1], 0.15) * dry;
    if (sweeping > 0.01) {
      const s = this.sweeper;
      s.clock += dt;
      s.x += s.dir * 0.35 * dt;
      if (s.x > Math.min(x1, mid + 2.5) || s.x < Math.max(x0, mid - 2.5)) s.dir = -s.dir as 1 | -1;
      const pose = [0, 1, 2, 1][Math.floor(s.clock / 0.28) % 4];
      pushStanding(push, this.sweeperCells[pose], SCALE, MARGIN, s.x, FRONTAGE - 1.5, sweeping);
    }
    // Opening hours: the rack of games out on the pavement, and whoever is queueing.
    const open = hoursRamp(env.hours, SHOP_OPEN[0], SHOP_OPEN[1], 0.1);
    if (open > 0.01) {
      const rx = x0 + 2.4;
      pushStanding(push, this.rackCell, SCALE, MARGIN, rx, FRONTAGE - 0.7, open);
    }
    this.queue.forEach((q, i) => {
      const want = i < this.queueWanted && open > 0.5 ? 1 : 0;
      q.alpha += THREE.MathUtils.clamp(want - q.alpha, -dt * 0.8, dt * 0.8);
      if (q.alpha <= 0.01) return;
      q.phase += dt;
      const x = mid + 0.4 + i * QUEUE_SPACING;
      const z = FRONTAGE - QUEUE_OUT - q.jitter;
      const pose = Math.sin(q.phase * 0.7) > 0 ? 0 : 1;
      pushStanding(push, this.queueCells[q.variant][pose], SCALE, MARGIN, x, z, q.alpha);
    });
  }
}

/** Someone standing in the queue, seen from behind (facing the shop): hair over the back of the head, weight on one leg or the other. */
function paintBack(ctx: CanvasRenderingContext2D, cell: Cell, look: Look, pose: number): void {
  const { cx, foot, rect } = figurePen(ctx, cell);
  const s = SCALE;
  const lean = pose ? 0.03 : -0.03;
  rect(-0.09, 0, 0.16, 0.85, look.trousers);
  rect(0.09, 0, 0.16, 0.85, look.trousers);
  rect(-0.09, -0.02, 0.18, 0.07, '#222222');
  rect(0.09, -0.02, 0.18, 0.07, '#222222');
  rect(lean, 0.8, 0.44, 0.62, look.shirt);
  rect(lean - 0.26, 0.9, 0.11, 0.5, look.shirt);
  // One hand in a pocket, the other hanging.
  rect(lean + 0.26, pose ? 0.95 : 0.9, 0.11, pose ? 0.45 : 0.5, look.shirt);
  rect(lean - 0.26, 0.86, 0.1, 0.1, look.skin);
  rect(lean, 1.4, 0.12, 0.1, look.skin);
  ctx.fillStyle = look.skin;
  ctx.beginPath();
  ctx.arc(cx + lean * s, foot - 1.62 * s, 0.12 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = look.hair;
  ctx.beginPath();
  ctx.arc(cx + lean * s, foot - 1.63 * s, 0.13 * s, 0, Math.PI * 2);
  ctx.fill();
}

/** The shopkeeper sweeping, seen from the front in a long grey apron, the broom swept left, upright or right (`pose` 0-2). */
function paintSweeper(ctx: CanvasRenderingContext2D, cell: Cell, pose: number): void {
  const { cx, foot, rect } = figurePen(ctx, cell);
  const s = SCALE;
  const swing = (pose - 1) * 0.28;
  // The broom first, behind the hands: a shaft from the hands down to the head on the pavement.
  const handX = cx + swing * 0.3 * s;
  const handY = foot - 1.05 * s;
  const headX = cx + (swing + 0.1) * s;
  ctx.strokeStyle = '#8a6a3a';
  ctx.lineWidth = Math.max(1.5, 0.04 * s);
  ctx.beginPath();
  ctx.moveTo(handX, handY - 0.25 * s);
  ctx.lineTo(headX, foot - 0.06 * s);
  ctx.stroke();
  ctx.fillStyle = '#3a2a1a';
  ctx.fillRect(headX - 0.2 * s, foot - 0.09 * s, 0.4 * s, 0.07 * s);
  rect(-0.08, 0, 0.16, 0.85, '#2b2f3d');
  rect(0.08, 0, 0.16, 0.85, '#2b2f3d');
  rect(-0.08, -0.02, 0.18, 0.07, '#222222');
  rect(0.08, -0.02, 0.18, 0.07, '#222222');
  rect(0, 0.8, 0.44, 0.62, '#8c4f9e');
  rect(0, 0.45, 0.42, 0.9, '#6a6a70');
  // Both arms reaching for the broom.
  rect(-0.18 + swing * 0.2, 1.0, 0.1, 0.4, '#8c4f9e');
  rect(0.18 + swing * 0.2, 1.0, 0.1, 0.4, '#8c4f9e');
  rect(swing * 0.3, 0.98, 0.14, 0.1, '#d9a071');
  rect(0, 1.4, 0.12, 0.1, '#d9a071');
  ctx.fillStyle = '#d9a071';
  ctx.beginPath();
  ctx.arc(cx, foot - 1.62 * s, 0.12 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8a8a8a';
  ctx.beginPath();
  ctx.arc(cx, foot - 1.66 * s, 0.12 * s, Math.PI * 1.05, Math.PI * 1.95);
  ctx.fill();
}

/** A stretch of balcony railing in front of whoever stands on it: top rail, bottom rail and bars. */
function paintRailing(ctx: CanvasRenderingContext2D, cell: Cell): void {
  const s = SCALE;
  const foot = cell.y + cell.h - MARGIN;
  const x0 = cell.x + 2;
  const x1 = cell.x + cell.w - 2;
  ctx.fillStyle = RAILING;
  ctx.fillRect(x0, foot - 1.0 * s, x1 - x0, Math.max(1.5, 0.05 * s));
  ctx.fillRect(x0, foot - 0.08 * s, x1 - x0, Math.max(1.5, 0.05 * s));
  for (let x = x0; x <= x1; x += 0.11 * s) ctx.fillRect(x, foot - 1.0 * s, Math.max(1, 0.025 * s), 0.95 * s);
  // The balcony slab's edge under it.
  ctx.fillStyle = '#b8b0a2';
  ctx.fillRect(x0 - 1, foot - 0.02 * s, x1 - x0 + 2, 0.12 * s);
}

/** Someone leaning on the rail with a cigarette, at the lips (`pose` 0: the tip glows brighter) or lowered. */
function paintSmoker(ctx: CanvasRenderingContext2D, glow: CanvasRenderingContext2D, cell: Cell, look: Look, pose: number): void {
  const { cx, foot, rect } = figurePen(ctx, cell);
  const s = SCALE;
  rect(-0.08, 0, 0.16, 0.85, look.trousers);
  rect(0.08, 0, 0.16, 0.85, look.trousers);
  rect(0, 0.8, 0.44, 0.62, look.shirt);
  // The left forearm along the rail; the right hand at the mouth or down by the rail.
  rect(-0.3, 0.95, 0.11, 0.45, look.shirt);
  rect(-0.33, 0.95, 0.1, 0.1, look.skin);
  let tip: [number, number];
  if (pose === 0) {
    rect(0.2, 1.15, 0.11, 0.3, look.shirt);
    rect(0.08, 1.48, 0.09, 0.09, look.skin);
    tip = [cx + 0.02 * s, foot - 1.55 * s];
  } else {
    rect(0.27, 0.92, 0.11, 0.5, look.shirt);
    rect(0.28, 0.9, 0.1, 0.1, look.skin);
    tip = [cx + 0.36 * s, foot - 0.97 * s];
  }
  rect(0, 1.4, 0.12, 0.1, look.skin);
  ctx.fillStyle = look.skin;
  ctx.beginPath();
  ctx.arc(cx, foot - 1.62 * s, 0.12 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = look.hair;
  ctx.beginPath();
  ctx.arc(cx, foot - 1.64 * s, 0.125 * s, Math.PI * 1.05, Math.PI * 1.95);
  ctx.fill();
  paintRailing(ctx, cell);
  ctx.fillStyle = '#f0e8e0';
  ctx.fillRect(tip[0] - 1, tip[1] - 0.5, 2.5, 1.2);
  ctx.fillStyle = '#ff7a2a';
  ctx.fillRect(tip[0] + 1.5, tip[1] - 0.5, 1.2, 1.2);
  glowDot(glow, tip[0] + 2, tip[1], 3.5, '255,120,40', pose === 0 ? 1 : 0.55);
}

/** Someone watering the flower box on the rail, the can tipped (`pose` 0) or level. */
function paintWaterer(ctx: CanvasRenderingContext2D, cell: Cell, look: Look, pose: number): void {
  const { cx, foot, rect } = figurePen(ctx, cell);
  const s = SCALE;
  rect(-0.08, 0, 0.16, 0.85, look.trousers);
  rect(0.08, 0, 0.16, 0.85, look.trousers);
  rect(0, 0.8, 0.44, 0.62, look.shirt);
  rect(-0.26, 0.9, 0.11, 0.5, look.shirt);
  rect(-0.26, 0.86, 0.1, 0.1, look.skin);
  // The right arm out over the rail holding the can.
  rect(0.3, 1.3, 0.26, 0.1, look.shirt);
  rect(0.45, 1.28, 0.1, 0.1, look.skin);
  rect(0, 1.4, 0.12, 0.1, look.skin);
  ctx.fillStyle = look.skin;
  ctx.beginPath();
  ctx.arc(cx, foot - 1.62 * s, 0.12 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = look.hair;
  ctx.beginPath();
  ctx.arc(cx, foot - 1.64 * s, 0.125 * s, Math.PI * 1.05, Math.PI * 1.95);
  ctx.fill();
  paintRailing(ctx, cell);
  // The flower box hung on the rail, geraniums in it.
  ctx.fillStyle = '#8a4a2a';
  ctx.fillRect(cell.x + 4, foot - 1.05 * s, cell.w - 8, 0.14 * s);
  for (let i = 0; i < 7; i++) {
    const fx = cell.x + 6 + ((cell.w - 12) * i) / 6;
    ctx.fillStyle = '#3f7a34';
    ctx.fillRect(fx - 2, foot - 1.2 * s, 4, 0.16 * s);
    ctx.fillStyle = i % 2 ? '#d9383a' : '#e0567a';
    ctx.fillRect(fx - 1.5, foot - 1.24 * s, 3, 3);
  }
  // The can: a green body, its spout tipped down towards the plants or held level.
  ctx.save();
  ctx.translate(cx + 0.52 * s, foot - 1.36 * s);
  ctx.rotate(pose === 0 ? 0.5 : 0);
  ctx.fillStyle = '#3f8a5a';
  ctx.fillRect(-0.1 * s, -0.08 * s, 0.2 * s, 0.16 * s);
  ctx.strokeStyle = '#3f8a5a';
  ctx.lineWidth = Math.max(1, 0.025 * s);
  ctx.beginPath();
  ctx.moveTo(0.1 * s, 0.02 * s);
  ctx.lineTo(0.26 * s, -0.08 * s);
  ctx.stroke();
  ctx.restore();
  if (pose === 0) {
    ctx.fillStyle = 'rgba(200,225,255,0.7)';
    for (let i = 0; i < 4; i++) ctx.fillRect(cx + (0.7 + i * 0.015) * s, foot - (1.34 - i * 0.03) * s, 1, 0.06 * s);
  }
}

/** The shop's pavement rack: a little wooden trestle with a crate of game boxes, spines in every colour, and a price card. */
function paintRack(ctx: CanvasRenderingContext2D, cell: Cell, random: Rng): void {
  const s = SCALE;
  const x0 = cell.x + 2;
  const x1 = cell.x + cell.w - 2;
  const foot = cell.y + cell.h - MARGIN;
  ctx.fillStyle = '#6a4a2a';
  for (const x of [x0 + 2, x1 - 5]) ctx.fillRect(x, foot - 0.62 * s, 3, 0.62 * s);
  ctx.fillStyle = '#8a6a42';
  ctx.fillRect(x0, foot - 0.7 * s, x1 - x0, 0.1 * s);
  ctx.fillStyle = '#b08a58';
  ctx.fillRect(x0 + 2, foot - 1.0 * s, x1 - x0 - 4, 0.3 * s);
  const colors = ['#d94f3a', '#3b6fb3', '#f0c94a', '#e8e8e8', '#6fa35e', '#8c4f9e', '#1c1c1e'];
  for (let x = x0 + 4; x < x1 - 6; x += 3) {
    ctx.fillStyle = pick(random, colors);
    ctx.fillRect(x, foot - (1.0 + between(random, 0.08, 0.14)) * s, 2.4, 0.2 * s);
  }
  ctx.fillStyle = '#f4f0e4';
  ctx.fillRect(x1 - 0.35 * s, foot - 0.62 * s, 0.3 * s, 0.2 * s);
  ctx.fillStyle = '#c0302a';
  ctx.fillRect(x1 - 0.32 * s, foot - 0.56 * s, 0.24 * s, 0.05 * s);
}
