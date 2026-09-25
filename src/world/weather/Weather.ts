import * as THREE from 'three';
import { seededRandom } from '@/covers/generated/canvasUtils';
import type { SeasonName } from '@/world/props/outdoors/season';

/** The kinds of weather a spell can bring. */
export type WeatherKind = 'clear' | 'fair' | 'cloudy' | 'overcast' | 'fog' | 'showers' | 'rain' | 'storm' | 'snow';
export const WEATHER_KINDS: readonly WeatherKind[] = ['clear', 'fair', 'cloudy', 'overcast', 'fog', 'showers', 'rain', 'storm', 'snow'];

/** Everything the sky, the view and the room need to know about the weather right now, 0..1 each. */
export interface WeatherState {
  kind: WeatherKind;
  /** How much of the sky is under cloud: dims the sun and greys the sky. */
  cloudCover: number;
  /** How hard it is raining / snowing right now. */
  rain: number;
  snow: number;
  /** How wet the ground still is (it dries slowly after the rain) and how much snow lies on it. */
  wetness: number;
  snowCover: number;
  /** How hard the wind blows right now, gusts included: trees and awnings sway, rain slants. */
  wind: number;
  /** How thick the fog or the morning mist is: the view fades into grey with distance. */
  fog: number;
  /** Brightness of a lightning flash right now (0 most of the time, up to 1 for a split second). */
  lightning: number;
  /** Counts the strikes so far: a listener notices a new one when it changes (the thunder). */
  strikes: number;
  /** How far away the last strike was, in metres (thunder arrives distance / 343 seconds later). */
  strikeDistance: number;
}

/** What each kind of spell brings: cloud cover, precipitation, wind and fog it settles on. */
const TARGETS: Record<WeatherKind, { cloudCover: number; rain: number; snow: number; wind: number; fog: number }> = {
  clear: { cloudCover: 0.08, rain: 0, snow: 0, wind: 0.15, fog: 0 },
  fair: { cloudCover: 0.3, rain: 0, snow: 0, wind: 0.3, fog: 0 },
  cloudy: { cloudCover: 0.62, rain: 0, snow: 0, wind: 0.45, fog: 0 },
  overcast: { cloudCover: 0.9, rain: 0, snow: 0, wind: 0.3, fog: 0.15 },
  fog: { cloudCover: 0.8, rain: 0, snow: 0, wind: 0.05, fog: 0.85 },
  showers: { cloudCover: 0.75, rain: 0.55, snow: 0, wind: 0.55, fog: 0 },
  rain: { cloudCover: 0.97, rain: 0.9, snow: 0, wind: 0.5, fog: 0.1 },
  storm: { cloudCover: 1, rain: 1, snow: 0, wind: 0.95, fog: 0 },
  snow: { cloudCover: 0.95, rain: 0, snow: 0.8, wind: 0.35, fog: 0.2 },
};

/** How likely each kind is to come next, per season (snow only falls in winter, storms mostly in summer, fog in autumn and winter). */
const ODDS: Record<SeasonName, Partial<Record<WeatherKind, number>>> = {
  spring: { clear: 3, fair: 4, cloudy: 3, overcast: 1, fog: 0.3, showers: 3, rain: 1, storm: 0.5 },
  summer: { clear: 6, fair: 4, cloudy: 2, overcast: 0.5, showers: 1.5, rain: 0.5, storm: 1.2 },
  autumn: { clear: 2, fair: 3, cloudy: 3, overcast: 2, fog: 1.5, showers: 2, rain: 2, storm: 0.4 },
  winter: { clear: 2, fair: 2, cloudy: 3, overcast: 3, fog: 1.5, showers: 0.5, rain: 1.5, snow: 2.5 },
};

/** How much mist the dawn brings in each season (on a calm, dry morning of a misty day). */
const DAWN_MIST: Record<SeasonName, number> = { spring: 0.35, summer: 0.15, autumn: 0.7, winter: 0.5 };
/** Game hours the dawn mist lies: it gathers from `from`, is thickest at `peak` and has burnt off by `to`. */
const MIST_HOURS = { from: 3.5, peak: 6.5, to: 10 };

/** Game hours a spell lasts, and over how many the sky changes from one to the next. */
const SPELL_HOURS: [number, number] = [2.5, 8];
const CHANGE_HOURS = 1.2;
/** Game hours for the ground to soak once it rains hard, and to dry out again under an open sky. */
const SOAK_HOURS = 0.4;
const DRY_HOURS = 3;
/** Game hours for a hard fall to whiten the ground, and for the snow to melt (winter keeps it longer). */
const SETTLE_HOURS = 1.5;
const MELT_HOURS = { winter: 30, other: 5 };
/** Real seconds between two strikes in a storm at its height, and how long a flash lasts. */
const STRIKE_EVERY: [number, number] = [5, 22];
const FLASH_SECONDS = 0.45;
/** How far the strikes land, metres. */
const STRIKE_RANGE: [number, number] = [400, 5000];

/**
 * The weather over the neighbourhood: a sequence of spells (clear, fair, cloudy, overcast, fog,
 * showers, rain, storms, snow in winter), each lasting a few game hours, drawn from the season's
 * odds and seeded by the date so a given day brings the same weather to everyone. The sky eases
 * from one spell to the next; the ground soaks up the rain and dries after it, and snow settles and
 * melts; the wind rises and falls with the spell, gusting; on misty days (seeded too) a mist lies
 * at dawn and burns off in the morning. `advance()` is fed game hours by `Sky`, `tick()` real
 * seconds (gusts and lightning live on the player's clock, not the game's: a flash lasts a split
 * second). `DayNight` reads the state to dim the sun and grey the sky, the view outside and the
 * street's sound read it too. `pin()` holds one kind (the `?weather=` URL parameter).
 */
export class Weather {
  readonly state: WeatherState = {
    kind: 'fair',
    cloudCover: 0.3,
    rain: 0,
    snow: 0,
    wetness: 0,
    snowCover: 0,
    wind: 0.3,
    fog: 0,
    lightning: 0,
    strikes: 0,
    strikeDistance: 1000,
  };

  private readonly random: () => number;
  /** Real-time randomness (gusts, strikes): not the seeded sequence, which must stay the same for everyone. */
  private readonly jitter = Math.random;
  private hoursLeft: number;
  private pinned: WeatherKind | null = null;
  /** The spell's own wind and fog, eased; `state.wind` adds the gusts and `state.fog` the dawn mist. */
  private steadyWind = 0.3;
  private spellFog = 0;
  /** Whether today is a misty day (seeded by the date), 0..1. */
  private readonly mistiness: number;
  private gustClock = 0;
  private gust = 0;
  private gustTarget = 0;
  private strikeClock = 8;
  private flashAge = Infinity;

  constructor(
    private readonly season: SeasonName,
    date = new Date(),
  ) {
    this.random = seededRandom(date.getFullYear() * 400 + date.getMonth() * 32 + date.getDate());
    for (let i = 0; i < 4; i++) this.random();
    this.mistiness = THREE.MathUtils.smoothstep(this.random(), 0.35, 0.8);
    this.state.kind = this.draw();
    this.hoursLeft = THREE.MathUtils.lerp(SPELL_HOURS[0], SPELL_HOURS[1], this.random());
    this.settle();
  }

  /** Holds `kind` until released with null; the sky still eases into it. */
  pin(kind: WeatherKind | null): void {
    this.pinned = kind;
    if (kind) this.state.kind = kind;
  }

  /** Jumps straight to the settled state of the current spell (at start, or after pinning), ground included. */
  settle(): void {
    const target = TARGETS[this.state.kind];
    this.state.cloudCover = target.cloudCover;
    this.state.rain = target.rain;
    this.state.snow = target.snow;
    this.state.wind = this.steadyWind = target.wind;
    this.state.fog = this.spellFog = target.fog;
    this.state.wetness = target.rain > 0 ? 1 : 0;
    this.state.snowCover = target.snow > 0 ? 1 : 0;
  }

  /** Moves the weather on by `hours` game hours; `clockHours` is the time of day (for the dawn mist). */
  advance(hours: number, clockHours = 12): void {
    if (hours <= 0) return;
    this.hoursLeft -= hours;
    if (this.hoursLeft <= 0 && !this.pinned) {
      this.state.kind = this.draw();
      this.hoursLeft = THREE.MathUtils.lerp(SPELL_HOURS[0], SPELL_HOURS[1], this.random());
    }
    const s = this.state;
    const target = TARGETS[s.kind];
    const k = 1 - Math.exp(-hours / (CHANGE_HOURS / 3));
    s.cloudCover += (target.cloudCover - s.cloudCover) * k;
    // Rain waits for the cloud to gather, and stops before it clears.
    const gathered = THREE.MathUtils.smoothstep(s.cloudCover, 0.55, 0.85);
    s.rain += (target.rain * gathered - s.rain) * k;
    s.snow += (target.snow * gathered - s.snow) * k;
    this.steadyWind += (target.wind - this.steadyWind) * k;
    this.spellFog += (target.fog - this.spellFog) * k;
    if (s.rain > 0.05) s.wetness = Math.min(1, s.wetness + (hours / SOAK_HOURS) * s.rain);
    else s.wetness = Math.max(0, s.wetness - (hours / DRY_HOURS) * (1.2 - s.cloudCover));
    if (s.snow > 0.05) s.snowCover = Math.min(1, s.snowCover + (hours / SETTLE_HOURS) * s.snow);
    else s.snowCover = Math.max(0, s.snowCover - (hours / (this.season === 'winter' ? MELT_HOURS.winter : MELT_HOURS.other)) * (1 + s.rain * 3));
    s.fog = Math.max(this.spellFog, this.dawnMist(clockHours));
  }

  /**
   * Moves the gusts and the lightning on by `dt` real seconds. A storm at its height strikes every
   * few seconds somewhere around the city: the flash flickers twice and dies within half a second.
   */
  tick(dt: number): void {
    const s = this.state;
    // Gusts: a new target every few seconds, stronger and more frequent in a strong wind.
    this.gustClock -= dt;
    if (this.gustClock <= 0) {
      this.gustClock = THREE.MathUtils.lerp(2, 7, this.jitter()) * (1.2 - 0.6 * this.steadyWind);
      this.gustTarget = this.jitter() * this.jitter() * (0.15 + 0.5 * this.steadyWind);
    }
    this.gust += (this.gustTarget - this.gust) * (1 - Math.exp(-dt * 1.5));
    s.wind = THREE.MathUtils.clamp(this.steadyWind + this.gust, 0, 1);

    const stormy = s.kind === 'storm' ? THREE.MathUtils.smoothstep(s.rain, 0.5, 0.9) : 0;
    this.flashAge += dt;
    if (stormy > 0) {
      this.strikeClock -= dt * stormy;
      if (this.strikeClock <= 0) {
        this.strikeClock = THREE.MathUtils.lerp(STRIKE_EVERY[0], STRIKE_EVERY[1], this.jitter());
        this.flashAge = 0;
        s.strikes++;
        s.strikeDistance = THREE.MathUtils.lerp(STRIKE_RANGE[0], STRIKE_RANGE[1], this.jitter() ** 1.5);
      }
    }
    s.lightning = flash(this.flashAge) * THREE.MathUtils.lerp(1, 0.45, (s.strikeDistance - STRIKE_RANGE[0]) / (STRIKE_RANGE[1] - STRIKE_RANGE[0]));
  }

  /** The mist of a calm, dry dawn on a misty day, 0..1, at time of day `hours`. */
  private dawnMist(hours: number): number {
    const s = this.state;
    const rise = THREE.MathUtils.smoothstep(hours, MIST_HOURS.from, MIST_HOURS.peak);
    const burn = 1 - THREE.MathUtils.smoothstep(hours, MIST_HOURS.peak, MIST_HOURS.to);
    const calm = 1 - THREE.MathUtils.smoothstep(this.steadyWind, 0.2, 0.5);
    const dry = 1 - THREE.MathUtils.smoothstep(Math.max(s.rain, s.snow), 0.1, 0.4);
    return DAWN_MIST[this.season] * this.mistiness * rise * burn * calm * dry;
  }

  private draw(): WeatherKind {
    if (this.pinned) return this.pinned;
    const odds = ODDS[this.season];
    const kinds = WEATHER_KINDS.filter((kind) => (odds[kind] ?? 0) > 0 && kind !== this.state.kind);
    const total = kinds.reduce((sum, kind) => sum + (odds[kind] ?? 0), 0);
    let pick = this.random() * total;
    for (const kind of kinds) {
      pick -= odds[kind] ?? 0;
      if (pick <= 0) return kind;
    }
    return kinds[kinds.length - 1];
  }
}

/** A lightning flash `age` seconds after the strike: a bright stroke, a dimmer return stroke, then nothing. */
function flash(age: number): number {
  if (age >= FLASH_SECONDS) return 0;
  const first = Math.exp(-age / 0.04);
  const second = age > 0.12 ? 0.8 * Math.exp(-(age - 0.12) / 0.07) : 0;
  return Math.min(1, first + second);
}

/** Parses `?weather=rain`; anything that is not a kind is ignored. */
export function parseWeather(value: string | null): WeatherKind | undefined {
  return WEATHER_KINDS.find((kind) => kind === value);
}
