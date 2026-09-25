import * as THREE from 'three';
import { type Rng, azimuthOf, azimuthX, heightY, sizePx } from './Sheet';
import { AMBULANCE_BODY, BUS_BODY, CAR_BODY, type CarFrame, TAXI_BODY, TRUCK_BODY, VAN_BODY, type VehicleBody, paintCar } from './Car';
import { between, pick } from './paint';
import { resample } from './Park';
import { type AtlasPens, type Cell, type LifeEnv, type Push, acrossSign, glowDot, pushStanding, uprightBounds } from './sprites';

/** How far ahead a headlight beam lights the road, in metres. */
const BEAM = 2.8;

/** Every kind of vehicle on the roads. */
export type VehicleKind = 'car' | 'taxi' | 'bus' | 'truck' | 'van' | 'ambulance';

/**
 * How a kind of vehicle is painted into the atlas: its box model, its paint (white for the plain
 * car, tinted per car by the shader; the others in their own livery), the distances its cells are
 * painted at and every how many degrees of viewing angle.
 */
export interface VehicleLook {
  body: VehicleBody;
  color: string;
  distances: number[];
  step: number;
}

/** The looks: the plain car every 10° at two distances; the rarer ones every 20° at one (the atlas has room for no more). */
export const VEHICLE_LOOKS: Record<VehicleKind, VehicleLook> = {
  car: { body: CAR_BODY, color: '#ffffff', distances: [13, 20], step: 10 },
  taxi: { body: TAXI_BODY, color: '#e8b820', distances: [16], step: 20 },
  bus: { body: BUS_BODY, color: '#3a7a58', distances: [32], step: 20 },
  truck: { body: TRUCK_BODY, color: '#e4e6e0', distances: [30], step: 20 },
  van: { body: VAN_BODY, color: '#e6e2d6', distances: [30], step: 20 },
  ambulance: { body: AMBULANCE_BODY, color: '#f2f2ee', distances: [26], step: 20 },
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
export function framePoint(frame: CarFrame, u: number, v: number): [number, number] {
  return [frame.x + frame.along[0] * u + frame.across[0] * v, frame.z + frame.along[1] * u + frame.across[1] * v];
}

/** Everything above the wheels: the cab roof, or the load box, or the taxi's sign. */
function topOf(body: VehicleBody): number {
  return Math.max(body.height + (body.roofTop ?? 0), body.cargo?.height ?? 0);
}

/**
 * Scenery-texture pixel bounds (left, top, right, bottom) of a vehicle in `frame`, with room for
 * its shadow and the headlight beam ahead. Shared by the atlas painter and the per-frame placement
 * so both agree exactly.
 */
export function carBounds(frame: CarFrame, body: VehicleBody = CAR_BODY): number[] {
  const { length: L, width: W } = body;
  const top = topOf(body);
  let left = Infinity;
  let right = -Infinity;
  let high = Infinity;
  let bottom = -Infinity;
  const corner = (u: number, v: number, h: number): void => {
    const [x, z] = framePoint(frame, u, v);
    const px = azimuthX(azimuthOf(x, z));
    const py = heightY(h, Math.hypot(x, z));
    left = Math.min(left, px);
    right = Math.max(right, px);
    high = Math.min(high, py);
    bottom = Math.max(bottom, py);
  };
  for (const u of [-0.3, L + 0.3]) for (const v of [-0.4, W + 0.5]) for (const h of [0, top]) corner(u, v, h);
  for (const v of [-0.4, W + 0.5]) corner(L + BEAM, v, 0);
  return [left - 3, high - 3, right + 3, bottom + 3];
}

/**
 * Paints one look's cells: the vehicle straight ahead at each distance, pointing every `step`
 * degrees round the compass, its livery on the colour canvas and its lights on the glow canvas.
 * Returns the cells per distance class, per angle.
 */
export function paintVehicleCells(pens: AtlasPens, kind: VehicleKind): Cell[][] {
  const { body, color, distances, step } = VEHICLE_LOOKS[kind];
  const angles = 360 / step;
  const out: Cell[][] = distances.map(() => new Array<Cell>(angles));
  // Tallest first, so the packed rows waste little.
  const requests = distances.flatMap((z, classIndex) =>
    Array.from({ length: angles }, (_, k) => {
      const frame = carFrameAt(0, z, THREE.MathUtils.degToRad(k * step), body);
      const [left, top, right, bottom] = carBounds(frame, body);
      return { z, classIndex, k, frame, left, top, w: Math.ceil(right - left), h: Math.ceil(bottom - top) };
    }),
  );
  for (const r of requests.sort((p, q) => q.h - p.h)) {
    const cell = pens.place(r.w, r.h);
    out[r.classIndex][r.k] = cell;
    const point = (x: number, zz: number, h: number): [number, number] => [azimuthX(azimuthOf(x, zz)) - r.left + cell.x, heightY(h, Math.hypot(x, zz)) - r.top + cell.y];
    const fill = (p: Path2D, style: string | CanvasGradient): void => {
      pens.color.fillStyle = style;
      pens.color.fill(p);
    };
    paintCar({ point, fill, detail: fill, wheelRadius: sizePx(body.wheel, r.z) }, r.frame, color, body);
    paintLivery(pens.color, pens.glow, point, r.frame, r.z, kind);
    paintCarLights(pens.glow, point, r.frame, r.z, body);
  }
  return out;
}

/** The cell of `cells` (painted by `paintVehicleCells`) for a vehicle `d` metres away seen at `relative` radians between its heading and the line of sight. */
export function vehicleCell(cells: Cell[][], kind: VehicleKind, relative: number, d: number): Cell {
  const { distances, step } = VEHICLE_LOOKS[kind];
  const angles = 360 / step;
  const angleIndex = Math.round(relative / THREE.MathUtils.degToRad(step)) % angles;
  let classIndex = 0;
  for (let k = 1; k < distances.length; k++) if (Math.abs(distances[k] - d) < Math.abs(distances[classIndex] - d)) classIndex = k;
  return cells[classIndex][angleIndex];
}

/** Livery over the painted box model: the taxi's chequer and roof sign, the ambulance's stripes, the van's and the dustcart's markings. */
function paintLivery(ctx: CanvasRenderingContext2D, glow: CanvasRenderingContext2D, point: (x: number, z: number, h: number) => [number, number], frame: CarFrame, distance: number, kind: VehicleKind): void {
  const { body } = VEHICLE_LOOKS[kind];
  const P = (u: number, v: number, h: number): [number, number] => {
    const [x, z] = framePoint(frame, u, v);
    return point(x, z, h);
  };
  const quad = (pts: [number, number, number][], fill: string): void => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    pts.forEach(([u, v, h], i) => {
      const [x, y] = P(u, v, h);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
  };
  /** A band along the near flank from u0 to u1 between heights h0 and h1. */
  const band = (u0: number, u1: number, h0: number, h1: number, fill: string): void => quad([[u0, 0, h0], [u1, 0, h0], [u1, 0, h1], [u0, 0, h1]], fill);
  const L = body.length;
  const W = body.width;
  if (kind === 'taxi') {
    // A black-and-white chequer along the flank, and the lit sign on the roof.
    const n = 12;
    for (let i = 0; i < n; i++) {
      const u0 = 0.3 + ((L - 0.6) * i) / n;
      const u1 = 0.3 + ((L - 0.6) * (i + 1)) / n;
      band(u0, u1, 0.6, 0.67, i % 2 ? '#111111' : '#f4f4f0');
      band(u0, u1, 0.67, 0.74, i % 2 ? '#f4f4f0' : '#111111');
    }
    const mid = (body.roof0 + body.roof1) / 2;
    const h = body.height;
    const top = h + (body.roofTop ?? 0.3);
    quad([[mid - 0.3, W / 2 - 0.35, h], [mid + 0.3, W / 2 - 0.35, h], [mid + 0.3, W / 2 - 0.35, top], [mid - 0.3, W / 2 - 0.35, top]], '#f6e9b0');
    quad([[mid - 0.3, W / 2 - 0.35, top], [mid + 0.3, W / 2 - 0.35, top], [mid + 0.3, W / 2 + 0.35, top], [mid - 0.3, W / 2 + 0.35, top]], '#fff6d0');
    const [sx, sy] = P(mid, W / 2, (h + top) / 2);
    glowDot(glow, sx, sy, Math.max(2, sizePx(0.45, distance)), '255,225,140', 0.9);
  } else if (kind === 'ambulance') {
    const box = body.cargo?.length ?? L;
    band(0.05, L - 0.1, 0.78, 1.0, '#c8201e');
    // A chequered band of yellow and green along the box, and the blue lamps on its roof corners.
    for (let i = 0; i < 10; i++) band((box * i) / 10, (box * (i + 1)) / 10, 1.25, 1.5, i % 2 ? '#2f8a3a' : '#e8d020');
    band(box * 0.45, box * 0.55, 1.75, 2.25, '#c8201e');
    band(box * 0.4, box * 0.6, 1.9, 2.1, '#c8201e');
    const ch = body.cargo?.height ?? body.height;
    for (const [u, v] of [[box - 0.15, 0.15], [box - 0.15, W - 0.15], [0.1, 0.15], [0.1, W - 0.15]] as const) {
      quad([[u - 0.12, v, ch], [u + 0.12, v, ch], [u + 0.12, v, ch + 0.12], [u - 0.12, v, ch + 0.12]], '#2a4ad0');
    }
  } else if (kind === 'van') {
    // A courier's colours: a red band along the box, a darker skirt.
    const box = body.cargo?.length ?? L;
    band(0.1, box - 0.1, 1.3, 1.75, '#c8342a');
    band(0.1, box - 0.1, 1.8, 1.88, '#c8342a');
    band(0, L, body.floor, body.floor + 0.25, '#4a4c50');
  } else if (kind === 'truck') {
    // The dustcart: a green stripe down the body, the hopper's dark mouth at the back, the beacon on the cab.
    const box = body.cargo?.length ?? L;
    band(0.2, L - 0.1, 1.05, 1.3, '#2f7a3a');
    band(0, 0.9, body.floor + 0.2, (body.cargo?.height ?? body.height) - 0.4, '#3a3c3a');
    band(box + 0.1, L - 0.2, body.floor, body.floor + 0.3, '#2a2a2a');
    const [bx, by] = P(L - 1.2, W / 2, body.height + 0.12);
    ctx.fillStyle = '#e89020';
    ctx.fillRect(bx - 2, by - 2, 4, 3);
  }
}

/** Headlights at the front, tail lights at the rear, a soft beam on the road ahead, into the glow canvas; a bus's lit board and saloon. */
function paintCarLights(glow: CanvasRenderingContext2D, point: (x: number, z: number, h: number) => [number, number], frame: CarFrame, distance: number, body: VehicleBody): void {
  const { length: CAR_LENGTH, width: CAR_WIDTH } = body;
  const at = (u: number, v: number, h: number): [number, number] => {
    const [x, z] = framePoint(frame, u, v);
    return point(x, z, h);
  };
  const lamp = (u: number, v: number, h: number, radius: number, rgb: string, strength: number): void => {
    const [x, y] = at(u, v, h);
    const r = Math.max(1.5, sizePx(radius, distance));
    const g = glow.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${strength})`);
    g.addColorStop(0.5, `rgba(${rgb},${strength * 0.4})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    glow.fillStyle = g;
    glow.fillRect(x - r, y - r, r * 2, r * 2);
  };
  glow.save();
  glow.globalCompositeOperation = 'lighter';
  lamp(CAR_LENGTH, 0.3, 0.62, 0.26, '255,240,205', 0.95);
  lamp(CAR_LENGTH, CAR_WIDTH - 0.3, 0.62, 0.22, '255,240,205', 0.7);
  lamp(0, 0.25, 0.72, 0.16, '255,45,25', 0.85);
  lamp(0, CAR_WIDTH - 0.25, 0.72, 0.14, '255,45,25', 0.65);
  if (body.pillars > 1) {
    // A bus: its lit destination board over the windscreen, and the saloon lit behind the side windows.
    lamp(CAR_LENGTH, CAR_WIDTH / 2, body.height - 0.25, 0.5, '255,170,60', 0.8);
    const saloon = new Path2D();
    const corners = [at(body.roof0, 0.05, body.body + 0.1), at(body.roof1, 0.05, body.body + 0.1), at(body.roof1, 0.05, body.height - 0.4), at(body.roof0, 0.05, body.height - 0.4)];
    corners.forEach(([x, y], i) => (i === 0 ? saloon.moveTo(x, y) : saloon.lineTo(x, y)));
    saloon.closePath();
    glow.fillStyle = 'rgba(255,236,200,0.28)';
    glow.fill(saloon);
  }
  const [bx0, by0] = at(CAR_LENGTH, CAR_WIDTH / 2, 0);
  const [bx1, by1] = at(CAR_LENGTH + BEAM, CAR_WIDTH / 2, 0);
  const bg = glow.createLinearGradient(bx0, by0, bx1, by1);
  bg.addColorStop(0, 'rgba(255,232,185,0.06)');
  bg.addColorStop(0.5, 'rgba(255,232,185,0.03)');
  bg.addColorStop(1, 'rgba(255,232,185,0)');
  glow.fillStyle = bg;
  for (const k of [1, 0.75, 0.5, 0.25]) {
    const beam = new Path2D();
    const near = ((CAR_WIDTH - 0.3) / 2) * k;
    const far = ((CAR_WIDTH + 0.6) / 2) * k;
    const reach = CAR_LENGTH + BEAM * (0.6 + 0.4 * k);
    const corners: [number, number][] = [at(CAR_LENGTH, CAR_WIDTH / 2 - near, 0), at(CAR_LENGTH, CAR_WIDTH / 2 + near, 0), at(reach, CAR_WIDTH / 2 + far, 0), at(reach, CAR_WIDTH / 2 - far, 0)];
    corners.forEach(([x, y], i) => (i === 0 ? beam.moveTo(x, y) : beam.lineTo(x, y)));
    beam.closePath();
    glow.fill(beam);
  }
  glow.restore();
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

/** Pushes a flash at (u, v, h) of a vehicle in `frame`, sorted just in front of the vehicle (at `d`). */
export function pushFlash(push: Push, cell: Cell, frame: CarFrame, u: number, v: number, h: number, d: number, alpha: number): void {
  const [x, z] = framePoint(frame, u, v);
  push(uprightBounds(x, z, FLASH_SIZE, h - FLASH_SIZE / 2, h + FLASH_SIZE / 2), cell, d - 0.4, alpha);
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

/** Cyclists: pixels per metre of their cells, the cell size in metres, and their speeds. */
const BIKE = { scale: 36, length: 1.9, height: 1.85, margin: 3 };
const BIKE_SPEED: [number, number] = [3.8, 6];
const MAX_CYCLISTS = 5;
const JERSEYS = ['#c8342a', '#2f5a9a', '#e8e2d2', '#2f2f36', '#e8c84a', '#3f8a5a'];
/** The two cycle routes near the kerbs: our side's cycle lane (westward then south) and along the far parked cars (north then east). */
const CYCLE_NEAR = 5.15;
const CYCLE_FAR = 19.6;
const CORNER: [number, number] = [-4, 4];

/** One cyclist: the path they follow (sampled every half metre), how far along, their speed, look, and the lateral dodge round an obstacle. */
interface Cyclist {
  path: [number, number][];
  s: number;
  speed: number;
  look: number;
  dodge: number;
  clock: number;
}

/** A turn of radius `r` about (cx, cz) from angle a0 to a1 (degrees in the x-z plane), a point every half metre. */
function arc(cx: number, cz: number, r: number, a0: number, a1: number): [number, number][] {
  const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * THREE.MathUtils.DEG2RAD * r) / 0.5));
  return Array.from({ length: n }, (_, i) => {
    const a = THREE.MathUtils.degToRad(a0 + ((a1 - a0) * i) / n);
    return [cx + r * Math.cos(a), cz + r * Math.sin(a)];
  });
}

/**
 * Cyclists near the kerbs: in the cycle lane under our windows and along the far parked cars,
 * more by day and in the dry, a front lamp and a red rear light after dark. They swing out round
 * whatever stands in their way (a double-parked van).
 */
export class Cyclists {
  /** Per look, per facing (+azimuth, -azimuth): two pedalling poses. */
  private readonly cells: Cell[][][] = [];
  private readonly riders: Cyclist[] = [];
  private readonly paths: [number, number][][];
  private spawnClock = 3;

  constructor(private readonly random: Rng) {
    const R = CYCLE_NEAR - CORNER[1];
    const Rf = CYCLE_FAR - CORNER[1];
    this.paths = [
      [...resample([[62, CYCLE_NEAR], [CORNER[0], CYCLE_NEAR]], 0.5), ...arc(CORNER[0], CORNER[1], R, 90, 180), ...resample([[-CYCLE_NEAR, CORNER[1]], [-CYCLE_NEAR, -62]], 0.5)],
      [...resample([[-CYCLE_FAR, -62], [-CYCLE_FAR, CORNER[1]]], 0.5), ...arc(CORNER[0], CORNER[1], Rf, 180, 90), ...resample([[CORNER[0], CYCLE_FAR], [62, CYCLE_FAR]], 0.5)],
    ];
  }

  paint(pens: AtlasPens): void {
    for (let look = 0; look < 3; look++) {
      this.cells.push(
        [1, -1].map((facing) =>
          [0, 1].map((pose) => {
            const cell = pens.place(Math.ceil(BIKE.length * BIKE.scale) + 4, Math.ceil(BIKE.height * BIKE.scale) + BIKE.margin * 2);
            paintCyclist(pens.color, pens.glow, cell, JERSEYS[look * 2], facing, pose);
            return cell;
          }),
        ),
      );
    }
  }

  /** Moves the riders on and pushes them; `obstacles` are (x, z) points to swing out round. */
  update(dt: number, env: LifeEnv, daylight: number, push: Push, obstacles: readonly [number, number][]): void {
    this.spawnClock -= dt;
    if (this.spawnClock <= 0) {
      const busy = (0.2 + 0.8 * daylight) * env.wakefulness * (1 - 0.85 * THREE.MathUtils.smoothstep(env.wet, 0.1, 0.5));
      this.spawnClock = between(this.random, 6, 22) / Math.max(busy, 0.05);
      if (busy > 0.08 && this.riders.length < MAX_CYCLISTS) {
        this.riders.push({ path: pick(this.random, this.paths), s: 0, speed: between(this.random, BIKE_SPEED[0], BIKE_SPEED[1]), look: Math.floor(this.random() * this.cells.length), dodge: 0, clock: this.random() });
      }
    }
    for (let i = this.riders.length - 1; i >= 0; i--) {
      const r = this.riders[i];
      r.s += (r.speed * dt) / 0.5;
      r.clock += dt;
      if (r.s >= r.path.length - 1) {
        this.riders.splice(i, 1);
        continue;
      }
      const i0 = Math.floor(r.s);
      const t = r.s - i0;
      const [x0, z0] = r.path[i0];
      const [x1, z1] = r.path[Math.min(i0 + 1, r.path.length - 1)];
      const len = Math.hypot(x1 - x0, z1 - z0) || 1;
      const [dx, dz] = [(x1 - x0) / len, (z1 - z0) / len];
      // Swing out (to the left of the heading) while something stands in the next few metres of the path.
      const blocked = obstacles.some(([ox, oz]) => {
        for (let k = 0; k <= 16; k += 2) {
          const p = r.path[Math.min(r.path.length - 1, i0 + k)];
          if (Math.hypot(p[0] - ox, p[1] - oz) < 4) return true;
        }
        return false;
      });
      r.dodge += THREE.MathUtils.clamp((blocked ? 1.8 : 0) - r.dodge, -1.2 * dt, 1.2 * dt);
      const x = x0 + (x1 - x0) * t + dz * r.dodge;
      const z = z0 + (z1 - z0) * t - dx * r.dodge;
      const alpha = Math.min(1, r.s / 12, (r.path.length - 1 - r.s) / 12);
      const facing = acrossSign(x, z, dx, dz) > 0 ? 0 : 1;
      const pose = Math.floor(r.clock * r.speed * 0.9) % 2;
      pushStanding(push, this.cells[r.look][facing][pose], BIKE.scale, BIKE.margin, x, z, alpha);
    }
  }
}

/** A cyclist seen side on, facing +x (`facing` 1) or -x, pedals level or vertical (`pose`); a white lamp on the bars and a red one under the saddle for the night. */
function paintCyclist(ctx: CanvasRenderingContext2D, glow: CanvasRenderingContext2D, cell: Cell, jersey: string, facing: number, pose: number): void {
  const s = BIKE.scale;
  const cx = cell.x + cell.w / 2;
  const foot = cell.y + cell.h - BIKE.margin;
  const X = (u: number): number => cx + u * s * facing;
  const Y = (h: number): number => foot - h * s;
  const wheelR = 0.34;
  ctx.lineCap = 'round';
  // Wheels, then the frame between them.
  ctx.strokeStyle = '#1a1a1c';
  ctx.lineWidth = Math.max(1.5, 0.05 * s);
  for (const u of [-0.52, 0.52]) {
    ctx.beginPath();
    ctx.arc(X(u), Y(wheelR), wheelR * s, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = '#6a7a8a';
  ctx.lineWidth = Math.max(1.2, 0.035 * s);
  ctx.beginPath();
  ctx.moveTo(X(-0.52), Y(wheelR));
  ctx.lineTo(X(-0.05), Y(wheelR));
  ctx.lineTo(X(-0.15), Y(0.85));
  ctx.lineTo(X(0.4), Y(0.85));
  ctx.lineTo(X(0.52), Y(wheelR));
  ctx.moveTo(X(-0.05), Y(wheelR));
  ctx.lineTo(X(0.4), Y(0.85));
  ctx.lineTo(X(0.36), Y(1.02));
  ctx.moveTo(X(-0.15), Y(0.85));
  ctx.lineTo(X(-0.18), Y(0.93));
  ctx.stroke();
  // The rider: legs to the pedals, back leaning to the bars, head up.
  const [p0, p1] = pose ? [[-0.05, 0.5], [-0.05, 0.18]] : [[0.1, 0.34], [-0.2, 0.34]];
  ctx.strokeStyle = '#2b2f3d';
  ctx.lineWidth = Math.max(1.5, 0.09 * s);
  for (const [pu, ph] of [p0, p1]) {
    ctx.beginPath();
    ctx.moveTo(X(-0.16), Y(0.98));
    ctx.lineTo(X((pu - 0.16) / 2 + 0.12), Y((ph + 0.98) / 2 + 0.08));
    ctx.lineTo(X(pu), Y(ph));
    ctx.stroke();
  }
  ctx.strokeStyle = jersey;
  ctx.lineWidth = Math.max(2, 0.2 * s);
  ctx.beginPath();
  ctx.moveTo(X(-0.14), Y(1.02));
  ctx.lineTo(X(0.12), Y(1.42));
  ctx.stroke();
  ctx.lineWidth = Math.max(1.2, 0.07 * s);
  ctx.beginPath();
  ctx.moveTo(X(0.1), Y(1.38));
  ctx.lineTo(X(0.34), Y(1.05));
  ctx.stroke();
  ctx.fillStyle = '#e0b090';
  ctx.beginPath();
  ctx.arc(X(0.2), Y(1.58), 0.1 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a2a2a';
  ctx.beginPath();
  ctx.arc(X(0.19), Y(1.61), 0.11 * s, Math.PI, Math.PI * 2);
  ctx.fill();
  glowDot(glow, X(0.42), Y(0.95), Math.max(2, 0.3 * s), '255,245,215', 0.95);
  glowDot(glow, X(-0.5), Y(0.8), Math.max(2, 0.18 * s), '255,40,25', 0.8);
}
