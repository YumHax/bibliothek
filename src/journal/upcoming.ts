import { themeOf } from '@/economy/marketDays';

/**
 * What the market's round has coming, for the journal's "to do" list: today's theme when it is a
 * special day, tomorrow's, and the next special one after that. `day` is the market's own day
 * count (`MarketStock.day`, the game's clock), not the calendar.
 */
export function upcomingMarketDays(day: number): string[] {
  const lines: string[] = [];
  const today = themeOf(day);
  if (today.kind !== 'ordinary') lines.push(`At the market today: ${title(today.title)}. ${today.blurb}`);
  const tomorrow = themeOf(day + 1);
  lines.push(tomorrow.kind === 'ordinary' ? 'At the market tomorrow: an ordinary day.' : `At the market tomorrow: ${title(tomorrow.title)}. ${tomorrow.blurb}`);
  for (let ahead = 2; ahead <= 7; ahead++) {
    const theme = themeOf(day + ahead);
    if (theme.kind === 'ordinary' || theme.kind === tomorrow.kind) continue;
    lines.push(`In ${ahead} days: ${title(theme.title)}.`);
    break;
  }
  return lines;
}

/** "NINTENDO FAIR" -> "Nintendo Fair". */
function title(caps: string): string {
  return caps.toLowerCase().replace(/(^|[\s&'])([a-z])/g, (_, sep: string, c: string) => sep + c.toUpperCase());
}
