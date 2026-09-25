import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../../Furniture';
import type { CarVoice, VehicleKind } from '../StreetCars';
import type { VehicleSize } from '../carModel';
import type { Vec2 } from '../streetPlan';
import { Horn, allowedSpeed, approach, corneringSpeed, distanceNearest, placeOnRoute, sampleRoute, type Route } from './driving';
import type { RoadObstacle, RoadVehicle, StreetTraffic } from './StreetTraffic';

/** The zone's collision set (world-space boxes): a vehicle standing still is solid while it stands. */
export interface CollisionSet {
  add(box: THREE.Box3): void;
  remove(box: THREE.Box3): void;
}

export interface ScriptedVehicleOptions {
  traffic: StreetTraffic;
  /** The player (the camera): drivers stop for them. */
  viewer: THREE.Object3D;
  /** The way it drives (zone-local points); it appears at the first and vanishes at the last. */
  route: readonly (readonly [number, number])[];
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
  protected readonly route: Route;
  protected readonly stopDistances: number[];
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
    this.stopDistances = (options.stops ?? []).map((s) => distanceNearest(this.route, s.at));
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

  /** Sets off from the start of the route. */
  protected depart(from = 0): void {
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
      if (!this.keepWaiting(this.stopIndex)) {
        this.leaving(this.stopIndex);
        this.setSolid(false);
        this.state = 'driving';
        this.nextStop++;
      }
      this.animate(dt);
      return;
    }
    const { traffic, viewer, cruise, stopFor } = this.options;
    viewer.getWorldPosition(this.eye);
    this.parent?.worldToLocal(this.eye);
    let cap = corneringSpeed(this.route, this.distance, cruise);
    const toStop = this.toNextStop;
    // Ease into the stop at 1.5 m/s² (a bus does not slam on).
    if (toStop < Infinity) cap = Math.min(cap, toStop <= 0 ? 0 : Math.sqrt(2 * 1.5 * toStop) + 0.2);
    const { target, heldBy } = allowedSpeed(traffic, this, cap, this.eye, stopFor);
    this.speed = approach(this.speed, target, dt, this.options.accel ?? 1.6);
    this.horn.update(dt, this.speed, heldBy, traffic.carsGreen);
    this.distance += this.speed * dt;
    if (toStop < Infinity && this.distance >= this.stopDistances[this.nextStop]! - 0.15 && this.speed < 0.6) {
      this.speed = 0;
      this.state = 'stopped';
      this.stopIndex = this.nextStop;
      this.stoodFor = 0;
      this.place();
      this.setSolid(true);
      this.arrived(this.stopIndex);
      this.animate(dt);
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
  }

  private place(): void {
    this.yaw = placeOnRoute(this.route, this.distance, this.position);
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
