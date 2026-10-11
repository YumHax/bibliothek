import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import { STREET_PLAN } from '../streetPlan';
import { FRONT } from '@/world/measures/street';
import { random } from '@/random';
import { inHours } from '@/time/clock';
import type { HeldBy } from './driving';
import type { VehicleKind } from './Car';

/** Where the signalled crossing's cycle is: cars go, amber, all red, walkers go, walkers' flashing man, all red again. */
type SignalPhase = 'carsGreen' | 'amber' | 'clearForWalkers' | 'walkersGreen' | 'walkersFlash' | 'clearForCars';

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
  /** A vehicle standing in the lane (a van delivering, the lorry at the bins, a police stop): drivers may go round it. */
  readonly passable?: boolean;
  /** How long the thing standing there is, this obstacle at its back (metres; a passable one: drivers are past it once beyond). */
  readonly span?: number;
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
  /** What it is (a cyclist is given room, a slow rider passed). */
  readonly kind?: VehicleKind;
  /** What holds it up this frame (`driving.allowedSpeed`), for the horns behind: none, it stands for nothing. */
  readonly holdUp?: HeldBy;
}

/** An emergency vehicle: the others pull over while its siren is on (`driving.allowedSpeed`). */
export interface SirenVehicle extends RoadVehicle {
  readonly sirenOn: boolean;
}

/** How much grip the road has, wet and under snow (1 dry): braking takes that much longer. */
const GRIP = { wet: 0.3, snow: 0.5, least: 0.4 };
/** How much slower drivers go: on snow, on a wet road, in fog (cruising and cornering alike), never under `least`. */
const PACE = { snow: 0.4, wet: 0.12, fog: 0.3, least: 0.55 };
/**
 * The lights' push buttons and their night: someone waiting (a press, or a walker at the kerb) cuts the cars' green to
 * `minGreen` seconds; by night (`restHours`) the lights rest on the cars' green until asked, but never past `restMost`.
 */
const DEMAND = { minGreen: 7, restHours: [22.5, 6] as [number, number], restMost: 50 };

type Crossing = (typeof STREET_PLAN.crossings)[number];

/** The crossing with lights: its index in `STREET_PLAN.crossings`. */
const SIGNALLED = STREET_PLAN.crossings.findIndex((c) => c.signals);

const ORDER: readonly SignalPhase[] = ['carsGreen', 'amber', 'clearForWalkers', 'walkersGreen', 'walkersFlash', 'clearForCars'];

/**
 * What the street's road users agree on, in one place: the lights at the signalled crossing
 * (their cycle, from `STREET_PLAN.signals.cycle`, cut short by a push on the button, resting on
 * the cars' green by night), the obstacles on the road drivers stop for, whether the bus is
 * standing at its stop (the bus-stop queue boards it), and what the weather asks of drivers (grip,
 * pace, lamps on by day). The cars, the bus, the bikes, the passers-by and the signal heads all
 * read it; nothing is drawn here.
 */
export class StreetTraffic extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  readonly obstacles = new Set<RoadObstacle>();
  /** Everything driving (cars, the bus, the van, the lorry, bikes), for the queues. */
  readonly vehicles = new Set<RoadVehicle>();
  /** The emergency vehicles (whether or not they are out): drivers make way for one with its siren on. */
  readonly sirens = new Set<SirenVehicle>();
  /** Set by the bus while it stands at the stop with its doors open. */
  busAtStop = false;
  /** How well tyres grip the road now (1 dry; less wet, least on snow): drivers brake gentler, stop longer. */
  grip = 1;
  /** How fast drivers dare go now (1 dry and clear; less on snow, in the wet, in fog). */
  pace = 1;
  /** How much the weather has drivers put their lamps on by day (0 none .. 1 dipped beams: fog, a downpour). */
  murk = 0;
  /** Someone asked to cross (the button pressed, or a walker waiting): the cars' green is cut short. */
  private demanded = false;
  private phaseIndex = 0;
  private phaseTime = 0;

  /** `dayNight`: the weather the road's grip follows (none: always dry). */
  constructor(private readonly dayNight?: DayNight) {
    super();
    this.name = 'StreetTraffic';
    // Start somewhere in the cycle, so two visits do not look alike.
    this.phaseTime = random() * STREET_PLAN.signals.cycle.carsGreen;
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

  /** Whether someone has asked to cross and is waiting for the green man (the boxes' WAIT lamps). */
  get waiting(): boolean {
    return this.demanded;
  }

  /** Whether an emergency vehicle is out with its siren on (one call at a time). */
  get sirenOut(): boolean {
    for (const s of this.sirens) if (s.active && s.sirenOn) return true;
    return false;
  }

  /** The push button pressed: the cars' green is cut short (never under its least), and the WAIT lamps light. */
  demand(): void {
    if (this.phase === 'carsGreen' || this.phase === 'amber') this.demanded = true;
  }

  update(dt: number): void {
    if (this.dayNight) {
      const s = this.dayNight.state;
      this.grip = Math.max(GRIP.least, 1 - GRIP.wet * s.wetness - GRIP.snow * s.snowCover);
      this.pace = Math.max(PACE.least, 1 - PACE.snow * s.snowCover - PACE.wet * s.wetness - PACE.fog * s.fog);
      this.murk = Math.min(1, Math.max(THREE.MathUtils.smoothstep(s.fog, 0.15, 0.6), THREE.MathUtils.smoothstep(s.rain, 0.35, 0.8) * 0.8, THREE.MathUtils.smoothstep(s.snow, 0.3, 0.7) * 0.8));
    }
    // A walker waiting at the lights' kerb asks as the button does.
    if (!this.demanded && this.phase === 'carsGreen') {
      for (const o of this.obstacles) if (o.active && o.wantsToCross === SIGNALLED) this.demanded = true;
    }
    this.phaseTime += dt;
    while (this.phaseTime >= this.durationOf(this.phase)) {
      this.phaseTime -= this.durationOf(this.phase);
      this.phaseIndex = (this.phaseIndex + 1) % ORDER.length;
      if (this.phase === 'walkersGreen') this.demanded = false;
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
      case 'carsGreen': {
        // Asked to cross: green no longer than its least (or now, if it has run that long already); by night, resting on it.
        if (this.demanded) return Math.max(DEMAND.minGreen, Math.min(c.carsGreen, this.phaseTime));
        const night = this.dayNight ? inHours(this.dayNight.state.hours, DEMAND.restHours) : false;
        return night ? DEMAND.restMost : c.carsGreen;
      }
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
