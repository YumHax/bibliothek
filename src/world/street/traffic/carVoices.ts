import * as THREE from 'three';
import type { CarModelId } from '../carModel';
import type { SirenKind } from './Emergency';
import type { Car, VehicleKind } from './Car';

/*
 * What the street's sound and the wet road hear and see of the moving cars: a fixed pool of voices (`CarVoice`) and
 * lamps (`MovingLamp`) that `StreetCars` lends a car while it moves and takes back when it parks or leaves, so the
 * listeners (`StreetSound`, `relief/WetGround`) hold stable references whatever the cars do.
 */

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

/** What the street's sound and the wet road hear and see of a moving car: a slot lent to it while it moves. */
export class VoiceSlot implements CarVoice, MovingLamp {
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

/** The pool of `count` slots: a car on the move borrows one (none free: it drives silently), and hands it back at rest. */
export class VoicePool {
  readonly slots: readonly VoiceSlot[];

  constructor(count: number) {
    this.slots = Array.from({ length: count }, () => new VoiceSlot());
  }

  lend(car: Car): void {
    if (car.voice) return;
    const slot = this.slots.find((s) => !s.car);
    if (!slot) return;
    slot.lend(car);
    car.voice = slot;
  }

  /** The slot reads the car one last time (its final toots and doors), then is free. */
  release(car: Car): void {
    if (!car.voice) return;
    car.voice.sync();
    car.voice.car = null;
    car.voice.active = false;
    car.voice = null;
  }

  /** Every slot reads its car: once a frame, after the cars have moved. */
  sync(): void {
    for (const slot of this.slots) slot.sync();
  }
}
