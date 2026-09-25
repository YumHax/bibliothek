import { type Rng, azimuthOf, azimuthX, heightY } from './Sheet';
import { between } from './paint';
import { FOUNTAIN } from './plan';
import type { LifeEvents } from './lifeEvents';
import type { AtlasPens, Cell, LifeEnv, LifeLayer, Push } from './sprites';

/** The fountain's plume, animated: its size in metres and frames. */
const SPRAY = { width: 3.6, height: 4.8, scale: 12, frames: 4 };

/**
 * The park fountain's plume, moving: frames of spray cycling over the painted one; shut off while
 * snow lies deep (`events.fountain` tells the sound).
 */
export class Fountain implements LifeLayer {
  private readonly cells: Cell[] = [];
  private clock = 0;

  constructor(
    private readonly random: Rng,
    private readonly events: LifeEvents,
  ) {}

  paint({ place, color }: AtlasPens): void {
    for (let frame = 0; frame < SPRAY.frames; frame++) {
      const cell = place(Math.ceil(SPRAY.width * SPRAY.scale), Math.ceil((SPRAY.height - 0.2) * SPRAY.scale));
      paintSpray(color, cell, frame, this.random);
      this.cells.push(cell);
    }
  }

  update(dt: number, env: LifeEnv, push: Push): void {
    const running = env.snow < 0.5;
    this.events.fountain = running;
    this.clock += dt;
    if (!running) return;
    const { x, z } = FOUNTAIN;
    const d = Math.hypot(x, z);
    const a = azimuthOf(x, z);
    const cell = this.cells[Math.floor(this.clock * 8) % SPRAY.frames];
    const half = SPRAY.width / 2 / d;
    push([azimuthX(a - half), heightY(SPRAY.height, d), azimuthX(a + half), heightY(0.2, d)], cell, d - 0.5, 0.85);
  }
}

/** One frame of the fountain's plume: droplets rising in the jet and falling back all round. */
function paintSpray(ctx: CanvasRenderingContext2D, cell: Cell, frame: number, random: Rng): void {
  const s = SPRAY.scale;
  const cx = cell.x + cell.w / 2;
  const base = cell.y + cell.h;
  for (let i = 0; i < 70; i++) {
    // Each droplet on its own arc; the frame moves it a quarter of the way along.
    const t = (random() + frame / SPRAY.frames) % 1;
    const side = random() < 0.5 ? -1 : 1;
    const reach = between(random, 0.3, 1.6);
    const x = cx + side * reach * t * s;
    const h = (SPRAY.height - 0.5) * (1 - (2 * t - 1) * (2 * t - 1)) * between(random, 0.6, 1);
    ctx.fillStyle = `rgba(255,255,255,${between(random, 0.5, 0.9)})`;
    ctx.fillRect(x, base - h * s, Math.max(1, 0.06 * s), Math.max(1, 0.12 * s));
  }
}
