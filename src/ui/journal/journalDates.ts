import { gameDayOf } from '@/journal/Journal';
import { weekdayOf } from '@/time/wakefulness';

/**
 * One way to head a page: "Day 12" from a game day's key; an older page, kept by date ("2026-09-25", local,
 * no time zone shift), reads "Before day 1 · Fri 25 Sep" so it sits with the numbered days.
 */
export function longDate(key: string): string {
  const gameDay = gameDayOf(key);
  if (gameDay !== null) return `Day ${gameDay}`;
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y!, (m ?? 1) - 1, d ?? 1); // a stored page's date, not a draw
  return `Before day 1 · ${WEEKDAYS_SHORT[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** The game week's day a page falls on ("Tuesday"), or null for a page kept by date. */
export function weekdayName(key: string): string | null {
  const gameDay = gameDayOf(key);
  return gameDay === null ? null : WEEKDAYS[weekdayOf(gameDay)]!;
}

/** The game's week, Monday first (`weekdayOf`). */
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
/** Spelled out here (Sunday first, `Date.getDay`): the locale's short forms vary ("Sept" in some). */
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
