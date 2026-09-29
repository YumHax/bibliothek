import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { seededRandom } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { wakefulnessAt } from '@/time/wakefulness';
import { CAR_SIZES, carGeometries, type CarModelId } from './carModel';
import { nightnessOf } from './streetAir';
import { snowCovered } from './snowCover';
import { CAR_PAINTS, VAN_PAINTS, type ParkedCar } from '../city/parkedCars';
import type { Vec2 } from './streetPlan';
import { Horn, ROAD_Y, allowedSpeed, approach, corneringSpeed, placeOnRoute, sampleRoute, type Route } from './traffic/driving';
import type { RoadVehicle, StreetTraffic } from './traffic/StreetTraffic';
import { TAXI } from '../city/traffic';
import { createCanvas } from '@/covers/generated/canvasUtils';
import { GROUND, RENDER_ORDER, onSurface } from '../surface/layers';

export interface StreetCarsOptions {
  parked: readonly ParkedCar[];
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

const PAINTS = CAR_PAINTS;
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const MODELS: readonly CarModelId[] = ['hatch', 'saloon', 'van'];
/** A taxi's roof sign: size (along, up, across) and where it sits (along from the middle, over the roof). */
const TAXI_SIGN = { size: [0.2, 0.14, 0.55] as const, along: -0.25, lift: 0.07 };
/** The pool of the headlights on the road ahead of a driving car at night: how far it reaches, how wide it spreads, how bright. */
const BEAM = { length: 9, width: 4.6, strength: 0.55 };

/** A driving car's pose, for what lights up round it (the wet road's streaks, `relief/WetGround`). */
export interface MovingLamp {
  readonly position: THREE.Vector3;
  readonly yaw: number;
  readonly active: boolean;
  readonly length: number;
}

/** Cars already on their way when the player arrives: this many, somewhere between these shares of their route. */
const PREWARM = { cars: 2, from: 0.3, to: 0.65 };

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
  /** This time round it is a taxi (yellow, its sign lit). */
  taxi = false;
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
  private readonly lift = new THREE.Matrix4();
  private readonly eye = new THREE.Vector3();
  /** The model sets moved this frame (reused: no set a frame). */
  private readonly touched = new Set<ModelSet>();
  /** The taxis' roof signs, one slot per driving car, and their lit material. */
  private readonly signs: THREE.InstancedMesh;
  private readonly signMaterial = new THREE.MeshBasicMaterial({ color: 0xf2d27a });
  /** The next update puts a couple of cars mid-route (the street is never empty on arrival). */
  private prewarm = true;
  /** The headlights' pools on the road, one slot per driving car (additive, the canvas alpha kept). */
  private readonly beams: THREE.InstancedMesh;
  private readonly beamMaterial: THREE.MeshBasicMaterial;
  private readonly beamLocal = new THREE.Matrix4();

  constructor(private readonly dayNight: DayNight, private readonly options: StreetCarsOptions) {
    super();
    this.name = 'StreetCars';
    // Which shape each parked car is (`city/parkedCars`: the window view parks the same), and the driving ones'.
    const parkedModels = options.parked.map(({ shape }): CarModelId => shape);
    const drivingModels = Array.from({ length: options.cars }, (_, i): CarModelId => (i % 3 === 1 ? 'saloon' : i % 5 === 4 ? 'van' : 'hatch'));

    const body = snowCovered(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
    const glass = snowCovered(new THREE.MeshStandardMaterial({ color: 0x1a232b, roughness: 0.06 }));
    // Its own, not the palette's: an instanced mesh sharing a material with plain meshes (the bus's wheels) switches programs every draw.
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

    options.parked.forEach(({ at, yaw, paint }, i) => {
      const model = parkedModels[i]!;
      const set = this.sets.get(model)!;
      const slot = set.used++;
      set.body.setColorAt(slot, this.color.setHex(paint));
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
    this.signs = new THREE.InstancedMesh(new THREE.BoxGeometry(...TAXI_SIGN.size), this.signMaterial, Math.max(1, this.drivers.length));
    this.signs.frustumCulled = false;
    this.signs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < this.signs.count; i++) this.signs.setMatrixAt(i, HIDDEN);
    this.add(this.signs);
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
    this.beams = new THREE.InstancedMesh(new THREE.PlaneGeometry(BEAM.length, BEAM.width).rotateX(-Math.PI / 2), this.beamMaterial, Math.max(1, this.drivers.length));
    this.beams.frustumCulled = false;
    this.beams.castShadow = false;
    this.beams.receiveShadow = false;
    this.beams.renderOrder = RENDER_ORDER.groundGlow;
    this.beams.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < this.beams.count; i++) this.beams.setMatrixAt(i, HIDDEN);
    this.beams.visible = false;
    this.add(this.beams);
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

  /** The driving cars' poses, for the wet road's streaks of their lamps. */
  get lamps(): readonly MovingLamp[] {
    return this.drivers;
  }

  /** The driving cars, for the street's sound. */
  get voices(): readonly CarVoice[] {
    return this.drivers;
  }

  dispose(): void {
    for (const d of this.drivers) this.options.traffic.vehicles.delete(d);
  }

  setZoneActive(active: boolean): void {
    if (active) this.prewarm = true;
  }

  update(dt: number): void {
    const s = this.dayNight.state;
    const night = THREE.MathUtils.smoothstep(nightnessOf(s), 0.2, 0.6);
    this.lampMaterial.color.setScalar(0.35 + 2.4 * night);
    this.signMaterial.color.setRGB(0.9 + 1.6 * night, 0.75 + 1.3 * night, 0.35 + 0.6 * night);
    this.beamMaterial.color.setRGB(1, 0.94, 0.82).multiplyScalar(BEAM.strength * night);
    const beams = night > 0.02;
    this.beams.visible = beams;
    this.options.viewer.getWorldPosition(this.eye);
    this.worldToLocal(this.eye);
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
      this.spawnClock = (a + this.random() * (b - a)) / Math.max(0.12, wakefulnessAt(s.hours));
      this.spawn();
    }
    const touched = this.touched;
    touched.clear();
    let signs = false;
    for (let i = 0; i < this.drivers.length; i++) {
      const driver = this.drivers[i]!;
      if (!driver.active) continue;
      this.drive(driver, dt);
      if (!driver.active) this.setInstance(driver.model, driver.slot, 0, 0, 0, true);
      else this.setInstance(driver.model, driver.slot, driver.position.x, driver.position.z, driver.yaw, false, true);
      touched.add(this.sets.get(driver.model)!);
      // The pool ahead of the nose, in the car's frame (`scratch` holds its pose), just over the asphalt.
      if (driver.active) this.beamLocal.makeTranslation(driver.length / 2 - 0.2 + BEAM.length / 2, GROUND.lampPool.lift, 0).premultiply(this.scratch);
      this.beams.setMatrixAt(i, driver.active ? this.beamLocal : HIDDEN);
      if (driver.taxi) {
        // The sign rides on the roof, in the car's frame (`scratch` still holds its pose).
        if (driver.active) this.lift.makeTranslation(TAXI_SIGN.along, CAR_SIZES[driver.model].height + TAXI_SIGN.lift, 0).premultiply(this.scratch);
        this.signs.setMatrixAt(i, driver.active ? this.lift : HIDDEN);
        signs = true;
      }
    }
    for (const set of touched) this.flag(set);
    this.beams.instanceMatrix.needsUpdate = true;
    if (signs) this.signs.instanceMatrix.needsUpdate = true;
  }

  /**
   * A car sets off at the start of a route (the next in turn), unless the one before it has not
   * cleared the start yet; or, arriving, already `from` metres along route `forced`.
   */
  private spawn(forced?: number, from = 0): void {
    let free = 0;
    for (const d of this.drivers) if (!d.active) free++;
    let pick = Math.floor(this.random() * free);
    const driver = this.drivers.find((d) => !d.active && pick-- === 0);
    if (!driver) return;
    const route = forced ?? this.nextRoute;
    if (forced === undefined) this.nextRoute = (this.nextRoute + 1) % this.routes.length;
    if (this.drivers.some((d) => d.active && d.route === route && Math.abs(d.distance - from) < 12)) return;
    driver.active = true;
    driver.route = route;
    driver.distance = from;
    driver.speed = this.options.speed;
    // A new car each time: a fresh coat of paint, now and then a taxi's.
    driver.taxi = driver.model !== 'van' && this.random() < TAXI.share;
    const palette = driver.model === 'van' ? VAN_PAINTS : PAINTS;
    const set = this.sets.get(driver.model)!;
    set.body.setColorAt(driver.slot, this.color.setHex(driver.taxi ? TAXI.paint : palette[Math.floor(this.random() * palette.length)]!));
    if (set.body.instanceColor) set.body.instanceColor.needsUpdate = true;
    driver.yaw = placeOnRoute(this.routes[route]!, from, driver.position);
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

/**
 * A headlights' pool seen from above, u forward from the nose: two lamps' cones merging, brightest
 * a few metres ahead, spreading and fading out towards the far end, soft at the sides.
 */
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
