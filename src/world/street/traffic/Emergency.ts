import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { DayNight } from '../../props/DayNight';
import type { VehicleSize } from '../carModel';
import { nightnessOf } from '../streetAir';
import { snowPaint } from '../snowCover';
import type { VehicleKind } from '../StreetCars';
import type { Vec2 } from '../streetPlan';
import { ScriptedVehicle, type CollisionSet } from './ScriptedVehicle';
import type { SirenVehicle, StreetTraffic } from './StreetTraffic';
import type { SirenVoice } from '../audio/StreetCues';
import { closures } from '../details/roadworks';
import { random } from '@/random';
import { Walker } from '../../people/Walker';
import { randomLook, type PersonLook } from '../../people/looks';
import { placeOnRoute } from './driving';

/** Which service a siren belongs to (the street's sound may tell them apart). */
export type SirenKind = 'ambulance' | 'police' | 'fire';

export interface EmergencyOptions {
  traffic: StreetTraffic;
  viewer: THREE.Object3D;
  /** The ways it may come (the traffic's routes), one drawn per call. */
  routes: readonly (readonly Vec2[])[];
  stopFor: number;
  collisions?: CollisionSet;
  /** Real seconds between two calls (drawn between these), and before the first. */
  every: readonly [number, number];
  first: readonly [number, number];
  /** Cruising speed (m/s): quicker than the cars. */
  cruise: number;
  /**
   * Where a call may be (`STREET_PLAN.emergencyCalls`): on route `route`, it pulls up in the lane at `at` (siren off,
   * beacons on) and its crew go in at `door` a while; and how often a call is on this street rather than passing through.
   */
  calls?: readonly EmergencyCall[];
  callChance?: number;
  /** The walkable street's cars (the police flag a driver down: `PoliceCar`); none: never. */
  cars?: TrafficStops;
}

/** A call on the street: the route it comes by, where it pulls up, the door the crew go in by. */
export interface EmergencyCall {
  route: number;
  at: Vec2;
  door: Vec2;
}

/** What the police ask of the street's cars to pull one over (`StreetCars`). */
export interface TrafficStops {
  flagDown(route: number, from: number): RoadVehicleLike | null;
  flaggedAt(car: RoadVehicleLike): number | null;
  release(car: RoadVehicleLike): void;
}

/** A car pulled over, as the police see it. */
interface RoadVehicleLike {
  readonly position: THREE.Vector3;
  readonly yaw: number;
  readonly width: number;
}

/** On a call: how long the crew stay in (s, drawn between), how far they stand from the vehicle's side, their pace. */
const SCENE = { inside: [22, 45] as [number, number], side: 0.6, pace: 1.35 };
/** Where a scene is: on the way, standing (crew out), crew back and gone again (beacons off, no siren). */
type ScenePhase = 'none' | 'toScene' | 'onScene' | 'leaving';

/** The blue lamps' flash: four a second, the two sides alternating. */
const FLASH_HZ = 4;
/** How far to the left of its line it keeps, past the drivers pulled over to the right for it. */
const OVERTAKING = -0.8;
/** Another service already out on a call: try again this many seconds later. */
const RETRY = 25;
/** Within this many metres (along the street) of a roadworks' line it keeps to its own line. */
const WORKS_CLEAR = 14;

const worksLocal = new THREE.Vector3();
const worksInverse = new THREE.Matrix4();

/** Whether zone-local `p` is within `WORKS_CLEAR` of a closure's line, between its kerbs. */
function nearWorks(p: THREE.Vector3): boolean {
  for (const closure of closures()) {
    worksLocal.copy(p).applyMatrix4(worksInverse.copy(closure.frame).invert());
    const [a, b] = closure.parking;
    if (Math.abs(worksLocal.x) < WORKS_CLEAR && worksLocal.z >= Math.min(a![0], b![0]) && worksLocal.z <= Math.max(a![1], b![1])) return true;
  }
  return false;
}

/**
 * An emergency vehicle on a call, now and then (the ambulance, the police, the fire engine): it
 * comes along one of the traffic's routes (`ScriptedVehicle`) with its blue lamps flashing and its
 * siren on (`sirenOn`, heard by `StreetCues`; `siren` says whose), a little quicker than the
 * traffic. The drivers ahead pull over and crawl as it comes up behind (`traffic.sirens`, read by
 * `driving.allowedSpeed`), and it slips past them a little left of its line; it takes a red light
 * at a crawl, and still stops for anyone on the road. One service out at a time.
 */
export abstract class EmergencyVehicle extends ScriptedVehicle implements SirenVoice, SirenVehicle {
  abstract readonly siren: SirenKind;
  /** Its crew, who get out at a call (place each in the zone at the origin). */
  readonly crew: readonly Walker[];
  private readonly blues: [THREE.MeshBasicMaterial, THREE.MeshBasicMaterial];
  private clock: number;
  private flash = 0;
  /** Which of the traffic's routes it drives this time. */
  protected which = 0;
  protected scene: ScenePhase = 'none';
  /** The call it is on (or none: passing through). */
  protected call: EmergencyCall | null = null;
  /** Crew out of the vehicle and not yet back. */
  protected crewOut = 0;

  constructor(
    protected readonly dayNight: DayNight,
    protected readonly service: EmergencyOptions,
    size: VehicleSize,
    kind: VehicleKind,
    accel: number,
    crew: readonly PersonLook[] = [],
  ) {
    const [route, ...alternatives] = service.routes;
    super({ traffic: service.traffic, viewer: service.viewer, route: route!, alternatives, cruise: service.cruise, size, kind, stopFor: service.stopFor, collisions: service.collisions, accel });
    const [a, b] = service.first;
    this.clock = a + random() * (b - a);
    this.blues = [new THREE.MeshBasicMaterial({ color: 0x0a1030 }), new THREE.MeshBasicMaterial({ color: 0x0a1030 })];
    service.traffic.sirens.add(this);
    this.crew = crew.map((look, i) => {
      const walker = new Walker({ viewer: service.viewer, seed: 9300 + i * 17, look, speed: SCENE.pace, lines: this.crewLines(), label: this.crewLabel(), labelWithin: 5, fade: true });
      walker.setPresent(false);
      return walker;
    });
  }

  /** What the crew say, clicked. */
  protected crewLines(): readonly string[] {
    return ['Stand back, please.', 'Nothing to see here.'];
  }

  /** Who the crew are, on the caption. */
  protected crewLabel(): string {
    return 'Crew';
  }

  /** Siren on while it races along (to a call or through); off on the scene and once it is done. */
  get sirenOn(): boolean {
    return this.active && (this.scene === 'none' || this.scene === 'toScene');
  }

  /** Beacons flashing: on the way, and standing at the call. */
  private get beacons(): boolean {
    return this.active && this.scene !== 'leaving';
  }

  override get emergency(): boolean {
    return this.sirenOn;
  }

  protected override get overtaking(): number {
    // Not through the works' gap: the roadworker (or his night board) stands on the centre line there.
    return nearWorks(this.position) ? 0 : OVERTAKING;
  }

  override dispose(): void {
    super.dispose();
    this.service.traffic.sirens.delete(this);
  }

  /** The light bar: a dark bar `width` across at (x, y), a blue lamp at each end. */
  protected lightBar(x: number, y: number, width: number): void {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, width), snowPaint(0x202226, 0.5));
    bar.position.set(x, y, 0);
    this.add(bar);
    for (const [i, side] of [-1, 1].entries()) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, Math.min(0.42, width / 2 - 0.05)), this.blues[i]!);
      lamp.position.set(x, y + 0.08, side * (width / 2 - 0.25));
      this.add(lamp);
    }
  }

  protected schedule(dt: number): void {
    if (this.active) return;
    this.clock -= dt;
    if (this.clock > 0) return;
    if (this.service.traffic.sirenOut) {
      this.clock = RETRY;
      return;
    }
    const [a, b] = this.service.every;
    this.clock = a + random() * (b - a);
    const calls = this.service.calls ?? [];
    const call = calls.length && random() < (this.service.callChance ?? 0) ? calls[Math.floor(random() * calls.length)]! : null;
    this.which = call ? Math.min(call.route, this.routeCount - 1) : Math.floor(random() * this.routeCount);
    this.call = call;
    this.scene = call ? 'toScene' : 'none';
    this.signalOverride = null;
    this.depart(0, this.which);
    if (call) this.setStops([{ at: call.at, dwell: 0 }]);
  }

  protected override arrived(): void {
    if (!this.call) return;
    this.scene = 'onScene';
    this.signalOverride = 'hazards';
    this.sendCrew(this.call.door);
  }

  protected override keepWaiting(): boolean {
    return this.scene === 'onScene';
  }

  protected override leaving(): void {
    this.scene = 'leaving';
    this.signalOverride = null;
  }

  protected override finished(): void {
    this.scene = 'none';
    this.call = null;
    for (const w of this.crew) w.setPresent(false);
  }

  /** The crew out of the kerb-side doors to `door`, in a while, then back; the scene ends when the last is back in. */
  protected sendCrew(door: Vec2): void {
    if (!this.crew.length) {
      this.scene = 'leaving';
      return;
    }
    const side = this.kerbSide();
    const target = new THREE.Vector3(door[0], 0, door[1]);
    this.crewOut = this.crew.length;
    this.crew.forEach((walker, i) => {
      const start = side.clone().addScaledVector(this.alongDir(), (i - 0.5) * 1.1);
      walker.setPresent(true, start);
      walker.walk([target], () => {
        walker.setPresent(false);
        const [a, b] = SCENE.inside;
        this.wait(a + random() * (b - a), () => {
          walker.setPresent(true, target);
          walker.walk([start], () => {
            walker.setPresent(false);
            if (--this.crewOut <= 0) this.scene = 'leaving';
          });
        });
      });
    });
  }

  /** The point by its kerb-side doors (to its right), zone-local, on the ground. */
  protected kerbSide(): THREE.Vector3 {
    const right = this.width / 2 + SCENE.side;
    return new THREE.Vector3(this.position.x + Math.sin(this.yaw) * right, 0, this.position.z + Math.cos(this.yaw) * right);
  }

  /** Its heading, as a unit vector on the ground. */
  protected alongDir(): THREE.Vector3 {
    return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  /** Where `distance` along the route it drives this time is (zone-local). */
  protected pointAt(distance: number): Vec2 {
    const p = new THREE.Vector3();
    placeOnRoute(this.route, distance, p);
    return [p.x, p.z];
  }

  private readonly timers: { left: number; then: () => void }[] = [];

  /** Runs `then` after `seconds` of the street's time (paused while it is dormant). */
  protected wait(seconds: number, then: () => void): void {
    this.timers.push({ left: seconds, then });
  }

  protected override animate(dt: number): void {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i]!;
      t.left -= dt;
      if (t.left <= 0) {
        this.timers.splice(i, 1);
        t.then();
      }
    }
    const night = THREE.MathUtils.smoothstep(nightnessOf(this.dayNight.state), 0.2, 0.6);
    this.lampFace?.setNight(Math.max(night, 0.55 * this.service.traffic.murk));
    this.flash = (this.flash + dt * FLASH_HZ) % 1;
    const left = this.flash < 0.5 && this.beacons;
    const right = this.flash >= 0.5 && this.beacons;
    this.blues[0].color.setRGB(left ? 0.3 : 0.02, left ? 0.6 : 0.04, left ? 3 : 0.2);
    this.blues[1].color.setRGB(right ? 0.3 : 0.02, right ? 0.6 : 0.04, right ? 3 : 0.2);
  }
}

/** A crew member in a service's uniform (jacket, trousers, a cap or none), the face from `seed`. */
export function uniform(seed: number, jacket: number, accent: number, trousers: number, cap?: number): PersonLook {
  const look: PersonLook = { ...randomLook(seed, 'vendor'), top: 'jacket', topColor: jacket, topAccent: accent, longSleeves: true, trousers, shorts: false };
  delete look.apron;
  delete look.skirt;
  delete look.bag;
  if (cap !== undefined) {
    look.hat = 'cap';
    look.hatColor = cap;
  } else delete look.hat;
  return look;
}

export function shade(mesh: THREE.Mesh): THREE.Mesh {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A chequered band down both sides (two colours alternating in two rows), one mesh per colour. */
export function chequers(host: THREE.Object3D, size: VehicleSize, colours: readonly [THREE.Material, THREE.Material], y: number, square = 0.16, margin = 0.4): void {
  const { length, width } = size;
  const count = Math.round((length - 2 * margin) / (square * 2.2));
  const along = (length - 2 * margin) / count;
  const tiles: [THREE.BufferGeometry[], THREE.BufferGeometry[]] = [[], []];
  for (const side of [-1, 1]) {
    for (let i = 0; i < count; i++) {
      for (let row = 0; row < 2; row++) {
        tiles[(i + row) % 2]!.push(new THREE.BoxGeometry(along, square, 0.01).translate(-length / 2 + margin + along * (i + 0.5), y + row * square, side * (width / 2 + 0.056)));
      }
    }
  }
  tiles.forEach((list, k) => {
    host.add(new THREE.Mesh(mergeGeometries(list)!, colours[k]!));
    for (const t of list) t.dispose();
  });
}
