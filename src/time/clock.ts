/*
 * The game's hours, read one way. A span of hours is `{ from, to }` in game hours (or a `[from, to]` pair, as the plans
 * write them). `to` may run past midnight written as over 24 (a bar closing at 26 = 2:00, the shop plans' convention) or
 * as a smaller number than `from` (out from 22 to 6, the residents' convention): `inHours` reads both the same way, the
 * half-open span [from, to) wrapped round the day. A feature that reads the clock takes a `GameClock` (`today.clock`,
 * `time/Today`): the game day and the hour of it, never a `() => number` of its own.
 */

/** A span of game hours; `to` over 24 or below `from` runs past midnight. */
export interface HourSpan {
  readonly from: number;
  readonly to: number;
}

/** A span as the plans write it: `[from, to]`. */
export type HourPair = readonly [from: number, to: number];

/** `hours` brought into [0, 24). */
function wrapHours(hours: number): number {
  return ((hours % 24) + 24) % 24;
}

/** `{ from, to }` from a plan's pair (or a span, unchanged). */
function spanOf(hours: HourSpan | HourPair): HourSpan {
  return Array.isArray(hours) ? { from: hours[0], to: hours[1] } : (hours as HourSpan);
}

/**
 * Whether `hours` falls in `span`: [from, to), the span wrapping round midnight when `to` is over 24 or below `from`;
 * a span of a whole day or more is always on.
 */
export function inHours(hours: number, span: HourSpan | HourPair): boolean {
  const { from, to } = spanOf(span);
  if (to - from >= 24) return true;
  const h = wrapHours(hours);
  if (from <= to && to <= 24) return h >= from && h < to;
  // Past midnight, either way of writing it: on from `from` to the day's end, then till `to` of the next day.
  const end = to > 24 ? to - 24 : to;
  return h >= from || h < end;
}

/** The game day an evening belongs to: the small hours are still last night's. */
export function nightOf(day: number, hours: number): number {
  return hours < 12 ? day - 1 : day;
}

/** The game clock as a feature reads it: the game day (from 1) and the hour of it (0 ≤ hours < 24). */
export interface GameClock {
  readonly day: number;
  readonly hours: number;
}
