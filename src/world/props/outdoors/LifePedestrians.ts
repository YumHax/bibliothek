import * as THREE from 'three';
import { type Rng, azimuthOf, azimuthX, heightY } from './Sheet';
import { between, pick } from './paint';
import { KERB, LIFE_REACH, PARK_PATHS, WALK_LINE } from './plan';
import { resample } from './Park';
import type { LifeEvents } from './lifeEvents';
import { FIGURE_MARGIN, FIGURE_SCALE, HAIRS, type Look, SHIRTS, SKINS, TROUSERS, figurePen } from './figures';
import type { AtlasPens, Cell, LifeEnv, LifeLayer, Push } from './sprites';

/** How tall a pedestrian cell reaches: room for an umbrella over the head. */
const PERSON_TOP = 2.3;
/** Pedestrian cell in the atlas: the figure (and its umbrella) plus a small margin all round. */
const PERSON_CELL = { w: 46, h: Math.ceil(PERSON_TOP * FIGURE_SCALE) + 6, margin: FIGURE_MARGIN };
const PERSON_VARIANTS = 8;
const UMBRELLAS = ['#1c1c1e', '#2a3f6a', '#8a2a2a', '#2f5a44', '#e8c84a', '#6a3a6a', '#1c1c1e', '#b8302a'];
/** A dog trotting beside its owner: its cell, a metre ahead of them. */
const DOG = { length: 0.75, height: 0.55, scale: 40, lead: 1.1 };
const DOG_COATS = ['#8a5a32', '#2a2420', '#d8c8a8', '#6a6a6a'];
/** Seconds between two barks while a dog is out (the sound reads `events.barks`). */
const BARK_EVERY: [number, number] = [14, 45];
/** The stretches of the far pavements walked (x on Front Street, z on Park Street), metres. */
const FRONT_WALK: [number, number] = [-KERB, LIFE_REACH];
const PARK_WALK: [number, number] = [-70, KERB];

/** A walker's look: their clothes and the umbrella they put up in the rain. */
interface WalkerLook extends Look {
  umbrella: string;
}

interface Walker {
  where: 'front' | 'park' | 'path';
  /** Pavement walkers: position along the street; path walkers: index into the resampled path. */
  s: number;
  dir: 1 | -1;
  speed: number;
  variant: number;
  path: [number, number][];
  /** Whether this one is still out after dark, and if so the city wakefulness below which they too go home. */
  nightOwl: boolean;
  homeAt: number;
  poseClock: number;
  /** Walks a dog; stays in when it pours (fair-weather walkers only go out when it is dry). */
  dog: number;
  hardy: boolean;
}

/**
 * People walking the far pavements and the park paths, a few with a dog trotting ahead (now and
 * then one barks: `events.barks`), umbrellas up in the rain while the fair-weather half stays in;
 * most go home at dusk, the night owls as the city falls asleep.
 */
export class Pedestrians implements LifeLayer {
  /** Per variant: without and with an umbrella, each in two poses. */
  private readonly personCells: Cell[][][] = [];
  /** Per coat: facing along +u and -u, each in two poses. */
  private readonly dogCells: Cell[][][] = [];
  private readonly walkers: Walker[] = [];
  private barkTimer = 10;
  /** Scratch: where each dog out this frame is (the first `barking` of them). */
  private readonly dogsOut: [number, number][] = [];
  private barking = 0;

  constructor(
    private readonly random: Rng,
    private readonly events: LifeEvents,
  ) {}

  paint({ place, color }: AtlasPens): void {
    for (let variant = 0; variant < PERSON_VARIANTS; variant++) {
      const look: WalkerLook = { shirt: SHIRTS[variant], trousers: pick(this.random, TROUSERS), skin: pick(this.random, SKINS), hair: pick(this.random, HAIRS), umbrella: UMBRELLAS[variant] };
      this.personCells.push(
        [false, true].map((umbrella) =>
          [0, 1].map((pose) => {
            const cell = place(PERSON_CELL.w, PERSON_CELL.h);
            paintPerson(color, cell, look, pose, umbrella);
            return cell;
          }),
        ),
      );
    }
    for (const coat of DOG_COATS) {
      this.dogCells.push(
        [1, -1].map((facing) =>
          [0, 1].map((pose) => {
            const cell = place(Math.ceil((DOG.length + 0.2) * DOG.scale), Math.ceil((DOG.height + 0.1) * DOG.scale));
            paintDog(color, cell, coat, facing, pose);
            return cell;
          }),
        ),
      );
    }
  }

  populate(): void {
    const random = this.random;
    const walker = (where: Walker['where'], s: number, path: [number, number][] = []): Walker => ({
      where,
      s,
      dir: random() < 0.5 ? 1 : -1,
      speed: between(random, 1.1, 1.6),
      variant: Math.floor(random() * PERSON_VARIANTS),
      path,
      nightOwl: random() < 0.35,
      homeAt: between(random, 0.1, 0.6),
      poseClock: random(),
      dog: random() < 0.2 ? Math.floor(random() * DOG_COATS.length) : -1,
      hardy: random() < 0.55,
    });
    for (let i = 0; i < 6; i++) this.walkers.push(walker('front', between(random, FRONT_WALK[0], FRONT_WALK[1])));
    for (let i = 0; i < 4; i++) this.walkers.push(walker('park', between(random, PARK_WALK[0], PARK_WALK[1])));
    for (const path of PARK_PATHS) {
      const pts = resample(path, 1);
      for (let i = 0; i < 2; i++) this.walkers.push(walker('path', between(random, 0, pts.length - 1), pts));
    }
  }

  update(dt: number, env: LifeEnv, push: Push): void {
    const { dusk, wakefulness, wet } = env;
    const umbrellas = env.rain > 0.15;
    this.barking = 0;
    for (const w of this.walkers) {
      let alpha = w.nightOwl ? THREE.MathUtils.smoothstep(wakefulness, w.homeAt, w.homeAt + 0.12) : 1 - dusk;
      if (!w.hardy) alpha *= 1 - THREE.MathUtils.smoothstep(wet, 0.25, 0.5);
      w.poseClock += dt;
      let x: number;
      let z: number;
      let dx: number;
      let dz: number;
      if (w.where === 'path') {
        w.s += w.dir * w.speed * dt;
        if (w.s <= 0 || w.s >= w.path.length - 1) {
          w.dir = -w.dir as 1 | -1;
          w.s = THREE.MathUtils.clamp(w.s, 0, w.path.length - 1);
        }
        const i = Math.floor(w.s);
        const t = w.s - i;
        const [x0, z0] = w.path[i];
        const [x1, z1] = w.path[Math.min(i + 1, w.path.length - 1)];
        const len = Math.hypot(x1 - x0, z1 - z0) || 1;
        x = x0 + (x1 - x0) * t;
        z = z0 + (z1 - z0) * t;
        dx = ((x1 - x0) / len) * w.dir;
        dz = ((z1 - z0) / len) * w.dir;
      } else {
        const front = w.where === 'front';
        const [from, to] = front ? FRONT_WALK : PARK_WALK;
        w.s += w.dir * w.speed * dt;
        if (w.s < from - 2 || w.s > to + 2) {
          w.dir = -w.dir as 1 | -1;
          w.variant = Math.floor(this.random() * PERSON_VARIANTS);
        }
        alpha *= Math.min(1, Math.max(0, (w.s - from) / 3), Math.max(0, (to - w.s) / 3));
        x = front ? w.s : -WALK_LINE;
        z = front ? WALK_LINE : w.s;
        dx = front ? w.dir : 0;
        dz = front ? 0 : w.dir;
      }
      this.pushWalker(push, w, x, z, alpha, umbrellas, dx, dz);
      if (w.dog >= 0 && alpha > 0.5) {
        const spot = (this.dogsOut[this.barking] ??= [0, 0]);
        spot[0] = x + dx * DOG.lead;
        spot[1] = z + dz * DOG.lead;
        this.barking++;
      }
    }
    // Now and then one of the dogs out barks.
    this.barkTimer -= dt;
    if (this.barkTimer <= 0) {
      this.barkTimer = between(this.random, BARK_EVERY[0], BARK_EVERY[1]);
      if (this.barking > 0) {
        // `pick` over the dogs out this frame.
        const [bx, bz] = this.dogsOut[Math.min(this.barking - 1, Math.floor(this.random() * this.barking))];
        this.events.bark.x = bx;
        this.events.bark.z = bz;
        this.events.barks++;
      }
    }
  }

  /** A walker at (x, z) heading along (dx, dz) (a unit vector on the ground), with their umbrella up if it rains and their dog ahead. */
  private pushWalker(push: Push, w: Walker, x: number, z: number, alpha: number, umbrella: boolean, dx: number, dz: number): void {
    const pose = Math.floor(w.poseClock / 0.32) % 2;
    const cell = this.personCells[w.variant][umbrella ? 1 : 0][pose];
    const d = Math.hypot(x, z);
    const a = azimuthOf(x, z);
    const halfWidth = ((PERSON_CELL.w / FIGURE_SCALE) * 0.5) / d;
    const margin = PERSON_CELL.margin / FIGURE_SCALE;
    push([azimuthX(a - halfWidth), heightY(PERSON_TOP + margin, d), azimuthX(a + halfWidth), heightY(-margin, d)], cell, d, alpha);
    if (w.dog < 0 || alpha <= 0.01) return;
    // The dog trots ahead, seen side on: which way it faces on screen is which way it heads across the view.
    const gx = x + dx * DOG.lead;
    const gz = z + dz * DOG.lead;
    const dd = Math.hypot(gx, gz);
    const da = azimuthOf(gx, gz);
    const across = dx * Math.cos(da) - dz * Math.sin(da); // > 0: moving towards +azimuth
    const dogCell = this.dogCells[w.dog][across >= 0 ? 0 : 1][pose];
    const half = (dogCell.w / DOG.scale / 2) / dd;
    const m = 2 / DOG.scale;
    push([azimuthX(da - half), heightY(DOG.height + m, dd), azimuthX(da + half), heightY(-m, dd)], dogCell, dd, alpha);
  }
}

/** A pedestrian seen from the front, feet at the bottom of the cell, mid-stride in `pose` 1, maybe under an umbrella. */
function paintPerson(ctx: CanvasRenderingContext2D, cell: Cell, look: WalkerLook, pose: number, umbrella = false): void {
  const { cx, foot, rect } = figurePen(ctx, cell);
  const s = FIGURE_SCALE;
  const spread = pose ? 0.17 : 0.07;
  const step = pose ? 0.06 : 0;
  rect(-spread, 0, 0.16, 0.85 - step, look.trousers);
  rect(spread, 0, 0.16, 0.85, look.trousers);
  rect(-spread, -0.02, 0.2, 0.08, '#222222');
  rect(spread, -0.02, 0.2, 0.08, '#222222');
  rect(0, 0.8, 0.44, 0.62, look.shirt);
  rect(-0.26, 0.9 - step * 2, 0.11, 0.5, look.shirt);
  rect(0.26, 0.9 + step * 2, 0.11, 0.5, look.shirt);
  rect(-0.26, 0.86 - step * 2, 0.1, 0.1, look.skin);
  rect(0.26, 0.86 + step * 2, 0.1, 0.1, look.skin);
  rect(0, 1.4, 0.12, 0.1, look.skin);
  ctx.fillStyle = look.skin;
  ctx.beginPath();
  ctx.arc(cx, foot - 1.62 * s, 0.12 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = look.hair;
  ctx.beginPath();
  ctx.arc(cx, foot - 1.64 * s, 0.125 * s, Math.PI * 1.05, Math.PI * 1.95);
  ctx.fill();
  if (!umbrella) return;
  // The umbrella, held up in the right hand: the shaft, then a shallow dome with its scalloped rim.
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(cx + 0.2 * s, foot - 2.05 * s, 0.035 * s, 0.9 * s);
  const top = foot - 2.25 * s;
  const rim = foot - 1.92 * s;
  const r = 0.55 * s;
  ctx.fillStyle = look.umbrella;
  ctx.beginPath();
  ctx.moveTo(cx - r + 0.2 * s, rim);
  ctx.quadraticCurveTo(cx + 0.2 * s, top - 0.1 * s, cx + r + 0.2 * s, rim);
  for (let i = 3; i >= 0; i--) ctx.quadraticCurveTo(cx + 0.2 * s - r + ((i + 0.5) / 4) * 2 * r, rim - 0.05 * s, cx + 0.2 * s - r + (i / 4) * 2 * r, rim);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.ellipse(cx + 0.05 * s, top + 0.1 * s, r * 0.4, 0.06 * s, -0.2, 0, Math.PI * 2);
  ctx.fill();
}

/** A dog seen side on, facing +x (`facing` 1) or -x, legs together or apart in `pose` 1. */
function paintDog(ctx: CanvasRenderingContext2D, cell: Cell, coat: string, facing: number, pose: number): void {
  const s = DOG.scale;
  const cx = cell.x + cell.w / 2;
  const foot = cell.y + cell.h - 2;
  const X = (u: number): number => cx + u * s * facing;
  ctx.fillStyle = coat;
  // Body, then the head up front and the tail up behind.
  ctx.beginPath();
  ctx.ellipse(cx, foot - 0.34 * s, 0.3 * s, 0.11 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(X(0.33), foot - 0.46 * s, 0.1 * s, 0.08 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(Math.min(X(0.38), X(0.47)), foot - 0.46 * s, 0.09 * s, 0.05 * s);
  ctx.strokeStyle = coat;
  ctx.lineWidth = 0.05 * s;
  ctx.beginPath();
  ctx.moveTo(X(-0.28), foot - 0.38 * s);
  ctx.lineTo(X(-0.4), foot - 0.52 * s);
  ctx.stroke();
  const spread = pose ? 0.06 : 0;
  for (const u of [-0.2 - spread, -0.2 + spread, 0.2 - spread, 0.2 + spread]) ctx.fillRect(X(u) - 0.025 * s, foot - 0.28 * s, 0.05 * s, 0.28 * s);
}
