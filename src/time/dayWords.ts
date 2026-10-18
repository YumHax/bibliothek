import { weekdayOf } from './wakefulness';

/*
 * A game day as the player reads it in a list or on a card: "yesterday", "last week", "back on Thursday", never a day
 * number (docs/ui.md: no raw counters in copy). A leaf: the collection's receipts, the box card, the lent-out notes.
 */

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const SMALL = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'] as const;

/** "three", or "14" past twelve. */
function word(n: number): string {
  return SMALL[n] ?? String(n);
}

/** Game day `day` seen from `today`, looking back: "today", "yesterday", "on Tuesday", "last week", "three weeks ago". */
export function daysAgoWords(day: number, today: number): string {
  const ago = today - day;
  if (ago <= 0) return 'today';
  if (ago === 1) return 'yesterday';
  if (ago < 7) return `on ${WEEKDAYS[weekdayOf(day)]}`;
  if (ago < 14) return 'last week';
  if (ago < 28) return `${word(Math.floor(ago / 7))} weeks ago`;
  const months = Math.floor(ago / 28);
  return months === 1 ? 'a month ago' : `${word(months)} months ago`;
}

/** When something due on game day `due` comes, seen from `today`: "today", "tomorrow", "on Thursday", "next week", "any day now" when late. */
export function comesBackWords(due: number, today: number): string {
  const days = due - today;
  if (days < 0) return 'any day now';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return `on ${WEEKDAYS[weekdayOf(due)]}`;
  if (days < 14) return 'next week';
  return `in ${word(Math.floor(days / 7))} weeks`;
}
