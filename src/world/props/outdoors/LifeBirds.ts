import * as THREE from 'three';
import { type Rng, azimuthOf, azimuthX, heightY } from './Sheet';
import { between } from './paint';
import type { AtlasPens, Cell, LifeEnv, LifeLayer, Push } from './sprites';

/** Pigeons wheeling over the street: how many, their size and the cell they are painted in. */
const BIRDS = 7;
const BIRD = { span: 0.7, scale: 30 };

/** One of the pigeons: its place in the flock and its own wingbeat. */
interface Bird {
  offset: [number, number, number];
  phase: number;
  rate: number;
}

/** The flock of pigeons wheeling over the corner and out over the park, by day in dry weather. */
export class Birds implements LifeLayer {
  /** Wings up, wings down. */
  private readonly cells: Cell[] = [];
  private readonly birds: Bird[] = [];
  private clock = 0;

  constructor(private readonly random: Rng) {}

  paint({ place, color }: AtlasPens): void {
    for (const pose of [0, 1]) {
      const cell = place(Math.ceil(BIRD.span * BIRD.scale) + 4, Math.ceil(BIRD.span * 0.5 * BIRD.scale) + 4);
      paintBird(color, cell, pose);
      this.cells.push(cell);
    }
  }

  populate(): void {
    const random = this.random;
    for (let i = 0; i < BIRDS; i++) {
      this.birds.push({ offset: [between(random, -4, 4), between(random, -1.5, 1.5), between(random, -4, 4)], phase: random() * Math.PI * 2, rate: between(random, 7, 10) });
    }
  }

  update(dt: number, env: LifeEnv, push: Push): void {
    const visible = (1 - env.dusk) * (1 - THREE.MathUtils.smoothstep(env.wet, 0.1, 0.35));
    this.clock += dt;
    if (visible <= 0.01) return;
    const t = this.clock * 0.11;
    // The flock's centre loops over the crossroads and out over the park, between the rooftops.
    const cx = -18 + Math.sin(t) * 30;
    const cz = 26 + Math.sin(t * 1.7) * 14;
    const ch = 22 + Math.sin(t * 0.8) * 4;
    for (const bird of this.birds) {
      const wob = this.clock * 0.6 + bird.phase;
      const x = cx + bird.offset[0] + Math.sin(wob) * 1.2;
      const z = cz + bird.offset[2] + Math.cos(wob * 0.9) * 1.2;
      const h = ch + bird.offset[1] + Math.sin(wob * 1.3) * 0.5;
      const d = Math.hypot(x, z);
      const a = azimuthOf(x, z);
      const pose = Math.sin(this.clock * bird.rate + bird.phase) > 0 ? 0 : 1;
      const cell = this.cells[pose];
      const half = (cell.w / BIRD.scale / 2) / d;
      const tall = cell.h / BIRD.scale / 2;
      push([azimuthX(a - half), heightY(h + tall, d), azimuthX(a + half), heightY(h - tall, d)], cell, d, visible);
    }
  }
}

/** A pigeon seen from below, wings up (`pose` 0) or down. */
function paintBird(ctx: CanvasRenderingContext2D, cell: Cell, pose: number): void {
  const s = BIRD.scale;
  const cx = cell.x + cell.w / 2;
  const cy = cell.y + cell.h / 2;
  const half = (BIRD.span / 2) * s;
  const lift = (pose === 0 ? -0.16 : 0.1) * s;
  ctx.strokeStyle = '#3a3c42';
  ctx.lineWidth = Math.max(1.5, 0.07 * s);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - half, cy + lift);
  ctx.quadraticCurveTo(cx - half * 0.4, cy + lift * 0.2 - 0.05 * s, cx, cy);
  ctx.quadraticCurveTo(cx + half * 0.4, cy + lift * 0.2 - 0.05 * s, cx + half, cy + lift);
  ctx.stroke();
  ctx.fillStyle = '#4a4c52';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 0.02 * s, 0.07 * s, 0.05 * s, 0, 0, Math.PI * 2);
  ctx.fill();
}
