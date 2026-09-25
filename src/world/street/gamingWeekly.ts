import { getPlatform } from '@/catalog/platforms';
import { seededRandom } from '@/covers/generated/canvasUtils';
import type { StockItem } from '@/economy/StockItem';

/** One issue of the newsstand's paper: its masthead line, the day's lead and three or four tips. */
export interface WeeklyIssue {
  masthead: string;
  dateline: string;
  headline: string;
  blurb: string;
  hints: string[];
  /** "Prices today: 18 to 540 coins", or null when nobody has been to the market yet. */
  prices: string | null;
}

export interface WeeklySources {
  /** Today's market stock if it has been drawn (`MarketStock.peekToday()`), else null. */
  stock: readonly StockItem[] | null;
  /** The market day (issues change with it). */
  day: number;
  /** The day's theme at the market (`MarketStock.theme`). */
  theme: { title: string; blurb: string };
  /** The player's wishlist and what they own (so a tip never points at a game they have). */
  wanted: (id: string) => boolean;
}

const RUMOURS = [
  (g: string, p: string) => `Rumour: a boxed ${g} (${p}) turned up at the market. Go early.`,
  (g: string, p: string) => `Overheard at the bus stop: somebody's selling ${g} for ${p}. Complete, they say.`,
  (g: string, p: string) => `Collectors are whispering about a ${p} copy of ${g} on the stalls today.`,
  (g: string, p: string) => `Spotted: ${g} (${p}) in a crate by the door. It will not stay there long.`,
];

const QUIET = [
  'The market restocks every morning. Nobody knows what is on the stalls until they go and look.',
  'Our reporter could not get in before opening. Try RÉTRO JEUX across the street: the market is through the back.',
  'Tip: the bargain bin is where the gems hide. Dig.',
  'Tip: haggling works best on worn copies. Stallholders rarely budge on a showpiece.',
  'The arcade pays tickets for scores; the prize counter swaps tickets for coins.',
];

/**
 * Writes the day's issue of THE GAMING WEEKLY from what the flea market has on its stalls: the
 * showpiece and a wishlist find if there is one, a rumour about an ordinary copy, a gem in the
 * bargain bin, the cheapest box in the hall, and the price range. Seeded by the market day, so the
 * paper reads the same all day. Before anybody has been to the market (the stock is not drawn
 * yet) it prints general tips instead.
 */
export function writeWeekly({ stock, day, theme, wanted }: WeeklySources): WeeklyIssue {
  const random = seededRandom(day * 131 + 7);
  const date = new Date();
  const dateline = `Issue ${day + 1} · ${date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}`;
  const base = { masthead: 'THE GAMING WEEKLY', dateline, headline: `Today at the market: ${theme.title}`, blurb: theme.blurb };
  if (!stock || stock.length === 0) {
    const hints = [...QUIET].sort(() => random() - 0.5).slice(0, 3);
    return { ...base, hints, prices: null };
  }

  const name = (item: StockItem): [string, string] => [item.game.title, getPlatform(item.game.platform).shortName];
  const hints: string[] = [];
  const showpiece = stock.find((i) => i.source === 'showpiece');
  if (showpiece) hints.push(`Collector's piece: a complete ${name(showpiece)[0]} (${name(showpiece)[1]}) on the ${name(showpiece)[1]} stall.`);
  const wish = stock.find((i) => i.source === 'wanted' || wanted(i.game.id));
  if (wish) hints.push(`Good news for you: ${name(wish)[0]}, the one on your wishlist, is on a stall today.`);
  const ordinary = stock.filter((i) => i.source === 'stall' && i.condition === 'complete');
  if (ordinary.length) {
    const pickOne = ordinary[Math.floor(random() * ordinary.length)]!;
    const rumour = RUMOURS[Math.floor(random() * RUMOURS.length)]!;
    hints.push(rumour(...name(pickOne)));
  }
  if (stock.some((i) => i.gem)) hints.push('Word is there is a gem hiding in the bargain bin today. Dig to the bottom.');
  const priced = stock.filter((i) => i.priced && i.source !== 'bin');
  if (priced.length) {
    const cheapest = priced.reduce((a, b) => (b.price < a.price ? b : a));
    hints.push(`Cheapest box on the stalls: ${name(cheapest)[0]} (${name(cheapest)[1]}), ${cheapest.price} coins.`);
  }
  while (hints.length < 3) hints.push(QUIET[Math.floor(random() * QUIET.length)]!);
  const prices = priced.length ? priced.map((i) => i.price) : stock.map((i) => i.price);
  return { ...base, hints: hints.slice(0, 4), prices: `Prices today: ${Math.min(...prices)} to ${Math.max(...prices)} coins.` };
}
