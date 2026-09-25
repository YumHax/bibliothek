import type { Updatable } from '@/core/Engine';
import { DayNight } from './props/DayNight';
import { localPlace } from './props/solar';
import { Outdoors, type NearWall } from './props/outdoors/Outdoors';
import { type Holiday, type Season, seasonOf } from './props/outdoors/season';
import { Weather, type WeatherKind } from './weather/Weather';

export interface SkyOptions {
  /** Initial time of day (hours). Default 8, a sunny morning. */
  hours?: number;
  /** Real seconds one full day/night cycle takes; 0 freezes the clock. Default 600 (ten minutes). */
  dayLength?: number;
  /** World yaw of the wall the sun's azimuth is expressed against (see `Outdoors.primaryRotationY`). */
  sunRotationY: number;
  /** A wall of the building itself standing in the view of some windows (see `Outdoors.nearWall`). */
  nearWall?: NearWall;
  /** The time of year the view is painted in; default the real calendar's (`?season=`). */
  season?: Season;
  /** The holiday the view is dressed for (`?holiday=`); default the real calendar's, null for none. */
  holiday?: Holiday | null;
  /** Holds the weather to one kind (`?weather=`); default it changes on its own. */
  weather?: WeatherKind;
  /** Latitude the sunrise and sunset are computed for (`?lat=`); default the time zone's city (see `localPlace`). */
  latitude?: number;
}

/**
 * The one sky over every zone: the clock (`DayNight`), the weather (`Weather`) and the painted view
 * outside (`Outdoors`). Created once by `main.ts` and ticked by the engine, so rooms can load and
 * unload without the day skipping a beat; every window in every zone shows this same world.
 */
export class Sky implements Updatable {
  readonly dayNight: DayNight;
  readonly weather: Weather;
  readonly outdoors: Outdoors;

  constructor(options: SkyOptions) {
    const season = options.season ?? seasonOf(new Date());
    this.dayNight = new DayNight({ hours: options.hours, dayLength: options.dayLength, place: localPlace(options.latitude) });
    this.weather = new Weather(season.name);
    if (options.weather) {
      this.weather.pin(options.weather);
      this.weather.settle();
    }
    this.dayNight.setWeather(this.weather.state);
    this.outdoors = new Outdoors(this.dayNight, { primaryRotationY: options.sunRotationY, nearWall: options.nearWall, season, holiday: options.holiday });
  }

  update(dt: number): void {
    // The weather keeps game time, like the clock: a spell lasts hours of the day, not seconds.
    const { dayLength } = this.dayNight;
    if (dayLength) this.weather.advance((dt * 24) / dayLength, this.dayNight.state.hours);
    this.weather.tick(dt);
    this.dayNight.update(dt);
    this.outdoors.update(dt);
  }
}
