import * as THREE from 'three';

/**
 * Where the sun stands for a date and a place, with the NOAA solar equations (fractional year,
 * equation of time, declination; no network). The clock of the game is local wall-clock time, so
 * the place's longitude and the date's time-zone offset (summer time included) turn it into solar
 * time: in Berlin in June the sun rises at 4:45 and sets at 21:30, in December at 8:15 and 15:55.
 */

/** A place: latitude (north positive) and longitude (east positive), in degrees. */
export interface Place {
  latitude: number;
  longitude: number;
}

/** The sun on one day at one place, in local clock hours (0..24) and radians. */
export interface SolarDay {
  /** Clock hours of sunrise, solar noon and sunset (sunrise/sunset NaN in a polar day or night). */
  sunrise: number;
  noon: number;
  sunset: number;
  /** Hours of sun: 0 in a polar night, 24 in a midnight sun. */
  dayHours: number;
  /** The sun's elevation at noon and at midnight (negative: below the horizon). */
  noonElevation: number;
  midnightElevation: number;
  /** The sun's elevation at a clock hour of this day. */
  elevationAt(hours: number): number;
}

/** Latitude used when the time zone is not in `ZONES`: central Europe, about Frankfurt. */
export const DEFAULT_LATITUDE = 50;
/** The sun's apparent elevation at sunrise and sunset: its radius plus the refraction at the horizon. */
const HORIZON_ELEVATION = THREE.MathUtils.degToRad(-0.833);

/** A city's place for the common time zones (`Intl` names), so the day is as long as the player's. */
const ZONES: Record<string, Place> = {
  'Europe/Berlin': { latitude: 52.52, longitude: 13.4 },
  'Europe/Paris': { latitude: 48.85, longitude: 2.35 },
  'Europe/London': { latitude: 51.51, longitude: -0.13 },
  'Europe/Madrid': { latitude: 40.42, longitude: -3.7 },
  'Europe/Rome': { latitude: 41.9, longitude: 12.5 },
  'Europe/Amsterdam': { latitude: 52.37, longitude: 4.9 },
  'Europe/Brussels': { latitude: 50.85, longitude: 4.35 },
  'Europe/Zurich': { latitude: 47.37, longitude: 8.54 },
  'Europe/Vienna': { latitude: 48.21, longitude: 16.37 },
  'Europe/Stockholm': { latitude: 59.33, longitude: 18.07 },
  'Europe/Warsaw': { latitude: 52.23, longitude: 21.01 },
  'Europe/Moscow': { latitude: 55.76, longitude: 37.62 },
  'America/New_York': { latitude: 40.71, longitude: -74.01 },
  'America/Chicago': { latitude: 41.88, longitude: -87.63 },
  'America/Denver': { latitude: 39.74, longitude: -104.99 },
  'America/Los_Angeles': { latitude: 34.05, longitude: -118.24 },
  'America/Toronto': { latitude: 43.65, longitude: -79.38 },
  'America/Mexico_City': { latitude: 19.43, longitude: -99.13 },
  'America/Sao_Paulo': { latitude: -23.55, longitude: -46.63 },
  'Asia/Tokyo': { latitude: 35.68, longitude: 139.69 },
  'Asia/Shanghai': { latitude: 31.23, longitude: 121.47 },
  'Asia/Singapore': { latitude: 1.35, longitude: 103.82 },
  'Asia/Kolkata': { latitude: 28.61, longitude: 77.21 },
  'Asia/Dubai': { latitude: 25.2, longitude: 55.27 },
  'Australia/Sydney': { latitude: -33.87, longitude: 151.21 },
  'Pacific/Auckland': { latitude: -36.85, longitude: 174.76 },
  'Africa/Johannesburg': { latitude: -26.2, longitude: 28.05 },
};

/**
 * The player's place, guessed from the browser's time zone; `latitude` (the `?lat=` override)
 * replaces the table's. Unknown zones get `DEFAULT_LATITUDE` on the zone's own meridian, so noon
 * falls at 12:00 standard time.
 */
export function localPlace(latitude?: number, date = new Date()): Place {
  let zone = '';
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    // No Intl time zone: the defaults below.
  }
  const known = ZONES[zone];
  const place: Place = known ?? { latitude: DEFAULT_LATITUDE, longitude: standardMeridian(date) };
  return latitude === undefined ? place : { ...place, latitude: THREE.MathUtils.clamp(latitude, -89, 89) };
}

/** Parses `?lat=48.85`; anything that is not a latitude is ignored. */
export function parseLatitude(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= 90 ? n : undefined;
}

/** Longitude of the meridian the date's time zone keeps (its offset without summer time), in degrees. */
function standardMeridian(date: Date): number {
  const year = date.getFullYear();
  const offset = Math.max(new Date(year, 0, 1).getTimezoneOffset(), new Date(year, 6, 1).getTimezoneOffset());
  return (-offset / 60) * 15;
}

/** The sun at `place` on the calendar day of `date` (see `SolarDay`). */
export function solarDay(date: Date, place: Place): SolarDay {
  const start = new Date(date.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() - start.getTime()) / 86_400_000) + 1;
  const leap = new Date(date.getFullYear(), 1, 29).getMonth() === 1;
  // Fractional year at local noon, radians.
  const g = ((2 * Math.PI) / (leap ? 366 : 365)) * (dayOfYear - 1);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const lat = THREE.MathUtils.degToRad(place.latitude);
  // Clock hour of solar noon: the place's longitude against its zone's clock (summer time included), and the equation of time.
  const zoneHours = -new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12).getTimezoneOffset() / 60;
  const noon = 12 + zoneHours - place.longitude / 15 - eqTime / 60;
  const elevationAt = (hours: number): number => {
    const hourAngle = THREE.MathUtils.degToRad((hours - noon) * 15);
    return Math.asin(THREE.MathUtils.clamp(Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle), -1, 1));
  };
  const cosH = (Math.sin(HORIZON_ELEVATION) - Math.sin(lat) * Math.sin(decl)) / (Math.cos(lat) * Math.cos(decl));
  let sunrise = NaN;
  let sunset = NaN;
  let dayHours: number;
  if (cosH >= 1) dayHours = 0;
  else if (cosH <= -1) dayHours = 24;
  else {
    const half = THREE.MathUtils.radToDeg(Math.acos(cosH)) / 15;
    dayHours = 2 * half;
    sunrise = wrapHours(noon - half);
    sunset = wrapHours(noon + half);
  }
  return { sunrise, noon: wrapHours(noon), sunset, dayHours, noonElevation: elevationAt(noon), midnightElevation: elevationAt(noon + 12), elevationAt };
}

/** Hours folded into 0..24. */
function wrapHours(hours: number): number {
  return ((hours % 24) + 24) % 24;
}

/**
 * The sun's elevation as the game's `sunHeight`: 0 at sunrise and sunset, 1 once the sun is
 * `reference` radians up (a high summer sun; a winter noon peaks lower), -1 at the day's lowest
 * point below the horizon (so every night gets properly dark, even a short northern summer one).
 */
export function sunHeightOf(day: SolarDay, hours: number, reference: number): number {
  const s = Math.sin(day.elevationAt(hours)) - Math.sin(HORIZON_ELEVATION);
  if (s >= 0) return Math.min(1, s / (Math.sin(reference) - Math.sin(HORIZON_ELEVATION)));
  // Below the horizon: scaled by how deep the sun goes tonight, never less than 6° (a night must reach full dark).
  const depth = Math.max(Math.sin(HORIZON_ELEVATION) - Math.sin(day.midnightElevation), Math.sin(THREE.MathUtils.degToRad(6)));
  return Math.max(-1, s / depth);
}
