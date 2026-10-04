import * as THREE from 'three';
import { CAR_SIZES, type CarModelId } from '../carModel';
import type { Vec2 } from '../streetPlan';
import { Horn, type DriverView, type Route } from './driving';
import type { RoadVehicle } from './StreetTraffic';
import type { VoiceSlot } from './carVoices';

/*
 * One of the street's cars as the simulation sees it (`StreetCars` drives them, `CarFleet` draws them, the
 * `VoicePool` lends them a voice): its mode, its path and errand, its lights, and its slot in its shape's meshes.
 */

/** What drives on the street, as the street's sound tells them apart. */
export type VehicleKind = 'car' | 'bus' | 'van' | 'lorry' | 'bike' | 'scooter' | 'moto' | 'courier' | 'ambulance' | 'police' | 'fire';

type Mode = 'away' | 'drive' | 'standing' | 'reverse' | 'parked';

/** A driver's errand: parking in a bay, pulling out of one, pulling in at a taxi stand (`StreetCars` reads it as `Car['job']`). */
type Job =
  | { kind: 'park'; bay: number; stopAt: number; waited: number }
  | { kind: 'pullOut'; clock: number; route: number }
  | { kind: 'fare'; stop: number; stopAt: number; aside: number; pickUp: boolean; phase: 'approach' | 'opening' | 'walking' | 'leaving'; clock: number };

/** A parking bay: where, its heading, who stands in it, the route that passes it (and where along), whether the cat's car is in it. */
export interface Bay {
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
export class Car implements RoadVehicle, DriverView {
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

/** The view a reversing car drives by: its travel heading (the nose points the other way). */
export class ReverseView implements DriverView {
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

/** A parked car's box in bay `at` heading `yaw` (zone-local), for a car of `model`'s size. */
export function bayBox(at: Vec2, yaw: number, model: CarModelId): THREE.Box3 {
  const size = CAR_SIZES[model];
  const along = Math.abs(Math.cos(yaw)) > 0.5;
  const hx = (along ? size.length : size.width) / 2;
  const hz = (along ? size.width : size.length) / 2;
  return new THREE.Box3(new THREE.Vector3(at[0] - hx, 0, at[1] - hz), new THREE.Vector3(at[0] + hx, size.height, at[1] + hz));
}
