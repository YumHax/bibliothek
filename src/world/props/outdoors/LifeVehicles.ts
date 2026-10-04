import * as THREE from 'three';
import type { Rng } from './Sheet';
import { AMBULANCE_BODY, BUS_BODY, CAR_BODY, type CarFrame, TAXI_BODY, TRUCK_BODY, VAN_BODY, type VehicleBody } from './Car';
import { resample } from './Park';
import { CYCLE_FAR, CYCLE_NEAR, LIFE_REACH, TURN_CENTRE } from './plan';
import { type AtlasPens, type Cell, type LifeEnv, type LifeLayer, type Push, glowDot, packTint, uprightBounds } from './sprites';
import { between, pick } from '@/random';

/** Every kind of vehicle on the roads, in the order the pane shader numbers them (`vehicleShader`). */
export const VEHICLE_KINDS = ['car', 'taxi', 'bus', 'truck', 'van', 'ambulance'] as const;
export type VehicleKind = (typeof VEHICLE_KINDS)[number];
/** The shader's number for a cyclist (drawn by `bikeHit`, after the vehicles' kinds). */
export const BIKE_KIND = VEHICLE_KINDS.length;

/** A vehicle or a cyclist as the pane shader draws it (`vehicleShader`): where, which way, which kind (`VEHICLE_KINDS` index or `BIKE_KIND`), its paint (packed linear) and fade. */
export interface VehiclePose {
  x: number;
  z: number;
  heading: number;
  kind: number;
  paint: number;
  alpha: number;
}

/**
 * How a kind of vehicle looks: its box model (`Car.ts`, the shapes the pane shader draws as solids),
 * its paint (the plain car's is each car's own, `Traffic`'s tints) and the livery band along its
 * flanks, heights in metres.
 */
interface VehicleLook {
  body: VehicleBody;
  color: string;
  stripe?: { from: number; to: number; color: string };
}

export const VEHICLE_LOOKS: Record<VehicleKind, VehicleLook> = {
  car: { body: CAR_BODY, color: '#ffffff' },
  taxi: { body: TAXI_BODY, color: '#e8b820', stripe: { from: 0.6, to: 0.74, color: '#1c1c1c' } },
  bus: { body: BUS_BODY, color: '#3a7a58' },
  truck: { body: TRUCK_BODY, color: '#e4e6e0', stripe: { from: 1.05, to: 1.3, color: '#2f7a3a' } },
  van: { body: VAN_BODY, color: '#e6e2d6', stripe: { from: 1.3, to: 1.75, color: '#c8342a' } },
  ambulance: { body: AMBULANCE_BODY, color: '#f2f2ee', stripe: { from: 0.78, to: 1.0, color: '#c8201e' } },
};

/** Blinking lights, pushed as small sprites of their own over a vehicle: amber (hazards, the dustcart's beacon) and blue (the ambulance). */
export type FlashColor = 'amber' | 'blue';
const FLASH_RGB: Record<FlashColor, string> = { amber: '255,160,30', blue: '60,120,255' };
/** A flash sprite: its cell size in pixels and how many metres across it is drawn. */
const FLASH_CELL = 32;
const FLASH_SIZE = 0.9;

/** The frame of a vehicle centred at (x, z) pointing along `heading` (azimuth convention: 0 is +z, +90° is +x), its near flank at v = 0. */
export function carFrameAt(x: number, z: number, heading: number, body: VehicleBody = CAR_BODY): CarFrame {
  const along: [number, number] = [Math.sin(heading), Math.cos(heading)];
  let across: [number, number] = [-along[1], along[0]];
  if (across[0] * x + across[1] * z < 0) across = [-across[0], -across[1]];
  return {
    x: x - (along[0] * body.length + across[0] * body.width) / 2,
    z: z - (along[1] * body.length + across[1] * body.width) / 2,
    along,
    across,
  };
}

/** The world point (x, z) at (u, v) in a vehicle's frame. */
function framePoint(frame: CarFrame, u: number, v: number): [number, number] {
  return [frame.x + frame.along[0] * u + frame.across[0] * v, frame.z + frame.along[1] * u + frame.across[1] * v];
}

/** Paints the two flash cells (a bright core by day, a halo on the glow canvas by night). */
export function paintFlashCells(pens: AtlasPens): Record<FlashColor, Cell> {
  const out = {} as Record<FlashColor, Cell>;
  for (const color of ['amber', 'blue'] as const) {
    const cell = pens.place(FLASH_CELL, FLASH_CELL);
    const cx = cell.x + FLASH_CELL / 2;
    const cy = cell.y + FLASH_CELL / 2;
    const g = pens.color.createRadialGradient(cx, cy, 0, cx, cy, FLASH_CELL * 0.22);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, `rgba(${FLASH_RGB[color]},1)`);
    g.addColorStop(1, `rgba(${FLASH_RGB[color]},0)`);
    pens.color.fillStyle = g;
    pens.color.fillRect(cell.x, cell.y, FLASH_CELL, FLASH_CELL);
    glowDot(pens.glow, cx, cy, FLASH_CELL / 2, FLASH_RGB[color], 1);
    out[color] = cell;
  }
  return out;
}

/** Pushes a flash at (u, v, h) of a vehicle in `frame`, sorted and hidden at its own place, a little in front of the vehicle's surface there. */
export function pushFlash(push: Push, cell: Cell, frame: CarFrame, u: number, v: number, h: number, alpha: number): void {
  const [x, z] = framePoint(frame, u, v);
  push(uprightBounds(x, z, FLASH_SIZE, h - FLASH_SIZE / 2, h + FLASH_SIZE / 2), cell, Math.hypot(x, z) - 0.3, alpha);
}

/** The flashes a vehicle shows at `time` seconds: (colour, u, v, h), none when its lights are off. */
export function flashesOf(kind: VehicleKind, time: number, hazards: boolean): [FlashColor, number, number, number][] {
  const { body } = VEHICLE_LOOKS[kind];
  const L = body.length;
  const W = body.width;
  if (kind === 'ambulance') {
    const ch = (body.cargo?.height ?? body.height) + 0.08;
    const box = body.cargo?.length ?? L;
    // Two frames, alternating corners, three times a second.
    return Math.floor(time * 6) % 2
      ? [['blue', box - 0.15, 0.15, ch], ['blue', 0.1, W - 0.15, ch]]
      : [['blue', box - 0.15, W - 0.15, ch], ['blue', 0.1, 0.15, ch]];
  }
  if (kind === 'truck') return Math.sin(time * 7) > 0.2 ? [['amber', L - 1.2, W / 2, body.height + 0.15]] : [];
  if (hazards && Math.floor(time * 2.6) % 2 === 0) return [['amber', 0.05, 0.15, 0.75], ['amber', L - 0.05, 0.15, 0.7]];
  return [];
}

/** Cyclists: their speeds. */
const BIKE_SPEED: [number, number] = [3.8, 6];
const MAX_CYCLISTS = 5;
const JERSEYS = ['#c8342a', '#2f5a9a', '#e8e2d2', '#2f2f36', '#e8c84a', '#3f8a5a'].map(packTint);
/** The two cycle routes near the kerbs (`CYCLE_NEAR` westward then south, `CYCLE_FAR` north then east) bend round the cars' turn (`TURN_CENTRE`). */
const CORNER: [number, number] = TURN_CENTRE;

/** One cyclist: the path they follow (sampled every half metre), how far along, their speed, jersey (packed), and the lateral dodge round an obstacle. */
interface Cyclist {
  path: [number, number][];
  s: number;
  speed: number;
  look: number;
  dodge: number;
}

/** A turn of radius `r` about (cx, cz) from angle a0 to a1 (degrees in the x-z plane), a point every half metre. */
export function arc(cx: number, cz: number, r: number, a0: number, a1: number): [number, number][] {
  const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * THREE.MathUtils.DEG2RAD * r) / 0.5));
  return Array.from({ length: n }, (_, i) => {
    const a = THREE.MathUtils.degToRad(a0 + ((a1 - a0) * i) / n);
    return [cx + r * Math.cos(a), cz + r * Math.sin(a)];
  });
}

/**
 * Cyclists near the kerbs: in the cycle lane under our windows and along the far parked cars,
 * more by day and in the dry, a front lamp and a red rear light after dark. They swing out round
 * whatever stands in their way (a double-parked van). Drawn by the pane shader as solids
 * (`bikeHit`), from `poses`, like the vehicles.
 */
export class Cyclists implements LifeLayer {
  /** This frame's riders, for the pane shader (`Life` copies them into its uniforms with the vehicles). */
  readonly poses: VehiclePose[] = [];
  private readonly riders: Cyclist[] = [];
  private readonly paths: [number, number][][];
  private spawnClock = 3;

  /** `obstacles` are (x, z) points to swing out round, kept up to date by whoever moves them (the traffic's double-parked van). */
  constructor(
    private readonly random: Rng,
    private readonly obstacles: readonly (readonly [number, number])[],
  ) {
    const R = CYCLE_NEAR - CORNER[1];
    const Rf = CYCLE_FAR - CORNER[1];
    this.paths = [
      [...resample([[LIFE_REACH, CYCLE_NEAR], [CORNER[0], CYCLE_NEAR]], 0.5), ...arc(CORNER[0], CORNER[1], R, 90, 180), ...resample([[CORNER[0] - R, CORNER[1]], [CORNER[0] - R, -LIFE_REACH]], 0.5)],
      [...resample([[CORNER[0] - Rf, -LIFE_REACH], [CORNER[0] - Rf, CORNER[1]]], 0.5), ...arc(CORNER[0], CORNER[1], Rf, 180, 90), ...resample([[CORNER[0], CYCLE_FAR], [LIFE_REACH, CYCLE_FAR]], 0.5)],
    ];
  }

  /** Nothing in the atlas: the riders are solids in the shader. */
  paint(_pens: AtlasPens): void {}

  /** Moves the riders on (in steps of at most 0.1 s, like the traffic; a long unseen `dt` in several) and lists them. */
  update(frameDt: number, env: LifeEnv): void {
    for (let left = Math.min(frameDt, 1); left > 1e-6; left -= 0.1) this.ride(Math.min(left, 0.1), env);
  }

  private ride(dt: number, env: LifeEnv): void {
    const daylight = 1 - env.dusk;
    const obstacles = this.obstacles;
    this.spawnClock -= dt;
    if (this.spawnClock <= 0) {
      const busy = (0.2 + 0.8 * daylight) * env.wakefulness * (1 - 0.85 * THREE.MathUtils.smoothstep(env.wet, 0.1, 0.5));
      this.spawnClock = between(this.random, 6, 22) / Math.max(busy, 0.05);
      if (busy > 0.08 && this.riders.length < MAX_CYCLISTS) {
        this.riders.push({ path: pick(this.random, this.paths), s: 0, speed: between(this.random, BIKE_SPEED[0], BIKE_SPEED[1]), look: pick(this.random, JERSEYS), dodge: 0 });
      }
    }
    this.poses.length = 0;
    for (let i = this.riders.length - 1; i >= 0; i--) {
      const r = this.riders[i]!;
      r.s += (r.speed * dt) / 0.5;
      if (r.s >= r.path.length - 1) {
        this.riders.splice(i, 1);
        continue;
      }
      // Still short of the path's last sample (above), so i0 and its neighbour are on it.
      const i0 = Math.floor(r.s);
      const t = r.s - i0;
      const [x0, z0] = r.path[i0]!;
      const [x1, z1] = r.path[Math.min(i0 + 1, r.path.length - 1)]!;
      const len = Math.hypot(x1 - x0, z1 - z0) || 1;
      const [dx, dz] = [(x1 - x0) / len, (z1 - z0) / len];
      // Swing out (to the left of the heading) while something stands in the next few metres of the path.
      const blocked = obstacles.some(([ox, oz]) => {
        for (let k = 0; k <= 16; k += 2) {
          const p = r.path[Math.min(r.path.length - 1, i0 + k)]!;
          if (Math.hypot(p[0] - ox, p[1] - oz) < 4) return true;
        }
        return false;
      });
      r.dodge += THREE.MathUtils.clamp((blocked ? 1.8 : 0) - r.dodge, -1.2 * dt, 1.2 * dt);
      const x = x0 + (x1 - x0) * t + dz * r.dodge;
      const z = z0 + (z1 - z0) * t - dx * r.dodge;
      const alpha = Math.min(1, r.s / 12, (r.path.length - 1 - r.s) / 12);
      this.poses.push({ x, z, heading: Math.atan2(dx, dz), kind: BIKE_KIND, paint: r.look, alpha });
    }
  }
}
