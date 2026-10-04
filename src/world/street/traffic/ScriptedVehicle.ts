import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../../Furniture';
import type { CarVoice, VehicleKind } from '../StreetCars';
import type { VehicleSize } from '../carModel';
import type { Vec2 } from '../streetPlan';
import { Horn, allowedSpeed, approach, corneringSpeed, distanceNearest, headingAt, placeOnRoute, sampleRoute, type Route } from './driving';
import type { LampMaterial } from './lampMaterial';
import { rollAngle, type WheelMaterial } from './wheelSpin';
import type { RoadObstacle, RoadVehicle, StreetTraffic } from './StreetTraffic';
import { angleTo } from '@/math/angles';

/** The zone's collision set (world-space boxes): a vehicle standing still is solid while it stands. */
export interface CollisionSet {
  add(box: THREE.Box3): void;
  remove(box: THREE.Box3): void;
}

interface ScriptedVehicleOptions {
  traffic: StreetTraffic;
  /** The player (the camera): drivers stop for them. */
  viewer: THREE.Object3D;
  /** The way it drives (zone-local points); it appears at the first and vanishes at the last. */
  route: readonly (readonly [number, number])[];
  /** Other ways it may come (`depart(from, which)`, 1 on): no stops on those. */
  alternatives?: readonly (readonly (readonly [number, number])[])[];
  cruise: number;
  size: VehicleSize;
  kind: VehicleKind;
  /** Where it pulls up on the way (the nearest point of the route to each), and for how long by default. */
  stops?: readonly { at: Vec2; dwell: number }[];
  /** How far short of the player it stops. */
  stopFor: number;
  collisions?: CollisionSet;
  /** Pulls away more gently than a car (m/s²). */
  accel?: number;
}

type State = 'away' | 'driving' | 'stopped';

/** How far a driver pulls over for a siren behind (metres to the right), and how quickly it moves across (m/s). */
const PULL_OVER = 1.3;
const SIDEWAYS = 1.2;
/** A bend this sharp (radians) within this many metres ahead: the indicator goes on; how fast it blinks (Hz). */
const SIGNAL = { turn: 0.6, ahead: 22, hz: 1.5 } as const;
/** Slowing by more than this (m/s²), or standing held up: the brake lights are on. */
const BRAKING_AT = 0.8;

/**
 * A vehicle that drives one fixed route on its own timetable (the bus, the delivery van, the bin
 * lorry): it keeps to the route's samples like the cars (corners, queues, lights, zebras, the
 * player, anything on the road, via `allowedSpeed`), pulls up gently at its stops and stands
 * there as long as the subclass says (`keepWaiting`), solid while it stands (a collider and an
 * obstacle for the other drivers), and is a `RoadVehicle` and a `CarVoice` while it drives.
 * Subclasses build the body (nose to +x, wheels on y = 0) as children and call `depart()` to
 * send it off; the group moves itself in zone-local coordinates.
 */
export abstract class ScriptedVehicle extends THREE.Group implements Furniture, Updatable, CarVoice, RoadVehicle {
  readonly contactShadow = false;
  readonly kind: VehicleKind;
  readonly length: number;
  readonly width: number;
  speed = 0;
  yaw = 0;
  protected route: Route;
  private readonly routes: Route[];
  protected stopDistances: number[];
  private readonly firstStops: number[];
  /** Metres to the right of its line (pulled over for a siren, or swinging out); eased towards `laneOffsetTo`. */
  laneOffset = 0;
  protected laneOffsetTo = 0;
  /** Its brake lights: slowing hard, or held standing. */
  isBraking = false;
  /** Its indicator: -1 left, 1 right, 0 off (on through the bends ahead, and pulling in or out). */
  signalling: -1 | 0 | 1 = 0;
  /** Its lamps and wheels, when the subclass builds them with `LampMaterial` and `WheelMaterial`: driven here. */
  protected lampFace: LampMaterial | null = null;
  protected wheelFace: { material: WheelMaterial; radius: number } | null = null;
  private signalClock = 0;
  private rolled = 0;
  protected state: State = 'away';
  protected distance = 0;
  /** Seconds at the current stop. */
  protected stoodFor = 0;
  protected stopIndex = -1;
  private nextStop = 0;
  private readonly horn = new Horn();
  private readonly eye = new THREE.Vector3();
  private readonly standing: RoadObstacle[] = [];
  /** Its own standing obstacles (it never stops for those). */
  readonly own = new Set<RoadObstacle>();
  private readonly collider = new THREE.Box3();
  private solid = false;

  constructor(protected readonly options: ScriptedVehicleOptions) {
    super();
    this.kind = options.kind;
    this.length = options.size.length;
    this.width = options.size.width;
    this.route = sampleRoute(options.route);
    this.routes = [this.route, ...(options.alternatives ?? []).map((points) => sampleRoute(points))];
    this.firstStops = (options.stops ?? []).map((s) => distanceNearest(this.route, s.at));
    this.stopDistances = this.firstStops;
    // Standing, it is three obstacles along its length (drivers stop 1.5 m short of it).
    for (let i = 0; i < 3; i++) this.standing.push({ position: new THREE.Vector3(), radius: Math.min(this.width / 2 + 0.2, this.length / 6), active: false, gap: 1.5 });
    for (const o of this.standing) this.own.add(o);
    this.visible = false;
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  get active(): boolean {
    return this.state !== 'away';
  }

  get honks(): number {
    return this.horn.honks;
  }

  /** Its brake lights are on (for the street's sound: `CarVoice.braking`). */
  get braking(): boolean {
    return this.isBraking;
  }

  dispose(): void {
    this.setSolid(false);
    this.options.traffic.vehicles.delete(this);
    for (const o of this.standing) this.options.traffic.obstacles.delete(o);
  }

  /** Called every frame, first: the timetable (when to set off). */
  protected abstract schedule(dt: number): void;

  /** Whether to stay at stop `index` a while longer (`stoodFor` seconds so far); default: its dwell. */
  protected keepWaiting(index: number): boolean {
    return this.stoodFor < (this.options.stops?.[index]?.dwell ?? 0);
  }

  /** Just pulled up at stop `index`. */
  protected arrived(_index: number): void {}

  /** Pulling away from stop `index`. */
  protected leaving(_index: number): void {}

  /** Reached the end of the route and vanished. */
  protected finished(): void {}

  /** Per-frame animation of the body (lamps, doors, wheels), after it has moved. */
  protected animate(_dt: number): void {}

  /** How many ways it may come (`depart`'s `which`). */
  protected get routeCount(): number {
    return this.routes.length;
  }

  /** On a call with its siren on (`EmergencyVehicle`): through red lights, never pulling over. */
  get emergency(): boolean {
    return false;
  }

  /** Sets off from the start of the route (`which`: one of the `alternatives`, 1 on, which have no stops). */
  protected depart(from = 0, which = 0): void {
    this.route = this.routes[which] ?? this.routes[0]!;
    this.stopDistances = which === 0 ? this.firstStops : [];
    this.laneOffset = 0;
    this.laneOffsetTo = 0;
    this.state = 'driving';
    this.distance = from;
    this.speed = from > 0 ? 0 : this.options.cruise;
    this.nextStop = this.stopDistances.findIndex((d) => d > from - 1);
    if (this.nextStop < 0) this.nextStop = this.stopDistances.length;
    this.stopIndex = -1;
    this.visible = true;
    this.options.traffic.vehicles.add(this);
    this.place();
  }

  /** Distance still to go to the next stop, or Infinity. */
  protected get toNextStop(): number {
    const d = this.stopDistances[this.nextStop];
    return d === undefined ? Infinity : d - this.distance;
  }

  update(dt: number): void {
    this.schedule(dt);
    if (this.state === 'away') return;
    if (this.state === 'stopped') {
      this.stoodFor += dt;
      this.isBraking = true;
      if (!this.keepWaiting(this.stopIndex)) {
        this.leaving(this.stopIndex);
        this.setSolid(false);
        this.state = 'driving';
        this.nextStop++;
      }
      this.animate(dt);
      this.dressLamps(dt);
      return;
    }
    const { traffic, viewer, cruise, stopFor } = this.options;
    viewer.getWorldPosition(this.eye);
    this.parent?.worldToLocal(this.eye);
    let cap = corneringSpeed(this.route, this.distance, cruise);
    const toStop = this.toNextStop;
    // Ease into the stop at 1.5 m/s² (a bus does not slam on).
    if (toStop < Infinity) cap = Math.min(cap, toStop <= 0 ? 0 : Math.sqrt(2 * 1.5 * toStop) + 0.2);
    const { target, heldBy, pullOver } = allowedSpeed(traffic, this, cap, this.eye, stopFor);
    const before = this.speed;
    this.speed = approach(this.speed, target, dt, this.options.accel ?? 1.6, traffic.grip);
    this.isBraking = (before - this.speed) / Math.max(dt, 1e-3) > BRAKING_AT || (this.speed < 0.3 && heldBy !== null);
    this.horn.update(dt, this.speed, heldBy, traffic.carsGreen);
    this.laneOffsetTo = pullOver ? PULL_OVER : this.emergency ? this.overtaking : 0;
    this.laneOffset += THREE.MathUtils.clamp(this.laneOffsetTo - this.laneOffset, -SIDEWAYS * dt, SIDEWAYS * dt);
    this.distance += this.speed * dt;
    this.rolled += this.speed * dt;
    if (toStop < Infinity && this.distance >= this.stopDistances[this.nextStop]! - 0.15 && this.speed < 0.6) {
      this.speed = 0;
      this.state = 'stopped';
      this.stopIndex = this.nextStop;
      this.stoodFor = 0;
      this.place();
      this.setSolid(true);
      this.arrived(this.stopIndex);
      this.animate(dt);
      this.dressLamps(dt);
      return;
    }
    if (this.distance >= this.route.length) {
      this.state = 'away';
      this.speed = 0;
      this.visible = false;
      this.options.traffic.vehicles.delete(this);
      this.finished();
      return;
    }
    this.place();
    this.animate(dt);
    this.dressLamps(dt);
  }

  /** How far to the left an emergency vehicle keeps (negative: towards the middle of the road, past those pulled over). */
  protected get overtaking(): number {
    return 0;
  }

  /** The indicator for the bend ahead (or a stop to pull in to), the lamps' state, the wheels' turn. */
  private dressLamps(dt: number): void {
    if (this.state === 'driving') {
      const here = headingAt(this.route, this.distance);
      const next = headingAt(this.route, this.distance + SIGNAL.ahead);
      const turn = angleTo(here, next);
      const toStop = this.toNextStop;
      this.signalling = Math.abs(turn) > SIGNAL.turn ? (turn > 0 ? -1 : 1) : toStop < 30 ? 1 : 0;
    } else this.signalling = 0;
    this.signalClock = (this.signalClock + dt * SIGNAL.hz) % 1;
    const blink = this.signalClock < 0.5;
    this.lampFace?.setState({ lit: true, brake: this.isBraking, left: blink && this.signalling < 0, right: blink && this.signalling > 0, reverse: false });
    if (this.wheelFace) this.wheelFace.material.angle = rollAngle(this.rolled, this.wheelFace.radius);
  }

  private place(): void {
    this.yaw = placeOnRoute(this.route, this.distance, this.position);
    // Right of the heading is (sin yaw, cos yaw).
    this.position.x += Math.sin(this.yaw) * this.laneOffset;
    this.position.z += Math.cos(this.yaw) * this.laneOffset;
    this.rotation.set(0, this.yaw, 0);
  }

  /** Standing still: a collider for the player and obstacles for the other drivers; or not. */
  private setSolid(solid: boolean): void {
    if (solid === this.solid) return;
    this.solid = solid;
    const { traffic, collisions } = this.options;
    if (solid) {
      const hx = Math.cos(this.yaw);
      const hz = -Math.sin(this.yaw);
      this.standing.forEach((o, i) => {
        const along = ((i - 1) * this.length) / 3;
        o.position.set(this.position.x + hx * along, 0, this.position.z + hz * along);
        (o as { active: boolean }).active = true;
        traffic.obstacles.add(o);
      });
      if (collisions && this.parent) {
        const along = Math.abs(hx) > Math.abs(hz);
        const half = new THREE.Vector3((along ? this.length : this.width) / 2, 0, (along ? this.width : this.length) / 2);
        const centre = this.parent.localToWorld(new THREE.Vector3(this.position.x, 0, this.position.z));
        this.collider.set(centre.clone().sub(half), centre.clone().add(half).setY(this.options.size.height));
        collisions.add(this.collider);
      }
    } else {
      for (const o of this.standing) {
        (o as { active: boolean }).active = false;
        traffic.obstacles.delete(o);
      }
      collisions?.remove(this.collider);
    }
  }
}
