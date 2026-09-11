import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';

/** Everything the sky and the room lighting need to know about the current time of day. */
export interface SkyState {
  /** Time of day, 0 ≤ hours < 24. */
  hours: number;
  /** Sun height above the horizon, -1 (midnight) .. 1 (noon); 0 at sunrise and sunset. */
  sunHeight: number;
  /** 0 at night .. 1 in full day; drives the room's ambient light. */
  daylight: number;
  /** Sky colour at the top of a window and at the horizon. */
  zenith: THREE.Color;
  horizon: THREE.Color;
  /**
   * Hue of the light the sky pours into the room (brightness normalised, the room sets the
   * intensity): warm white under a high sun, orange at sunset, mauve at dusk, cool blue at night.
   */
  ambient: THREE.Color;
  /**
   * Where the sun and the moon are drawn, relative to the *primary* window's outward normal:
   * elevation above the horizon and azimuth (positive = towards the evening side), in radians.
   * The sun keeps going below the horizon after sunset so it visibly sets and rises. Windows on
   * other walls add their own rotation.
   */
  sunElevation: number;
  sunAzimuth: number;
  moonElevation: number;
  moonAzimuth: number;
  /** 0 by day .. 1 at night: how strongly the moon (and the stars) show. */
  moonVisibility: number;
  /** 0..1 strength of the warm glow the low sun spreads along the horizon (sunrise and sunset). */
  horizonGlow: number;
  /**
   * The light coming through the window (sun by day, moon at night), same frame as above. The sun
   * light never drops below a few degrees, so that the last rays still reach the floor.
   */
  lightElevation: number;
  lightAzimuth: number;
  lightColor: THREE.Color;
  lightIntensity: number;
  /** True between sunset and sunrise. */
  night: boolean;
}

export interface DayNightOptions {
  /** Initial time of day in hours. Default 8 (morning). */
  hours?: number;
  /** Real seconds one full 24 h cycle takes; 0 freezes the clock. Default 600 (ten minutes). */
  dayLength?: number;
}

export type SkyListener = (state: SkyState) => void;

/** The default: a whole day in ten minutes. */
export const DEFAULT_DAY_LENGTH_S = 600;
const DEFAULT_HOURS = 8;
/** A long summer day: 14 h of sun, 10 h of night. */
const SUNRISE_HOUR = 6;
const SUNSET_HOUR = 20;
const DAY_HOURS = SUNSET_HOUR - SUNRISE_HOUR;
const NOON_HOUR = (SUNRISE_HOUR + SUNSET_HOUR) / 2;

/** Sky gradient keyed by sun height: night, dusk, sunset, golden hour, day. */
const SKY_STOPS: { at: number; zenith: number; horizon: number }[] = [
  { at: -1, zenith: 0x0a1030, horizon: 0x1c2a50 },
  { at: -0.35, zenith: 0x0f1742, horizon: 0x2a3868 },
  { at: -0.15, zenith: 0x1a2358, horizon: 0x5c4474 },
  { at: -0.05, zenith: 0x27356e, horizon: 0xc46c5a },
  { at: 0, zenith: 0x34507f, horizon: 0xf08a3a },
  { at: 0.08, zenith: 0x4a7ab8, horizon: 0xf7b56a },
  { at: 0.2, zenith: 0x5a95d2, horizon: 0xf1d2a0 },
  { at: 0.45, zenith: 0x3d84d8, horizon: 0xaad4f4 },
  { at: 1, zenith: 0x2f76d0, horizon: 0xbfe0f8 },
];

const SUN_LOW = new THREE.Color(0xff7a2e);
const SUN_HIGH = new THREE.Color(0xfff4e6);
const MOON = new THREE.Color(0x93a8d6);
const DAY_WHITE = new THREE.Color(0xfff6e6);
const NIGHT_BLUE = new THREE.Color(0x8a97b8);
const SUN_MAX_INTENSITY = 5;
const MOON_MAX_INTENSITY = 0.35;
/** Highest elevation the sun reaches as seen through the window (a real noon sun would miss the room). */
const SUN_MAX_ELEVATION = THREE.MathUtils.degToRad(55);
const SUN_MAX_AZIMUTH = THREE.MathUtils.degToRad(50);
/** The sun light never comes in flatter than this; the drawn sun goes on down to `SUN_SET_ELEVATION`. */
const SUN_MIN_LIGHT_ELEVATION = THREE.MathUtils.degToRad(3);
const SUN_SET_ELEVATION = THREE.MathUtils.degToRad(-4);
const DAY_HOUR = 14;
const NIGHT_HOUR = 23;

const scratchA = new THREE.Color();
const scratchB = new THREE.Color();

function sampleStops(sunHeight: number, key: 'zenith' | 'horizon', out: THREE.Color): THREE.Color {
  const h = THREE.MathUtils.clamp(sunHeight, -1, 1);
  for (let i = 1; i < SKY_STOPS.length; i++) {
    const a = SKY_STOPS[i - 1];
    const b = SKY_STOPS[i];
    if (h <= b.at) {
      const t = (h - a.at) / (b.at - a.at);
      return out.lerpColors(scratchA.setHex(a[key]), scratchB.setHex(b[key]), t);
    }
  }
  return out.setHex(SKY_STOPS[SKY_STOPS.length - 1][key]);
}

/** Sun height for a time of day: a half sine over the day, another (negative) over the night. */
function sunHeightAt(hours: number): number {
  const sinceSunrise = ((hours - SUNRISE_HOUR) % 24 + 24) % 24;
  if (sinceSunrise < DAY_HOURS) return Math.sin((Math.PI * sinceSunrise) / DAY_HOURS);
  return -Math.sin((Math.PI * (sinceSunrise - DAY_HOURS)) / (24 - DAY_HOURS));
}

/**
 * The clock of the room: a time of day, the sky colours and sun/moon that go with it.
 * It runs on its own, a whole day in `dayLength` seconds (ten minutes by default), with a slow
 * sunset and sunrise. Ticked by whoever owns it (the primary window); listeners (window panes,
 * room lighting) are told on every change.
 */
export class DayNight implements Updatable {
  /** Real seconds per 24 h cycle; 0 freezes the clock. */
  dayLength: number;
  readonly state: SkyState = {
    hours: 0,
    sunHeight: 0,
    daylight: 0,
    zenith: new THREE.Color(),
    horizon: new THREE.Color(),
    ambient: new THREE.Color(),
    sunElevation: 0,
    sunAzimuth: 0,
    moonElevation: 0,
    moonAzimuth: 0,
    moonVisibility: 0,
    horizonGlow: 0,
    lightElevation: 0,
    lightAzimuth: 0,
    lightColor: new THREE.Color(),
    lightIntensity: 0,
    night: false,
  };

  private hours: number;
  private readonly listeners = new Set<SkyListener>();

  constructor({ hours = DEFAULT_HOURS, dayLength = DEFAULT_DAY_LENGTH_S }: DayNightOptions = {}) {
    this.dayLength = dayLength;
    this.hours = ((hours % 24) + 24) % 24;
    this.compute();
  }

  get isNight(): boolean {
    return this.state.night;
  }

  /** Jumps to a time of day (hours, fractional allowed) and notifies listeners. The cycle goes on from there. */
  setTime(hours: number): void {
    this.hours = ((hours % 24) + 24) % 24;
    this.compute();
    this.notify();
  }

  /** Night falls (23:00) if it is day, otherwise the afternoon sun comes back (14:00). */
  toggleNight(): void {
    this.setTime(this.state.night ? DAY_HOUR : NIGHT_HOUR);
  }

  /** Subscribes to sky changes; called right away with the current state. Returns an unsubscribe function. */
  onChange(listener: SkyListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  update(dt: number): void {
    if (!this.dayLength) return;
    this.hours = (this.hours + (dt * 24) / this.dayLength) % 24;
    this.compute();
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.state);
  }

  private compute(): void {
    const s = this.state;
    const h = this.hours;
    s.hours = h;
    s.sunHeight = sunHeightAt(h);
    s.daylight = THREE.MathUtils.smoothstep(s.sunHeight, -0.12, 0.3);
    s.night = s.sunHeight < 0;
    sampleStops(s.sunHeight, 'zenith', s.zenith);
    sampleStops(s.sunHeight, 'horizon', s.horizon);
    s.horizonGlow = 1 - THREE.MathUtils.smoothstep(Math.abs(s.sunHeight + 0.03), 0, 0.3);

    // Ambient hue: the sky seen from inside, pulled to warm white under a high sun and to a
    // desaturated blue deep in the night so the room never goes garish.
    s.ambient.copy(s.horizon).lerp(s.zenith, 0.45);
    const brightest = Math.max(s.ambient.r, s.ambient.g, s.ambient.b) || 1;
    s.ambient.multiplyScalar(1 / brightest);
    s.ambient.lerp(DAY_WHITE, THREE.MathUtils.smoothstep(s.sunHeight, 0.12, 0.5));
    s.ambient.lerp(NIGHT_BLUE, THREE.MathUtils.smoothstep(-s.sunHeight, 0.05, 0.35));

    // The sun crosses the sky from the morning side to the evening side and sinks a little below
    // the horizon, so it is seen setting and rising.
    const up = THREE.MathUtils.clamp(s.sunHeight, 0, 1);
    const sinking = THREE.MathUtils.smoothstep(s.sunHeight, -0.08, 0.06);
    s.sunElevation = THREE.MathUtils.lerp(SUN_SET_ELEVATION, SUN_MIN_LIGHT_ELEVATION, sinking) + up * SUN_MAX_ELEVATION;
    s.sunAzimuth = THREE.MathUtils.clamp((h - NOON_HOUR) / (DAY_HOURS / 2), -1, 1) * SUN_MAX_AZIMUTH;
    // The moon rises as the sun sets and climbs through the night.
    const nightUp = THREE.MathUtils.clamp(-s.sunHeight, 0, 1);
    s.moonElevation = THREE.MathUtils.degToRad(8) + nightUp * THREE.MathUtils.degToRad(40);
    s.moonAzimuth = -0.35;
    s.moonVisibility = THREE.MathUtils.smoothstep(-s.sunHeight, -0.02, 0.2);

    if (!s.night) {
      s.lightElevation = SUN_MIN_LIGHT_ELEVATION + up * SUN_MAX_ELEVATION;
      s.lightAzimuth = s.sunAzimuth;
      s.lightColor.lerpColors(SUN_LOW, SUN_HIGH, THREE.MathUtils.clamp(s.sunHeight / 0.35, 0, 1));
      // Long orange rays at sunrise and sunset, fading out in the last moments before the sun is gone.
      const strength = THREE.MathUtils.lerp(0.45, 1, THREE.MathUtils.smoothstep(s.sunHeight, 0, 0.3));
      s.lightIntensity = SUN_MAX_INTENSITY * strength * THREE.MathUtils.smoothstep(s.sunHeight, 0, 0.04);
    } else {
      s.lightElevation = s.moonElevation;
      s.lightAzimuth = s.moonAzimuth;
      s.lightColor.copy(MOON);
      s.lightIntensity = MOON_MAX_INTENSITY * THREE.MathUtils.smoothstep(-s.sunHeight, 0, 0.2);
    }
  }
}
