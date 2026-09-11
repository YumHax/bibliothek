import * as THREE from 'three';
import { createCanvas } from '@/covers/generated/canvasUtils';
import { type Rng, SCENE_HEIGHT, SCENE_WIDTH, azimuthOf, azimuthX, heightY, sizePx } from './Sheet';
import { CAR_COLORS, CAR_HEIGHT, CAR_LENGTH, CAR_WIDTH, type CarFrame, paintCar } from './Car';
import { between, pick } from './paint';
import { KERB } from './plan';
import { PATHS, resample } from './Park';

/** How many moving things the pane shader looks up per pixel; the arrays below have this many slots. */
export const SPRITE_COUNT = 32;
/** Atlas size: 72 car cells (the nearest ones up to ~500 px wide with their beam) plus the pedestrians; the glow copy is at half size. */
const ATLAS_W = 2048;
const ATLAS_H = 2048;
const GLOW_SCALE = 0.5;
/**
 * Traffic lanes, metres from the eye. Both streets end at the corner (the block across Front
 * Street fills the quadrant beyond it, the park the one to the left), so the road simply bends
 * there. Right-hand traffic (facing +z, right is -x): cars coming west along Front Street are on
 * its near lane and turn right, down Park Street's near lane; cars coming north up Park Street's
 * far lane turn left, east along Front Street's far lane.
 */
const NEAR_LANE = 11;
const FAR_LANE = 16.5;
/** Our own kerb: the bend's arcs are centred on the corner of the two near pavements. */
const BOX_NEAR = 4;
const BOX_FAR = KERB;
/** Where the streets are simulated to: far enough for cars to be tiny when they appear or leave. */
const FRONT_END = 62;
const PARK_SOUTH = -62;
/** Where pedestrians walk: the far pavement, just past the kerb. */
const PAVEMENT = KERB + 1.6;
/** How far ahead a headlight beam lights the road, in metres. */
const BEAM = 2.8;
/** Sprite cells are painted every this many degrees of viewing angle, at these distances. */
const ANGLE_STEP = 10;
const ANGLE_CELLS = 360 / ANGLE_STEP;
const DISTANCE_CLASSES = [13, 20];
const MAX_CARS = 12;
const CRUISE: [number, number] = [6, 9];
const TURN_SPEED = 4;
/** Braking deceleration (m/s²) and the distance kept to the car ahead. */
const BRAKING = 3;
const GAP = 6.5;
const PERSON_HEIGHT = 1.75;
/** Pedestrian cell in the atlas: 72 px for the 1.75 m figure plus a small margin all round. */
const PERSON_CELL = { w: 32, h: 72, margin: 3 };
const PERSON_SCALE = (PERSON_CELL.h - 2 * PERSON_CELL.margin) / PERSON_HEIGHT;
const PERSON_VARIANTS = 8;
const SHIRTS = ['#d94f3a', '#3b6fb3', '#e8e2d2', '#2f2f36', '#6fa35e', '#f0c94a', '#8c4f9e', '#c9c9c9'];
const TROUSERS = ['#2b2f3d', '#1c1c1e', '#4b5563', '#6b5a48'];
const SKINS = ['#f1c9a5', '#d9a071', '#8d5a3b', '#f7d9c0', '#5b3a25'];
const HAIRS = ['#2a1f14', '#5a3a1a', '#c9a34a', '#111111', '#8a8a8a'];
const WHITE_TINT = 0xffffff;

/** A rectangle of the atlas in pixels. */
interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A way through the neighbourhood, sampled every half metre: where the car is and which way it points. */
interface Route {
  points: [number, number][];
  headings: number[];
  /** Metres per sample. */
  step: number;
  /** Speed limit per sample (slow through the turn). */
  limits: number[];
  /** Mean seconds between two cars setting off on it. */
  interval: number;
  nextSpawn: number;
}

interface MovingCar {
  route: Route;
  /** Sample index along the route (fractional). */
  s: number;
  /** Current speed and the speed this driver likes, m/s. */
  speed: number;
  cruise: number;
  tint: number;
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
}

interface Slot {
  d: number;
  rect: number[];
  cell: number[];
  alpha: number;
  lod: number;
  tint: number;
}

/**
 * The life outside: traffic through the crossroads and people walking the pavements and the park
 * paths. Each is a sprite the pane shader draws over the scenery: a rectangle in the panorama's
 * band space textured from a small atlas painted here once, hidden wherever the scenery is nearer,
 * dimmed by night and distance like everything else, with headlights and tail lights after dark.
 *
 * Cars follow the road round the corner, one route per direction, both beginning and ending far
 * out of sight, and keep their distance in a queue. The atlas holds the car (in white, tinted per
 * car by the shader) seen from every 10° of viewing angle at two distances, so a car turning or
 * seen down the street shows the right faces. `update()` moves everything and refreshes the
 * uniform arrays the shader reads.
 */
export class Life {
  readonly atlas: THREE.CanvasTexture;
  readonly glow: THREE.CanvasTexture;
  /** Per sprite: band-space rectangle (u0, v0, u1, v1), atlas rectangle (u0, v0, u1, v1), (alpha, distance, lod, packed tint). */
  readonly rects = new Float32Array(SPRITE_COUNT * 4);
  readonly cells = new Float32Array(SPRITE_COUNT * 4);
  readonly info = new Float32Array(SPRITE_COUNT * 4);

  private readonly carCells: Cell[][] = [];
  private readonly personCells: Cell[][] = [];
  private readonly routes: Route[];
  private readonly cars: MovingCar[] = [];
  private readonly walkers: Walker[] = [];
  private readonly slots: Slot[] = [];
  private readonly tints = CAR_COLORS.map(packTint);

  constructor(private readonly random: Rng) {
    const [colorCanvas, color] = createCanvas(ATLAS_W, ATLAS_H);
    const [glowCanvas, glow] = createCanvas(ATLAS_W * GLOW_SCALE, ATLAS_H * GLOW_SCALE);
    // Opaque black under additive light: on a transparent canvas the faint beam would be un-premultiplied
    // to full white at upload.
    glow.fillStyle = '#000000';
    glow.fillRect(0, 0, glowCanvas.width, glowCanvas.height);
    glow.scale(GLOW_SCALE, GLOW_SCALE);
    this.paintAtlas(color, glow);
    this.atlas = new THREE.CanvasTexture(colorCanvas);
    this.atlas.colorSpace = THREE.SRGBColorSpace;
    this.atlas.premultiplyAlpha = true;
    this.glow = new THREE.CanvasTexture(glowCanvas);
    this.glow.colorSpace = THREE.NoColorSpace;

    this.routes = buildRoutes();
    for (const route of this.routes) route.nextSpawn = between(random, 0, route.interval);
    // Start with traffic already on the roads.
    for (let i = 0; i < 8; i++) {
      const route = pick(random, this.routes);
      const cruise = between(random, CRUISE[0], CRUISE[1]);
      this.cars.push({ route, s: between(random, 0, route.points.length * 0.6), speed: cruise, cruise, tint: pick(random, this.tints) });
    }

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
    });
    for (let i = 0; i < 6; i++) this.walkers.push(walker('front', between(random, -BOX_FAR, FRONT_END)));
    for (let i = 0; i < 4; i++) this.walkers.push(walker('park', between(random, -70, BOX_FAR)));
    for (const path of PATHS) {
      const pts = resample(path, 1);
      for (let i = 0; i < 2; i++) this.walkers.push(walker('path', between(random, 0, pts.length - 1), pts));
    }
  }

  /**
   * Moves everything `dt` seconds on and rewrites the sprite arrays. `nightness` sends most walkers
   * home at dusk; `wakefulness` (0..1, see `wakefulnessAt`) sends the night owls home too as the
   * city falls asleep and spaces the cars out: at 0.1 a car sets off ten times less often.
   */
  update(dt: number, nightness: number, wakefulness = 1): void {
    this.slots.length = 0;
    this.driveCars(Math.min(dt, 0.1), wakefulness);
    for (const car of this.cars) this.pushCar(car);

    const dusk = THREE.MathUtils.smoothstep(nightness, 0.3, 0.7);
    for (const w of this.walkers) {
      const alpha = w.nightOwl ? THREE.MathUtils.smoothstep(wakefulness, w.homeAt, w.homeAt + 0.12) : 1 - dusk;
      w.poseClock += dt;
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
        this.pushWalker(w, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, alpha);
        continue;
      }
      const [from, to] = w.where === 'front' ? [-BOX_FAR, FRONT_END] : [-70, BOX_FAR];
      w.s += w.dir * w.speed * dt;
      if (w.s < from - 2 || w.s > to + 2) {
        w.dir = -w.dir as 1 | -1;
        w.variant = Math.floor(this.random() * PERSON_VARIANTS);
      }
      const fade = Math.min(1, Math.max(0, (w.s - from) / 3), Math.max(0, (to - w.s) / 3));
      const [x, z] = w.where === 'front' ? [w.s, PAVEMENT] : [-PAVEMENT, w.s];
      this.pushWalker(w, x, z, alpha * fade);
    }

    // Far to near, so nearer sprites are composited over farther ones.
    this.slots.sort((p, q) => q.d - p.d);
    for (let i = 0; i < SPRITE_COUNT; i++) {
      const slot = this.slots[i];
      this.info[i * 4] = slot ? slot.alpha : 0;
      if (!slot) continue;
      this.rects.set(slot.rect, i * 4);
      this.cells.set(slot.cell, i * 4);
      this.info[i * 4 + 1] = slot.d;
      this.info[i * 4 + 2] = slot.lod;
      this.info[i * 4 + 3] = slot.tint;
    }
  }

  /** Cars set off (fewer the sleepier the city), brake for the car ahead, take the corner slowly, and leave at the far end. */
  private driveCars(dt: number, wakefulness: number): void {
    for (const route of this.routes) {
      route.nextSpawn -= dt;
      if (route.nextSpawn > 0 || this.cars.length >= MAX_CARS) continue;
      route.nextSpawn = between(this.random, route.interval * 0.5, route.interval * 1.5) / Math.max(wakefulness, 0.05);
      const blocked = this.cars.some((c) => c.route === route && c.s * route.step < GAP + 2);
      if (blocked) continue;
      const cruise = between(this.random, CRUISE[0], CRUISE[1]);
      this.cars.push({ route, s: 0, speed: cruise * 0.6, cruise, tint: pick(this.random, this.tints) });
    }
    for (const car of this.cars) {
      const { route } = car;
      // Nearest car ahead on the same route.
      let ahead = Infinity;
      for (const other of this.cars) {
        const gap = (other.s - car.s) * route.step;
        if (other !== car && other.route === route && gap > 0 && gap < ahead) ahead = gap;
      }
      let target = Math.min(car.cruise, route.limits[Math.min(route.limits.length - 1, Math.floor(car.s))]);
      if (ahead < Infinity) target = Math.min(target, Math.sqrt(Math.max(0, 2 * BRAKING * (ahead - GAP))));
      car.speed += THREE.MathUtils.clamp(target - car.speed, -2 * BRAKING * dt, 2.5 * dt);
      car.s += (Math.max(0, car.speed) * dt) / route.step;
    }
    for (let i = this.cars.length - 1; i >= 0; i--) if (this.cars[i].s >= this.cars[i].route.points.length - 1) this.cars.splice(i, 1);
  }

  private pushCar(car: MovingCar): void {
    const { route } = car;
    // Interpolated between samples: half-metre steps would be seen as a stutter.
    const i0 = Math.min(route.points.length - 1, Math.floor(car.s));
    const i1 = Math.min(route.points.length - 1, i0 + 1);
    const t = car.s - i0;
    const x = THREE.MathUtils.lerp(route.points[i0][0], route.points[i1][0], t);
    const z = THREE.MathUtils.lerp(route.points[i0][1], route.points[i1][1], t);
    const h0 = route.headings[i0];
    const h1 = route.headings[i1];
    const heading = Math.atan2(THREE.MathUtils.lerp(Math.sin(h0), Math.sin(h1), t), THREE.MathUtils.lerp(Math.cos(h0), Math.cos(h1), t));
    const d = Math.hypot(x, z);
    const frame = carFrameAt(x, z, heading);
    const relative = THREE.MathUtils.euclideanModulo(heading - azimuthOf(x, z), Math.PI * 2);
    const angleIndex = Math.round(relative / THREE.MathUtils.degToRad(ANGLE_STEP)) % ANGLE_CELLS;
    let classIndex = 0;
    for (let k = 1; k < DISTANCE_CLASSES.length; k++) if (Math.abs(DISTANCE_CLASSES[k] - d) < Math.abs(DISTANCE_CLASSES[classIndex] - d)) classIndex = k;
    const cell = this.carCells[classIndex][angleIndex];
    // Fade over the first and last metres of the route (only the far end of Front Street is ever in view).
    const along = car.s * route.step;
    const left = (route.points.length - 1 - car.s) * route.step;
    this.push(carBounds(frame), cell, d, Math.min(1, along / 8, left / 8), car.tint);
  }

  private pushWalker(w: Walker, x: number, z: number, alpha: number): void {
    const pose = Math.floor(w.poseClock / 0.32) % 2;
    const cell = this.personCells[w.variant][pose];
    const d = Math.hypot(x, z);
    const a = azimuthOf(x, z);
    const halfWidth = ((PERSON_CELL.w / PERSON_SCALE) * 0.5) / d;
    const margin = PERSON_CELL.margin / PERSON_SCALE;
    this.push([azimuthX(a - halfWidth), heightY(PERSON_HEIGHT + margin, d), azimuthX(a + halfWidth), heightY(-margin, d)], cell, d, alpha, WHITE_TINT);
  }

  /** Queues a sprite: `bounds` are scenery-texture pixels (left, top, right, bottom). */
  private push(bounds: number[], cell: Cell, d: number, alpha: number, tint: number): void {
    if (this.slots.length >= SPRITE_COUNT || alpha <= 0.01) return;
    const [left, top, right, bottom] = bounds;
    const lod = Math.max(0, Math.log2(cell.h / Math.max(1, bottom - top)));
    this.slots.push({
      d,
      alpha,
      lod,
      tint,
      rect: [left / SCENE_WIDTH, 1 - bottom / SCENE_HEIGHT, right / SCENE_WIDTH, 1 - top / SCENE_HEIGHT],
      cell: [cell.x / ATLAS_W, 1 - (cell.y + cell.h) / ATLAS_H, (cell.x + cell.w) / ATLAS_W, 1 - cell.y / ATLAS_H],
    });
  }

  /**
   * The atlas: a white car seen straight ahead at each distance class, pointing every 15° round
   * the compass (the shader stretches the nearest cell to wherever the car is and tints it);
   * pedestrians in two walking poses. Lights (headlights, tail lights, the beam on the road) go
   * to the glow canvas.
   */
  private paintAtlas(color: CanvasRenderingContext2D, glow: CanvasRenderingContext2D): void {
    let penX = 0;
    let penY = 0;
    let rowH = 0;
    const place = (w: number, h: number): Cell => {
      if (penX + w > ATLAS_W) {
        penX = 0;
        penY += rowH;
        rowH = 0;
      }
      const cell = { x: penX, y: penY, w, h };
      penX += w;
      rowH = Math.max(rowH, h);
      return cell;
    };

    // Every car cell's frame and size first, tallest placed first so the rows waste little.
    const requests = DISTANCE_CLASSES.flatMap((z, classIndex) =>
      Array.from({ length: ANGLE_CELLS }, (_, k) => {
        const frame = carFrameAt(0, z, THREE.MathUtils.degToRad(k * ANGLE_STEP));
        const [left, top, right, bottom] = carBounds(frame);
        return { z, classIndex, k, frame, left, top, w: Math.ceil(right - left), h: Math.ceil(bottom - top) };
      }),
    );
    for (let i = 0; i < DISTANCE_CLASSES.length; i++) this.carCells.push(new Array<Cell>(ANGLE_CELLS).fill({ x: 0, y: 0, w: 1, h: 1 }));
    for (const r of [...requests].sort((p, q) => q.h - p.h)) {
      const cell = place(r.w, r.h);
      this.carCells[r.classIndex][r.k] = cell;
      const point = (x: number, zz: number, h: number): [number, number] => [azimuthX(azimuthOf(x, zz)) - r.left + cell.x, heightY(h, Math.hypot(x, zz)) - r.top + cell.y];
      const fill = (p: Path2D, style: string | CanvasGradient): void => {
        color.fillStyle = style;
        color.fill(p);
      };
      paintCar({ point, fill, detail: fill, wheelRadius: sizePx(0.33, r.z) }, r.frame, '#ffffff');
      paintCarLights(glow, point, r.frame, r.z);
    }

    for (let variant = 0; variant < PERSON_VARIANTS; variant++) {
      const look = { shirt: SHIRTS[variant], trousers: pick(this.random, TROUSERS), skin: pick(this.random, SKINS), hair: pick(this.random, HAIRS) };
      this.personCells.push(
        [0, 1].map((pose) => {
          const cell = place(PERSON_CELL.w, PERSON_CELL.h);
          paintPerson(color, cell, look, pose);
          return cell;
        }),
      );
    }
    if (penY + rowH > ATLAS_H) console.warn('[outdoors] sprite atlas overflow');
  }
}

/** A car's colour in linear light, packed into one float (r << 16 | g << 8 | b) for the shader. */
function packTint(hex: string): number {
  const c = new THREE.Color(hex);
  return (Math.round(c.r * 255) << 16) | (Math.round(c.g * 255) << 8) | Math.round(c.b * 255);
}

/** The frame of a car centred at (x, z) pointing along `heading` (azimuth convention: 0 is +z, +90° is +x), its near flank at v = 0. */
export function carFrameAt(x: number, z: number, heading: number): CarFrame {
  const along: [number, number] = [Math.sin(heading), Math.cos(heading)];
  let across: [number, number] = [-along[1], along[0]];
  if (across[0] * x + across[1] * z < 0) across = [-across[0], -across[1]];
  return {
    x: x - (along[0] * CAR_LENGTH + across[0] * CAR_WIDTH) / 2,
    z: z - (along[1] * CAR_LENGTH + across[1] * CAR_WIDTH) / 2,
    along,
    across,
  };
}

/**
 * Scenery-texture pixel bounds (left, top, right, bottom) of a car in `frame`, with room for its
 * shadow and the headlight beam ahead. Shared by the atlas painter and the per-frame placement so
 * both agree exactly.
 */
export function carBounds(frame: CarFrame): number[] {
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  const corner = (u: number, v: number, h: number): void => {
    const x = frame.x + frame.along[0] * u + frame.across[0] * v;
    const z = frame.z + frame.along[1] * u + frame.across[1] * v;
    const px = azimuthX(azimuthOf(x, z));
    const py = heightY(h, Math.hypot(x, z));
    left = Math.min(left, px);
    right = Math.max(right, px);
    top = Math.min(top, py);
    bottom = Math.max(bottom, py);
  };
  for (const u of [-0.3, CAR_LENGTH + 0.3]) for (const v of [-0.4, CAR_WIDTH + 0.5]) for (const h of [0, CAR_HEIGHT]) corner(u, v, h);
  for (const v of [-0.4, CAR_WIDTH + 0.5]) corner(CAR_LENGTH + BEAM, v, 0);
  return [left - 3, top - 3, right + 3, bottom + 3];
}

/** Headlights at the front, tail lights at the rear, a soft beam on the road ahead, into the glow canvas. */
function paintCarLights(glow: CanvasRenderingContext2D, point: (x: number, z: number, h: number) => [number, number], frame: CarFrame, distance: number): void {
  const at = (u: number, v: number, h: number): [number, number] => point(frame.x + frame.along[0] * u + frame.across[0] * v, frame.z + frame.along[1] * u + frame.across[1] * v, h);
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

/**
 * The two ways round the corner (right-hand traffic; both streets end there): west along Front
 * Street's near lane then right, down Park Street's near lane; north up Park Street's far lane
 * then left, east along Front Street's far lane. Concentric arcs about the corner of our own
 * pavements, so the two directions never cross. Both routes start and end far out of sight.
 */
function buildRoutes(): Route[] {
  const step = 0.5;
  const line = (from: [number, number], to: [number, number]): [number, number][] => resample([from, to], step);
  /** Turn of radius `r` about (cx, cz) from angle a0 to a1 (degrees, in the x–z plane). */
  const arc = (cx: number, cz: number, r: number, a0: number, a1: number): [number, number][] => {
    const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * THREE.MathUtils.DEG2RAD * r) / step));
    return Array.from({ length: n }, (_, i) => {
      const a = THREE.MathUtils.degToRad(a0 + ((a1 - a0) * i) / n);
      return [cx + r * Math.cos(a), cz + r * Math.sin(a)];
    });
  };
  const make = (parts: [number, number][][], interval: number): Route => {
    const points = parts.flat();
    const headings = points.map((_, i) => {
      const q = points[Math.min(i + 1, points.length - 1)];
      const o = points[Math.max(i - 1, 0)];
      return Math.atan2(q[0] - o[0], q[1] - o[1]);
    });
    // Slow through the turn: wherever the heading is changing.
    const limits = headings.map((h, i) => {
      const turning = Math.abs(THREE.MathUtils.euclideanModulo(h - headings[Math.max(0, i - 4)] + Math.PI, Math.PI * 2) - Math.PI) > 0.02;
      return turning ? TURN_SPEED : CRUISE[1];
    });
    return { points, headings, step, limits, interval, nextSpawn: 0 };
  };
  const corner: [number, number] = [-BOX_NEAR, BOX_NEAR];
  const inner = NEAR_LANE - BOX_NEAR;
  const outer = FAR_LANE - BOX_NEAR;
  return [
    make([line([FRONT_END, NEAR_LANE], [-BOX_NEAR, NEAR_LANE]), arc(corner[0], corner[1], inner, 90, 180), line([-NEAR_LANE, BOX_NEAR], [-NEAR_LANE, PARK_SOUTH])], 9),
    make([line([-FAR_LANE, PARK_SOUTH], [-FAR_LANE, BOX_NEAR]), arc(corner[0], corner[1], outer, 180, 90), line([-BOX_NEAR, FAR_LANE], [FRONT_END, FAR_LANE])], 9),
  ];
}

interface Look {
  shirt: string;
  trousers: string;
  skin: string;
  hair: string;
}

/** A pedestrian seen from the front, feet at the bottom of the cell, mid-stride in `pose` 1. */
function paintPerson(ctx: CanvasRenderingContext2D, cell: Cell, look: Look, pose: number): void {
  const s = PERSON_SCALE;
  const cx = cell.x + cell.w / 2;
  const foot = cell.y + cell.h - PERSON_CELL.margin;
  const rect = (x: number, yBottom: number, w: number, h: number, fill: string): void => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(cx + x * s - (w * s) / 2, foot - yBottom * s - h * s, w * s, h * s, Math.min(w, h) * s * 0.35);
    ctx.fill();
  };
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
}
