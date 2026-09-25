import * as THREE from 'three';
import { type Rng, azimuthOf } from './Sheet';
import { CAR_BODY, CAR_COLORS } from './Car';
import { between, pick } from './paint';
import { BUS_STOP_X, FAR_LANE, KERB, LIFE_REACH, NEAR_KERB, NEAR_LANE } from './plan';
import { resample } from './Park';
import type { LifeEvents } from './lifeEvents';
import { type AtlasPens, type Cell, type LifeEnv, type LifeLayer, type Push, WHITE_TINT, packTint } from './sprites';
import { type FlashColor, type VehicleKind, VEHICLE_LOOKS, arc, carBounds, carFrameAt, flashesOf, paintFlashCells, paintVehicleCells, pushFlash, vehicleCell } from './LifeVehicles';

const MAX_CARS = 14;
const CRUISE: [number, number] = [6, 9];
const TURN_SPEED = 4;
/** Braking deceleration (m/s²) and the distance kept to the car ahead (centre to centre for two cars; longer vehicles add their extra length). */
const BRAKING = 3;
const GAP = 6.5;
/** How many of the cars setting off are taxis. */
const TAXI_SHARE = 0.18;
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

/** Where a vehicle is: x, z and heading. */
type Placement = [number, number, number];

/**
 * The traffic through the crossroads: cars follow the road round the corner, one route per
 * direction, both beginning and ending far out of sight, and keep their distance in a queue. The
 * atlas holds the car (in white, tinted per car by the shader) seen from every 10° of viewing angle
 * at two distances, so a car turning or seen down the street shows the right faces; taxis, the
 * bus, the morning dustcart, a delivery van that double-parks with its hazards on and the odd
 * ambulance (blue lights, everyone pulling over) in their own liveries. Writes what can be heard
 * of it into `events`.
 */
export class Traffic implements LifeLayer {
  /** Where something stands in the road this frame that the cyclists swing out round (the double-parked van). */
  readonly obstacles: [number, number][] = [];
  /** The blinking lights' two cells, painted on their own (after the fountain's spray, where the atlas has always had them). */
  readonly flashes = {
    paint: (pens: AtlasPens): void => {
      this.flashCells = paintFlashCells(pens);
    },
  };

  private readonly vehicleCells = {} as Record<VehicleKind, Cell[][]>;
  private flashCells = {} as Record<FlashColor, Cell>;
  private readonly routes = buildRoutes();
  private readonly cars: MovingCar[] = [];
  private readonly tints = CAR_COLORS.map(packTint);
  private clock = 0;
  private busTimer = 20;
  private vanTimer = 40;
  private ambulanceTimer = AMBULANCE_INTERVAL[0] * 0.6;
  private garbageDone = false;
  /** Scratch placements: the ambulance's (held through a frame's drive) and any other vehicle's. */
  private readonly sirenAt: Placement = [0, 0, 0];
  private readonly at: Placement = [0, 0, 0];

  constructor(
    private readonly random: Rng,
    private readonly events: LifeEvents,
  ) {}

  paint(pens: AtlasPens): void {
    for (const kind of ['car', 'taxi', 'bus', 'truck', 'van', 'ambulance'] as const) this.vehicleCells[kind] = paintVehicleCells(pens, kind);
  }

  /** Starts with traffic already on the roads. */
  populate(): void {
    const random = this.random;
    for (const route of this.routes) route.nextSpawn = between(random, 0, route.interval);
    for (let i = 0; i < 8; i++) {
      const route = pick(random, this.routes);
      const car = this.newCar(route, random() < TAXI_SHARE ? 'taxi' : 'car', between(random, CRUISE[0], CRUISE[1]));
      car.s = between(random, 0, route.points.length * 0.6);
      car.speed = car.cruise;
      this.cars.push(car);
    }
  }

  /** Drives on in steps of at most 0.1 s (fewer cars the sleepier the city), pushes every vehicle and its flashes. */
  update(dt: number, env: LifeEnv, push: Push): void {
    this.clock += dt;
    this.drive(Math.min(dt, 0.1), env);
    for (const car of this.cars) this.pushCar(car, push);
    let n = 0;
    for (const car of this.cars) {
      if (car.kind !== 'van' || car.offset <= 0.5) continue;
      const [x, z] = this.carPosition(car, this.at);
      const spot = (this.obstacles[n] ??= [0, 0]);
      spot[0] = x;
      spot[1] = z;
      n++;
    }
    this.obstacles.length = n;
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
      const miss = x === null ? (px < -NEAR_KERB - 2 ? Math.abs(pz - z) : Infinity) : pz > zMin ? Math.abs(px - x) : Infinity;
      if (miss < best) {
        best = miss;
        at = i;
      }
    });
    return at;
  }

  /** Cars set off (fewer the sleepier the city), brake for the car ahead, take the corner slowly, and leave at the far end; the special vehicles keep their own hours. */
  private drive(dt: number, env: LifeEnv): void {
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
    const siren = ambulance ? this.carPosition(ambulance, this.sirenAt) : null;
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
          const [cx, cz] = this.carPosition(car, this.at);
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
        [events.garbage.x, events.garbage.z] = this.carPosition(car, this.at);
      }
    }
    events.garbageWorking = events.garbage.working;
    for (let i = this.cars.length - 1; i >= 0; i--) if (this.cars[i].s >= this.cars[i].route.points.length - 1) this.cars.splice(i, 1);
  }

  /** Whether no car in its lane is coming up within `room` metres behind `car` (a parked van may pull out). */
  private clearBehind(car: MovingCar, room: number): boolean {
    return !this.cars.some((c) => c !== car && c.route === car.route && c.offset < OUT_OF_LANE && c.s <= car.s + 8 / car.route.step && (car.s - c.s) * car.route.step < room);
  }

  /** Where a vehicle is (x, z, interpolated between samples, shifted by its offset) and its heading, written into `out`. */
  private carPosition(car: MovingCar, out: Placement): Placement {
    const { route } = car;
    // Interpolated between samples: half-metre steps would be seen as a stutter.
    const i0 = Math.min(route.points.length - 1, Math.floor(car.s));
    const i1 = Math.min(route.points.length - 1, i0 + 1);
    const t = car.s - i0;
    const h0 = route.headings[i0];
    const h1 = route.headings[i1];
    const heading = Math.atan2(THREE.MathUtils.lerp(Math.sin(h0), Math.sin(h1), t), THREE.MathUtils.lerp(Math.cos(h0), Math.cos(h1), t));
    // The offset is to the right of the heading: towards the kerb.
    out[0] = THREE.MathUtils.lerp(route.points[i0][0], route.points[i1][0], t) - Math.cos(heading) * car.offset;
    out[1] = THREE.MathUtils.lerp(route.points[i0][1], route.points[i1][1], t) + Math.sin(heading) * car.offset;
    out[2] = heading;
    return out;
  }

  private pushCar(car: MovingCar, push: Push): void {
    const { route } = car;
    const [x, z, heading] = this.carPosition(car, this.at);
    const body = VEHICLE_LOOKS[car.kind].body;
    const d = Math.hypot(x, z);
    const frame = carFrameAt(x, z, heading, body);
    const relative = THREE.MathUtils.euclideanModulo(heading - azimuthOf(x, z), Math.PI * 2);
    const cell = vehicleCell(this.vehicleCells[car.kind], car.kind, relative, d);
    // Fade over the first and last metres of the route (only the far end of Front Street is ever in view).
    const along = car.s * route.step;
    const left = (route.points.length - 1 - car.s) * route.step;
    const alpha = Math.min(1, along / 8, left / 8);
    push(carBounds(frame, body), cell, d, alpha, car.tint);
    const hazards = car.kind === 'van' && car.offset > 0.4;
    for (const [color, u, v, h] of flashesOf(car.kind, this.clock, hazards)) pushFlash(push, this.flashCells[color], frame, u, v, h, d, alpha);
  }
}

/**
 * The two ways round the corner (right-hand traffic; both streets end there): west along Front
 * Street's near lane then right, down Park Street's near lane; north up Park Street's far lane
 * then left, east along Front Street's far lane. Concentric arcs about the corner of our own
 * pavements, so the two directions never cross. Both routes start and end far out of sight
 * (`LIFE_REACH`).
 */
function buildRoutes(): Route[] {
  const step = 0.5;
  const line = (from: [number, number], to: [number, number]): [number, number][] => resample([from, to], step);
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
  // `arc` samples every half metre, the routes' step.
  const corner: [number, number] = [-NEAR_KERB, NEAR_KERB];
  const inner = NEAR_LANE - NEAR_KERB;
  const outer = FAR_LANE - NEAR_KERB;
  return [
    make([line([LIFE_REACH, NEAR_LANE], [-NEAR_KERB, NEAR_LANE]), arc(corner[0], corner[1], inner, 90, 180), line([-NEAR_LANE, NEAR_KERB], [-NEAR_LANE, -LIFE_REACH])], 9),
    make([line([-FAR_LANE, -LIFE_REACH], [-FAR_LANE, NEAR_KERB]), arc(corner[0], corner[1], outer, 180, 90), line([-NEAR_KERB, FAR_LANE], [LIFE_REACH, FAR_LANE])], 9),
  ];
}
