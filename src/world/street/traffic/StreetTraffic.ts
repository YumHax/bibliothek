import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../../Furniture';
import { FRONT, STREET_PLAN } from '../streetPlan';

/** Where the signalled crossing's cycle is: cars go, amber, all red, walkers go, walkers' flashing man, all red again. */
export type SignalPhase = 'carsGreen' | 'amber' | 'clearForWalkers' | 'walkersGreen' | 'walkersFlash' | 'clearForCars';

/**
 * Something drivers must not run into (zone-local, on the ground): a passer-by on the road, the
 * bus standing at its stop, the delivery van double-parked. `wantsToCross` is the index (in
 * `STREET_PLAN.crossings`) of the crossing a walker is waiting at the kerb of, else null: at a
 * plain zebra drivers give way to them before they even step off.
 */
export interface RoadObstacle {
  readonly position: THREE.Vector3;
  readonly radius: number;
  readonly active: boolean;
  readonly wantsToCross?: number | null;
  /** How far short of it a driver stops (metres); the plan's `stopFor` when absent (a person). */
  readonly gap?: number;
}

/**
 * Something driving on the road (a car, the bus, a bike): drivers behind it, going the same way,
 * queue. Zone-local position on the road, `yaw` of the nose (0 = +x), speed in m/s.
 */
export interface RoadVehicle {
  readonly position: THREE.Vector3;
  readonly yaw: number;
  readonly speed: number;
  readonly active: boolean;
  readonly length: number;
  readonly width: number;
}

type Crossing = (typeof STREET_PLAN.crossings)[number];

const ORDER: readonly SignalPhase[] = ['carsGreen', 'amber', 'clearForWalkers', 'walkersGreen', 'walkersFlash', 'clearForCars'];

/**
 * What the street's road users agree on, in one place: the lights at the signalled crossing
 * (their cycle, from `STREET_PLAN.signals.cycle`), the obstacles on the road drivers stop for,
 * and whether the bus is standing at its stop (the bus-stop queue boards it). The cars, the bus,
 * the bikes, the passers-by and the signal heads all read it; nothing is drawn here.
 */
export class StreetTraffic extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  readonly obstacles = new Set<RoadObstacle>();
  /** Everything driving (cars, the bus, the van, the lorry, bikes), for the queues. */
  readonly vehicles = new Set<RoadVehicle>();
  /** Set by the bus while it stands at the stop with its doors open. */
  busAtStop = false;
  private phaseIndex = 0;
  private phaseTime = 0;

  constructor() {
    super();
    this.name = 'StreetTraffic';
    // Start somewhere in the cycle, so two visits do not look alike.
    this.phaseTime = Math.random() * STREET_PLAN.signals.cycle.carsGreen;
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  get phase(): SignalPhase {
    return ORDER[this.phaseIndex]!;
  }

  /** Seconds left in the current phase. */
  get phaseLeft(): number {
    return this.durationOf(this.phase) - this.phaseTime;
  }

  /** Cars may drive through the signalled crossing (green; on amber only if they cannot stop, the driver's call). */
  get carsGreen(): boolean {
    return this.phase === 'carsGreen';
  }

  get amber(): boolean {
    return this.phase === 'amber';
  }

  /** Walkers may step off the kerb (the green man); while it flashes, those on the road finish crossing. */
  get walkersGreen(): boolean {
    return this.phase === 'walkersGreen';
  }

  get walkersFlashing(): boolean {
    return this.phase === 'walkersFlash';
  }

  update(dt: number): void {
    this.phaseTime += dt;
    while (this.phaseTime >= this.durationOf(this.phase)) {
      this.phaseTime -= this.durationOf(this.phase);
      this.phaseIndex = (this.phaseIndex + 1) % ORDER.length;
    }
  }

  /**
   * Whether a driver heading along x (`direction` +1 east, -1 west) must hold before `crossing`:
   * red or amber at the lights; at a plain zebra, anyone on it or waiting at its kerbs.
   */
  mustHoldAt(crossing: Crossing, index: number): boolean {
    if (crossing.signals) return !this.carsGreen;
    for (const o of this.obstacles) {
      if (!o.active) continue;
      if (o.wantsToCross === index) return true;
      const p = o.position;
      if (p.x > crossing.from - 0.8 && p.x < crossing.to + 0.8 && p.z > FRONT.nearKerb - 0.6 && p.z < FRONT.farKerb + 0.6) return true;
    }
    return false;
  }

  /** The x a driver heading `direction` (+1 east, -1 west) stops at before `crossing` (the stop line). */
  stopLineX(crossing: Crossing, direction: 1 | -1): number {
    return direction > 0 ? crossing.from - STREET_PLAN.stopLine : crossing.to + STREET_PLAN.stopLine;
  }

  private durationOf(phase: SignalPhase): number {
    const c = STREET_PLAN.signals.cycle;
    switch (phase) {
      case 'carsGreen':
        return c.carsGreen;
      case 'amber':
        return c.amber;
      case 'walkersGreen':
        return c.walkersGreen;
      case 'walkersFlash':
        return c.walkersFlash;
      default:
        return c.clear;
    }
  }
}
