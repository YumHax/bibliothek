import { themeOf } from '@/economy/marketDays';

/** What a "to watch" line is about: the pictogram it takes in the journal. */
type UpcomingKind = 'arcade' | 'market' | 'seller' | 'building' | 'home' | 'collection' | 'social';

/**
 * One line of the journal's "to do, to watch": its kind (the pictogram), a few words without the date, and how many
 * days away it is (0 today, 1 tomorrow; absent for something waiting with no date, like the parcel in the hall).
 */
export interface Upcoming {
  kind: UpcomingKind;
  text: string;
  inDays?: number;
}

/**
 * What the market's round has coming, for the journal's "to do" list: today's theme when it is a
 * special day, tomorrow's when it is one, and the next special one after that. `day` is the market's
 * own day count (`MarketStock.day`, the game's clock), not the calendar. A few words each: the
 * flyers and the market's own signs carry the blurbs.
 */
export function upcomingMarketDays(day: number): Upcoming[] {
  const lines: Upcoming[] = [];
  const today = themeOf(day);
  if (today.kind !== 'ordinary') lines.push({ kind: 'market', text: `${title(today.title)} at the market`, inDays: 0 });
  const tomorrow = themeOf(day + 1);
  if (tomorrow.kind !== 'ordinary') lines.push({ kind: 'market', text: `${title(tomorrow.title)} at the market`, inDays: 1 });
  for (let ahead = 2; ahead <= 7; ahead++) {
    const theme = themeOf(day + ahead);
    if (theme.kind === 'ordinary' || theme.kind === tomorrow.kind) continue;
    lines.push({ kind: 'market', text: `${title(theme.title)} at the market`, inDays: ahead });
    break;
  }
  return lines;
}

/** "NINTENDO FAIR" -> "Nintendo Fair". */
function title(caps: string): string {
  return caps.toLowerCase().replace(/(^|[\s&'])([a-z])/g, (_, sep: string, c: string) => sep + c.toUpperCase());
}
