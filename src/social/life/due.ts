import { weekdayOf } from '@/time/wakefulness';

/*
 * When a promise is due, in words (docs/social.md "Promises"): the ticket and the book say "by tomorrow evening", "by
 * Thursday evening", never a day number. A leaf, shared by the favours, the votes and the wager.
 */

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

/** "by tonight", "by tomorrow evening", "by Thursday evening", "within the week": game day `due` seen from `day`. */
export function dueWords(due: number, day: number): string {
  const days = due - day;
  if (days <= 0) return 'by tonight';
  if (days === 1) return 'by tomorrow evening';
  if (days < 7) return `by ${WEEKDAYS[weekdayOf(due)]} evening`;
  return 'within the week';
}

/** The weekday of game day `day`, in full ("Thursday"). */
export function weekdayName(day: number): string {
  return WEEKDAYS[weekdayOf(day)]!;
}
