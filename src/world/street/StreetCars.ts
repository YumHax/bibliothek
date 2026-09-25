import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { seededRandom } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { wakefulnessAt } from '../props/outdoors/wakefulness';
import { CAR, carGeometries } from './carModel';
import { nightnessOf } from './streetAir';
import { KERB_HEIGHT, type Vec2 } from './streetPlan';

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
}

/** A moving car, as the street's sound hears it: where it is (zone-local) and how fast it goes. */
export interface CarVoice {
  readonly position: THREE.Vector3;
  readonly speed: number;
  readonly active: boolean;
}

const PAINTS = [0xb8322a, 0x2a4f8a, 0xe8e6e0, 0x2a2c30, 0x8a9096, 0x3f6b4f, 0xd9b44a, 0x6a2a4a, 0x9aa8b4, 0x1f3040];
/** Route samples every this many metres (positions and headings looked up, never computed per frame). */
const STEP = 0.5;
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const ROAD_Y = -KERB_HEIGHT;

interface Route {
  /** x, z, heading (radians, yaw of the nose) per sample. */
  samples: Float32Array;
  length: number;
}

class Driver implements CarVoice {
  readonly position = new THREE.Vector3();
  active = false;
  route = 0;
  distance = 0;
  speed = 0;
  yaw = 0;
}

/**
 * The cars: parked along the kerbs, and a few driving through (up Park Street, along Front
 * Street, up the cross street, and the other way), all instances of one low-poly model (body,
 * glass, wheels: three draw calls for every car on the street, a fourth for the driving cars'
 * lamps, lit at night). Drivers keep to their route's samples, slow for the corners, queue behind
 * each other and stop for anyone standing in the road ahead of them; they never collide with
 * the player (the parked ones do). How often a car comes follows how awake the city is.
 */
export class StreetCars extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  readonly colliders: THREE.Box3[];
  private readonly drivers: Driver[] = [];
  private readonly meshes: THREE.InstancedMesh[];
  private readonly body: THREE.InstancedMesh;
  private readonly glass: THREE.InstancedMesh;
  private readonly wheels: THREE.InstancedMesh;
  private readonly lamps: THREE.InstancedMesh;
  private readonly lampMaterial: THREE.MeshBasicMaterial;
  private readonly routes: Route[];
  private readonly parkedCount: number;
  private readonly random = seededRandom(Date.now() & 0xffff);
  private spawnClock = 2;
  private nextRoute = 0;
  private readonly scratch = new THREE.Matrix4();
  private readonly eye = new THREE.Vector3();

  constructor(private readonly dayNight: DayNight, private readonly options: StreetCarsOptions) {
    super();
    this.name = 'StreetCars';
    const geometries = carGeometries();
    const count = options.parked.length + options.cars;
    this.parkedCount = options.parked.length;
    this.body = new THREE.InstancedMesh(geometries.body, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.4, flatShading: true }), count);
    this.glass = new THREE.InstancedMesh(geometries.glass, new THREE.MeshStandardMaterial({ color: 0x1a232b, roughness: 0.12, metalness: 0.6, flatShading: true }), count);
    this.wheels = new THREE.InstancedMesh(geometries.wheels, new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.85 }), count);
    this.lampMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x666666 });
    this.lamps = new THREE.InstancedMesh(geometries.lamps, this.lampMaterial, options.cars);

    const paint = seededRandom(9001);
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) this.body.setColorAt(i, color.setHex(PAINTS[Math.floor(paint() * PAINTS.length)]!));
    options.parked.forEach(({ at, yaw }, i) => this.setInstance(i, at[0], at[1], yaw));
    for (let i = 0; i < options.cars; i++) {
      this.setInstance(this.parkedCount + i, 0, 0, 0, true);
      this.lamps.setMatrixAt(i, HIDDEN);
      this.drivers.push(new Driver());
    }
    this.meshes = [this.body, this.glass, this.wheels, this.lamps];
    for (const mesh of this.meshes) {
      mesh.frustumCulled = false; // the driving cars move out of any bounds computed now
      mesh.castShadow = mesh !== this.lamps;
      mesh.receiveShadow = mesh !== this.lamps;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.add(mesh);
    }
    this.routes = options.routes.map(sampleRoute);
    this.colliders = options.parked.map(({ at, yaw }) => {
      const along = Math.abs(Math.cos(yaw)) > 0.5;
      const hx = (along ? CAR.length : CAR.width) / 2;
      const hz = (along ? CAR.width : CAR.length) / 2;
      return new THREE.Box3(new THREE.Vector3(at[0] - hx, 0, at[1] - hz), new THREE.Vector3(at[0] + hx, CAR.height, at[1] + hz));
    });
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  /** The driving cars, for the street's sound. */
  get voices(): readonly CarVoice[] {
    return this.drivers;
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
    let moved = false;
    for (let i = 0; i < this.drivers.length; i++) {
      const driver = this.drivers[i]!;
      if (!driver.active) continue;
      this.drive(driver, dt);
      const index = this.parkedCount + i;
      if (!driver.active) {
        this.setInstance(index, 0, 0, 0, true);
        this.lamps.setMatrixAt(i, HIDDEN);
      } else {
        this.setInstance(index, driver.position.x, driver.position.z, driver.yaw);
        this.lamps.setMatrixAt(i, this.scratch);
      }
      moved = true;
    }
    if (moved) {
      for (const mesh of this.meshes) mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** A car sets off at the start of a route, unless the one before it has not cleared the start yet. */
  private spawn(): void {
    const driver = this.drivers.find((d) => !d.active);
    if (!driver) return;
    const route = this.nextRoute;
    this.nextRoute = (this.nextRoute + 1) % this.routes.length;
    if (this.drivers.some((d) => d.active && d.route === route && d.distance < 12)) return;
    driver.active = true;
    driver.route = route;
    driver.distance = 0;
    driver.speed = this.options.speed;
    this.place(driver);
  }

  private drive(driver: Driver, dt: number): void {
    const route = this.routes[driver.route]!;
    const cruise = this.options.speed;
    // Slow for the bend ahead.
    const here = this.headingAt(route, driver.distance);
    const ahead = this.headingAt(route, driver.distance + 8);
    const turn = Math.abs(Math.atan2(Math.sin(ahead - here), Math.cos(ahead - here)));
    let target = cruise * (1 - 0.6 * Math.min(1, turn / 1.2));
    // Stop for the player standing in the way.
    const hx = Math.cos(driver.yaw);
    const hz = -Math.sin(driver.yaw);
    const rx = this.eye.x - driver.position.x;
    const rz = this.eye.z - driver.position.z;
    const along = rx * hx + rz * hz;
    const lateral = Math.abs(rx * hz - rz * hx);
    const nose = CAR.length / 2;
    // Brake early enough to stand still with the nose `stopFor` short of them (a firm 5 m/s²).
    if (along > 0 && lateral < CAR.width / 2 + 0.6) {
      const room = along - nose - this.options.stopFor;
      if (room < 12) target = Math.min(target, room <= 0 ? 0 : Math.sqrt(2 * 5 * room));
    }
    // Queue behind the car ahead on the same route.
    for (const other of this.drivers) {
      if (other === driver || !other.active || other.route !== driver.route) continue;
      const gap = other.distance - driver.distance;
      if (gap > 0 && gap < CAR.length + 14) target = Math.min(target, gap < CAR.length + 3 ? 0 : Math.min(other.speed + (gap - CAR.length - 3) * 0.8, cruise));
    }
    const dv = target - driver.speed;
    driver.speed = Math.max(0, driver.speed + THREE.MathUtils.clamp(dv, -8 * dt, 2.4 * dt));
    driver.distance += driver.speed * dt;
    if (driver.distance >= route.length) {
      driver.active = false;
      driver.speed = 0;
      return;
    }
    this.place(driver);
  }

  /** Puts the driver where its distance along the route says. */
  private place(driver: Driver): void {
    const { samples } = this.routes[driver.route]!;
    const f = driver.distance / STEP;
    const i = Math.min(Math.floor(f), samples.length / 3 - 2);
    const t = f - i;
    const a = i * 3;
    driver.position.set(samples[a]! + (samples[a + 3]! - samples[a]!) * t, ROAD_Y, samples[a + 1]! + (samples[a + 4]! - samples[a + 1]!) * t);
    const h0 = samples[a + 2]!;
    const h1 = samples[a + 5]!;
    driver.yaw = h0 + Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0)) * t;
  }

  private headingAt(route: Route, distance: number): number {
    const i = Math.min(Math.max(0, Math.round(distance / STEP)), route.samples.length / 3 - 1);
    return route.samples[i * 3 + 2]!;
  }

  /** Instance `index` at (x, z) heading `yaw` (also leaves the matrix in `this.scratch` for the lamps), or hidden. */
  private setInstance(index: number, x: number, z: number, yaw: number, hidden = false): void {
    if (hidden) this.scratch.copy(HIDDEN);
    else this.scratch.makeRotationY(yaw).setPosition(x, ROAD_Y, z);
    this.body.setMatrixAt(index, this.scratch);
    this.glass.setMatrixAt(index, this.scratch);
    this.wheels.setMatrixAt(index, this.scratch);
  }
}

/** Samples a smooth route through `points` every `STEP` metres: position and the nose's yaw. */
function sampleRoute(points: readonly Vec2[]): Route {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal', 0.3);
  const length = curve.getLength();
  const n = Math.max(2, Math.ceil(length / STEP) + 1);
  const samples = new Float32Array(n * 3);
  const p = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const u = Math.min(1, (i * STEP) / length);
    curve.getPointAt(u, p);
    curve.getTangentAt(u, tangent);
    samples[i * 3] = p.x;
    samples[i * 3 + 1] = p.z;
    samples[i * 3 + 2] = Math.atan2(-tangent.z, tangent.x);
  }
  return { samples, length };
}
