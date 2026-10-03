import * as THREE from 'three';
import type { DayNight } from '../../props/DayNight';
import { Walker } from '../../people/Walker';
import { CAR_SIZES, LORRY, carGeometries, lorryGeometries, vehicleGlass } from '../carModel';
import { nightnessOf } from '../streetAir';
import { snowCovered } from '../snowCover';
import { paint, standard } from '../../materials/palette';
import type { Vec2 } from '../streetPlan';
import { ScriptedVehicle, type CollisionSet } from './ScriptedVehicle';
import type { StreetTraffic } from './StreetTraffic';
import { CRUISE } from '../../city/traffic';
import { LampMaterial } from './lampMaterial';
import { WheelMaterial } from './wheelSpin';
import { VEHICLES } from '../../city/vehicles';

interface Common {
  traffic: StreetTraffic;
  viewer: THREE.Object3D;
  /** The traffic's first route (up Park Street, along Front Street, into the side street). */
  route: readonly Vec2[];
  stopFor: number;
  collisions?: CollisionSet;
}

/** Which of `windows` game hour `h` is inside ([from, to)), or -1. */
function windowAt(h: number, windows: readonly (readonly [number, number])[]): number {
  return windows.findIndex(([from, to]) => h >= from && h < to);
}

/** Splices a stop off the lane into a route's straight stretch along Front Street (like the bus's pull-in). */
function withPullIn(route: readonly Vec2[], [sx, sz]: Vec2): Vec2[] {
  const i = route.findIndex((p, k) => k + 1 < route.length && p[0] <= sx - 12 && route[k + 1]![0] >= sx + 12 && p[1] === route[k + 1]![1]);
  if (i < 0) return [...route];
  const lane = route[i]![1];
  return [...route.slice(0, i + 1), [sx - 9, lane], [sx - 3.5, sz], [sx, sz], [sx + 3.5, sz], [sx + 9, lane], ...route.slice(i + 1)];
}

function shade(mesh: THREE.Mesh): THREE.Mesh {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export interface DeliveryVanOptions extends Common {
  /** Where it double-parks (outside the bakery), facing +x; the shop door the crates go in by; the game hours it comes in, and any later rounds. */
  at: Vec2;
  door: Vec2;
  hours: readonly [number, number];
  later?: readonly (readonly [number, number])[];
  /** The bakery's crates (two trips, its cream van), or a parcel (one trip, the parcel firm's green van). */
  cargo?: 'crates' | 'parcel';
}

/** What each kind of delivery carries in, how many trips, the van's paint, its band's and the load's colour. */
const CARGO = {
  crates: { trips: 2, size: { w: 0.5, h: 0.32, d: 0.36 }, body: 0xeeeae2, band: 0xb8862f, load: 0x9a6a3a, y: 1.0, seed: 991 },
  parcel: { trips: 1, size: { w: 0.42, h: 0.3, d: 0.32 }, body: 0x2f4a3a, band: 0xd9b44a, load: 0xb08a5a, y: 1.05, seed: 977 },
} as const;

/**
 * The bakery's morning delivery: a white panel van comes up the street during `hours`, double-
 * parks outside the bakery with its hazards blinking (solid while it stands, and an obstacle the
 * cars and bikes go round), opens its back doors, and the driver (`people/Walker`) carries a
 * couple of crates across the pavement into the shop, then drives off. Once per morning window
 * (a player arriving in the middle of it finds it already on its way).
 */
export class DeliveryVan extends ScriptedVehicle {
  private readonly driver: Walker;
  private readonly crate: THREE.Mesh;
  private readonly rearDoors: THREE.Mesh[] = [];
  private readonly lamps: LampMaterial;
  private readonly hazard: THREE.MeshBasicMaterial;
  private readonly cargo: (typeof CARGO)[keyof typeof CARGO];
  private readonly windows: readonly (readonly [number, number])[];
  private lastWindow = -1;
  private trips = 0;
  /** What the driver is doing while the van stands: getting out, carrying, in the shop, coming back, done. */
  private job: 'none' | 'toDoor' | 'inside' | 'toVan' | 'done' = 'none';
  private jobClock = 0;
  private doorsOpen = 0;
  private blink = 0;

  constructor(private readonly dayNight: DayNight, private readonly van: DeliveryVanOptions) {
    super({ traffic: van.traffic, viewer: van.viewer, route: withPullIn(van.route, van.at), cruise: CRUISE.van, size: CAR_SIZES.van, kind: 'van', stops: [{ at: van.at, dwell: 0 }], stopFor: van.stopFor, collisions: van.collisions });
    this.name = van.cargo === 'parcel' ? 'ParcelVan' : 'DeliveryVan';
    this.cargo = CARGO[van.cargo ?? 'crates'];
    this.windows = [van.hours, ...(van.later ?? [])];
    const g = carGeometries('van');
    this.lamps = new LampMaterial();
    const wheels = new WheelMaterial(false);
    this.lampFace = this.lamps;
    this.wheelFace = { material: wheels, radius: VEHICLES.van.wheelRadius };
    this.hazard = new THREE.MeshBasicMaterial({ color: 0x331800 });
    this.add(
      shade(new THREE.Mesh(g.body, snowCovered(new THREE.MeshStandardMaterial({ color: this.cargo.body, roughness: 0.35 })))),
      shade(new THREE.Mesh(g.glass, vehicleGlass())),
      shade(new THREE.Mesh(g.wheels, wheels)),
      new THREE.Mesh(g.lamps, this.lamps),
    );
    // The bakery's name on the side, and the hazard lamps at the four corners.
    const { length, width } = CAR_SIZES.van;
    for (const x of [length / 2 + 0.07, -length / 2 - 0.07]) {
      for (const z of [-width / 2 + 0.1, width / 2 - 0.1]) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.14), this.hazard);
        lamp.position.set(x, x > 0 ? 0.78 : 1.3, z);
        this.add(lamp);
      }
    }
    const stripe = paint(this.cargo.band, 0.6);
    for (const side of [-1, 1]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.22, 0.01), stripe);
      band.position.set(-0.8, 1.35, side * (width / 2 + 0.056));
      this.add(band);
    }
    // Rear doors, hinged at the back corners.
    const doorMaterial = standard({ color: this.cargo.body, roughness: 0.4 });
    for (const side of [-1, 1]) {
      const pivot = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.8, width / 2 - 0.06).translate(0, 0, (-side * (width / 2 - 0.06)) / 2), doorMaterial);
      pivot.position.set(-length / 2 - 0.07, 1.25, side * (width / 2 - 0.04));
      pivot.userData.side = side;
      this.rearDoors.push(pivot);
      this.add(pivot);
    }

    this.driver = new Walker({ viewer: van.viewer, seed: this.cargo.seed, speed: van.cargo === 'parcel' ? 1.45 : 1.1, fade: true });
    this.driver.traverse((o) => {
      o.castShadow = false;
    });
    const { w, h, d } = this.cargo.size;
    this.crate = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), paint(this.cargo.load, 0.85));
    this.crate.position.set(0, this.cargo.y, 0.36);
    this.driver.add(this.crate);
    this.driver.setPresent(false);
  }

  /** The delivery person, who walks about the pavement: place it in the zone at the origin (it moves itself in zone-local coordinates). */
  get person(): Walker {
    return this.driver;
  }

  protected schedule(): void {
    const window = windowAt(this.dayNight.state.hours, this.windows);
    if (window >= 0 && window !== this.lastWindow && !this.active) {
      this.trips = 0;
      this.job = 'none';
      this.depart();
    }
    this.lastWindow = window;
  }

  protected arrived(): void {
    this.job = 'none';
    this.jobClock = 0;
  }

  protected keepWaiting(): boolean {
    return this.job !== 'done' || this.doorsOpen > 0;
  }

  protected leaving(): void {
    this.driver.setPresent(false);
  }

  protected animate(dt: number): void {
    const night = THREE.MathUtils.smoothstep(nightnessOf(this.dayNight.state), 0.2, 0.6);
    this.lamps.setNight(night);
    const standing = this.state === 'stopped';
    this.blink = (this.blink + dt) % 0.9;
    if (standing && this.blink < 0.45) this.hazard.color.setRGB(2.4, 1.2, 0.1);
    else this.hazard.color.setRGB(0.2, 0.1, 0);
    this.doorsOpen = THREE.MathUtils.clamp(this.doorsOpen + ((standing && this.job !== 'done') || (standing && this.driver.isWalking) ? dt : -dt) / 0.9, 0, 1);
    for (const door of this.rearDoors) door.rotation.y = (door.userData.side as number) * 1.9 * this.doorsOpen;
    if (standing) this.work(dt);
  }

  /** The driver's round: out of the back doors with a crate, along the van's side, across the pavement into the shop, back for the next one, then off. */
  private work(dt: number): void {
    this.jobClock += dt;
    const { length, width } = CAR_SIZES.van;
    const hx = Math.cos(this.yaw);
    const hz = -Math.sin(this.yaw);
    const at = (along: number, side: number): THREE.Vector3 => new THREE.Vector3(this.position.x + hx * along - hz * side, 0, this.position.z + hz * along + hx * side);
    const [dx, dz] = this.van.door;
    // Round the van's front (a parked car stands behind it), then straight over the pavement.
    const rear = at(-length / 2 - 0.6, 0.3);
    const way = [at(-length / 2 - 0.6, width / 2 + 0.4), at(length / 2 + 0.6, width / 2 + 0.4), new THREE.Vector3(this.position.x + hx * (length / 2 + 0.6), 0, dz - 1.4)];
    const door = new THREE.Vector3(dx, 0, dz);
    switch (this.job) {
      case 'none':
        if (this.jobClock < 1.5 || this.doorsOpen < 1) return;
        this.driver.setPresent(true, rear);
        this.crate.visible = true;
        this.driver.walk([...way, door], () => {
          this.job = 'inside';
          this.jobClock = 0;
          this.driver.setPresent(false);
        });
        this.driver.setPose('crossed');
        this.job = 'toDoor';
        return;
      case 'inside':
        if (this.jobClock < 3) return;
        this.trips++;
        this.driver.setPresent(true, door);
        this.crate.visible = false;
        this.driver.walk([...way].reverse().concat(rear), () => {
          this.jobClock = 0;
          if (this.trips >= this.cargo.trips) {
            this.job = 'done';
            this.driver.setPresent(false);
          } else this.job = 'none';
        });
        this.job = 'toVan';
        return;
      default:
        return;
    }
  }
}

export interface BinLorryOptions extends Common {
  /** The litter bins it empties (it pauses level with each). */
  bins: readonly Vec2[];
  /** The game hours of its morning round, and any later ones (the recycling). */
  hours: readonly [number, number];
  later?: readonly (readonly [number, number])[];
}

/** Seconds it stands level with a bin. */
const PER_BIN = 4;

/**
 * The bin lorry: once each early morning (`hours`) it crawls along the traffic's first route,
 * its orange beacon turning, pausing a few seconds level with each litter bin along Front Street
 * (the queue behind it waits), then goes on round the corner into the side street.
 */
export class BinLorry extends ScriptedVehicle {
  private readonly beacon: THREE.MeshBasicMaterial;
  private readonly lamps: LampMaterial;
  private readonly windows: readonly (readonly [number, number])[];
  private lastWindow = -1;
  private spin = 0;

  constructor(private readonly dayNight: DayNight, lorry: BinLorryOptions) {
    const bins = [...lorry.bins].sort((a, b) => a[0] - b[0]);
    // A stop on the lane level with each bin (in the order the lorry meets them, west to east).
    const lane = lorry.route.find(([x]) => x === 0)?.[1] ?? 1.6;
    super({ traffic: lorry.traffic, viewer: lorry.viewer, route: lorry.route, cruise: CRUISE.lorry, size: LORRY, kind: 'lorry', stops: bins.map(([x]) => ({ at: [x, lane] as Vec2, dwell: PER_BIN })), stopFor: lorry.stopFor, collisions: lorry.collisions, accel: 1 });
    this.name = 'BinLorry';
    this.windows = [lorry.hours, ...(lorry.later ?? [])];
    const g = lorryGeometries();
    this.lamps = new LampMaterial();
    const wheels = new WheelMaterial(false);
    this.lampFace = this.lamps;
    this.wheelFace = { material: wheels, radius: VEHICLES.lorry.wheelRadius };
    this.beacon = new THREE.MeshBasicMaterial({ color: 0x331800 });
    this.add(
      shade(new THREE.Mesh(g.body, snowCovered(new THREE.MeshStandardMaterial({ color: 0x3f7a4f, roughness: 0.45 })))),
      shade(new THREE.Mesh(g.glass, vehicleGlass())),
      shade(new THREE.Mesh(g.wheels, wheels)),
      new THREE.Mesh(g.lamps, this.lamps),
      new THREE.Mesh(g.beacon, this.beacon),
    );
    // A white band down the compactor body.
    const band = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.35, LORRY.width - 0.02), paint(0xe8e6de, 0.6));
    band.position.set(-0.9, 1.6, 0);
    this.add(band);
  }

  protected schedule(): void {
    const window = windowAt(this.dayNight.state.hours, this.windows);
    if (window >= 0 && window !== this.lastWindow && !this.active) this.depart();
    this.lastWindow = window;
  }

  protected animate(dt: number): void {
    const night = THREE.MathUtils.smoothstep(nightnessOf(this.dayNight.state), 0.2, 0.6);
    this.lamps.setNight(night);
    // The beacon turns: a flash twice a second.
    this.spin = (this.spin + dt * 2) % 1;
    const flash = Math.max(0, Math.sin(this.spin * Math.PI * 2)) ** 3;
    this.beacon.color.setRGB(0.3 + 2.6 * flash, 0.12 + 1.2 * flash, 0.02);
  }
}
