import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { seededRandom } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { wakefulnessAt } from '@/time/wakefulness';
import { CAR_SIZES, DRIVER_SEAT, carGeometries, type CarModelId } from './carModel';
import { nightnessOf } from './streetAir';
import { snowCovered } from './snowCover';
import { CAR_PAINTS, VAN_PAINTS, catBay, type ParkedCar } from '../city/parkedCars';
import type { Vec2 } from './streetPlan';
import { Horn, ROAD_Y, allowedSpeed, approach, corneringSpeed, distanceNearest, headingAt, placeOnRoute, sampleRoute, type DriverView, type Route } from './traffic/driving';
import type { RoadVehicle, StreetTraffic } from './traffic/StreetTraffic';
import type { CollisionSet } from './traffic/ScriptedVehicle';
import type { SirenKind } from './traffic/Emergency';
import { LampMaterial, lampStates } from './traffic/lampMaterial';
import { WheelMaterial, rollAngle, wheelAngles } from './traffic/wheelSpin';
import { TAXI, rushAt } from '../city/traffic';
import { VEHICLES } from '../city/vehicles';
import { createCanvas } from '@/covers/generated/canvasUtils';
import { GROUND, RENDER_ORDER, onSurface } from '../surface/layers';
import { SpeechBubble } from '../people/SpeechBubble';
import { Walker } from '../people/Walker';

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

/** What drives on the street, as the street's sound tells them apart. */
export type VehicleKind = 'car' | 'bus' | 'van' | 'lorry' | 'bike' | 'scooter' | 'moto' | 'courier' | 'ambulance' | 'police' | 'fire';

/**
 * A moving vehicle, as the street's sound hears it: where it is (zone-local), how fast it goes,
 * what it is, and how many times its driver has sounded the horn (a counter: a new toot when it
 * grows). The rest is optional detail some road users give: braking, reversing, its doors
 * (`doorSlams`, a counter: a door opened or shut), its siren's service, the car's shape, a taxi.
 */
export interface CarVoice {
  readonly position: THREE.Vector3;
  readonly speed: number;
  readonly active: boolean;
  readonly honks: number;
  readonly kind: VehicleKind;
  readonly braking?: boolean;
  readonly reversing?: boolean;
  readonly doorSlams?: number;
  readonly siren?: SirenKind;
  readonly model?: CarModelId;
  readonly taxi?: boolean;
}

/** A driving car's pose, for what lights up round it (the wet road's streaks, `relief/WetGround`). */
export interface MovingLamp {
  readonly position: THREE.Vector3;
  readonly yaw: number;
  readonly active: boolean;
  readonly length: number;
}

const PAINTS = CAR_PAINTS;
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const MODELS: readonly CarModelId[] = ['hatch', 'saloon', 'van'];
/** A taxi's roof sign: size (along, up, across) and where it sits (along from the middle, over the roof). */
const TAXI_SIGN = { size: [0.2, 0.14, 0.55] as const, along: -0.25, lift: 0.07 };
/** The pool of the headlights on the road ahead of a driving car at night: how far it reaches, how wide it spreads, how bright. */
const BEAM = { length: 9, width: 4.6, strength: 0.55 };
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

type Mode = 'away' | 'drive' | 'standing' | 'reverse' | 'parked';

/** A driver's errand: parking in a bay, pulling out of one, pulling in at a taxi stand. */
type Job =
  | { kind: 'park'; bay: number; stopAt: number; waited: number }
  | { kind: 'pullOut'; clock: number; route: number }
  | { kind: 'fare'; stop: number; stopAt: number; aside: number; pickUp: boolean; phase: 'approach' | 'opening' | 'walking' | 'leaving'; clock: number };

/** A parking bay: where, its heading, who stands in it, the route that passes it (and where along), whether the cat's car is in it. */
interface Bay {
  at: Vec2;
  yaw: number;
  car: Car | null;
  route: number;
  along: number;
  cat: boolean;
  /** Zone-local, and in the world once placed (null: not added to the collisions). */
  box: THREE.Box3;
  world: THREE.Box3 | null;
}

/** One of the cars on the street, parked or driving: its slot in its shape's instanced meshes. */
class Car implements RoadVehicle, DriverView {
  readonly position = new THREE.Vector3();
  readonly horn = new Horn();
  readonly self: RoadVehicle = this;
  mode: Mode = 'away';
  /** The way it drives now (a route, a pull-out joining one, a reverse into a bay), and how far along. */
  path: Route | null = null;
  /** Which traffic route its path follows (for the spacing between cars setting off), -1 none. */
  route = -1;
  distance = 0;
  speed = 0;
  yaw = 0;
  cruise = 0;
  /** Metres to the right of its line (pulled over, pulled in, edging round), eased towards `asideTo`. */
  aside = 0;
  asideTo = 0;
  taxi = false;
  braking = false;
  reversing = false;
  hazards = false;
  signal: -1 | 0 | 1 = 0;
  edging = false;
  /** Metres its wheels have rolled (back counts back). */
  rolled = 0;
  bay = -1;
  job: Job | null = null;
  voice: VoiceSlot | null = null;
  doors = 0;

  constructor(
    readonly model: CarModelId,
    readonly slot: number,
  ) {}

  get length(): number {
    return CAR_SIZES[this.model].length;
  }

  get width(): number {
    return CAR_SIZES[this.model].width;
  }

  get kind(): VehicleKind {
    return this.model === 'van' ? 'van' : 'car';
  }

  /** On the road (driving, standing in the lane, reversing): the others queue behind it. */
  get active(): boolean {
    return this.mode !== 'away' && this.mode !== 'parked';
  }

  get lit(): boolean {
    return this.active;
  }
}

/** What the street's sound and the wet road hear and see of a moving car: a slot lent to it while it moves. */
class VoiceSlot implements CarVoice, MovingLamp {
  readonly position = new THREE.Vector3();
  speed = 0;
  active = false;
  honks = 0;
  kind: VehicleKind = 'car';
  yaw = 0;
  length = 4;
  braking = false;
  reversing = false;
  doorSlams = 0;
  model: CarModelId = 'hatch';
  taxi = false;
  car: Car | null = null;
  private seenHonks = 0;
  private seenDoors = 0;

  lend(car: Car): void {
    this.car = car;
    this.seenHonks = car.horn.honks;
    this.seenDoors = car.doors;
    this.kind = car.kind;
    this.model = car.model;
    this.length = car.length;
  }

  sync(): void {
    const car = this.car;
    this.active = car !== null && car.active;
    if (!car) return;
    this.position.copy(car.position);
    this.speed = car.speed;
    this.yaw = car.yaw;
    this.braking = car.braking;
    this.reversing = car.reversing;
    this.taxi = car.taxi;
    this.honks += car.horn.honks - this.seenHonks;
    this.seenHonks = car.horn.honks;
    this.doorSlams += car.doors - this.seenDoors;
    this.seenDoors = car.doors;
  }
}

/** One car shape's instanced meshes (body, glass, tyres and trim, lamps), their per-instance lamp states and wheel angles. */
interface ModelSet {
  body: THREE.InstancedMesh;
  glass: THREE.InstancedMesh;
  wheels: THREE.InstancedMesh;
  lamps: THREE.InstancedMesh;
  lampState: THREE.InstancedBufferAttribute;
  wheelAngle: THREE.InstancedBufferAttribute;
  used: number;
}

/** The view a reversing car drives by: its travel heading (the nose points the other way). */
class ReverseView implements DriverView {
  yaw = 0;
  constructor(readonly car: Car) {}
  get position(): THREE.Vector3 {
    return this.car.position;
  }
  get speed(): number {
    return this.car.speed;
  }
  get length(): number {
    return this.car.length;
  }
  get width(): number {
    return this.car.width;
  }
  get self(): RoadVehicle {
    return this.car;
  }
}

/**
 * The cars: parked along the kerbs, and a few driving through (up Park Street, along Front
 * Street past the roadworks into the side street, and the other way), in three shapes (a
 * hatchback, a saloon, a panel van), each shape instanced (body, glass, tyres with the trim and
 * the cabin seen through the tinted glass, lamps with the plates: four draw calls a shape, plus
 * the drivers' figures, the taxis' signs and the headlight pools). Drivers keep to their route's
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
  private readonly slots: VoiceSlot[] = [];
  private readonly sets = new Map<CarModelId, ModelSet>();
  private readonly lampMaterial = new LampMaterial(true);
  private readonly routes: Route[];
  private readonly random = seededRandom(Date.now() & 0xffff);
  private readonly color = new THREE.Color();
  private spawnClock = 2;
  private manoeuvreClock: number;
  private taxiClock: number;
  private nextRoute = 0;
  private readonly scratch = new THREE.Matrix4();
  private readonly lift = new THREE.Matrix4();
  private readonly seat = new THREE.Matrix4();
  private readonly eye = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  private readonly lampValue = new THREE.Vector4();
  /** The model sets moved this frame (reused: no set a frame). */
  private readonly touched = new Set<ModelSet>();
  /** The taxis' roof signs, one slot per car, and their lit material. */
  private readonly signs: THREE.InstancedMesh;
  private readonly signMaterial = new THREE.MeshBasicMaterial({ color: 0xf2d27a });
  /** The drivers seen through the glass: heads and shoulders, one slot per car. */
  private readonly heads: THREE.InstancedMesh;
  private readonly shoulders: THREE.InstancedMesh;
  /** The next update puts a couple of cars mid-route (the street is never empty on arrival). */
  private prewarm = true;
  /** The headlights' pools on the road, one slot per car (additive, the canvas alpha kept). */
  private readonly beams: THREE.InstancedMesh;
  private readonly beamMaterial: THREE.MeshBasicMaterial;
  private readonly beamLocal = new THREE.Matrix4();
  /** The dark under each car (no sky reaches under it): a soft rectangle on the road, one slot per car. */
  private readonly shades: THREE.InstancedMesh;
  private readonly shadeLocal = new THREE.Matrix4();
  /** One sphere round every car shown, shared by all the meshes (they are culled as one, kept up to date as cars move). */
  private readonly bounds = new THREE.Sphere();
  private readonly box = new THREE.Box3();
  private readonly bubble = new SpeechBubble();
  private grumble = 0;
  private placed = false;
  private signalClock = 0;
  /** A free bay a driver on that route should take when one comes by (set when none was on its way). */
  private pendingPark: number | null = null;

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
    const drivingModels = Array.from({ length: options.cars }, (_, i): CarModelId => (i % 3 === 1 ? 'saloon' : i % 5 === 4 ? 'van' : 'hatch'));

    const body = snowCovered(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
    // Tinted, see-through: the seats and the driver show behind it.
    const glass = snowCovered(new THREE.MeshStandardMaterial({ color: 0x1a232b, roughness: 0.06, transparent: true, opacity: 0.66, depthWrite: false }));
    // Its own, not the palette's: an instanced mesh sharing a material with plain meshes (the bus's wheels) switches programs every draw.
    const tyres = new WheelMaterial(true);
    for (const model of MODELS) {
      const parked = parkedModels.filter((m) => m === model).length;
      const driving = drivingModels.filter((m) => m === model).length;
      const count = parked + driving;
      if (!count) continue;
      const g = carGeometries(model);
      const set: ModelSet = {
        body: new THREE.InstancedMesh(g.body, body, count),
        glass: new THREE.InstancedMesh(g.glass, glass, count),
        wheels: new THREE.InstancedMesh(g.wheels, tyres, count),
        lamps: new THREE.InstancedMesh(g.lamps, this.lampMaterial, count),
        lampState: lampStates(g.lamps, count),
        wheelAngle: wheelAngles(g.wheels, count),
        used: 0,
      };
      for (const mesh of [set.body, set.glass, set.wheels, set.lamps]) {
        mesh.castShadow = mesh !== set.lamps && mesh !== set.glass;
        mesh.receiveShadow = mesh !== set.lamps;
        mesh.boundingSphere = this.bounds;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        for (let i = 0; i < count; i++) mesh.setMatrixAt(i, HIDDEN);
        this.add(mesh);
      }
      set.glass.renderOrder = RENDER_ORDER.glass;
      this.sets.set(model, set);
    }

    // The bays: every one the plan has (taken or free), each with the route that passes it.
    for (const { at, yaw } of options.bays ?? options.parked) {
      const serves = this.servingRoute(at, yaw);
      this.bays.push({ at, yaw, car: null, route: serves?.route ?? -1, along: serves?.along ?? 0, cat: catBay(at), box: bayBox(at, yaw, 'van'), world: null });
    }
    const parkedIn: [Car, number][] = [];
    const taken = new Set<number>();
    options.parked.forEach(({ at, yaw, paint }, i) => {
      const model = parkedModels[i]!;
      const set = this.sets.get(model)!;
      const car = new Car(model, set.used++);
      set.body.setColorAt(car.slot, this.color.setHex(paint));
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
      const set = this.sets.get(model)!;
      const car = new Car(model, set.used++);
      set.body.setColorAt(car.slot, this.color.setHex(PAINTS[i % PAINTS.length]!));
      this.cars.push(car);
    });
    for (const set of this.sets.values()) {
      if (set.body.instanceColor) set.body.instanceColor.needsUpdate = true;
      this.flag(set);
    }
    for (let i = 0; i < options.cars + SPARE_VOICES; i++) this.slots.push(new VoiceSlot());

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

    const n = this.cars.length;
    this.signs = this.instanced(new THREE.BoxGeometry(...TAXI_SIGN.size), this.signMaterial, n);
    this.heads = this.instanced(new THREE.SphereGeometry(0.1, 10, 8).translate(0.04, 0.38, 0), new THREE.MeshStandardMaterial({ color: 0xc99b7c, roughness: 0.7 }), n);
    this.shoulders = this.instanced(new THREE.BoxGeometry(0.24, 0.3, 0.42).translate(-0.02, 0.14, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }), n);
    const clothes = seededRandom(311);
    for (let i = 0; i < n; i++) this.shoulders.setColorAt(i, this.color.setHSL(clothes(), 0.25, 0.18 + 0.3 * clothes()));
    this.beamMaterial = onSurface(
      new THREE.MeshBasicMaterial({
        map: beamTexture(),
        color: 0x000000,
        transparent: true,
        blending: THREE.CustomBlending,
        blendSrc: THREE.SrcAlphaFactor,
        blendDst: THREE.OneFactor,
        blendSrcAlpha: THREE.ZeroFactor,
        blendDstAlpha: THREE.OneFactor,
        fog: true,
      }),
      GROUND.lampPool,
      { depthWrite: false },
    );
    // Flat on the road, u forward from just behind the nose.
    this.beams = this.instanced(new THREE.PlaneGeometry(BEAM.length, BEAM.width).rotateX(-Math.PI / 2), this.beamMaterial, n);
    this.beams.castShadow = false;
    this.beams.receiveShadow = false;
    this.beams.renderOrder = RENDER_ORDER.groundGlow;
    this.beams.visible = false;
    const shade = onSurface(new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: shadeTexture(), transparent: true, opacity: SHADE_OPACITY, fog: true }), GROUND.carShade, { depthWrite: false });
    this.shades = this.instanced(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), shade, n);
    this.shades.castShadow = false;
    this.shades.receiveShadow = false;
    this.shades.renderOrder = RENDER_ORDER.contactShadow;
    this.add(this.bubble);
    // The parked cars into their bays, now that every mesh they show in is there.
    for (const [car, bay] of parkedIn) {
      this.settle(car, bay, false);
      this.show(car, this.cars.indexOf(car));
    }
    for (const set of this.sets.values()) this.flag(set);
    // Without collisions to come and go in, the parked cars are solid where they stand.
    this.colliders = options.collisions ? [] : this.bays.filter((b) => b.car).map((b) => b.box);
    this.updateBounds();
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  /** The moving cars' poses, for the wet road's streaks of their lamps. */
  get lamps(): readonly MovingLamp[] {
    return this.slots;
  }

  /** The moving cars, for the street's sound. */
  get voices(): readonly CarVoice[] {
    return this.slots;
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
    const night = THREE.MathUtils.smoothstep(nightnessOf(s), 0.2, 0.6);
    this.lampMaterial.setNight(night);
    this.signMaterial.color.setRGB(0.9 + 1.6 * night, 0.75 + 1.3 * night, 0.35 + 0.6 * night);
    this.beamMaterial.color.setRGB(1, 0.94, 0.82).multiplyScalar(BEAM.strength * night);
    this.beams.visible = night > 0.02;
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
    this.grumble = Math.max(0, this.grumble - dt);

    const touched = this.touched;
    touched.clear();
    let moved = false;
    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i]!;
      if (!car.active) continue;
      if (car.mode === 'drive') this.drive(car, dt);
      else if (car.mode === 'standing') this.stand(car, dt);
      else if (car.mode === 'reverse') this.reverse(car, dt);
      this.show(car, i);
      touched.add(this.sets.get(car.model)!);
      moved = true;
    }
    for (const slot of this.slots) slot.sync();
    for (const set of touched) this.flag(set);
    if (moved) {
      for (const mesh of [this.beams, this.signs, this.heads, this.shoulders, this.shades]) mesh.instanceMatrix.needsUpdate = true;
      this.updateBounds();
    }
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
    const set = this.sets.get(car.model)!;
    set.body.setColorAt(car.slot, this.color.setHex(car.taxi ? TAXI.paint : palette[Math.floor(this.random() * palette.length)]!));
    if (set.body.instanceColor) set.body.instanceColor.needsUpdate = true;
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
    this.lendVoice(car);
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

  private drive(car: Car, dt: number): void {
    const path = car.path!;
    const traffic = this.options.traffic;
    let cap = corneringSpeed(path, car.distance, car.cruise);
    const job = car.job;
    let pulling = false;
    if (job && (job.kind === 'park' || job.kind === 'fare')) {
      // Ease to a stop at the bay's or the stand's spot, pulled towards the kerb.
      const left = job.stopAt - car.distance;
      cap = Math.min(cap, left <= 0 ? 0 : Math.sqrt(2 * 1.5 * left) + 0.2);
      if (left < 28) {
        car.asideTo = job.kind === 'park' ? PARK.aside : job.aside;
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
    // Kept waiting by the player long enough: a word, and round them.
    if (!car.edging && car.horn.atViewer >= EDGE.after) {
      car.edging = true;
      car.asideTo = EDGE.aside;
      this.say(car, GRUMBLES[Math.floor(this.random() * GRUMBLES.length)]!);
    } else if (car.edging && this.leftBehind(car)) {
      car.edging = false;
      car.asideTo = 0;
    }
    if (!pulling && !car.edging) car.asideTo = pullOver ? PULL_OVER : 0;
    this.ease(car, dt);
    car.distance += car.speed * dt;
    car.rolled += car.speed * dt;

    if (job && (job.kind === 'park' || job.kind === 'fare') && car.distance >= job.stopAt - 0.15 && car.speed < 0.6) {
      car.speed = 0;
      car.mode = 'standing';
      car.braking = true;
      if (job.kind === 'fare') {
        job.phase = 'opening';
        job.clock = 0;
        car.hazards = true;
      }
      this.place(car);
      return;
    }
    if (car.distance >= path.length) {
      this.retire(car);
      return;
    }
    car.signal = car.edging ? -1 : pulling || pullOver ? 1 : this.bendSignal(path, car.distance);
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
    // The taxi: hazards on, the door opens, the fare gets out and goes, or comes and gets in; then off.
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

  private readonly reverseViews = new Map<Car, ReverseView>();

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
    this.releaseVoice(car);
    // Solid again, the size of the car now in it.
    bay.box.copy(bayBox(bay.at, bay.yaw, car.model));
    if (bay.world) {
      bay.world.copy(bay.box).applyMatrix4(this.matrixWorld);
      this.options.collisions?.add(bay.world);
    }
    if (arriving) {
      this.show(car, this.cars.indexOf(car));
      this.flag(this.sets.get(car.model)!);
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
      if (Math.hypot(this.v.x - at[0], this.v.z - at[1]) < SERVES.reach && Math.abs(Math.atan2(Math.sin(heading - yaw), Math.cos(heading - yaw))) < SERVES.heading) return { route: r, along };
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
    const turn = Math.atan2(Math.sin(next - here), Math.cos(next - here));
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
    this.releaseVoice(car);
    const i = this.cars.indexOf(car);
    if (i >= 0) this.show(car, i);
  }

  private lendVoice(car: Car): void {
    if (car.voice) return;
    const slot = this.slots.find((s) => !s.car);
    if (!slot) return;
    slot.lend(car);
    car.voice = slot;
  }

  private releaseVoice(car: Car): void {
    if (!car.voice) return;
    car.voice.sync();
    car.voice.car = null;
    car.voice.active = false;
    car.voice = null;
  }

  /** The driver says something (`text`) from behind the wheel: one at a time. */
  private say(car: Car, text: string): void {
    if (this.grumble > 0 || !this.options.speaks) return;
    this.grumble = 6;
    const seat = DRIVER_SEAT[car.model];
    this.bubble.position.set(seat.x, ROAD_Y + seat.belt + 0.75, seat.z).applyAxisAngle(THREE.Object3D.DEFAULT_UP, car.yaw).add(car.position).setY(ROAD_Y + seat.belt + 0.75);
    this.bubble.say(text, 2.8);
  }

  /** Writes car `i`'s instance (pose, lamps, wheels, driver, sign, beam), or hides what it does not show. */
  private show(car: Car, i: number): void {
    const set = this.sets.get(car.model)!;
    const away = car.mode === 'away';
    if (away) this.scratch.copy(HIDDEN);
    else this.scratch.makeRotationY(car.yaw).setPosition(car.position.x, ROAD_Y, car.position.z);
    set.body.setMatrixAt(car.slot, this.scratch);
    set.glass.setMatrixAt(car.slot, this.scratch);
    set.wheels.setMatrixAt(car.slot, this.scratch);
    set.lamps.setMatrixAt(car.slot, this.scratch);
    const blink = this.signalClock < 0.5;
    const left = blink && (car.hazards || car.signal < 0);
    const right = blink && (car.hazards || car.signal > 0);
    this.lampValue.set(car.lit ? (car.reversing ? 2 : 1) : 0, car.braking && car.lit ? 1 : 0, left ? 1 : 0, right ? 1 : 0);
    set.lampState.setXYZW(car.slot, this.lampValue.x, this.lampValue.y, this.lampValue.z, this.lampValue.w);
    set.wheelAngle.setX(car.slot, rollAngle(car.rolled, VEHICLES[car.model === 'hatch' ? 'car' : car.model].wheelRadius));
    const driving = car.active;
    if (driving) {
      const seat = DRIVER_SEAT[car.model];
      this.seat.makeTranslation(seat.x + 0.06, seat.belt, seat.z).premultiply(this.scratch);
    }
    this.heads.setMatrixAt(i, driving ? this.seat : HIDDEN);
    this.shoulders.setMatrixAt(i, driving ? this.seat : HIDDEN);
    // The pool ahead of the nose, in the car's frame, just over the asphalt (none while reversing).
    if (driving && !car.reversing) this.beamLocal.makeTranslation(car.length / 2 - 0.2 + BEAM.length / 2, GROUND.lampPool.lift, 0).premultiply(this.scratch);
    this.beams.setMatrixAt(i, driving && !car.reversing ? this.beamLocal : HIDDEN);
    // The sign rides on the roof, in the car's frame.
    if (car.taxi && driving) this.lift.makeTranslation(TAXI_SIGN.along, CAR_SIZES[car.model].height + TAXI_SIGN.lift, 0).premultiply(this.scratch);
    this.signs.setMatrixAt(i, car.taxi && driving ? this.lift : HIDDEN);
    // The dark under it, a little wider and longer than the car, just over the asphalt.
    if (!away) this.shadeLocal.makeScale(car.length + SHADE_MARGIN, 1, CAR_SIZES[car.model].width + SHADE_MARGIN).setPosition(0, GROUND.carShade.lift, 0).premultiply(this.scratch);
    this.shades.setMatrixAt(i, away ? HIDDEN : this.shadeLocal);
  }

  private flag(set: ModelSet): void {
    for (const mesh of [set.body, set.glass, set.wheels, set.lamps]) mesh.instanceMatrix.needsUpdate = true;
    set.lampState.needsUpdate = true;
    set.wheelAngle.needsUpdate = true;
  }

  /** An instanced mesh of `count` hidden slots, culled with the cars' shared sphere. */
  private instanced(geometry: THREE.BufferGeometry, material: THREE.Material, count: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, count));
    mesh.boundingSphere = this.bounds;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < mesh.count; i++) mesh.setMatrixAt(i, HIDDEN);
    this.add(mesh);
    return mesh;
  }

  /** The shared sphere round every car shown (and their beams ahead): what the meshes are culled by. */
  private updateBounds(): void {
    this.box.makeEmpty();
    for (const car of this.cars) if (car.mode !== 'away') this.box.expandByPoint(car.position);
    if (this.box.isEmpty()) this.box.setFromCenterAndSize(this.v.set(0, 0, 0), this.v.clone().setScalar(1));
    this.box.getBoundingSphere(this.bounds);
    this.bounds.radius += BEAM.length + 3;
  }
}

/** A parked car's box in bay `at` heading `yaw` (zone-local), for a car of `model`'s size. */
function bayBox(at: Vec2, yaw: number, model: CarModelId): THREE.Box3 {
  const size = CAR_SIZES[model];
  const along = Math.abs(Math.cos(yaw)) > 0.5;
  const hx = (along ? size.length : size.width) / 2;
  const hz = (along ? size.width : size.length) / 2;
  return new THREE.Box3(new THREE.Vector3(at[0] - hx, 0, at[1] - hz), new THREE.Vector3(at[0] + hx, size.height, at[1] + hz));
}

/**
 * A headlights' pool seen from above, u forward from the nose: two lamps' cones merging, brightest
 * a few metres ahead, spreading and fading out towards the far end, soft at the sides.
 */
/** How dark the ground under a car gets, and how far past its body the dark reaches (m, on both sides together). */
const SHADE_OPACITY = 0.55;
const SHADE_MARGIN = 0.5;

/** The dark under a car: a rectangle fading out towards its edges, darkest under the middle (an alpha map, white is dark). */
function shadeTexture(): THREE.CanvasTexture {
  const size = 64;
  const [canvas, ctx] = createCanvas(size, size);
  const image = ctx.createImageData(size, size);
  const edge = (t: number): number => THREE.MathUtils.smoothstep(Math.min(t, 1 - t), 0, 0.3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = Math.round(255 * edge(x / (size - 1)) * edge(y / (size - 1)));
      const k = (y * size + x) * 4;
      image.data[k] = v;
      image.data[k + 1] = v;
      image.data[k + 2] = v;
      image.data[k + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

function beamTexture(): THREE.CanvasTexture {
  const [w, h] = [256, 128];
  const [canvas, ctx] = createCanvas(w, h);
  const image = ctx.createImageData(w, h);
  for (let x = 0; x < w; x++) {
    const t = x / (w - 1);
    const along = THREE.MathUtils.smoothstep(t, 0.0, 0.12) * (1 - t) ** 1.6;
    const half = 0.18 + 0.32 * t;
    for (let y = 0; y < h; y++) {
      const across = Math.abs(y / (h - 1) - 0.5);
      const side = 1 - THREE.MathUtils.smoothstep(across, half * 0.55, half);
      const v = Math.round(255 * along * side);
      const k = (y * w + x) * 4;
      image.data[k] = 255;
      image.data[k + 1] = 255;
      image.data[k + 2] = 255;
      image.data[k + 3] = v;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
