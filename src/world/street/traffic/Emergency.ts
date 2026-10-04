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
}

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
  private readonly blues: [THREE.MeshBasicMaterial, THREE.MeshBasicMaterial];
  private clock: number;
  private flash = 0;

  constructor(
    protected readonly dayNight: DayNight,
    private readonly call: EmergencyOptions,
    size: VehicleSize,
    kind: VehicleKind,
    accel: number,
  ) {
    const [route, ...alternatives] = call.routes;
    super({ traffic: call.traffic, viewer: call.viewer, route: route!, alternatives, cruise: call.cruise, size, kind, stopFor: call.stopFor, collisions: call.collisions, accel });
    const [a, b] = call.first;
    this.clock = a + random() * (b - a);
    this.blues = [new THREE.MeshBasicMaterial({ color: 0x0a1030 }), new THREE.MeshBasicMaterial({ color: 0x0a1030 })];
    call.traffic.sirens.add(this);
  }

  get sirenOn(): boolean {
    return this.active;
  }

  override get emergency(): boolean {
    return this.active;
  }

  protected override get overtaking(): number {
    // Not through the works' gap: the roadworker (or his night board) stands on the centre line there.
    return nearWorks(this.position) ? 0 : OVERTAKING;
  }

  override dispose(): void {
    super.dispose();
    this.call.traffic.sirens.delete(this);
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
    if (this.call.traffic.sirenOut) {
      this.clock = RETRY;
      return;
    }
    const [a, b] = this.call.every;
    this.clock = a + random() * (b - a);
    this.depart(0, Math.floor(random() * this.routeCount));
  }

  protected override animate(dt: number): void {
    const night = THREE.MathUtils.smoothstep(nightnessOf(this.dayNight.state), 0.2, 0.6);
    this.lampFace?.setNight(night);
    this.flash = (this.flash + dt * FLASH_HZ) % 1;
    const left = this.flash < 0.5;
    this.blues[0].color.setRGB(left ? 0.3 : 0.02, left ? 0.6 : 0.04, left ? 3 : 0.2);
    this.blues[1].color.setRGB(left ? 0.02 : 0.3, left ? 0.04 : 0.6, left ? 0.2 : 3);
  }
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
