import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';
import type { LiftRides } from './Lift';
import { STOREYS } from './stairwellPlan';

interface RemovalLiftOptions {
  lift: LiftRides;
  /** Whether the removal men are at work now (Mrs Roux's moving day, in their hours: `building/rouxMove`). */
  atWork: () => boolean;
}

/** Seconds between two of the removal men's trips. */
const EVERY_S = 55;
/** The removal men's hours (game hours), lunch aside. */
const HOURS: readonly [number, number][] = [
  [8.5, 12],
  [13.5, 17.5],
];

/** Whether the removal men are working at game hour `h`. */
export function removalHours(h: number): boolean {
  return HOURS.some(([from, to]) => h >= from && h < to);
}

/**
 * Mrs Roux's removal men use the lift on her moving day: every so often it is called up to our landing and goes down
 * loaded to the hall, then back up empty (a ride with nobody seen: they are carrying cartons out of sight). The lift is
 * busy then and free in between (`Lift.carry` never takes it from the player). No mesh: an updatable placed in the zone.
 */
export class RemovalLift extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  readonly footprint = new THREE.Box3();
  private clock = EVERY_S / 3;
  private down = true;

  constructor(private readonly options: RemovalLiftOptions) {
    super();
    this.name = 'RemovalLift';
  }

  update(dt: number): void {
    this.clock -= dt;
    if (this.clock > 0) return;
    this.clock = EVERY_S;
    if (!this.options.atWork()) return;
    // Loaded down from our landing to the street door, then back up for the next load.
    const [from, to] = this.down ? [0, STOREYS] : [STOREYS, 0];
    if (this.options.lift.carry(from, to, {})) this.down = !this.down;
    // Busy (the player in it, a resident riding): they wait for the next go.
    else this.clock = EVERY_S / 4;
  }
}
