import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Updatable } from '@/core/Engine';
import { seededRandom } from '@/covers/generated/canvasUtils';
import { QUALITY } from '@/graphics/quality';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import { wakefulnessAt } from '../../props/outdoors/wakefulness';
import { BIKE, bikeGeometry, tube } from '../carModel';
import type { CarVoice } from '../StreetCars';
import type { Spot, Vec2 } from '../streetPlan';
import { ROAD_Y, allowedSpeed, approach, corneringSpeed, placeOnRoute, sampleRoute, type Route } from './driving';
import type { RoadVehicle, StreetTraffic } from './StreetTraffic';

export interface StreetBikesOptions {
  traffic: StreetTraffic;
  /** The player (the camera): riders stop for them. */
  viewer: THREE.Object3D;
  /** The cars' routes: riders keep `LANE_OFFSET` to the right of them. */
  routes: readonly (readonly Vec2[])[];
  riders: number;
  racks: readonly (Spot & { bikes: number })[];
}

const LANE_OFFSET = 2.2;
const CRUISE = 4.6;
/** How far out towards the car lane a rider swings to get round something standing in the way. */
const SWERVE = 1.7;
const THIGH = 0.46;
const SHIN = 0.47;
/** Metres a rack takes per bike along it. */
const RACK_PITCH = 1.9;
const FRAMES = [0x2a4f8a, 0xb8322a, 0x1f1f22, 0xe8e6e0, 0x3f6b4f, 0xd9b44a, 0x6a2a4a, 0x8a9096];
const CLOTHES = [0x2a3a5a, 0x5a2a2a, 0x3a4a3a, 0xc9a64a, 0x1f1f22, 0x6a6a72, 0xd9d4c8, 0x8a3a5a];
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

class Rider implements RoadVehicle, CarVoice {
  readonly position = new THREE.Vector3();
  readonly kind = 'bike' as const;
  readonly honks = 0;
  readonly length = BIKE.length;
  readonly width = 0.6;
  active = false;
  route = 0;
  distance = 0;
  speed = 0;
  yaw = 0;
  /** Sideways offset from its line (negative: out towards the car lane), and where it is easing to. */
  swerve = 0;
  swerveTo = 0;
  blocked = 0;
  clear = 0;
  crank = 0;
  readonly self: RoadVehicle = this;
}

/**
 * The bicycles: a couple of riders on the road's outer lanes (a little to the right of the cars'
 * lines, stopping at the lights, queueing, swinging out round the double-parked van), and bikes
 * locked to the stands of the racks on the pavements. All instanced: frames, riders' bodies,
 * skin, and the legs (thigh and shin per leg, laid on the pedals every frame by a two-bone reach
 * as the cranks turn). Fewer riders at night and in the rain, none on snow.
 */
export class StreetBikes extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  readonly colliders: THREE.Box3[] = [];
  private readonly riders: Rider[] = [];
  private readonly routes: Route[];
  private readonly frames: THREE.InstancedMesh;
  private readonly bodies: THREE.InstancedMesh;
  private readonly skin: THREE.InstancedMesh;
  private readonly legs: THREE.InstancedMesh;
  private readonly random = seededRandom(Date.now() & 0xfff);
  private spawnClock = 3;
  private nextRoute = 0;
  private readonly eye = new THREE.Vector3();
  private readonly bike = new THREE.Matrix4();
  private readonly part = new THREE.Matrix4();
  private readonly color = new THREE.Color();

  constructor(private readonly dayNight: DayNight, private readonly options: StreetBikesOptions) {
    super();
    this.name = 'StreetBikes';
    const riders = QUALITY.level === 'low' ? Math.min(1, options.riders) : options.riders;
    const parked = options.racks.reduce((n, r) => n + r.bikes, 0);
    this.routes = options.routes.map((points) => sampleRoute(points, LANE_OFFSET));

    const metal = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.6 });
    const cloth = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
    this.frames = new THREE.InstancedMesh(bikeGeometry(), metal, riders + parked);
    this.bodies = new THREE.InstancedMesh(riderBody(), cloth, riders);
    this.skin = new THREE.InstancedMesh(riderSkin(), new THREE.MeshStandardMaterial({ color: 0xd9a888, roughness: 0.7 }), riders);
    this.legs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), cloth, riders * 4);
    const paint = seededRandom(515);
    for (let i = 0; i < riders + parked; i++) this.frames.setColorAt(i, this.color.setHex(FRAMES[Math.floor(paint() * FRAMES.length)]!));
    for (let i = 0; i < riders; i++) {
      this.bodies.setColorAt(i, this.color.setHex(CLOTHES[i % CLOTHES.length]!));
      for (let l = 0; l < 4; l++) this.legs.setColorAt(i * 4 + l, this.color.setHex(CLOTHES[(i + 3) % CLOTHES.length]!).multiplyScalar(0.7));
      this.frames.setMatrixAt(i, HIDDEN);
      this.bodies.setMatrixAt(i, HIDDEN);
      this.skin.setMatrixAt(i, HIDDEN);
      for (let l = 0; l < 4; l++) this.legs.setMatrixAt(i * 4 + l, HIDDEN);
      const rider = new Rider();
      this.riders.push(rider);
      options.traffic.vehicles.add(rider);
    }

    // The racks: a row of stands along the kerb, a bike leaning on each.
    const hoops: THREE.BufferGeometry[] = [];
    const rack = new THREE.Matrix4();
    let slot = riders;
    for (const { at, yaw, bikes } of options.racks) {
      rack.makeRotationY(yaw).setPosition(at[0], 0, at[1]);
      for (let i = 0; i < bikes; i++) {
        const x = (i - (bikes - 1) / 2) * RACK_PITCH;
        const hoop = mergeGeometries([tube([x - 0.35, 0], [x - 0.35, 0.8], 0.025), tube([x + 0.35, 0], [x + 0.35, 0.8], 0.025), tube([x - 0.37, 0.8], [x + 0.37, 0.8], 0.025)])!;
        hoops.push(hoop.applyMatrix4(rack));
        this.part.makeRotationX(0.06).setPosition(x, 0, -0.28);
        this.frames.setMatrixAt(slot++, this.bike.multiplyMatrices(rack, this.part));
      }
      const along = Math.abs(Math.cos(yaw)) > 0.5;
      const long = (bikes * RACK_PITCH) / 2;
      const [hx, hz] = along ? [long, 0.45] : [0.45, long];
      this.colliders.push(new THREE.Box3(new THREE.Vector3(at[0] - hx, 0, at[1] - hz), new THREE.Vector3(at[0] + hx, 0.9, at[1] + hz)));
    }
    const stands = new THREE.Mesh(mergeGeometries(hoops)!, new THREE.MeshStandardMaterial({ color: 0x3a3f44, roughness: 0.45, metalness: 0.6 }));
    for (const g of hoops) g.dispose();
    stands.castShadow = true;
    stands.receiveShadow = true;

    for (const mesh of [this.frames, this.bodies, this.skin, this.legs]) {
      mesh.frustumCulled = false; // the riders move out of any bounds computed now
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.add(stands, this.frames, this.bodies, this.skin, this.legs);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  /** The riders, for the street's sound. */
  get voices(): readonly CarVoice[] {
    return this.riders;
  }

  dispose(): void {
    for (const r of this.riders) this.options.traffic.vehicles.delete(r);
  }

  update(dt: number): void {
    const s = this.dayNight.state;
    this.options.viewer.getWorldPosition(this.eye);
    this.worldToLocal(this.eye);
    this.spawnClock -= dt;
    if (this.spawnClock <= 0) {
      const weather = s.snowCover > 0.3 ? 0 : 1 - 0.7 * THREE.MathUtils.smoothstep(s.rain, 0.2, 0.7);
      this.spawnClock = (6 + this.random() * 16) / Math.max(0.1, wakefulnessAt(s.hours) * weather);
      if (weather > 0) this.spawn();
    }
    let moved = false;
    this.riders.forEach((rider, i) => {
      if (!rider.active) return;
      this.ride(rider, dt);
      this.pose(rider, i);
      moved = true;
    });
    if (moved) for (const mesh of [this.frames, this.bodies, this.skin, this.legs]) mesh.instanceMatrix.needsUpdate = true;
  }

  private spawn(): void {
    const rider = this.riders.find((r) => !r.active);
    if (!rider) return;
    rider.route = this.nextRoute;
    this.nextRoute = (this.nextRoute + 1) % this.routes.length;
    rider.active = true;
    rider.distance = 0;
    rider.speed = CRUISE;
    rider.swerve = 0;
    rider.swerveTo = 0;
    rider.yaw = placeOnRoute(this.routes[rider.route]!, 0, rider.position);
  }

  private ride(rider: Rider, dt: number): void {
    const route = this.routes[rider.route]!;
    const cap = corneringSpeed(route, rider.distance, CRUISE);
    const { target, heldBy } = allowedSpeed(this.options.traffic, rider, cap, this.eye, 2.5);
    // Held up by something that is not moving (the van, a parked bus): swing out and go round.
    const stuck = target < 1.2 && (heldBy === 'obstacle' || heldBy === 'vehicle');
    rider.blocked = stuck ? rider.blocked + dt : 0;
    rider.clear = stuck ? 0 : rider.clear + dt;
    if (rider.blocked > 0.8) rider.swerveTo = -SWERVE;
    else if (rider.clear > 2.2) rider.swerveTo = 0;
    rider.swerve += THREE.MathUtils.clamp(rider.swerveTo - rider.swerve, -dt * 1.1, dt * 1.1);
    rider.speed = approach(rider.speed, target, dt, 1.5);
    rider.distance += rider.speed * dt;
    rider.crank += (rider.speed / BIKE.wheelRadius / 2.6) * dt;
    if (rider.distance >= route.length) {
      rider.active = false;
      return;
    }
    rider.yaw = placeOnRoute(route, rider.distance, rider.position);
    // Right of the heading is (sin yaw, cos yaw).
    rider.position.x += Math.sin(rider.yaw) * rider.swerve;
    rider.position.z += Math.cos(rider.yaw) * rider.swerve;
  }

  /** Frame, body and head at the bike; each leg's thigh and shin from the hip to its pedal. */
  private pose(rider: Rider, i: number): void {
    if (!rider.active) {
      for (const mesh of [this.frames, this.bodies, this.skin]) mesh.setMatrixAt(i, HIDDEN);
      for (let l = 0; l < 4; l++) this.legs.setMatrixAt(i * 4 + l, HIDDEN);
      return;
    }
    // A slight lean into the bends is too fussy; upright, and a touch forward when pedalling hard.
    this.bike.makeRotationY(rider.yaw).setPosition(rider.position.x, ROAD_Y, rider.position.z);
    this.frames.setMatrixAt(i, this.bike);
    this.bodies.setMatrixAt(i, this.bike);
    this.skin.setMatrixAt(i, this.bike);
    const { crank, hip } = BIKE;
    for (let leg = 0; leg < 2; leg++) {
      const a = rider.crank + leg * Math.PI;
      const pedal: [number, number] = [crank.x + Math.cos(a) * crank.radius, crank.y + Math.sin(a) * crank.radius];
      const knee = reach([hip.x, hip.y], pedal, THIGH, SHIN);
      const z = leg ? 0.1 : -0.1;
      this.legs.setMatrixAt(i * 4 + leg * 2, this.segment([hip.x, hip.y], knee, z, 0.13));
      this.legs.setMatrixAt(i * 4 + leg * 2 + 1, this.segment(knee, pedal, z, 0.1));
    }
  }

  /** A unit box stretched from `a` to `b` in the bike's plane at depth z, placed on the bike. */
  private segment(a: readonly [number, number], b: readonly [number, number], z: number, thick: number): THREE.Matrix4 {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    this.part.makeRotationZ(Math.atan2(dy, dx));
    this.part.scale(new THREE.Vector3(Math.hypot(dx, dy), thick, thick));
    this.part.setPosition((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z);
    return this.part.premultiply(this.bike);
  }
}

/** Where the knee is for a hip and a foot a thigh and a shin apart: bent forwards (towards +x). */
function reach(hip: readonly [number, number], foot: readonly [number, number], upper: number, lower: number): [number, number] {
  const dx = foot[0] - hip[0];
  const dy = foot[1] - hip[1];
  const d = THREE.MathUtils.clamp(Math.hypot(dx, dy), 0.1, upper + lower - 0.005);
  const base = Math.atan2(dy, dx);
  const bend = Math.acos(THREE.MathUtils.clamp((upper * upper + d * d - lower * lower) / (2 * upper * d), -1, 1));
  const k1: [number, number] = [hip[0] + Math.cos(base + bend) * upper, hip[1] + Math.sin(base + bend) * upper];
  const k2: [number, number] = [hip[0] + Math.cos(base - bend) * upper, hip[1] + Math.sin(base - bend) * upper];
  return k1[0] > k2[0] ? k1 : k2;
}

/** A box from `a` to `b` in the bike's plane, `thick` along the travel and `wide` across it. */
function limb(a: readonly [number, number], b: readonly [number, number], thick: number, wide: number, z = 0): THREE.BufferGeometry {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const g = new THREE.BoxGeometry(thick, Math.hypot(dx, dy), wide);
  g.rotateZ(Math.atan2(dy, dx) - Math.PI / 2);
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z);
  return g;
}

/** The rider's torso (leaning over the bars) and arms, in the bike's frame. */
function riderBody(): THREE.BufferGeometry {
  const hip: [number, number] = [BIKE.hip.x, BIKE.hip.y];
  const shoulder: [number, number] = [0.14, 1.42];
  const hands: [number, number] = [BIKE.bars.x - 0.02, BIKE.bars.y + 0.03];
  const parts = [limb(hip, shoulder, 0.22, 0.36), limb(shoulder, hands, 0.08, 0.08, -0.2), limb(shoulder, hands, 0.08, 0.08, 0.2)];
  const g = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return g;
}

/** Head and hands. */
function riderSkin(): THREE.BufferGeometry {
  const head = new THREE.SphereGeometry(0.11, 10, 8).translate(0.24, 1.61, 0);
  head.deleteAttribute('uv');
  const hands = [-0.22, 0.22].map((z) => new THREE.BoxGeometry(0.07, 0.06, 0.08).translate(BIKE.bars.x, BIKE.bars.y + 0.02, z).toNonIndexed());
  for (const h of hands) h.deleteAttribute('uv');
  const g = mergeGeometries([head.toNonIndexed(), ...hands])!;
  return g;
}
