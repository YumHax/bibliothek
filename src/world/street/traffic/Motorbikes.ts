import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { seededRandom } from '@/covers/generated/canvasUtils';
import { QUALITY } from '@/graphics/quality';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import { wakefulnessAt } from '@/time/wakefulness';
import { snowCovered } from '../snowCover';
import { nightnessOf } from '../streetAir';
import type { CarVoice, VehicleKind } from '../StreetCars';
import type { Vec2 } from '../streetPlan';
import { Horn, ROAD_Y, allowedSpeed, approach, corneringSpeed, headingAt, placeOnRoute, sampleRoute, type Route } from './driving';
import type { RoadVehicle, StreetTraffic } from './StreetTraffic';
import { LampMaterial, lampStates } from './lampMaterial';
import { WheelMaterial, rollAngle, wheelAngles } from './wheelSpin';
import { TWO_WHEELERS, courierBox, twoWheelerGeometries, type TwoWheelerModel } from './twoWheelers';
import { rushAt } from '../../city/traffic';

interface MotorbikesOptions {
  traffic: StreetTraffic;
  /** The player (the camera): riders stop for them. */
  viewer: THREE.Object3D;
  /** The cars' routes: riders keep a little to the right in the car lane. */
  routes: readonly (readonly Vec2[])[];
  /** How many can ride at once, real seconds between two setting off, the share of couriers and of motorbikes. */
  riders: number;
  gap: readonly [number, number];
  courier: number;
  moto: number;
}

const MODELS: readonly TwoWheelerModel[] = ['scooter', 'moto'];
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
/** Metres right of the car lane's line a rider keeps. */
const LANE_OFFSET = 0.45;
/** Cruising speeds (m/s). */
const CRUISE = { scooter: 7, courier: 7.8, moto: 9.5 } as const;
/** The lean into a bend: at most this (radians), eased at this rate. */
const LEAN = { most: 0.38, rate: 3 } as const;
const SIGNAL = { turn: 0.6, ahead: 18, hz: 1.6 } as const;
const PAINTS = [0xb8322a, 0x2a4f8a, 0xe8e6e0, 0x1f1f22, 0x3f6b4f, 0xd9b44a, 0x8a9096, 0x6a2a4a];
const CLOTHES = [0x2a3a5a, 0x3a2a24, 0x1f1f22, 0x4a4a52, 0x5a2a2a, 0x2f4a3a];
const HELMETS = [0xe8e6e0, 0x1f1f22, 0xb8322a, 0x2a4f8a, 0xd9b44a];
/** The couriers' boxes, in their firms' colours. */
const BOXES = [0x2fa59a, 0xe07a2a, 0xd8d23a];

/** One rider on the road. */
class Mount implements RoadVehicle, CarVoice {
  readonly position = new THREE.Vector3();
  readonly horn = new Horn();
  readonly self: RoadVehicle = this;
  shape: TwoWheelerModel = 'scooter';
  courier = false;
  active = false;
  route = 0;
  distance = 0;
  speed = 0;
  yaw = 0;
  cruise: number = CRUISE.scooter;
  lean = 0;
  braking = false;
  signal: -1 | 0 | 1 = 0;
  rolled = 0;
  readonly width = 0.75;

  get length(): number {
    return TWO_WHEELERS[this.shape].length;
  }

  get kind(): VehicleKind {
    return this.courier ? 'courier' : this.shape;
  }

  get honks(): number {
    return this.horn.honks;
  }
}

/** One shape's instanced meshes. */
interface ModelSet {
  meshes: THREE.InstancedMesh[];
  body: THREE.InstancedMesh;
  lamps: THREE.InstancedMesh;
  lampState: THREE.InstancedBufferAttribute;
  wheelAngle: THREE.InstancedBufferAttribute;
  riders: THREE.InstancedMesh;
  helmets: THREE.InstancedMesh;
  boxes: THREE.InstancedMesh | null;
}

/**
 * Scooters, motorbikes and couriers (a scooter with a box on the back) in the car lanes, a little
 * right of the cars' line: they keep to the driving rules the cars do (`driving.allowedSpeed`:
 * lights, zebras, the player, queues, sirens), lean into the bends, indicate at the corners, light
 * their brake lamps, and sound the horn at a player in the way. One instance slot per rider in
 * each shape's meshes (body, trim and wheels, lamps, rider, helmet; the couriers' boxes): the
 * shape it is not riding is hidden. Fewer in the rain, none on snow, more in the rush hours.
 */
export class Motorbikes extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly mounts: Mount[] = [];
  private readonly routes: Route[];
  private readonly sets = new Map<TwoWheelerModel, ModelSet>();
  private readonly lampMaterial = new LampMaterial(true);
  private readonly random = seededRandom(Date.now() & 0x7ff);
  private readonly color = new THREE.Color();
  private readonly eye = new THREE.Vector3();
  private readonly pose = new THREE.Matrix4();
  private readonly roll = new THREE.Matrix4();
  private readonly bounds = new THREE.Sphere();
  private readonly box = new THREE.Box3();
  private spawnClock = 4;
  private nextRoute = 0;
  private signalClock = 0;

  constructor(private readonly dayNight: DayNight, private readonly options: MotorbikesOptions) {
    super();
    this.name = 'Motorbikes';
    const count = Math.max(1, QUALITY.level === 'low' ? Math.min(1, options.riders) : options.riders);
    this.routes = options.routes.map((points) => sampleRoute(points, LANE_OFFSET));
    const paint = snowCovered(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32 }));
    const trim = new WheelMaterial(true);
    const cloth = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
    const helmet = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 });
    const boxPaint = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    for (const model of MODELS) {
      const g = twoWheelerGeometries(model);
      const body = new THREE.InstancedMesh(g.body, paint, count);
      const lamps = new THREE.InstancedMesh(g.lamps, this.lampMaterial, count);
      const set: ModelSet = {
        body,
        lamps,
        lampState: lampStates(g.lamps, count),
        wheelAngle: wheelAngles(g.trim, count),
        riders: new THREE.InstancedMesh(g.rider, cloth, count),
        helmets: new THREE.InstancedMesh(g.helmet, helmet, count),
        boxes: model === 'scooter' ? new THREE.InstancedMesh(courierBox(model), boxPaint, count) : null,
        meshes: [],
      };
      set.meshes = [body, new THREE.InstancedMesh(g.trim, trim, count), lamps, set.riders, set.helmets, ...(set.boxes ? [set.boxes] : [])];
      for (const mesh of set.meshes) {
        mesh.castShadow = mesh !== lamps;
        mesh.receiveShadow = mesh !== lamps;
        mesh.boundingSphere = this.bounds;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        for (let i = 0; i < count; i++) mesh.setMatrixAt(i, HIDDEN);
        this.add(mesh);
      }
      this.sets.set(model, set);
    }
    for (let i = 0; i < count; i++) {
      const mount = new Mount();
      this.mounts.push(mount);
    }
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  /** The riders, for the street's sound. */
  get voices(): readonly CarVoice[] {
    return this.mounts;
  }

  dispose(): void {
    for (const m of this.mounts) this.options.traffic.vehicles.delete(m);
  }

  update(dt: number): void {
    const s = this.dayNight.state;
    this.lampMaterial.setNight(THREE.MathUtils.smoothstep(nightnessOf(s), 0.2, 0.6));
    this.options.viewer.getWorldPosition(this.eye);
    this.worldToLocal(this.eye);
    this.spawnClock -= dt;
    if (this.spawnClock <= 0) {
      const weather = s.snowCover > 0.3 ? 0 : 1 - 0.75 * THREE.MathUtils.smoothstep(s.rain, 0.15, 0.6);
      const [a, b] = this.options.gap;
      this.spawnClock = (a + this.random() * (b - a)) / Math.max(0.1, wakefulnessAt(s.hours) * rushAt(s.hours) * weather);
      if (weather > 0) this.spawn();
    }
    this.signalClock = (this.signalClock + dt * SIGNAL.hz) % 1;
    let moved = false;
    this.box.makeEmpty();
    for (let i = 0; i < this.mounts.length; i++) {
      const mount = this.mounts[i]!;
      if (!mount.active) continue;
      this.ride(mount, dt);
      this.show(mount, i);
      if (mount.active) this.box.expandByPoint(mount.position);
      moved = true;
    }
    if (!moved) return;
    for (const set of this.sets.values()) {
      for (const mesh of set.meshes) mesh.instanceMatrix.needsUpdate = true;
      set.lampState.needsUpdate = true;
      set.wheelAngle.needsUpdate = true;
    }
    if (this.box.isEmpty()) this.box.expandByPoint(this.eye);
    this.box.getBoundingSphere(this.bounds);
    this.bounds.radius += 3;
  }

  private spawn(): void {
    const index = this.mounts.findIndex((m) => !m.active);
    const mount = this.mounts[index];
    if (!mount) return;
    const route = this.nextRoute;
    this.nextRoute = (this.nextRoute + 1) % this.routes.length;
    if (this.mounts.some((m) => m.active && m.route === route && m.distance < 10)) return;
    mount.shape = this.random() < this.options.moto ? 'moto' : 'scooter';
    mount.courier = mount.shape === 'scooter' && this.random() < this.options.courier;
    mount.cruise = mount.courier ? CRUISE.courier : CRUISE[mount.shape];
    mount.active = true;
    mount.route = route;
    mount.distance = 0;
    mount.speed = mount.cruise;
    mount.lean = 0;
    mount.yaw = placeOnRoute(this.routes[route]!, 0, mount.position);
    this.options.traffic.vehicles.add(mount);
    const set = this.sets.get(mount.shape)!;
    set.body.setColorAt(index, this.color.setHex(PAINTS[Math.floor(this.random() * PAINTS.length)]!));
    set.riders.setColorAt(index, this.color.setHex(CLOTHES[Math.floor(this.random() * CLOTHES.length)]!));
    set.helmets.setColorAt(index, this.color.setHex(HELMETS[Math.floor(this.random() * HELMETS.length)]!));
    set.boxes?.setColorAt(index, this.color.setHex(BOXES[Math.floor(this.random() * BOXES.length)]!));
    for (const mesh of [set.body, set.riders, set.helmets, set.boxes]) if (mesh?.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  private ride(mount: Mount, dt: number): void {
    const route = this.routes[mount.route]!;
    const traffic = this.options.traffic;
    const cap = corneringSpeed(route, mount.distance, mount.cruise);
    const { target, heldBy, pullOver } = allowedSpeed(traffic, mount, cap, this.eye, 3);
    const before = mount.speed;
    mount.speed = approach(mount.speed, pullOver ? Math.min(target, 2) : target, dt, 3, traffic.grip);
    mount.braking = (before - mount.speed) / Math.max(dt, 1e-3) > 0.8 || (mount.speed < 0.3 && heldBy !== null);
    mount.horn.update(dt, mount.speed, heldBy, traffic.carsGreen);
    const yawBefore = mount.yaw;
    mount.distance += mount.speed * dt;
    mount.rolled += mount.speed * dt;
    if (mount.distance >= route.length) {
      mount.active = false;
      mount.speed = 0;
      traffic.vehicles.delete(mount);
      return;
    }
    mount.yaw = placeOnRoute(route, mount.distance, mount.position);
    // Lean into the bend: tan(lean) = v ω / g, towards the inside (a left turn leans left, -x about the bike's axis).
    const omega = Math.atan2(Math.sin(mount.yaw - yawBefore), Math.cos(mount.yaw - yawBefore)) / Math.max(dt, 1e-3);
    const lean = THREE.MathUtils.clamp(-Math.atan((mount.speed * omega) / 9.81), -LEAN.most, LEAN.most);
    mount.lean += THREE.MathUtils.clamp(lean - mount.lean, -LEAN.rate * dt, LEAN.rate * dt);
    const here = headingAt(route, mount.distance);
    const next = headingAt(route, mount.distance + SIGNAL.ahead);
    const turn = Math.atan2(Math.sin(next - here), Math.cos(next - here));
    mount.signal = Math.abs(turn) < SIGNAL.turn ? 0 : turn > 0 ? -1 : 1;
  }

  /** Writes rider `i` into its shape's slot (hiding it in the other's). */
  private show(mount: Mount, i: number): void {
    for (const [model, set] of this.sets) {
      const shown = mount.active && model === mount.shape;
      if (shown) this.pose.makeRotationY(mount.yaw).multiply(this.roll.makeRotationX(mount.lean)).setPosition(mount.position.x, ROAD_Y, mount.position.z);
      const m = shown ? this.pose : HIDDEN;
      for (const mesh of set.meshes) mesh.setMatrixAt(i, mesh === set.boxes && !mount.courier ? HIDDEN : m);
      const blink = this.signalClock < 0.5;
      set.lampState.setXYZW(i, shown ? 1 : 0, shown && mount.braking ? 1 : 0, blink && mount.signal < 0 ? 1 : 0, blink && mount.signal > 0 ? 1 : 0);
      set.wheelAngle.setX(i, rollAngle(mount.rolled, TWO_WHEELERS[model].wheelRadius));
    }
  }
}
