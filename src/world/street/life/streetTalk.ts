import type { Game } from '@/catalog/types';
import type { StockItem } from '@/economy/StockItem';
import type { MarketDayTheme } from '@/economy/marketDays';
import type { ScoreEntry } from '@/economy/rivals';
import type { SkyState } from '../../props/DayNight';

export interface StreetTalkOptions {
  /** The sky right now: the time, the weather. */
  sky: () => SkyState;
  /** The flea market: today's stock once drawn, the day's theme. */
  market: { peekToday(): readonly StockItem[] | null; readonly theme: MarketDayTheme };
  /** The collection: its wishlist is what the neighbours have heard the player is after. */
  games: { readonly games: readonly Game[] };
  /** The arcade's tables (top five per game, rivals and the player). */
  scores?: { table(gameId: string): ScoreEntry[] };
}

/** The arcade's cabinets as the street calls them (ids as in `ARCADE_GAMES`). */
const ARCADE: readonly [id: string, title: string][] = [
  ['breakout', 'BRICK STORM'], ['invaders', 'STAR RAID'], ['stacker', 'SKY STACK'], ['arrows', 'ARROW RUSH'], ['snake', 'NEON SNAKE'],
  ['comets', 'COMET DASH'], ['duel', 'PADDLE WARS'], ['stepbeat', 'STEP BEAT'], ['sheriff', 'NEON SHERIFF'],
];

const ANY_TIME = [
  'Mind the bikes, they come down here like it is a race.',
  'Sorry, in a hurry!',
  'The busker was here yesterday too. Same tune.',
  'That arcade still eats my coins.',
  'Have you seen the ginger cat? It sleeps on car roofs.',
];

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

/**
 * What a passer-by says when clicked, worked out afresh each time from what is going on: the
 * weather and the hour, the flea market's theme and whether a game on the player's wishlist is on
 * a stall today, who tops the arcade's tables (the player included), plus a few stock lines. The
 * line said last is not said again straight away. Returns the talker.
 */
export function streetTalk(options: StreetTalkOptions): () => string {
  let last = '';
  return () => {
    const lines = candidates(options);
    const fresh = lines.filter((line) => line !== last);
    last = pick(fresh.length ? fresh : lines);
    return `“${last}”`;
  };
}

function candidates({ sky, market, games, scores }: StreetTalkOptions): string[] {
  const s = sky();
  const lines: string[] = [];
  // The hour.
  if (s.hours < 6) lines.push('Can’t sleep either?', 'Only the arcade is still lit at this hour.');
  else if (s.hours < 10) lines.push('Morning! The bakery has croissants still warm.', 'Off to work. Well, eventually.');
  else if (s.hours < 14) lines.push('Lunch on the café terrace, if the sun holds.', 'Lovely day for it.');
  else if (s.hours < 19) lines.push('The kids come out of school soon: the arcade fills up.', 'Afternoon! Busy day?');
  else lines.push('Evening. The bars are filling up.', 'The shops shut soon, mind.');
  // The weather.
  if (s.rain > 0.4) lines.push('Some weather, eh? Forgot my umbrella again.', 'The flea market gets the dealers on rainy days: they hate getting wet.');
  else if (s.rain > 0.05) lines.push('Only a drizzle. It never stops the market.');
  if (s.snow > 0.1 || s.snowCover > 0.3) lines.push('Snow! Mind the pavement, it’s slippery.', 'Perfect weather to stay in with a longplay.');
  if (s.fog > 0.4) lines.push('Can’t see the end of the street in this fog.');
  if (s.wind > 0.6) lines.push('Hold on to your hat!');
  // The market.
  const { theme } = market;
  if (theme.kind !== 'ordinary') lines.push(`It’s ${theme.title} at the flea market today. ${theme.blurb}`);
  else lines.push('Have you been to the market yet? Get there before the dealers do.');
  const stock = market.peekToday();
  if (stock?.length) {
    const wanted = new Set(games.games.filter((g) => g.status === 'wishlist').map((g) => g.id));
    const hit = stock.find((item) => wanted.has(item.game.id));
    if (hit) lines.push(`Aren’t you the one looking for ${hit.game.title}? I saw one at the flea market this morning.`, `Word is there’s a ${hit.game.title} on a stall back there. Hurry.`);
    const gem = stock.find((item) => item.gem);
    if (gem) lines.push('Somebody said there’s a real find in the bargain bin today.');
    const any = pick(stock);
    lines.push(`I nearly bought ${any.game.title} at the market. Maybe tomorrow.`);
  } else {
    lines.push('RÉTRO JEUX has fresh crates at the back, they say.');
  }
  // The arcade's tables.
  if (scores) {
    const [id, title] = pick(ARCADE);
    const top = scores.table(id)[0];
    if (top?.you) lines.push(`Was that you at the top of ${title}? My nephew is furious.`);
    else if (top) lines.push(`${top.name} still holds ${title} at the arcade. ${top.score.toLocaleString('en')} points, can you believe it.`);
  }
  lines.push(...ANY_TIME);
  return lines;
}
