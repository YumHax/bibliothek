import type { Game } from '@/catalog/types';
import { inHours } from '@/time/clock';
import { keptAway } from '@/time/schedule';
import { BUSKER } from '../events/streetSchedules';
import type { StockItem } from '@/economy/StockItem';
import type { MarketDayTheme } from '@/economy/marketDays';
import type { ScoreEntry } from '@/economy/rivals';
import type { SkyState } from '../../props/DayNight';
import { HEAVY_RAIN } from '../../weather/Weather';
import { ARCADE_TITLES } from '../arcadeTitles';
import { pick, random } from '@/random';
import { weekdayOf } from '@/time/wakefulness';
import { LOCAL_QUIZ } from '@/streetShops/bars';
import { formatNumber } from '@/text/count';

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
  /** How far the stray cat trusts the player (0 to his most): the street has seen them together. */
  strayTrust?: () => number;
  /** The Grand Flea Fair is on today. */
  fairDay?: () => boolean;
  /** The game day (THE LOCAL's quiz night, the weekday a commuter grumbles about). */
  day?: () => number;
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

/**
 * Who is talking, for what they would say: a passer-by (the news of the street), someone in a hurry (a word over
 * the shoulder), a child, an old regular, someone interrupted on the phone, a reader on the bench, someone waiting
 * for the bus, a customer at a café table, one of the queue at RETRO GAMES or at the bakery, a smoker outside a bar;
 * someone eating their lunch on a bench, walking their dog, looking in a window, going home late, at the Fair, out of
 * a shop with their bag, a visitor taking pictures, someone waiting by the clock, a parent or a child at the
 * playground, a jogger, someone feeding the pigeons, a shopkeeper shutting up, a night-shift worker, the street
 * sweeper, a child on the way to or from school.
 */
export type TalkRole =
  | 'passer'
  | 'commuter'
  | 'child'
  | 'elder'
  | 'phone'
  | 'reader'
  | 'bus'
  | 'terrace'
  | 'queue'
  | 'bakery'
  | 'smoker'
  | 'chatting'
  | 'lunch'
  | 'dog'
  | 'window'
  | 'night'
  | 'fair'
  | 'shopper'
  | 'tourist'
  | 'waiting'
  | 'parent'
  | 'playground'
  | 'jogger'
  | 'feeder'
  | 'closing'
  | 'nightShift'
  | 'sweeper'
  | 'school';

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
    const lines = !own.length ? candidates(options) : random() < 0.7 ? own : [...own, ...candidates(options)];
    const fresh = lines.filter((line) => line !== last);
    last = pick(random, fresh.length ? fresh : lines);
    return last;
  };
}

/** What only someone in `role` would say, now. */
function roleLines(role: TalkRole, { sky, market, fairDay, day }: StreetTalkOptions): string[] {
  const s = sky();
  const wet = s.rain > 0.05;
  const cold = s.snow > 0.1 || s.snowCover > 0.3;
  switch (role) {
    case 'lunch':
      return ['Lunch break. Thirty minutes of peace.', 'Best sandwich on the street, from the bakery.', 'Don’t tell my boss I eat on a bench.', 'The pigeons know my lunch hour better than I do.'];
    case 'dog':
      return [
        'He’s friendly, don’t worry. Too friendly.',
        'Twice round the block, every morning, every evening. Rain or shine.',
        'He pulls like mad when he sees the pigeons.',
        'You can stroke him. He loves everyone except the postman.',
        'That ginger cat drives him up the wall.',
      ];
    case 'window':
      return ['Just looking. Always just looking.', 'Have you seen what they want for that in there?', 'I come by every week to see what’s new in the window.', 'One day I’ll go in. Not today.'];
    case 'night':
      return ['Is it that late already?', 'One more drink would have been one too many.', 'Shh, people are sleeping up there.', 'The arcade’s still lit. Fancy a game?', 'Long night. Good night, though.'];
    case 'fair':
      return fairDay?.()
        ? ['The Fair! I come every year.', 'I’ve got a list. I won’t stick to it.', 'They say the dealers come at dawn and take the best.', 'My bag’s already full and I haven’t reached the stalls.']
        : ['Watch the Morris column for the next Grand Flea Fair. Everyone comes.'];
    case 'shopper':
      return ['Got what I came for. Nearly.', 'They had it in stock, for once.', 'Don’t look in my bag, it’s a present.', 'Spent more than I meant to. As usual.'];
    case 'tourist':
      return ['Excuse me, is this Front Street? It looks just like the postcard.', 'Such a pretty street! Do you live here?', 'We came for the Fair. Where do we go?', 'Could you take our picture? No? Never mind.'];
    case 'waiting':
      return ['I’m meeting someone. They’re late. As usual.', 'We said by the clock, didn’t we? I’m sure we did.', 'Five more minutes and I’m going home.'];
    case 'parent':
      return ['Five more minutes, then home!', 'They’d stay on those swings till dark if I let them.', 'Do you have kids? Enjoy the quiet.', 'Careful on the slide! … They never listen.'];
    case 'playground':
      return ['Watch me! Watch me go down the slide!', 'I can swing higher than my sister.', 'Do you want to play tag? You’re it!', 'The sandpit has a whole castle in it. I built it.'];
    case 'jogger':
      return ['Can’t stop, I’ll lose my rhythm!', 'Three laps … to go …', cold ? 'Cold’s good for running. Honestly.' : 'Lovely day for a run.'];
    case 'feeder':
      return ['They know me, the pigeons. Every day, the same time.', 'Old bread. Nothing goes to waste.', 'Don’t frighten them off, there’s a love.', 'The ducks get the good bread. The pigeons get the crusts. They know.'];
    case 'closing':
      return ['Closing up, sorry. Back tomorrow at opening.', 'That’s me done for the day.', 'Long day. My feet are finished.', 'Come back tomorrow, I’ll have fresh stock.'];
    case 'nightShift':
      return ['Off to work. Somebody has to keep the lights on.', 'Night shift. I see this street when everyone else is asleep.', 'Just finished. Breakfast, then bed.'];
    case 'sweeper':
      return ['Morning. Mind the water.', 'You’d be amazed what people drop. Coins, keys, once a cartridge.', 'First one out every day. I like the quiet.'];
    case 'school':
      return ['Late for school! Bye!', 'We have a spelling test. I didn’t revise.', 'School’s finished! Arcade!', 'My mum says no games till my homework’s done.'];
    case 'commuter':
      return s.hours < 12
        ? ['Sorry, can’t stop, I’m late!', 'Train in four minutes. Bye!', day && weekdayOf(day()) === 0 ? 'Monday again. Already.' : day && weekdayOf(day()) === 4 ? 'Friday! Nearly there.' : 'Same train every morning. Same seat.']
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
        ? [`They say there’s a ${pick(random, stock).game.title} in today.`, 'New stock day. I’m not missing it this time.', 'Don’t push in, I was here first!']
        : ['New stock day. I’m not missing it this time.', 'Don’t push in, I was here first!', 'Is this the queue for RETRO GAMES?'];
    }
    case 'bakery':
      return ['The croissants go by nine.', 'Two baguettes, always. One never makes it home.', 'Smells good, doesn’t it?'];
    case 'smoker':
      return ['Just the one, then back in.', 'It’s louder in there than you’d think.', day && LOCAL_QUIZ.isDay(day()) ? 'Quiz night. We’re losing.' : 'The match is on. We’re losing.', 'Got a light? No? Never mind.'];
    case 'chatting':
      return ['Sorry, we were just catching up.', 'Have you heard about the flat on the third floor?', 'We’ve known each other since school.'];
    case 'passer':
      return s.hours >= 22 || s.hours < 5 ? ['Bit late to be out, isn’t it? Says me.'] : [];
  }
}

function candidates(options: StreetTalkOptions): string[] {
  const { sky, market, marketDay, games, scores } = options;
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
    const any = pick(random, stock);
    lines.push(`I nearly bought ${any.game.title} at the market. Maybe tomorrow.`);
  } else {
    lines.push('RETRO GAMES has fresh crates at the back, they say.');
  }
  // The arcade's tables.
  if (scores) {
    const [id, title] = pick(random, ARCADE);
    const top = scores.table(id)[0];
    if (top?.you) lines.push(`Was that you at the top of ${title}? My nephew is furious.`);
    else if (top) lines.push(`${top.name} still holds ${title} at the arcade. ${formatNumber(top.score)} points, can you believe it.`);
  }
  // What the street has seen of the player: the stray cat at their heels.
  const trust = options.strayTrust?.() ?? 0;
  if (trust >= 3) lines.push('That ginger cat follows you about now, doesn’t he? He never let anyone near.', 'The stray waits for you, you know. On the car roofs.');
  else if (trust >= 1) lines.push('I saw you feeding the ginger stray. He’s a wild one.');
  if (options.fairDay?.()) lines.push('It’s the Grand Flea Fair today! The whole town’s here.', 'Fair day. You can’t move for collectors.');
  lines.push(...ANY_TIME);
  // Talk of the busker while they play, by the busker's own hours and weather (`events/streetSchedules`).
  if (BUSKER.hours && inHours(s.hours, BUSKER.hours) && !keptAway(BUSKER, s)) lines.push(...BUSKER_LINES);
  return lines;
}
