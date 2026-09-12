import type { Updatable } from '@/core/Engine';
import { DayNight } from './props/DayNight';
import { Outdoors, type NearWall } from './props/outdoors/Outdoors';

export interface SkyOptions {
  /** Initial time of day (hours). Default 8, a sunny morning. */
  hours?: number;
  /** Real seconds one full day/night cycle takes; 0 freezes the clock. Default 600 (ten minutes). */
  dayLength?: number;
  /** World yaw of the wall the sun's azimuth is expressed against (see `Outdoors.primaryRotationY`). */
  sunRotationY: number;
  /** A wall of the building itself standing in the view of some windows (see `Outdoors.nearWall`). */
  nearWall?: NearWall;
}

/**
 * The one sky over every zone: the clock (`DayNight`) and the painted view outside (`Outdoors`).
 * Created once by `main.ts` and ticked by the engine, so rooms can load and unload without the
 * day skipping a beat; every window in every zone shows this same world.
 */
export class Sky implements Updatable {
  readonly dayNight: DayNight;
  readonly outdoors: Outdoors;

  constructor(options: SkyOptions) {
    this.dayNight = new DayNight({ hours: options.hours, dayLength: options.dayLength });
    this.outdoors = new Outdoors(this.dayNight, { primaryRotationY: options.sunRotationY, nearWall: options.nearWall });
  }

  update(dt: number): void {
    this.dayNight.update(dt);
    this.outdoors.update(dt);
  }
}
