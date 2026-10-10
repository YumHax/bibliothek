import { formatClock } from '@/text/clock';
import { weekdayOf } from './wakefulness';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/**
 * The game's day and hour as the player reads them on the wallet chip and the pause menu: "Sat · day 12 · 18:40".
 * The weekday is the game's week (`weekdayOf`: the saleroom's Sundays, the arcade's Saturdays).
 */
export function gameDateLabel(day: number, hours: number): string {
  return `${WEEKDAYS[weekdayOf(day)]} · day ${day} · ${formatClock(hours)}`;
}
