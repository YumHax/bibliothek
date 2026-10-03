import * as THREE from 'three';

/**
 * How awake the city is at `hours` (0 ≤ hours < 24), 0..1: the share of homes still up, and with
 * it how busy the streets are. Full through the day and the evening, tailing off after ten, at
 * its lowest between two and four in the morning, waking again before dawn. The night lights
 * compare it with each window's curfew (see `Sheet.lit`) and `Life` paces its traffic by it.
 */
export function wakefulnessAt(hours: number): number {
  const h = ((hours % 24) + 24) % 24;
  let i = 0;
  while (i < CURVE.length - 1 && CURVE[i + 1][0] <= h) i++;
  const [h0, w0] = CURVE[i];
  const [h1, w1] = CURVE[i + 1];
  return THREE.MathUtils.lerp(w0, w1, THREE.MathUtils.smoothstep(h, h0, h1));
}

/** A day of the week, Monday 0 .. Sunday 6. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
/** The game day that is a Sunday (the saleroom's sale day, `AUCTION.offset`, every seven): the weeks hang on it. */
const SUNDAY_DAY = 3;

/** The weekday of game day `day` (`Today.gameDay`): the market's days run through a week, Sunday the sale's. */
export function weekdayOf(day: number): Weekday {
  return ((((day - SUNDAY_DAY + 6) % 7) + 7) % 7) as Weekday;
}

/**
 * How busy the pavements are at `hours` on `weekday`, about 0..1.3 (the share of the street's walkers out, before
 * the weather): on a weekday the morning rush (7:30-9:30) and the evening one (17-19), a bump at lunch, a lull in the
 * afternoon, quieter evenings; on Saturday a late, busy shopping day; on Sunday a slow late morning and a stroll in the
 * afternoon. Never above `wakefulnessAt` by night (the same city asleep).
 */
export function streetBusyAt(hours: number, weekday: Weekday): number {
  const h = ((hours % 24) + 24) % 24;
  const curve = weekday === 6 ? SUNDAY : weekday === 5 ? SATURDAY : WEEKDAY;
  let i = 0;
  while (i < curve.length - 1 && curve[i + 1][0] <= h) i++;
  const [h0, w0] = curve[i];
  const [h1, w1] = curve[i + 1];
  return Math.min(THREE.MathUtils.lerp(w0, w1, THREE.MathUtils.smoothstep(h, h0, h1)), 0.3 + wakefulnessAt(h));
}

/** Whether `hours` is in a weekday's rush (the commuters' hours): 0 out of them .. 1 at their height. */
export function rushAt(hours: number, weekday: Weekday): number {
  if (weekday >= 5) return 0;
  const bump = (centre: number, half: number): number => Math.max(0, 1 - Math.abs(hours - centre) / half);
  return Math.max(bump(8.4, 1.2), bump(18, 1.2));
}

const WEEKDAY: readonly [number, number][] = [
  [0, 0.25], [2, 0.08], [5, 0.12], [6.5, 0.45], [8.3, 1.3], [9.6, 0.8], [11, 0.7], [12.8, 1.05], [14, 0.75],
  [15.5, 0.65], [16.8, 0.95], [18, 1.3], [19.3, 0.85], [21, 0.6], [22.5, 0.42], [24, 0.25],
];
const SATURDAY: readonly [number, number][] = [
  [0, 0.4], [2, 0.18], [5, 0.08], [8, 0.3], [10, 0.85], [12, 1.2], [15, 1.25], [18, 1.05], [20, 0.8], [22.5, 0.65], [24, 0.4],
];
const SUNDAY: readonly [number, number][] = [
  [0, 0.35], [2, 0.12], [6, 0.05], [9, 0.2], [11, 0.55], [13, 0.7], [15.5, 0.95], [18, 0.75], [20, 0.45], [22, 0.25], [24, 0.15],
];

/** (hour, wakefulness) knots; eased between, wrapping at midnight. */
const CURVE: readonly [number, number][] = [
  [0, 0.3],
  [1, 0.18],
  [2, 0.1],
  [4, 0.08],
  [5, 0.14],
  [6, 0.4],
  [7.5, 1],
  [21, 1],
  [22, 0.8],
  [23, 0.55],
  [24, 0.3],
];
