import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { seededRandom } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { wakefulnessAt } from '../props/outdoors/wakefulness';
import { CAR_SIZES, carGeometries, type CarModelId } from './carModel';
import { nightnessOf } from './streetAir';
import { snowCovered } from './snowCover';
import type { Vec2 } from './streetPlan';
import { Horn, ROAD_Y, allowedSpeed, approach, corneringSpeed, placeOnRoute, sampleRoute, type Route } from './traffic/driving';
import type { RoadVehicle, StreetTraffic } from './traffic/StreetTraffic';

export interface StreetCarsOptions {
  parked: readonly { at: Vec2; yaw: number }[];
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
}

/** What drives on the street, as the street's sound tells them apart. */
export type VehicleKind = 'car' | 'bus' | 'van' | 'lorry' | 'bike';

/**
 * A moving vehicle, as the street's sound hears it: where it is (zone-local), how fast it goes,
 * what it is, and how many times its driver has sounded the horn (a counter: a new toot when it grows).
 */
export interface CarVoice {
  readonly position: THREE.Vector3;
  readonly speed: number;
  readonly active: boolean;
  readonly honks: number;
  readonly kind: VehicleKind;
}

const PAINTS = [0xb8322a, 0x2a4f8a, 0xe8e6e0, 0x2a2c30, 0x8a9096, 0x3f6b4f, 0xd9b44a, 0x6a2a4a, 0x9aa8b4, 0x1f3040];
const VAN_PAINTS = [0xe8e6e0, 0xe8e6e0, 0x9aa8b4, 0x2a4f8a, 0xd9b44a];
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const MODELS: readonly CarModelId[] = ['hatch', 'saloon', 'van'];

/** One car shape's instanced meshes (body, glass, tyres, lamps) and how many slots are taken. */
interface ModelSet {
  body: THREE.InstancedMesh;
  glass: THREE.InstancedMesh;
  wheels: THREE.InstancedMesh;
  lamps: THREE.InstancedMesh;
  used: number;
}

class Driver implements CarVoice, RoadVehicle {
  readonly position = new THREE.Vector3();
  readonly horn = new Horn();
  active = false;
  route = 0;
  distance = 0;
  speed = 0;
  yaw = 0;
  constructor(
    readonly model: CarModelId,
    readonly slot: number,
    readonly kind: VehicleKind,
  ) {}

  get length(): number {
    return CAR_SIZES[this.model].length;
  }

  get width(): number {
    return CAR_SIZES[this.model].width;
  }

  get honks(): number {
    return this.horn.honks;
  }
}

/**
 * The cars: parked along the kerbs, and a few driving through (up Park Street, along Front
 * Street past the roadworks into the side street, and the other way), in three shapes (a
 * hatchback, a saloon, a panel van), each shape instanced (body, glass, tyres: three draw calls
 * a shape, a fourth for the driving cars' lamps, lit at night). Drivers keep to their route's
 * samples, slow for the corners, queue behind whatever drives ahead of them (`traffic.vehicles`),
 * stop at the crossing's red light and give way at the plain zebra, brake for the player and for
 * anything on the road (`traffic.obstacles`), and sound the horn at a player who will not get out
 * of the way. They never collide with the player (the parked ones do). How often a car comes
 * follows how awake the city is. Snow settles on their roofs and bonnets.
 */
export class StreetCars extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  readonly colliders: THREE.Box3[];
  private readonly drivers: Driver[] = [];
  private readonly sets = new Map<CarModelId, ModelSet>();
  private readonly lampMaterial: THREE.MeshBasicMaterial;
  private readonly routes: Route[];
  private readonly random = seededRandom(Date.now() & 0xffff);
  private readonly color = new THREE.Color();
  private spawnClock = 2;
  private nextRoute = 0;
  private readonly scratch = new THREE.Matrix4();
  private readonly eye = new THREE.Vector3();

  constructor(private readonly dayNight: DayNight, private readonly options: StreetCarsOptions) {
    super();
    this.name = 'StreetCars';
    // Which shape each parked car is (seeded, so the street looks the same each visit), and the driving ones'.
    const pick = seededRandom(4711);
    const parkedModels = options.parked.map((): CarModelId => {
      const r = pick();
      return r < 0.45 ? 'hatch' : r < 0.85 ? 'saloon' : 'van';
    });
    const drivingModels = Array.from({ length: options.cars }, (_, i): CarModelId => (i % 3 === 1 ? 'saloon' : i % 5 === 4 ? 'van' : 'hatch'));

    const body = snowCovered(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.4, flatShading: true }));
    const glass = snowCovered(new THREE.MeshStandardMaterial({ color: 0x1a232b, roughness: 0.12, metalness: 0.6, flatShading: true }));
    const tyres = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.85 });
    this.lampMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x666666 });
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
        used: 0,
      };
      for (const mesh of [set.body, set.glass, set.wheels, set.lamps]) {
        mesh.frustumCulled = false; // the driving cars move out of any bounds computed now
        mesh.castShadow = mesh !== set.lamps;
        mesh.receiveShadow = mesh !== set.lamps;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        for (let i = 0; i < count; i++) mesh.setMatrixAt(i, HIDDEN);
        this.add(mesh);
      }
      this.sets.set(model, set);
    }

    const paint = seededRandom(9001);
    options.parked.forEach(({ at, yaw }, i) => {
      const model = parkedModels[i]!;
      const set = this.sets.get(model)!;
      const slot = set.used++;
      const palette = model === 'van' ? VAN_PAINTS : PAINTS;
      set.body.setColorAt(slot, this.color.setHex(palette[Math.floor(paint() * palette.length)]!));
      this.setInstance(model, slot, at[0], at[1], yaw);
    });
    drivingModels.forEach((model, i) => {
      const set = this.sets.get(model)!;
      const driver = new Driver(model, set.used++, model === 'van' ? 'van' : 'car');
      set.body.setColorAt(driver.slot, this.color.setHex(PAINTS[i % PAINTS.length]!));
      this.drivers.push(driver);
      options.traffic.vehicles.add(driver);
    });
    for (const set of this.sets.values()) {
      if (set.body.instanceColor) set.body.instanceColor.needsUpdate = true;
      this.flag(set);
    }
    this.routes = options.routes.map((points) => sampleRoute(points));
    this.colliders = options.parked.map(({ at, yaw }, i) => {
      const size = CAR_SIZES[parkedModels[i]!];
      const along = Math.abs(Math.cos(yaw)) > 0.5;
      const hx = (along ? size.length : size.width) / 2;
      const hz = (along ? size.width : size.length) / 2;
      return new THREE.Box3(new THREE.Vector3(at[0] - hx, 0, at[1] - hz), new THREE.Vector3(at[0] + hx, size.height, at[1] + hz));
    });
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  /** The driving cars, for the street's sound. */
  get voices(): readonly CarVoice[] {
    return this.drivers;
  }

  dispose(): void {
    for (const d of this.drivers) this.options.traffic.vehicles.delete(d);
  }

  update(dt: number): void {
    const s = this.dayNight.state;
    const night = THREE.MathUtils.smoothstep(nightnessOf(s), 0.2, 0.6);
    this.lampMaterial.color.setScalar(0.35 + 2.4 * night);
    this.options.viewer.getWorldPosition(this.eye);
    this.worldToLocal(this.eye);

    this.spawnClock -= dt;
    if (this.spawnClock <= 0) {
      const [a, b] = this.options.gap;
      this.spawnClock = (a + this.random() * (b - a)) / Math.max(0.12, wakefulnessAt(s.hours));
      this.spawn();
    }
    const touched = new Set<ModelSet>();
    for (const driver of this.drivers) {
      if (!driver.active) continue;
      this.drive(driver, dt);
      if (!driver.active) this.setInstance(driver.model, driver.slot, 0, 0, 0, true);
      else this.setInstance(driver.model, driver.slot, driver.position.x, driver.position.z, driver.yaw, false, true);
      touched.add(this.sets.get(driver.model)!);
    }
    for (const set of touched) this.flag(set);
  }

  /** A car sets off at the start of a route, unless the one before it has not cleared the start yet. */
  private spawn(): void {
    const free = this.drivers.filter((d) => !d.active);
    const driver = free[Math.floor(this.random() * free.length)];
    if (!driver) return;
    const route = this.nextRoute;
    this.nextRoute = (this.nextRoute + 1) % this.routes.length;
    if (this.drivers.some((d) => d.active && d.route === route && d.distance < 12)) return;
    driver.active = true;
    driver.route = route;
    driver.distance = 0;
    driver.speed = this.options.speed;
    // A new car each time: a fresh coat of paint.
    const palette = driver.model === 'van' ? VAN_PAINTS : PAINTS;
    const set = this.sets.get(driver.model)!;
    set.body.setColorAt(driver.slot, this.color.setHex(palette[Math.floor(this.random() * palette.length)]!));
    if (set.body.instanceColor) set.body.instanceColor.needsUpdate = true;
    driver.yaw = placeOnRoute(this.routes[route]!, 0, driver.position);
  }

  private drive(driver: Driver, dt: number): void {
    const route = this.routes[driver.route]!;
    const traffic = this.options.traffic;
    const cap = corneringSpeed(route, driver.distance, this.options.speed);
    const { target, heldBy } = allowedSpeed(traffic, driver, cap, this.eye, this.options.stopFor);
    driver.speed = approach(driver.speed, target, dt);
    driver.horn.update(dt, driver.speed, heldBy, traffic.carsGreen);
    driver.distance += driver.speed * dt;
    if (driver.distance >= route.length) {
      driver.active = false;
      driver.speed = 0;
      return;
    }
    driver.yaw = placeOnRoute(route, driver.distance, driver.position);
  }

  /** A car's instance at (x, z) heading `yaw`, or hidden; `lit` shows its lamps (driving cars only). */
  private setInstance(model: CarModelId, slot: number, x: number, z: number, yaw: number, hidden = false, lit = false): void {
    const set = this.sets.get(model)!;
    if (hidden) this.scratch.copy(HIDDEN);
    else this.scratch.makeRotationY(yaw).setPosition(x, ROAD_Y, z);
    set.body.setMatrixAt(slot, this.scratch);
    set.glass.setMatrixAt(slot, this.scratch);
    set.wheels.setMatrixAt(slot, this.scratch);
    set.lamps.setMatrixAt(slot, lit ? this.scratch : HIDDEN);
  }

  private flag(set: ModelSet): void {
    for (const mesh of [set.body, set.glass, set.wheels, set.lamps]) mesh.instanceMatrix.needsUpdate = true;
  }
}
