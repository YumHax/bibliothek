import { formatClock } from '@/text/clock';
import { weekdayOf } from './wakefulness';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

/**
 * The game's day and hour as the player reads them on the wallet chip and the pause menu: "Saturday, 18:40", never a
 * day number (docs/ui.md: no raw counters). The weekday is the game's week (`weekdayOf`: the saleroom's Sundays, the
 * arcade's Saturdays).
 */
export function gameDateLabel(day: number, hours: number): string {
  return `${WEEKDAYS[weekdayOf(day)]}, ${formatClock(hours)}`;
}
