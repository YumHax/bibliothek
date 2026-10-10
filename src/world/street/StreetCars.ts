import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { wakefulnessAt } from '@/time/wakefulness';
import { DRIVER_SEAT, type CarModelId } from './carModel';
import { nightnessOf } from './streetAir';
import { CAR_PAINTS, VAN_PAINTS, catBay, type ParkedCar } from '../city/parkedCars';
import type { Vec2 } from './streetPlan';
import { ROAD_Y, allowedSpeed, approach, corneringSpeed, distanceNearest, headingAt, placeOnRoute, sampleRoute, type Route } from './traffic/driving';
import type { StreetTraffic } from './traffic/StreetTraffic';
import type { CollisionSet } from './traffic/ScriptedVehicle';
import { Car, ReverseView, bayBox, type Bay } from './traffic/Car';
import { VoicePool, type CarVoice, type MovingLamp } from './traffic/carVoices';
import { CarFleet } from './traffic/carFleet';
import { TAXI, rushAt } from '../city/traffic';
import { SpeechBubble } from '../people/SpeechBubble';
import { Walker } from '../people/Walker';
import { seededRng } from '@/random';
import { angleTo } from '@/math/angles';

// What the street's other road users and listeners take from here: the car's kinds and the voices' shapes.
export type { VehicleKind } from './traffic/Car';
export type { CarVoice, MovingLamp } from './traffic/carVoices';

/** A taxi stand at the kerb: where the taxi stands (its middle, heading), the kerb its fare steps onto, the door they come from or go to. */
export interface TaxiStop {
  at: Vec2;
  yaw: number;
  kerb: Vec2;
  door: Vec2;
}

export interface StreetCarsOptions {
  parked: readonly ParkedCar[];
  /** Every parking bay (middle, heading), taken or not (default: the parked cars' own): a driver may park in a free one. */
  bays?: readonly { at: Vec2; yaw: number }[];
  routes: readonly (readonly Vec2[])[];
  /** Cruising speed (m/s), seconds between two cars (scaled by how awake the city is), how many can drive at once. */
  speed: number;
  gap: readonly [number, number];
  cars: number;
  /** A driver stops for anyone standing this close ahead of the car. */
  stopFor: number;
  /** The player (the camera): cars stop for them. */
  viewer: THREE.Object3D;
  /** The lights, the obstacles on the road, the other vehicles. */
  traffic: StreetTraffic;
  /** The zone's collisions: the parked cars are solid there, and stop being so when one pulls out (none: solid in place, never moving). */
  collisions?: CollisionSet;
  /** Real seconds between two manoeuvres (a parked car pulling out, a driver parking); none: the parked cars stay put. */
  manoeuvres?: readonly [number, number];
  /** Taxis pulling in for a fare, and real seconds between two: the fare (`fare`) must be placed in the zone. */
  taxiStops?: readonly TaxiStop[];
  taxiEvery?: readonly [number, number];
  /** Drivers say a word to a player in their way (the walkable street's; never the cars seen through a window). */
  speaks?: boolean;
}

const PAINTS = CAR_PAINTS;
/** Cars already on their way when the player arrives: this many, somewhere between these shares of their route. */
const PREWARM = { cars: 2, from: 0.3, to: 0.65 };
/** Each driver's own pace: a share of the cruising speed drawn between these. */
const PACE = [0.82, 1.08] as const;
/** The voices and lamps a moving car gets lent (more than drive at once: pull-outs and parkers too). */
const SPARE_VOICES = 3;
/** A bend this sharp (radians) within this many metres ahead: the indicator goes on; how fast indicators blink (Hz). */
const SIGNAL = { turn: 0.6, ahead: 22, hz: 1.5 } as const;
/** Slowing by more than this (m/s²), or held standing: the brake lights are on. */
const BRAKING_AT = 0.8;
/** How quickly a car moves across its lane: a little standing, more as it rolls (m/s, plus this share of its speed). */
const SIDEWAYS = { creep: 0.15, rolling: 0.55 } as const;
/** Pulled over to the right for a siren behind (metres). */
const PULL_OVER = 1.3;
/** Kept waiting by the player: after this many toots the driver says so, swings out by `aside` (left) and creeps past at `crawl`. */
const EDGE = { after: 3, aside: -1.9, crawl: 2.2 } as const;
/** What a driver says, swinging out round a player standing in the road. */
const GRUMBLES = ['It’s a road, not a pavement!', 'Some of us have places to be.', 'Are you lost, love?', 'Mind yourself, then!', 'Unbelievable.'] as const;
/**
 * Parking: the driver stops this far past the bay, pulled `aside` towards the kerb (the traffic behind
 * passes), waits for the lane behind to clear (`clear` metres), then reverses in at `reverse` m/s.
 */
const PARK = { past: 7, aside: 1.9, clear: 14, reverse: 1.3, settle: 1.2 } as const;
/** Pulling out: the car joins its route this far ahead of the bay, after `wait` seconds with its indicator on, the lane clear for `clear` metres back. */
const PULL_OUT = { ahead: 9, wait: 2.2, clear: 30 } as const;
/** Pulling out of a bay or reversing into one needs this much room in front of it (no parked car's middle closer). */
const ROOM_AHEAD = 7;
/** Seconds a driver waits for a gap to pull out or reverse in before giving up. */
const PATIENCE = 20;
/** A bay or taxi stand belongs to the route whose line passes within this many metres, heading its way within this many radians. */
const SERVES = { reach: 8, heading: 0.5 } as const;
/** A taxi at its stand: a pause before the door opens, the time to let the fare go, and a limit on waiting for them. */
const FARE = { open: 1.2, leave: 1.6, patience: 25 } as const;
/** The fare's lines, clicked. */
const FARE_LINES = ['Can’t stop, sorry: the meter’s running.', 'Taxi! Oh, it’s mine.', 'Mind the puddles, the drivers never do.'] as const;

/**
 * The cars: parked along the kerbs, and a few driving through (up Park Street, along Front
 * Street past the roadworks into the side street, and the other way), in three shapes (a
 * hatchback, a saloon, a panel van), drawn by `traffic/carFleet` (instanced bodies, drivers, taxi
 * signs, headlight pools) and heard through `traffic/carVoices`. Drivers keep to their route's
 * samples at their own pace, slow for the corners (indicating), queue behind whatever drives
 * ahead (`traffic.vehicles`), stop at the crossing's red light and give way at the plain zebra,
 * brake for the player and for anything on the road (brake lights on; longer on a wet or snowy
 * road), pull over for a siren behind, and sound the horn at a player who will not get out of
 * the way, a few times, before saying so and edging round them. Now and then a parked car pulls
 * out of its bay, or a driver stops past a free one and reverses in (`manoeuvres`); taxis pull in
 * at their stands to drop a fare off or pick one up (`fare`, a passer-by). The parked cars are
 * solid (they stop being so when one pulls out); the driving ones never collide with the player.
 * How often a car comes follows how awake the city is and its rush hours. Snow settles on roofs
 * and bonnets.
 */
export class StreetCars extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  readonly colliders: THREE.Box3[];
  /** The taxis' passenger, walking between a stand and its door: place it in the zone at the origin (`taxiStops` only). */
  readonly fare: Walker | null = null;
  private readonly cars: Car[] = [];
  private readonly bays: Bay[] = [];
  private readonly stops: { stop: TaxiStop; route: number; along: number; aside: number }[] = [];
  private readonly voicePool: VoicePool;
  private readonly fleet: CarFleet;
  private readonly routes: Route[];
  private readonly random = seededRng();
  private spawnClock = 2;
  private manoeuvreClock: number;
  private taxiClock: number;
  private nextRoute = 0;
  private readonly eye = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  /** The next update puts a couple of cars mid-route (the street is never empty on arrival). */
  private prewarm = true;
  private readonly bubble = new SpeechBubble();
  private grumble = 0;
  private placed = false;
  private signalClock = 0;
  /** A free bay a driver on that route should take when one comes by (set when none was on its way). */
  private pendingPark: number | null = null;
  private readonly reverseViews = new Map<Car, ReverseView>();

  constructor(private readonly dayNight: DayNight, private readonly options: StreetCarsOptions) {
    super();
    this.name = 'StreetCars';
    this.routes = options.routes.map((points) => sampleRoute(points));
    const [m0, m1] = options.manoeuvres ?? [Infinity, Infinity];
    this.manoeuvreClock = m0 + this.random() * (m1 - m0);
    const [t0, t1] = options.taxiEvery ?? [Infinity, Infinity];
    this.taxiClock = (t0 + this.random() * (t1 - t0)) * 0.5;

    // Which shape each parked car is (`city/parkedCars`: the window view parks the same), and the driving ones'.
    const parkedModels = options.parked.map(({ shape }): CarModelId => shape);
    const drivingModels = Array.from({ length: options.cars }, (_, i): CarModelId => (i % 3 === 1 ? 'saloon' : i % 5 === 4 ? 'van' : i % 7 === 3 ? 'city' : i % 7 === 6 ? 'estate' : 'hatch'));
    this.fleet = new CarFleet(this, [...parkedModels, ...drivingModels]);

    // The bays: every one the plan has (taken or free), each with the route that passes it.
    for (const { at, yaw } of options.bays ?? options.parked) {
      const serves = this.servingRoute(at, yaw);
      this.bays.push({ at, yaw, car: null, route: serves?.route ?? -1, along: serves?.along ?? 0, cat: catBay(at), box: bayBox(at, yaw, 'van'), world: null });
    }
    const parkedIn: [Car, number][] = [];
    const taken = new Set<number>();
    options.parked.forEach(({ at, yaw, paint }, i) => {
      const model = parkedModels[i]!;
      const car = new Car(model, this.fleet.claim(model));
      this.fleet.paint(car, paint);
      this.cars.push(car);
      let bay = this.bays.findIndex((b, k) => !taken.has(k) && Math.hypot(b.at[0] - at[0], b.at[1] - at[1]) < 0.5);
      if (bay < 0) {
        this.bays.push({ at, yaw, car: null, route: -1, along: 0, cat: catBay(at), box: bayBox(at, yaw, model), world: null });
        bay = this.bays.length - 1;
      }
      taken.add(bay);
      parkedIn.push([car, bay]);
    });
    drivingModels.forEach((model, i) => {
      const car = new Car(model, this.fleet.claim(model));
      this.fleet.paint(car, PAINTS[i % PAINTS.length]!);
      this.cars.push(car);
    });
    this.fleet.flagAll();
    this.voicePool = new VoicePool(options.cars + SPARE_VOICES);

    // Taxi stands: the route past each, how far along, how far to its right the taxi stands.
    for (const stop of options.taxiStops ?? []) {
      const serves = this.servingRoute(stop.at, stop.yaw);
      if (!serves) continue;
      const yaw = placeOnRoute(this.routes[serves.route]!, serves.along, this.v);
      const aside = (stop.at[0] - this.v.x) * Math.sin(yaw) + (stop.at[1] - this.v.z) * Math.cos(yaw);
      this.stops.push({ stop, route: serves.route, along: serves.along, aside });
    }
    if (this.stops.length) {
      const fare = new Walker({ viewer: options.viewer, seed: 707, speed: 1.2, lines: FARE_LINES, label: 'Passer-by', labelWithin: 4 });
      fare.traverse((o) => {
        o.castShadow = false;
      });
      fare.setPresent(false);
      this.fare = fare;
    }

    this.add(this.bubble);
    // The parked cars into their bays, now that every mesh they show in is there.
    for (const [car, bay] of parkedIn) {
      this.settle(car, bay, false);
      this.fleet.show(car, this.cars.indexOf(car));
    }
    this.fleet.flagAll();
    // Without collisions to come and go in, the parked cars are solid where they stand.
    this.colliders = options.collisions ? [] : this.bays.filter((b) => b.car).map((b) => b.box);
    this.fleet.updateBounds(this.cars);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  /** The moving cars' poses, for the wet road's streaks of their lamps. */
  get lamps(): readonly MovingLamp[] {
    return this.voicePool.slots;
  }

  /** The moving cars, for the street's sound. */
  get voices(): readonly CarVoice[] {
    return this.voicePool.slots;
  }

  dispose(): void {
    for (const c of this.cars) this.options.traffic.vehicles.delete(c);
    for (const b of this.bays) if (b.world) this.options.collisions?.remove(b.world);
  }

  setZoneActive(active: boolean): void {
    if (active) this.prewarm = true;
  }

  update(dt: number): void {
    const s = this.dayNight.state;
    this.fleet.setNight(THREE.MathUtils.smoothstep(nightnessOf(s), 0.2, 0.6));
    this.options.viewer.getWorldPosition(this.eye);
    this.worldToLocal(this.eye);
    if (!this.placed) this.placeColliders();
    if (this.prewarm) {
      this.prewarm = false;
      for (let i = 0; i < PREWARM.cars; i++) {
        const route = i % this.routes.length;
        this.spawn(route, this.routes[route]!.length * (PREWARM.from + this.random() * (PREWARM.to - PREWARM.from)));
      }
    }

    this.spawnClock -= dt;
    if (this.spawnClock <= 0) {
      const [a, b] = this.options.gap;
      this.spawnClock = (a + this.random() * (b - a)) / Math.max(0.12, wakefulnessAt(s.hours) * rushAt(s.hours));
      this.spawn();
    }
    this.manoeuvreClock -= dt;
    if (this.manoeuvreClock <= 0) {
      const [a, b] = this.options.manoeuvres!;
      this.manoeuvreClock = (a + this.random() * (b - a)) / Math.max(0.3, wakefulnessAt(s.hours));
      // Keep the street about as full as the day began: park when bays have emptied, pull out when they have filled.
      let parked = 0;
      for (const bay of this.bays) if (bay.car) parked++;
      const parkChance = THREE.MathUtils.clamp(0.5 + (this.options.parked.length - parked) * 0.2, 0.05, 0.95);
      if (this.random() < parkChance) this.park();
      else this.pullOut();
    }
    this.taxiClock -= dt;
    if (this.taxiClock <= 0) {
      const [a, b] = this.options.taxiEvery!;
      this.taxiClock = (a + this.random() * (b - a)) / Math.max(0.3, wakefulnessAt(s.hours));
      this.callTaxi();
    }
    this.signalClock = (this.signalClock + dt * SIGNAL.hz) % 1;
    this.fleet.blink = this.signalClock < 0.5;
    this.grumble = Math.max(0, this.grumble - dt);

    let moved = false;
    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i]!;
      if (!car.active) continue;
      if (car.mode === 'drive') this.drive(car, dt);
      else if (car.mode === 'standing') this.stand(car, dt);
      else if (car.mode === 'reverse') this.reverse(car, dt);
      this.fleet.show(car, i);
      moved = true;
    }
    this.voicePool.sync();
    this.fleet.commit(this.cars, moved);
  }

  // --- Setting off, parking, taxis ---------------------------------------------------------------

  /** How many cars are on the road now. */
  private get onRoad(): number {
    let n = 0;
    for (const c of this.cars) if (c.active) n++;
    return n;
  }

  /**
   * A car sets off at the start of a route (the next in turn), unless the one before it has not
   * cleared the start yet; or, arriving, already `from` metres along route `forced`. Returns it.
   */
  private spawn(forced?: number, from = 0, wantTaxi = false): Car | null {
    if (this.onRoad >= this.options.cars + (wantTaxi ? 1 : 0)) return null;
    const route = forced ?? this.nextRoute;
    if (forced === undefined) this.nextRoute = (this.nextRoute + 1) % this.routes.length;
    const path = this.routes[route]!;
    if (this.cars.some((c) => c.active && c.path === path && Math.abs(c.distance - from) < 12)) return null;
    let free = 0;
    for (const c of this.cars) if (c.mode === 'away' && (!wantTaxi || c.model !== 'van')) free++;
    let pick = Math.floor(this.random() * free);
    const car = this.cars.find((c) => c.mode === 'away' && (!wantTaxi || c.model !== 'van') && pick-- === 0);
    if (!car) return null;
    // A new car each time: a fresh coat of paint, now and then a taxi's.
    car.taxi = wantTaxi || (car.model !== 'van' && this.random() < TAXI.share);
    const palette = car.model === 'van' ? VAN_PAINTS : PAINTS;
    this.fleet.paint(car, car.taxi ? TAXI.paint : palette[Math.floor(this.random() * palette.length)]!);
    this.start(car, path, route, from, from > 0 ? this.options.speed * 0.8 : this.options.speed);
    // A free bay waiting for someone on this route to take it.
    const bay = this.pendingPark;
    if (bay !== null && this.bays[bay]!.route === route && !car.taxi && this.bays[bay]!.along > from + 30) {
      this.pendingPark = null;
      car.job = { kind: 'park', bay, stopAt: this.bays[bay]!.along + PARK.past, waited: 0 };
    }
    return car;
  }

  /** Puts `car` on the road along `path` (following traffic route `route`, -1 none), `from` metres along it. */
  private start(car: Car, path: Route, route: number, from: number, speed: number): void {
    car.mode = 'drive';
    car.path = path;
    car.route = route;
    car.distance = from;
    car.speed = speed;
    car.cruise = this.options.speed * (PACE[0] + this.random() * (PACE[1] - PACE[0]));
    car.aside = 0;
    car.asideTo = 0;
    car.edging = false;
    car.reversing = false;
    car.hazards = false;
    car.job = null;
    car.yaw = placeOnRoute(path, from, car.position);
    this.options.traffic.vehicles.add(car);
    this.voicePool.lend(car);
  }

  /** A parked car (not the cat's) pulls out of its bay: indicator on a moment, then into the lane once it is clear. */
  private pullOut(): void {
    const candidates = this.bays.map((_, i) => i).filter((i) => {
      const b = this.bays[i]!;
      return b.car !== null && !b.cat && b.route >= 0 && this.roomAhead(i, ROOM_AHEAD) && Math.hypot(this.eye.x - b.at[0], this.eye.z - b.at[1]) > 2.5;
    });
    if (!candidates.length || this.onRoad >= this.options.cars + SPARE_VOICES - 1) return;
    const index = candidates[Math.floor(this.random() * candidates.length)]!;
    const bay = this.bays[index]!;
    const car = bay.car!;
    const route = this.routes[bay.route]!;
    // From the bay out to the lane, joining the route `ahead` metres on, and on along it to its end.
    const fx = Math.cos(bay.yaw);
    const fz = -Math.sin(bay.yaw);
    const join = bay.along + PULL_OUT.ahead;
    placeOnRoute(route, join, this.v);
    const ux = this.v.x - bay.at[0] - fx * ((this.v.x - bay.at[0]) * fx + (this.v.z - bay.at[1]) * fz);
    const uz = this.v.z - bay.at[1] - fz * ((this.v.x - bay.at[0]) * fx + (this.v.z - bay.at[1]) * fz);
    const points: Vec2[] = [
      [bay.at[0], bay.at[1]],
      [bay.at[0] + fx * 1.2 + ux * 0.04, bay.at[1] + fz * 1.2 + uz * 0.04],
      [bay.at[0] + fx * 4.8 + ux * 0.55, bay.at[1] + fz * 4.8 + uz * 0.55],
      [this.v.x, this.v.z],
    ];
    for (let d = join + 5; d < route.length; d += 5) {
      placeOnRoute(route, d, this.v);
      points.push([this.v.x, this.v.z]);
    }
    this.unsettle(car, index);
    this.start(car, sampleRoute(points), bay.route, 0, 0);
    car.mode = 'standing';
    // Towards the lane: left of the bay's heading is (-sin, -cos).
    car.signal = ux * -Math.sin(bay.yaw) + uz * -Math.cos(bay.yaw) > 0 ? -1 : 1;
    car.job = { kind: 'pullOut', clock: PULL_OUT.wait, route: bay.route };
  }

  /** A driver on its way past a free bay will park in it (or the next one setting off on that route). */
  private park(): void {
    const free = this.bays.map((_, i) => i).filter((i) => !this.bays[i]!.car && this.bays[i]!.route >= 0 && this.roomAhead(i, ROOM_AHEAD) && !this.cars.some((c) => c.job?.kind === 'park' && c.job.bay === i));
    if (!free.length) return;
    const index = free[Math.floor(this.random() * free.length)]!;
    const bay = this.bays[index]!;
    const path = this.routes[bay.route]!;
    const driver = this.cars.find((c) => c.mode === 'drive' && c.path === path && !c.job && !c.taxi && c.distance < bay.along - 30);
    if (driver) driver.job = { kind: 'park', bay: index, stopAt: bay.along + PARK.past, waited: 0 };
    else this.pendingPark = index;
  }

  /** A taxi sets off for a stand to drop a fare off there or pick one up (the fare walks between it and the stand's door). */
  private callTaxi(): void {
    if (!this.fare || this.fare.isPresent || this.cars.some((c) => c.job?.kind === 'fare')) return;
    const k = Math.floor(this.random() * this.stops.length);
    const stand = this.stops[k];
    if (!stand) return;
    const car = this.spawn(stand.route, 0, true);
    if (car) car.job = { kind: 'fare', stop: k, stopAt: stand.along, aside: stand.aside, pickUp: this.random() < 0.5, phase: 'approach', clock: 0 };
  }

  // --- Driving --------------------------------------------------------------------------------

  /** On the road: the speed the bend, the errand ahead and the traffic allow, the horn and the swing round a player in the way, then the move. */
  private drive(car: Car, dt: number): void {
    const path = car.path!;
    const traffic = this.options.traffic;
    let cap = corneringSpeed(path, car.distance, car.cruise);
    const job = car.job;
    const errand = job && (job.kind === 'park' || job.kind === 'fare') ? job : null;
    let pulling = false;
    if (errand) {
      // Ease to a stop at the bay's or the stand's spot, pulled towards the kerb.
      const left = errand.stopAt - car.distance;
      cap = Math.min(cap, left <= 0 ? 0 : Math.sqrt(2 * 1.5 * left) + 0.2);
      if (left < 28) {
        car.asideTo = errand.kind === 'park' ? PARK.aside : errand.aside;
        pulling = true;
      }
    }
    if (car.edging) cap = Math.min(cap, EDGE.crawl);
    const viewer = car.edging && this.clearOnceEdged(car) ? null : this.eye;
    const { target, heldBy, pullOver } = allowedSpeed(traffic, car, cap, viewer, this.options.stopFor);
    const before = car.speed;
    car.speed = approach(car.speed, target, dt, 2.4, traffic.grip);
    car.braking = (before - car.speed) / Math.max(dt, 1e-3) > BRAKING_AT || (car.speed < 0.3 && heldBy !== null);
    car.horn.update(dt, car.speed, heldBy, traffic.carsGreen);
    this.edgeRound(car);
    if (!pulling && !car.edging) car.asideTo = pullOver ? PULL_OVER : 0;
    this.ease(car, dt);
    car.distance += car.speed * dt;
    car.rolled += car.speed * dt;

    if (errand && car.distance >= errand.stopAt - 0.15 && car.speed < 0.6) {
      this.pullUp(car, errand);
      return;
    }
    if (car.distance >= path.length) {
      this.retire(car);
      return;
    }
    car.signal = car.edging ? -1 : pulling || pullOver ? 1 : this.bendSignal(path, car.distance);
    this.place(car);
  }

  /** Kept waiting by the player long enough: a word, and round them; back into the lane once they are behind. */
  private edgeRound(car: Car): void {
    if (!car.edging && car.horn.atViewer >= EDGE.after) {
      car.edging = true;
      car.asideTo = EDGE.aside;
      this.say(car, GRUMBLES[Math.floor(this.random() * GRUMBLES.length)]!);
    } else if (car.edging && this.leftBehind(car)) {
      car.edging = false;
      car.asideTo = 0;
    }
  }

  /** At the bay's or the stand's spot: stands, brake lights on; the taxi puts its hazards on and the door opens next. */
  private pullUp(car: Car, errand: Extract<NonNullable<Car['job']>, { kind: 'park' | 'fare' }>): void {
    car.speed = 0;
    car.mode = 'standing';
    car.braking = true;
    if (errand.kind === 'fare') {
      errand.phase = 'opening';
      errand.clock = 0;
      car.hazards = true;
    }
    this.place(car);
  }

  /** Standing in the lane or its bay: waiting to pull out, to reverse in, or for the taxi's fare. */
  private stand(car: Car, dt: number): void {
    const job = car.job;
    car.braking = true;
    car.speed = 0;
    if (!job) {
      car.mode = 'drive';
      return;
    }
    if (job.kind === 'pullOut') {
      job.clock -= dt;
      if (job.clock <= 0 && this.laneClear(car, PULL_OUT.clear, 7.5)) {
        car.mode = 'drive';
        car.job = null;
      } else if (job.clock < -PATIENCE) {
        // Never a gap: stays parked after all.
        const bay = this.bays.findIndex((b) => !b.car && Math.hypot(b.at[0] - car.position.x, b.at[1] - car.position.z) < 0.5);
        if (bay >= 0) this.settle(car, bay, true);
        else car.mode = 'drive';
      }
      return;
    }
    if (job.kind === 'park') {
      car.signal = 1;
      job.waited += dt;
      if (job.waited >= PARK.settle && this.laneClear(car, PARK.clear, 4)) this.backIn(car, job.bay);
      else if (job.waited > PATIENCE || this.bays[job.bay]!.car) {
        // Given up (or someone took the bay): drives on.
        car.job = null;
        car.asideTo = 0;
        car.mode = 'drive';
      }
      return;
    }
    this.serveFare(car, job, dt);
  }

  /** The taxi at its stand: hazards on, the door opens, the fare gets out and goes, or comes and gets in; then off. */
  private serveFare(car: Car, job: Extract<NonNullable<Car['job']>, { kind: 'fare' }>, dt: number): void {
    const stand = this.stops[job.stop]!;
    const fare = this.fare!;
    job.clock += dt;
    car.hazards = true;
    car.signal = 0;
    const kerbSide = (out: THREE.Vector3): THREE.Vector3 => {
      // By the rear door on the kerb's side (the right).
      const fx = Math.cos(car.yaw);
      const fz = -Math.sin(car.yaw);
      return out.set(car.position.x - fx * 0.6 + Math.sin(car.yaw) * (car.width / 2 + 0.45), 0, car.position.z - fz * 0.6 + Math.cos(car.yaw) * (car.width / 2 + 0.45));
    };
    const [kx, kz] = stand.stop.kerb;
    const [dx, dz] = stand.stop.door;
    if (job.phase === 'opening' && job.clock >= FARE.open) {
      job.phase = 'walking';
      job.clock = 0;
      car.doors++;
      const side = kerbSide(new THREE.Vector3());
      const kerb = new THREE.Vector3(kx, 0, kz);
      const door = new THREE.Vector3(dx, 0, dz);
      const done = (): void => {
        fare.setPresent(false);
        if (job.pickUp) car.doors++;
        job.phase = 'leaving';
        job.clock = 0;
      };
      if (job.pickUp) {
        fare.setPresent(true, door);
        fare.walk([kerb, side], done);
      } else {
        fare.setPresent(true, side);
        fare.walk([kerb, door], done);
      }
    } else if (job.phase === 'walking' && job.clock > FARE.patience) {
      fare.setPresent(false);
      job.phase = 'leaving';
      job.clock = 0;
    } else if (job.phase === 'leaving' && job.clock >= FARE.leave) {
      car.hazards = false;
      car.job = null;
      car.asideTo = 0;
      car.mode = 'drive';
      car.signal = -1;
    }
  }

  /** Stopped past the bay, the lane behind clear: reverse in along an S into it. */
  private backIn(car: Car, index: number): void {
    const bay = this.bays[index]!;
    const fx = Math.cos(bay.yaw);
    const fz = -Math.sin(bay.yaw);
    const [bx, bz] = bay.at;
    // The way across from the bay to where the car stands.
    const rx = car.position.x - bx;
    const rz = car.position.z - bz;
    const along = rx * fx + rz * fz;
    const ux = rx - fx * along;
    const uz = rz - fz * along;
    const points: Vec2[] = [
      [car.position.x, car.position.z],
      [bx + fx * 4.4 + ux * 0.8, bz + fz * 4.4 + uz * 0.8],
      [bx + fx * 1.7 + ux * 0.3, bz + fz * 1.7 + uz * 0.3],
      [bx + fx * 0.5 + ux * 0.03, bz + fz * 0.5 + uz * 0.03],
      [bx, bz],
    ];
    car.path = sampleRoute(points);
    car.distance = 0;
    car.aside = 0;
    car.asideTo = 0;
    car.mode = 'reverse';
    car.reversing = true;
    car.signal = 1;
    car.bay = index;
  }

  private reverse(car: Car, dt: number): void {
    const path = car.path!;
    let view = this.reverseViews.get(car);
    if (!view) this.reverseViews.set(car, (view = new ReverseView(car)));
    view.yaw = headingAt(path, car.distance);
    const left = path.length - car.distance;
    const cap = Math.min(PARK.reverse, left <= 0 ? 0 : Math.sqrt(2 * 1 * left) + 0.1);
    const { target } = allowedSpeed(this.options.traffic, view, cap, this.eye, 1.2);
    // Never backs into (or comes to rest, solid, on) a player standing in the bay.
    const { at, yaw } = this.bays[car.bay]!;
    const lengthwise = Math.abs(Math.cos(yaw)) > 0.5;
    const inBay = Math.abs(this.eye.x - at[0]) < (lengthwise ? 3.2 : 1.6) && Math.abs(this.eye.z - at[1]) < (lengthwise ? 1.6 : 3.2);
    const before = car.speed;
    car.speed = approach(car.speed, inBay ? 0 : target, dt, 1.2, this.options.traffic.grip);
    car.braking = before - car.speed > 0.01 || car.speed < 0.1;
    car.distance += car.speed * dt;
    car.rolled -= car.speed * dt;
    if (left <= 0.05 && !inBay) {
      this.settle(car, car.bay, true);
      return;
    }
    car.yaw = placeOnRoute(path, car.distance, car.position) + Math.PI;
  }

  // --- Bays, collisions -----------------------------------------------------------------------

  /** `car` comes to rest in bay `index`: parked, solid, its lamps off, its voice handed back. */
  private settle(car: Car, index: number, arriving: boolean): void {
    const bay = this.bays[index]!;
    bay.car = car;
    car.bay = index;
    car.mode = 'parked';
    car.job = null;
    car.speed = 0;
    car.aside = 0;
    car.reversing = false;
    car.hazards = false;
    car.signal = 0;
    car.taxi = false;
    car.position.set(bay.at[0], ROAD_Y, bay.at[1]);
    car.yaw = bay.yaw;
    this.options.traffic.vehicles.delete(car);
    this.voicePool.release(car);
    // Solid again, the size of the car now in it.
    bay.box.copy(bayBox(bay.at, bay.yaw, car.model));
    if (bay.world) {
      bay.world.copy(bay.box).applyMatrix4(this.matrixWorld);
      this.options.collisions?.add(bay.world);
    }
    if (arriving) {
      this.fleet.show(car, this.cars.indexOf(car));
      this.fleet.flagModel(car.model);
    }
  }

  /** `car` leaves bay `index`: no longer solid there. */
  private unsettle(car: Car, index: number): void {
    const bay = this.bays[index]!;
    bay.car = null;
    car.bay = -1;
    if (bay.world) this.options.collisions?.remove(bay.world);
  }

  /** The parked cars' boxes into the zone's collisions, once the cars have a place in the world. */
  private placeColliders(): void {
    this.placed = true;
    const collisions = this.options.collisions;
    if (!collisions) return;
    this.updateWorldMatrix(true, false);
    for (const bay of this.bays) {
      bay.world = bay.box.clone().applyMatrix4(this.matrixWorld);
      if (bay.car) collisions.add(bay.world);
    }
  }

  /** The route passing `at` heading `yaw` (within `SERVES`), and how far along it. */
  private servingRoute(at: Vec2, yaw: number): { route: number; along: number } | null {
    for (let r = 0; r < this.routes.length; r++) {
      const route = this.routes[r]!;
      const along = distanceNearest(route, at);
      const heading = placeOnRoute(route, along, this.v);
      if (Math.hypot(this.v.x - at[0], this.v.z - at[1]) < SERVES.reach && Math.abs(angleTo(yaw, heading)) < SERVES.heading) return { route: r, along };
    }
    return null;
  }

  /**
   * Nothing going `car`'s way within `reach` metres behind it, nor standing just ahead, within `across`
   * metres to either side (its lane, or from a bay the lane beside it).
   */
  private laneClear(car: Car, reach: number, across: number): boolean {
    const hx = Math.cos(car.yaw);
    const hz = -Math.sin(car.yaw);
    for (const v of this.options.traffic.vehicles) {
      if (v === car || !v.active) continue;
      const rx = v.position.x - car.position.x;
      const rz = v.position.z - car.position.z;
      const along = rx * hx + rz * hz;
      const lateral = Math.abs(rx * hz - rz * hx);
      // Something coming, or standing close by (one standing further back is waiting for this car, or for something else).
      if (lateral < across && along > -reach && along < 6 && Math.cos(v.yaw - car.yaw) > 0.3 && (v.speed > 0.3 || along > -7)) return false;
    }
    return true;
  }

  /** Whether no parked car stands within `metres` ahead of bay `index` (in its heading): room to pull out of it, or reverse into it. */
  private roomAhead(index: number, metres: number): boolean {
    const bay = this.bays[index]!;
    const fx = Math.cos(bay.yaw);
    const fz = -Math.sin(bay.yaw);
    return this.bays.every((other, k) => {
      if (k === index || !other.car) return true;
      const rx = other.at[0] - bay.at[0];
      const rz = other.at[1] - bay.at[1];
      const along = rx * fx + rz * fz;
      return Math.abs(rx * fz - rz * fx) > 1.5 || along <= 0 || along > metres;
    });
  }

  // --- Small helpers --------------------------------------------------------------------------

  /** The indicator for the bend ahead on `path`: -1 left, 1 right, 0 none. */
  private bendSignal(path: Route, distance: number): -1 | 0 | 1 {
    const here = headingAt(path, distance);
    const next = headingAt(path, distance + SIGNAL.ahead);
    const turn = angleTo(here, next);
    return Math.abs(turn) < SIGNAL.turn ? 0 : turn > 0 ? -1 : 1;
  }

  /** Whether the player a car is edging round is past (behind it), or has gone off the road ahead of it. */
  private leftBehind(car: Car): boolean {
    const rx = this.eye.x - car.position.x;
    const rz = this.eye.z - car.position.z;
    const along = rx * Math.cos(car.yaw) - rz * Math.sin(car.yaw);
    const across = rx * Math.sin(car.yaw) + rz * Math.cos(car.yaw);
    return along < -car.length || along > 25 || Math.abs(across) > 4.5;
  }

  /** Whether, once swung out to `asideTo`, the car clears the player standing ahead (or they are behind it already). */
  private clearOnceEdged(car: Car): boolean {
    const rx = this.eye.x - car.position.x;
    const rz = this.eye.z - car.position.z;
    const hx = Math.cos(car.yaw);
    const hz = -Math.sin(car.yaw);
    // Right of the heading is (sin yaw, cos yaw): where the player is across, from the line the car will be on.
    const across = rx * Math.sin(car.yaw) + rz * Math.cos(car.yaw) - (car.asideTo - car.aside);
    return rx * hx + rz * hz < 0 || Math.abs(across) >= car.width / 2 + 0.6;
  }

  /** Eases the car across its lane towards `asideTo`: little standing, more as it rolls (a car steers, it does not slide). */
  private ease(car: Car, dt: number): void {
    const rate = (SIDEWAYS.creep + SIDEWAYS.rolling * car.speed) * dt;
    car.aside += THREE.MathUtils.clamp(car.asideTo - car.aside, -rate, rate);
  }

  /** Where the car is along its path, `aside` metres to the right of its line. */
  private place(car: Car): void {
    car.yaw = placeOnRoute(car.path!, car.distance, car.position);
    // Right of the heading is (sin yaw, cos yaw).
    car.position.x += Math.sin(car.yaw) * car.aside;
    car.position.z += Math.cos(car.yaw) * car.aside;
  }

  /** Off the end of its path: gone. */
  private retire(car: Car): void {
    car.mode = 'away';
    car.speed = 0;
    car.job = null;
    car.path = null;
    this.options.traffic.vehicles.delete(car);
    this.voicePool.release(car);
    const i = this.cars.indexOf(car);
    if (i >= 0) this.fleet.show(car, i);
  }

  /** The driver says something (`text`) from behind the wheel: one at a time. */
  private say(car: Car, text: string): void {
    if (this.grumble > 0 || !this.options.speaks) return;
    this.grumble = 6;
    const seat = DRIVER_SEAT[car.model];
    this.bubble.position.set(seat.x, ROAD_Y + seat.belt + 0.75, seat.z).applyAxisAngle(THREE.Object3D.DEFAULT_UP, car.yaw).add(car.position).setY(ROAD_Y + seat.belt + 0.75);
    this.bubble.say(text, 2.8);
  }
}
