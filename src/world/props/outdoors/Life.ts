import * as THREE from 'three';
import { createCanvas } from '@/covers/generated/canvasUtils';
import { type Rng, SCENE_HEIGHT, SCENE_WIDTH, azimuthOf, azimuthX, heightY } from './Sheet';
import { CAR_BODY, CAR_COLORS } from './Car';
import { between, pick } from './paint';
import { KERB } from './plan';
import { FOUNTAIN, PATHS, resample } from './Park';
import { BUS_STOP_X } from './Street';
import type { GoodsRect } from './Shopfront';
import { type AtlasPens, type Cell, type LifeEnv, WHITE_TINT, packTint } from './sprites';
import { type FlashColor, type VehicleKind, Cyclists, VEHICLE_LOOKS, carFrameAt, carBounds, flashesOf, paintFlashCells, paintVehicleCells, pushFlash, vehicleCell } from './LifeVehicles';
import { Critters } from './LifeCritters';
import { Folk, MAX_QUEUE } from './LifeFolk';
import { type LifeEvents, quietStreet } from './lifeEvents';

export { carBounds, carFrameAt } from './LifeVehicles';
export type { LifeEvents } from './lifeEvents';

/**
 * How many moving things the pane shader looks up per pixel; the arrays below have this many slots.
 * Three vec4 uniforms each: 56 keeps the pane shader under WebGL's guaranteed 224 fragment uniform
 * vectors. A busy afternoon peaks around 45.
 */
export const SPRITE_COUNT = 56;
/**
 * Atlas size: the car and the taxi from every angle at two distances (the nearest up to ~500 px
 * wide with their beam), the bus, dustcart, van and ambulance, pedestrians, dogs, cyclists,
 * pigeons, bats, the fox and the cats, the balcony and shop figures, the fountain; the glow copy
 * is at half size.
 */
const ATLAS_W = 2048;
const ATLAS_H = 4096;
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
const MAX_CARS = 14;
const CRUISE: [number, number] = [6, 9];
const TURN_SPEED = 4;
/** Braking deceleration (m/s²) and the distance kept to the car ahead (centre to centre for two cars; longer vehicles add their extra length). */
const BRAKING = 3;
const GAP = 6.5;
/** How many of the cars setting off are taxis. */
const TAXI_SHARE = 0.18;
/** Pixels per metre of the pedestrian cells, and how tall a cell reaches: room for an umbrella over the head. */
const PERSON_SCALE = 37.7;
const PERSON_TOP = 2.3;
/** Pedestrian cell in the atlas: the figure (and its umbrella) plus a small margin all round. */
const PERSON_CELL = { w: 46, h: Math.ceil(PERSON_TOP * PERSON_SCALE) + 6, margin: 3 };
const PERSON_VARIANTS = 8;
const UMBRELLAS = ['#1c1c1e', '#2a3f6a', '#8a2a2a', '#2f5a44', '#e8c84a', '#6a3a6a', '#1c1c1e', '#b8302a'];
/** A dog trotting beside its owner: its cell, a metre ahead of them. */
const DOG = { length: 0.75, height: 0.55, scale: 40, lead: 1.1 };
const DOG_COATS = ['#8a5a32', '#2a2420', '#d8c8a8', '#6a6a6a'];
/** Seconds between two barks while a dog is out (the sound reads `events.barks`). */
const BARK_EVERY: [number, number] = [14, 45];
/** The bus: one route, every couple of minutes, pulling up at the shelter for a while. */
const BUS_INTERVAL = 110;
const BUS_DWELL = 9;
/**
 * The dustcart: out once a morning between these game hours, west along Front Street's near lane
 * and down Park Street at a crawl, stopping at these points (x on Front Street, then z on Park
 * Street) while the crew empties the bins.
 */
const GARBAGE_HOURS: [number, number] = [5.5, 7];
const GARBAGE_STOPS_X = [52, 36, 20];
const GARBAGE_STOPS_Z = [-18];
const GARBAGE_DWELL: [number, number] = [5, 8];
/** The delivery van: every few minutes in business hours, double-parked by a shop on Front Street's far side a while, hazards blinking. */
const VAN_HOURS: [number, number] = [8, 19];
const VAN_INTERVAL: [number, number] = [120, 260];
const VAN_DWELL: [number, number] = [35, 80];
const VAN_PARK_X: [number, number] = [18, 33];
/** How far a double-parked van stands out from its lane, towards the parked cars. */
const VAN_OFFSET = 3.1;
/** The ambulance: rare, fast; cars ahead of it pull over towards the kerb and crawl, cars on the other side brake. */
const AMBULANCE_INTERVAL: [number, number] = [220, 520];
const AMBULANCE_CRUISE = 12.5;
const YIELD_OFFSET = 1.3;
const YIELD_REACH = 40;
/** Lateral offsets at or above which a vehicle is out of its lane: the others pass it. */
const OUT_OF_LANE = 1.5;
/** Pigeons wheeling over the street: how many, their size and the cell they are painted in. */
const BIRDS = 7;
const BIRD = { span: 0.7, scale: 30 };
/** The fountain's plume, animated: its size in metres and frames. */
const SPRAY = { width: 3.6, height: 4.8, scale: 12, frames: 4 };
const SHIRTS = ['#d94f3a', '#3b6fb3', '#e8e2d2', '#2f2f36', '#6fa35e', '#f0c94a', '#8c4f9e', '#c9c9c9'];
const TROUSERS = ['#2b2f3d', '#1c1c1e', '#4b5563', '#6b5a48'];
const SKINS = ['#f1c9a5', '#d9a071', '#8d5a3b', '#f7d9c0', '#5b3a25'];
const HAIRS = ['#2a1f14', '#5a3a1a', '#c9a34a', '#111111', '#8a8a8a'];

/** What `Life.update` reads of the sky (a `SkyState` will do): falling rain and snow, the game hour, the wind. */
export interface LifeWeather {
  rain: number;
  snow: number;
  hours?: number;
  wind?: number;
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

/** Somewhere a vehicle pulls up: the route sample, how long it stays and how long it has stood there. */
interface Stop {
  at: number;
  dwell: number;
  waited: number;
}

interface MovingCar {
  kind: VehicleKind;
  /** Stops still ahead, in order (the bus's shelter, the dustcart's bins, the van's shop). */
  stops: Stop[];
  route: Route;
  /** Sample index along the route (fractional). */
  s: number;
  /** Current speed and the speed this driver likes, m/s. */
  speed: number;
  cruise: number;
  tint: number;
  /** Metres to the right of the lane (pulled over, double-parked) and where that is heading. */
  offset: number;
  offsetTarget: number;
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

/** One of the pigeons: its place in the flock and its own wingbeat. */
interface Bird {
  offset: [number, number, number];
  phase: number;
  rate: number;
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
 * seen down the street shows the right faces; taxis, the bus, the morning dustcart, a delivery van
 * that double-parks with its hazards on and the odd ambulance (blue lights, everyone pulling over)
 * in their own liveries. Cyclists (`Cyclists`), the night's animals (`Critters`) and the people on
 * the balconies and at the retro games shop (`Folk`) paint and move themselves. `update()` moves
 * everything and refreshes the uniform arrays the shader reads; `events` tells the street's sound
 * what happened.
 */
export class Life {
  readonly atlas: THREE.CanvasTexture;
  readonly glow: THREE.CanvasTexture;
  /** Per sprite: band-space rectangle (u0, v0, u1, v1), atlas rectangle (u0, v0, u1, v1), (alpha, distance, lod, packed tint). */
  readonly rects = new Float32Array(SPRITE_COUNT * 4);
  readonly cells = new Float32Array(SPRITE_COUNT * 4);
  readonly info = new Float32Array(SPRITE_COUNT * 4);
  /** What can be heard (see `LifeEvents`); read, never written, by `StreetAmbience`. */
  readonly events: LifeEvents = quietStreet();
  /** How many pixel rows of the atlas the painters used (the headless check reads it). */
  atlasUsed = 0;

  private readonly vehicleCells = {} as Record<VehicleKind, Cell[][]>;
  private flashCells = {} as Record<FlashColor, Cell>;
  /** Per variant: without and with an umbrella, each in two poses. */
  private readonly personCells: Cell[][][] = [];
  /** Per coat: facing along +u and -u, each in two poses. */
  private readonly dogCells: Cell[][][] = [];
  private readonly birdCells: Cell[] = [];
  private readonly sprayCells: Cell[] = [];
  private readonly birds: Bird[] = [];
  private readonly cyclists: Cyclists;
  private readonly critters: Critters;
  private readonly folk: Folk;
  private flockClock = 0;
  private sprayClock = 0;
  private clock = 0;
  private busTimer = 20;
  private vanTimer = 40;
  private ambulanceTimer = AMBULANCE_INTERVAL[0] * 0.6;
  private garbageDone = false;
  private barkTimer = 10;
  private readonly routes: Route[];
  private readonly cars: MovingCar[] = [];
  private readonly walkers: Walker[] = [];
  private readonly slots: Slot[] = [];
  private readonly tints = CAR_COLORS.map(packTint);
  private readonly push = (bounds: number[], cell: Cell, d: number, alpha: number, tint = WHITE_TINT): void => this.pushSprite(bounds, cell, d, alpha, tint);

  constructor(private readonly random: Rng) {
    this.cyclists = new Cyclists(random);
    this.critters = new Critters(random);
    this.folk = new Folk(random);
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
      const car = this.newCar(route, random() < TAXI_SHARE ? 'taxi' : 'car', between(random, CRUISE[0], CRUISE[1]));
      car.s = between(random, 0, route.points.length * 0.6);
      car.speed = car.cruise;
      this.cars.push(car);
    }
    for (let i = 0; i < BIRDS; i++) {
      this.birds.push({ offset: [between(random, -4, 4), between(random, -1.5, 1.5), between(random, -4, 4)], phase: random() * Math.PI * 2, rate: between(random, 7, 10) });
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
      dog: random() < 0.2 ? Math.floor(random() * DOG_COATS.length) : -1,
      hardy: random() < 0.55,
    });
    for (let i = 0; i < 6; i++) this.walkers.push(walker('front', between(random, -BOX_FAR, FRONT_END)));
    for (let i = 0; i < 4; i++) this.walkers.push(walker('park', between(random, -70, BOX_FAR)));
    for (const path of PATHS) {
      const pts = resample(path, 1);
      for (let i = 0; i < 2; i++) this.walkers.push(walker('path', between(random, 0, pts.length - 1), pts));
    }
  }

  /** Has `count` people (0..6) queue on the pavement at the retro games shop's door while it is open. */
  setShopQueue(count: number): void {
    this.folk.setQueue(Math.min(count, MAX_QUEUE));
  }

  /** Tells the shop's figures where the retro games shop really is, from the boxes in its windows (see `paintView`). */
  placeShop(goods: readonly GoodsRect[]): void {
    this.folk.setShop(goods);
  }

  /**
   * Moves everything `dt` seconds on and rewrites the sprite arrays. `nightness` sends most walkers
   * home at dusk; `wakefulness` (0..1, see `wakefulnessAt`) sends the night owls home too as the
   * city falls asleep and spaces the cars out: at 0.1 a car sets off ten times less often. The
   * `weather` (a `SkyState` will do) carries the rain and snow, and the game hour the dustcart, the
   * van, the shop and the animals keep to.
   */
  update(dt: number, nightness: number, wakefulness = 1, weather: LifeWeather = { rain: 0, snow: 0 }): void {
    this.slots.length = 0;
    this.clock += dt;
    const step = Math.min(dt, 0.1);
    const dusk = THREE.MathUtils.smoothstep(nightness, 0.3, 0.7);
    const wet = Math.max(weather.rain, weather.snow);
    const env: LifeEnv = { hours: weather.hours ?? 12, nightness, dusk, wakefulness, rain: weather.rain, snow: weather.snow, wet, wind: weather.wind ?? 0 };
    this.driveCars(step, env);
    for (const car of this.cars) this.pushCar(car);

    const obstacles: [number, number][] = [];
    for (const car of this.cars) if (car.kind === 'van' && car.offset > 0.5) obstacles.push(this.carPosition(car).slice(0, 2) as [number, number]);
    this.cyclists.update(step, env, 1 - dusk, this.push, obstacles);
    this.folk.update(dt, env, this.push);

    const umbrellas = weather.rain > 0.15;
    const barking: [number, number][] = [];
    for (const w of this.walkers) {
      let alpha = w.nightOwl ? THREE.MathUtils.smoothstep(wakefulness, w.homeAt, w.homeAt + 0.12) : 1 - dusk;
      if (!w.hardy) alpha *= 1 - THREE.MathUtils.smoothstep(wet, 0.25, 0.5);
      w.poseClock += dt;
      let x: number;
      let z: number;
      let dir: [number, number];
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
        [x, z] = [x0 + (x1 - x0) * t, z0 + (z1 - z0) * t];
        dir = [((x1 - x0) / len) * w.dir, ((z1 - z0) / len) * w.dir];
      } else {
        const [from, to] = w.where === 'front' ? [-BOX_FAR, FRONT_END] : [-70, BOX_FAR];
        w.s += w.dir * w.speed * dt;
        if (w.s < from - 2 || w.s > to + 2) {
          w.dir = -w.dir as 1 | -1;
          w.variant = Math.floor(this.random() * PERSON_VARIANTS);
        }
        alpha *= Math.min(1, Math.max(0, (w.s - from) / 3), Math.max(0, (to - w.s) / 3));
        [x, z] = w.where === 'front' ? [w.s, PAVEMENT] : [-PAVEMENT, w.s];
        dir = w.where === 'front' ? [w.dir, 0] : [0, w.dir];
      }
      this.pushWalker(w, x, z, alpha, umbrellas, dir);
      if (w.dog >= 0 && alpha > 0.5) barking.push([x + dir[0] * DOG.lead, z + dir[1] * DOG.lead]);
    }
    // Now and then one of the dogs out barks.
    this.barkTimer -= dt;
    if (this.barkTimer <= 0) {
      this.barkTimer = between(this.random, BARK_EVERY[0], BARK_EVERY[1]);
      if (barking.length > 0) {
        const [bx, bz] = pick(this.random, barking);
        this.events.bark.x = bx;
        this.events.bark.z = bz;
        this.events.barks++;
      }
    }
    this.critters.update(dt, env, this.push);
    this.pushBirds(dt, (1 - dusk) * (1 - THREE.MathUtils.smoothstep(wet, 0.1, 0.35)));
    const fountain = snowless(weather);
    this.events.fountain = fountain;
    this.pushSpray(dt, fountain);

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

  /** A vehicle of `kind` at the start of `route`, keen to go at `cruise`. */
  private newCar(route: Route, kind: VehicleKind, cruise: number, stops: Stop[] = []): MovingCar {
    return { kind, stops, route, s: 0, speed: cruise * 0.6, cruise, tint: kind === 'car' ? pick(this.random, this.tints) : WHITE_TINT, offset: 0, offsetTarget: 0 };
  }

  /** Whether nothing on `route` is still within `room` metres of its start (a new vehicle may set off). */
  private clearStart(route: Route, room: number): boolean {
    return !this.cars.some((c) => c.route === route && c.s * route.step - VEHICLE_LOOKS[c.kind].body.length / 2 < room);
  }

  /** The route sample nearest to `x` on Front Street (`z` > `zMin`), or to `z` on Park Street when `x` is null. */
  private sampleNear(route: Route, x: number | null, z: number, zMin = KERB - 16): number {
    let at = 0;
    let best = Infinity;
    route.points.forEach(([px, pz], i) => {
      const miss = x === null ? (px < -BOX_NEAR - 2 ? Math.abs(pz - z) : Infinity) : pz > zMin ? Math.abs(px - x) : Infinity;
      if (miss < best) {
        best = miss;
        at = i;
      }
    });
    return at;
  }

  /** Cars set off (fewer the sleepier the city), brake for the car ahead, take the corner slowly, and leave at the far end; the special vehicles keep their own hours. */
  private driveCars(dt: number, env: LifeEnv): void {
    const { wakefulness, hours } = env;
    const events = this.events;
    // The bus: up Park Street, round the corner and along Front Street, stopping at the shelter; none in the small hours.
    this.busTimer -= dt;
    if (this.busTimer <= 0) {
      this.busTimer = between(this.random, BUS_INTERVAL * 0.7, BUS_INTERVAL * 1.3) / Math.max(wakefulness, 0.2);
      const route = this.routes[1];
      if (wakefulness > 0.3 && this.clearStart(route, GAP + 12) && this.cars.length < MAX_CARS) {
        this.cars.push(this.newCar(route, 'bus', 7, [{ at: this.sampleNear(route, BUS_STOP_X, 0, KERB - 8), dwell: BUS_DWELL, waited: 0 }]));
      }
    }
    // The dustcart, once each morning.
    if (hours < GARBAGE_HOURS[0] - 0.5 || hours > 12) this.garbageDone = false;
    if (!this.garbageDone && hours >= GARBAGE_HOURS[0] && hours < GARBAGE_HOURS[1] && this.clearStart(this.routes[0], GAP + 10)) {
      this.garbageDone = true;
      const route = this.routes[0];
      const dwell = (): number => between(this.random, GARBAGE_DWELL[0], GARBAGE_DWELL[1]);
      const stops = [...GARBAGE_STOPS_X.map((x) => this.sampleNear(route, x, 0, 6)), ...GARBAGE_STOPS_Z.map((z) => this.sampleNear(route, null, z))].map((at) => ({ at, dwell: dwell(), waited: 0 }));
      this.cars.push(this.newCar(route, 'truck', 4.5, stops));
    }
    // The delivery van, in business hours.
    this.vanTimer -= dt;
    if (this.vanTimer <= 0) {
      this.vanTimer = 3;
      const route = this.routes[1];
      const busy = this.cars.some((c) => c.kind === 'van');
      if (!busy && hours >= VAN_HOURS[0] && hours < VAN_HOURS[1] && this.clearStart(route, GAP + 4) && this.cars.length < MAX_CARS) {
        this.vanTimer = between(this.random, VAN_INTERVAL[0], VAN_INTERVAL[1]);
        const at = this.sampleNear(route, between(this.random, VAN_PARK_X[0], VAN_PARK_X[1]), 0);
        this.cars.push(this.newCar(route, 'van', 7, [{ at, dwell: between(this.random, VAN_DWELL[0], VAN_DWELL[1]), waited: 0 }]));
      }
    }
    // Now and then an ambulance, siren going.
    this.ambulanceTimer -= dt;
    if (this.ambulanceTimer <= 0) {
      // The way in blocked: try again in a moment.
      this.ambulanceTimer = 3;
      const route = pick(this.random, this.routes);
      if (!this.cars.some((c) => c.kind === 'ambulance') && this.clearStart(route, GAP + 4)) {
        this.cars.push(this.newCar(route, 'ambulance', AMBULANCE_CRUISE));
        this.ambulanceTimer = between(this.random, AMBULANCE_INTERVAL[0], AMBULANCE_INTERVAL[1]);
      }
    }
    for (const route of this.routes) {
      route.nextSpawn -= dt;
      if (route.nextSpawn > 0 || this.cars.length >= MAX_CARS) continue;
      route.nextSpawn = between(this.random, route.interval * 0.5, route.interval * 1.5) / Math.max(wakefulness, 0.05);
      if (!this.clearStart(route, GAP + 2)) continue;
      this.cars.push(this.newCar(route, this.random() < TAXI_SHARE ? 'taxi' : 'car', between(this.random, CRUISE[0], CRUISE[1])));
    }

    const ambulance = this.cars.find((c) => c.kind === 'ambulance');
    const siren = ambulance ? this.carPosition(ambulance) : null;
    events.siren.active = siren !== null;
    if (siren) [events.siren.x, events.siren.z] = siren;
    events.garbage.active = false;
    events.garbage.working = false;
    for (const car of this.cars) {
      const { route } = car;
      const body = VEHICLE_LOOKS[car.kind].body;
      // Nearest car ahead on the same route, bumper to bumper; whatever is out of its lane is passed
      // (a double-parked van), and the ambulance slips past the cars pulling over for it.
      let ahead = Infinity;
      const passable = car.kind === 'ambulance' ? 0.6 : OUT_OF_LANE;
      if (car.offset < OUT_OF_LANE) {
        for (const other of this.cars) {
          if (other === car || other.route !== route || other.s <= car.s || other.offset >= passable) continue;
          const gap = (other.s - car.s) * route.step - (VEHICLE_LOOKS[other.kind].body.length + body.length) / 2 + CAR_BODY.length;
          if (gap < ahead) ahead = gap;
        }
      }
      const limit = route.limits[Math.min(route.limits.length - 1, Math.floor(car.s))];
      let target = Math.min(car.cruise, car.kind === 'ambulance' ? limit * 1.6 : limit);
      if (ahead < Infinity) target = Math.min(target, Math.sqrt(Math.max(0, 2 * BRAKING * (ahead - GAP))));
      // Make way for the ambulance: pull over and crawl if it is coming up behind, brake if it is near on the other side.
      if (ambulance && car !== ambulance && siren) {
        const behind = ambulance.route === route ? (car.s - ambulance.s) * route.step : -1;
        if (behind > 0 && behind < YIELD_REACH) {
          car.offsetTarget = Math.max(car.offsetTarget, YIELD_OFFSET);
          target = Math.min(target, 1.5);
        } else {
          if (car.offsetTarget === YIELD_OFFSET) car.offsetTarget = 0;
          const [cx, cz] = this.carPosition(car);
          if (Math.hypot(cx - siren[0], cz - siren[1]) < 30) target = Math.min(target, 3);
        }
      } else if (car.offsetTarget === YIELD_OFFSET) car.offsetTarget = 0;

      const stop = car.stops[0];
      if (stop) {
        // Pull up, wait (the passengers, the bins, the parcels), then go.
        const left = (stop.at - car.s) * route.step;
        if (car.kind === 'van' && left < 16) car.offsetTarget = VAN_OFFSET;
        if (left <= 0.3) {
          target = 0;
          car.speed = Math.min(car.speed, 0.3);
          if (stop.waited === 0 && car.kind === 'bus') events.busStops++;
          stop.waited += dt;
          if (car.kind === 'truck') events.garbage.working = true;
          if (stop.waited > stop.dwell && (car.kind !== 'van' || this.clearBehind(car, 18))) {
            car.stops.shift();
            if (car.kind === 'bus') events.busDepartures++;
            if (car.kind === 'van') car.offsetTarget = 0;
          }
        } else target = Math.min(target, Math.sqrt(2 * BRAKING * 0.6 * left));
      }
      car.offset += THREE.MathUtils.clamp(car.offsetTarget - car.offset, -0.9 * dt, 0.9 * dt);
      car.speed += THREE.MathUtils.clamp(target - car.speed, -2 * BRAKING * dt, (car.kind === 'ambulance' ? 3.5 : 2.5) * dt);
      car.s += (Math.max(0, car.speed) * dt) / route.step;
      if (car.kind === 'truck') {
        events.garbage.active = true;
        [events.garbage.x, events.garbage.z] = this.carPosition(car);
      }
    }
    events.garbageWorking = events.garbage.working;
    for (let i = this.cars.length - 1; i >= 0; i--) if (this.cars[i].s >= this.cars[i].route.points.length - 1) this.cars.splice(i, 1);
  }

  /** Whether no car in its lane is coming up within `room` metres behind `car` (a parked van may pull out). */
  private clearBehind(car: MovingCar, room: number): boolean {
    return !this.cars.some((c) => c !== car && c.route === car.route && c.offset < OUT_OF_LANE && c.s <= car.s + 8 / car.route.step && (car.s - c.s) * car.route.step < room);
  }

  /** Where a vehicle is (x, z, interpolated between samples, shifted by its offset) and its heading. */
  private carPosition(car: MovingCar): [number, number, number] {
    const { route } = car;
    // Interpolated between samples: half-metre steps would be seen as a stutter.
    const i0 = Math.min(route.points.length - 1, Math.floor(car.s));
    const i1 = Math.min(route.points.length - 1, i0 + 1);
    const t = car.s - i0;
    const h0 = route.headings[i0];
    const h1 = route.headings[i1];
    const heading = Math.atan2(THREE.MathUtils.lerp(Math.sin(h0), Math.sin(h1), t), THREE.MathUtils.lerp(Math.cos(h0), Math.cos(h1), t));
    // The offset is to the right of the heading: towards the kerb.
    const x = THREE.MathUtils.lerp(route.points[i0][0], route.points[i1][0], t) - Math.cos(heading) * car.offset;
    const z = THREE.MathUtils.lerp(route.points[i0][1], route.points[i1][1], t) + Math.sin(heading) * car.offset;
    return [x, z, heading];
  }

  private pushCar(car: MovingCar): void {
    const { route } = car;
    const [x, z, heading] = this.carPosition(car);
    const body = VEHICLE_LOOKS[car.kind].body;
    const d = Math.hypot(x, z);
    const frame = carFrameAt(x, z, heading, body);
    const relative = THREE.MathUtils.euclideanModulo(heading - azimuthOf(x, z), Math.PI * 2);
    const cell = vehicleCell(this.vehicleCells[car.kind], car.kind, relative, d);
    // Fade over the first and last metres of the route (only the far end of Front Street is ever in view).
    const along = car.s * route.step;
    const left = (route.points.length - 1 - car.s) * route.step;
    const alpha = Math.min(1, along / 8, left / 8);
    this.push(carBounds(frame, body), cell, d, alpha, car.tint);
    const hazards = car.kind === 'van' && car.offset > 0.4;
    for (const [color, u, v, h] of flashesOf(car.kind, this.clock, hazards)) pushFlash(this.push, this.flashCells[color], frame, u, v, h, d, alpha);
  }

  /** A walker at (x, z) heading along `dir` (a unit vector on the ground), with their umbrella up if it rains and their dog ahead. */
  private pushWalker(w: Walker, x: number, z: number, alpha: number, umbrella: boolean, dir: [number, number]): void {
    const pose = Math.floor(w.poseClock / 0.32) % 2;
    const cell = this.personCells[w.variant][umbrella ? 1 : 0][pose];
    const d = Math.hypot(x, z);
    const a = azimuthOf(x, z);
    const halfWidth = ((PERSON_CELL.w / PERSON_SCALE) * 0.5) / d;
    const margin = PERSON_CELL.margin / PERSON_SCALE;
    this.push([azimuthX(a - halfWidth), heightY(PERSON_TOP + margin, d), azimuthX(a + halfWidth), heightY(-margin, d)], cell, d, alpha);
    if (w.dog < 0 || alpha <= 0.01) return;
    // The dog trots ahead, seen side on: which way it faces on screen is which way it heads across the view.
    const dx = x + dir[0] * DOG.lead;
    const dz = z + dir[1] * DOG.lead;
    const dd = Math.hypot(dx, dz);
    const da = azimuthOf(dx, dz);
    const across = dir[0] * Math.cos(da) - dir[1] * Math.sin(da); // > 0: moving towards +azimuth
    const dogCell = this.dogCells[w.dog][across >= 0 ? 0 : 1][pose];
    const half = (dogCell.w / DOG.scale / 2) / dd;
    const m = 2 / DOG.scale;
    this.push([azimuthX(da - half), heightY(DOG.height + m, dd), azimuthX(da + half), heightY(-m, dd)], dogCell, dd, alpha);
  }

  /** The flock of pigeons wheeling over the corner, visible by day in dry weather. */
  private pushBirds(dt: number, visible: number): void {
    this.flockClock += dt;
    if (visible <= 0.01) return;
    const t = this.flockClock * 0.11;
    // The flock's centre loops over the crossroads and out over the park, between the rooftops.
    const cx = -18 + Math.sin(t) * 30;
    const cz = 26 + Math.sin(t * 1.7) * 14;
    const ch = 22 + Math.sin(t * 0.8) * 4;
    for (const bird of this.birds) {
      const wob = this.flockClock * 0.6 + bird.phase;
      const x = cx + bird.offset[0] + Math.sin(wob) * 1.2;
      const z = cz + bird.offset[2] + Math.cos(wob * 0.9) * 1.2;
      const h = ch + bird.offset[1] + Math.sin(wob * 1.3) * 0.5;
      const d = Math.hypot(x, z);
      const a = azimuthOf(x, z);
      const pose = Math.sin(this.flockClock * bird.rate + bird.phase) > 0 ? 0 : 1;
      const cell = this.birdCells[pose];
      const half = (cell.w / BIRD.scale / 2) / d;
      const tall = cell.h / BIRD.scale / 2;
      this.push([azimuthX(a - half), heightY(h + tall, d), azimuthX(a + half), heightY(h - tall, d)], cell, d, visible);
    }
  }

  /** The fountain's plume, moving: frames of spray cycling over the painted one (frozen hard in a cold snap). */
  private pushSpray(dt: number, running: boolean): void {
    this.sprayClock += dt;
    if (!running) return;
    const { x, z } = FOUNTAIN;
    const d = Math.hypot(x, z);
    const a = azimuthOf(x, z);
    const cell = this.sprayCells[Math.floor(this.sprayClock * 8) % SPRAY.frames];
    const half = SPRAY.width / 2 / d;
    this.push([azimuthX(a - half), heightY(SPRAY.height, d), azimuthX(a + half), heightY(0.2, d)], cell, d - 0.5, 0.85);
  }

  /** Queues a sprite: `bounds` are scenery-texture pixels (left, top, right, bottom). */
  private pushSprite(bounds: number[], cell: Cell, d: number, alpha: number, tint: number): void {
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
   * The atlas: every vehicle from every angle (the plain car in white, tinted by the shader; the
   * others in their liveries), pedestrians in two walking poses with and without umbrellas, dogs,
   * pigeons and the fountain's spray, the flashing lights, then what the cyclists, the animals and
   * the facade and shop figures paint for themselves. Lights (headlights, tail lights, the beam on
   * the road, lamps, a cigarette's tip) go to the glow canvas.
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
    const pens: AtlasPens = { place, color, glow };

    for (const kind of ['car', 'taxi', 'bus', 'truck', 'van', 'ambulance'] as const) this.vehicleCells[kind] = paintVehicleCells(pens, kind);
    for (let variant = 0; variant < PERSON_VARIANTS; variant++) {
      const look = { shirt: SHIRTS[variant], trousers: pick(this.random, TROUSERS), skin: pick(this.random, SKINS), hair: pick(this.random, HAIRS), umbrella: UMBRELLAS[variant] };
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
    for (const pose of [0, 1]) {
      const cell = place(Math.ceil(BIRD.span * BIRD.scale) + 4, Math.ceil(BIRD.span * 0.5 * BIRD.scale) + 4);
      paintBird(color, cell, pose);
      this.birdCells.push(cell);
    }
    for (let frame = 0; frame < SPRAY.frames; frame++) {
      const cell = place(Math.ceil(SPRAY.width * SPRAY.scale), Math.ceil((SPRAY.height - 0.2) * SPRAY.scale));
      paintSpray(color, cell, frame, this.random);
      this.sprayCells.push(cell);
    }
    this.flashCells = paintFlashCells(pens);
    this.cyclists.paint(pens);
    this.critters.paint(pens);
    this.folk.paint(pens);
    if (penY + rowH > ATLAS_H) console.warn('[outdoors] sprite atlas overflow');
    this.atlasUsed = penY + rowH;
  }
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
  umbrella: string;
}

/** Whether the fountain plays: it is shut off while snow lies deep. */
function snowless(weather: { snow: number }): boolean {
  return weather.snow < 0.5;
}

/** A pedestrian seen from the front, feet at the bottom of the cell, mid-stride in `pose` 1, maybe under an umbrella. */
function paintPerson(ctx: CanvasRenderingContext2D, cell: Cell, look: Look, pose: number, umbrella = false): void {
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
