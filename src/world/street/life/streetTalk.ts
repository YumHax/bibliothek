import type { Game } from '@/catalog/types';
import type { StockItem } from '@/economy/StockItem';
import type { MarketDayTheme } from '@/economy/marketDays';
import type { ScoreEntry } from '@/economy/rivals';
import type { SkyState } from '../../props/DayNight';
import { HEAVY_RAIN } from '../../weather/Weather';
import { ARCADE_TITLES } from '../arcadeTitles';

interface StreetTalkOptions {
  /** The sky right now: the time, the weather. */
  sky: () => SkyState;
  /** The flea market: today's stock once drawn. */
  market: { peekToday(): readonly StockItem[] | null };
  /** What kind of market day it is. */
  marketDay: { readonly theme: MarketDayTheme };
  /** The collection: its wishlist is what the neighbours have heard the player is after. */
  games: { readonly games: readonly Game[] };
  /** The arcade's tables (top five per game, rivals and the player). */
  scores?: { table(gameId: string): ScoreEntry[] };
}

/** The arcade's cabinets as the street calls them, LexiPunk aside (it plays free: nobody talks of its tables). */
const ARCADE = Object.entries(ARCADE_TITLES).filter(([id]) => id !== 'lexipunk');

const ANY_TIME = [
  'Mind the bikes, they come down here like it is a race.',
  'That arcade still eats my coins.',
  'Have you seen the ginger cat? It sleeps on car roofs.',
];
/** Said only while the busker plays (`STREET_PLAN.busker.hours`, by day and dry). */
const BUSKER_LINES = ['The busker was here yesterday too. Same tune.', 'That busker only knows game music. Not that I mind.'];

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

/**
 * Who is talking, for what they would say: a passer-by (the news of the street), someone in a hurry (a word over
 * the shoulder), a child, an old regular, someone interrupted on the phone, a reader on the bench, someone waiting
 * for the bus, a customer at a café table, one of the queue at RETRO GAMES or at the bakery, a smoker outside a bar.
 */
export type TalkRole = 'passer' | 'commuter' | 'child' | 'elder' | 'phone' | 'reader' | 'bus' | 'terrace' | 'queue' | 'bakery' | 'smoker' | 'chatting';

/**
 * What someone in the street says when clicked, worked out afresh each time from what is going on: the
 * weather and the hour, the flea market's theme and whether a game on the player's wishlist is on
 * a stall today, who tops the arcade's tables (the player included), plus a few stock lines; and
 * from who they are (`role`): the caller asks for a minute, the reader is in a good bit, the bus
 * stop's passenger has been waiting ages. The line said last is not said again straight away.
 * Returns the talker (a passer-by's when called without a role).
 */
export function streetTalk(options: StreetTalkOptions): (role?: TalkRole) => string {
  let last = '';
  return (role = 'passer') => {
    const own = roleLines(role, options);
    // Their own lines mostly, the news of the street now and then; a passer-by has only the news.
    const lines = !own.length ? candidates(options) : Math.random() < 0.7 ? own : [...own, ...candidates(options)];
    const fresh = lines.filter((line) => line !== last);
    last = pick(fresh.length ? fresh : lines);
    return `“${last}”`;
  };
}

/** What only someone in `role` would say, now. */
function roleLines(role: TalkRole, { sky, market }: StreetTalkOptions): string[] {
  const s = sky();
  const wet = s.rain > 0.05;
  switch (role) {
    case 'commuter':
      return s.hours < 12
        ? ['Sorry, can’t stop, I’m late!', 'Train in four minutes. Bye!', 'Monday again, is it? Feels like it.']
        : ['Home at last. Well, nearly.', 'Long day. Mind out!', 'Sorry, in a hurry!'];
    case 'child':
      return ['Have you got a Game Boy? My brother has one.', 'Mum says no arcade till my homework’s done.', 'I can do the whole first level without dying.', 'Are those games in your bag?'];
    case 'elder':
      return [
        'This street had a cinema once, you know. Where the arcade is.',
        'We had pinball, in my day. Real bells.',
        wet ? 'My knee said it would rain. It always knows.' : 'Lovely to get a bit of air.',
        'Young people and their games. My grandson is the same.',
      ];
    case 'phone':
      return ['Sorry, I’m on the phone. Two minutes!', '“No, I’m outside the grocer’s.” Sorry, not you.', 'Hang on, someone’s talking to me. Yes?', 'Can it wait? It’s my mother.'];
    case 'reader':
      return ['Shh, it’s just getting good.', 'Nothing beats a bench and a book.', 'A detective story. I think it was the butler.', 'One more chapter and I’ll go home. That was three chapters ago.'];
    case 'bus':
      return ['The 38 should be along any minute. Should.', 'You’d think they’d run more of them.', 'Off to the station. You?', wet ? 'At least the shelter keeps the rain off.' : 'Not a bad day to wait in.'];
    case 'terrace':
      return ['Best coffee on the street, this.', 'I come here every day. Same table.', 'Sit down, there’s a free chair.', s.hours >= 18 ? 'One more and then home.' : 'Just the one, then back to work.'];
    case 'queue': {
      const stock = market.peekToday();
      return stock?.length
        ? [`They say there’s a ${pick(stock).game.title} in today.`, 'New stock day. I’m not missing it this time.', 'Don’t push in, I was here first!']
        : ['New stock day. I’m not missing it this time.', 'Don’t push in, I was here first!', 'Is this the queue for RETRO GAMES?'];
    }
    case 'bakery':
      return ['The croissants go by nine.', 'Two baguettes, always. One never makes it home.', 'Smells good, doesn’t it?'];
    case 'smoker':
      return ['Just the one, then back in.', 'It’s louder in there than you’d think.', 'Quiz night. We’re losing.', 'Got a light? No? Never mind.'];
    case 'chatting':
      return ['Sorry, we were just catching up.', 'Have you heard about the flat on the third floor?', 'We’ve known each other since school.'];
    case 'passer':
      return [];
  }
}

function candidates({ sky, market, marketDay, games, scores }: StreetTalkOptions): string[] {
  const s = sky();
  const lines: string[] = [];
  // The hour.
  if (s.hours < 6) lines.push('Can’t sleep either?', 'Only the arcade is still lit at this hour.');
  else if (s.hours < 10) lines.push('Morning! The bakery has croissants still warm.', 'Off to work. Well, eventually.');
  else if (s.hours < 14) lines.push('Lunch on the café terrace, if the sun holds.', 'Lovely day for it.');
  else if (s.hours < 19) lines.push('The kids come out of school soon: the arcade fills up.', 'Afternoon! Busy day?');
  else lines.push('Evening. The bars are filling up.', 'The shops shut soon, mind.');
  // The weather.
  if (s.rain >= HEAVY_RAIN) lines.push('Some weather, eh? Forgot my umbrella again.', 'The flea market gets the dealers on rainy days: they hate getting wet.');
  else if (s.rain > 0.05) lines.push('Only a drizzle. It never stops the market.');
  if (s.snow > 0.1 || s.snowCover > 0.3) lines.push('Snow! Mind the pavement, it’s slippery.', 'Perfect weather to stay in with a longplay.');
  if (s.fog > 0.4) lines.push('Can’t see the end of the street in this fog.');
  if (s.wind > 0.6) lines.push('Hold on to your hat!');
  // The market.
  const { theme } = marketDay;
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
    lines.push('RETRO GAMES has fresh crates at the back, they say.');
  }
  // The arcade's tables.
  if (scores) {
    const [id, title] = pick(ARCADE);
    const top = scores.table(id)[0];
    if (top?.you) lines.push(`Was that you at the top of ${title}? My nephew is furious.`);
    else if (top) lines.push(`${top.name} still holds ${title} at the arcade. ${top.score.toLocaleString('en')} points, can you believe it.`);
  }
  lines.push(...ANY_TIME);
  if (s.hours >= 9 && s.hours < 21.5 && s.rain < 0.3) lines.push(...BUSKER_LINES);
  return lines;
}
