import { inHours } from '@/time/clock';
import { SUNDAY_WEEKDAY, weekdayOf } from '@/time/wakefulness';

/*
 * LUNCH AT MÉMÉ'S (docs/grandma.md "Sunday lunch, recipes and favours"): on a Sunday (and on Christmas Eve and Day),
 * from late morning, she calls the player to the table: the blanquette served, her talk over it, the meal told in a
 * fade, the tart and the coffee, then the envelope.
 */

/** Her lunch hours (game hours): called to the table from `from`, not after `until`; the clock after the meal. */
export const LUNCH = {
  from: 11.5,
  until: 14,
  /** The clock once the meal is told (the coffee), unless the player sat down later than this less `least`. */
  clears: 14.25,
  /** The meal takes at least this long (minutes). */
  least: 30,
  /** The fade (ms), like the household's long jobs. */
  outMs: 1100,
  darkMs: 2600,
  inMs: 1100,
  /** Seconds between her lines at the table. */
  lineGap: 3.6,
  /** Christmas: the envelope she slips under the plate, once a year. */
  christmasCoins: 25,
} as const;

/** What kind of lunch the day has: a Sunday's, Christmas (24, 25 December, real date), or none. */
export type LunchKind = 'sunday' | 'christmas';

export function lunchOf(gameDay: number, date: Date): LunchKind | null {
  if (date.getMonth() === 11 && (date.getDate() === 24 || date.getDate() === 25)) return 'christmas';
  return weekdayOf(gameDay) === SUNDAY_WEEKDAY ? 'sunday' : null;
}

/** Whether `hour` is in her lunch hours. */
export function lunchHours(hour: number): boolean {
  return inHours(hour, [LUNCH.from, LUNCH.until]);
}

/** Her Sunday dish by the season (the real month): what she calls it, how she serves it, the tart after. */
interface Dish {
  name: string;
  serve: readonly string[];
  tart: string;
}

const DISHES: Record<'winter' | 'spring' | 'summer' | 'autumn', Dish> = {
  winter: {
    name: 'blanquette',
    serve: ['There. Rice under, sauce over. Félix did it the other way round, the barbarian.', 'Take more sauce. More. You’re too thin, your mother says so too.'],
    tart: 'Apple tart, the apples from the cellar. They’re wrinkly, they taste better wrinkly.',
  },
  spring: {
    name: 'navarin',
    serve: ['Navarin, with the first peas. Shell them next time, I’m not your servant. I am, but don’t tell anyone.', 'Lamb from the butcher on the corner. He gave me the good bit, he likes me.'],
    tart: 'Rhubarb tart. Félix pulled a face at rhubarb every spring and ate two slices.',
  },
  summer: {
    name: 'tomatoes stuffed the way Félix liked them',
    serve: ['Stuffed tomatoes. Mind, they’re hot inside, you burned your tongue on one when you were seven.', 'Rice in the bottom of the dish. That’s the best bit, it’s caught. Take the corner.'],
    tart: 'Apricot tart. From the market, the man swears they’re from his own tree. He lies, but nicely.',
  },
  autumn: {
    name: 'pot-au-feu',
    serve: ['Pot-au-feu. The marrow bone is yours, Félix always took it. Not today.', 'Mustard? The strong one. Your eyes will water, it’s good for you.'],
    tart: 'Plum tart. From my plums. Well, the market’s plums, but I stoned them.',
  },
};

/** Today's dish by the real month. */
export function dishOf(date: Date): Dish {
  const m = date.getMonth();
  return DISHES[m === 11 || m <= 1 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn'];
}

/** Her words at the table. */
export const LUNCH_LINES = {
  /** Calling the player to the table, on the way in (`{dish}` today's). */
  call: ['À table! It’s getting cold, and so am I.', 'Lunch is ready. Wash your hands. I’m joking. Sort of.', 'Sit, sit, I’ve laid your place. The {dish} won’t wait.'],
  /** Said when lunch is still to come (on the way in before her hours, on a lunch day; `{dish}` today's). */
  later: 'Stay for lunch, there’s {dish}. Noon, not one minute after.',
  /** Over the meal, one of the memories seen in her album (by `MEMORIES` id): the table remembers what the player has seen. */
  remembers: {
    christmas95: 'You tore that paper like a puppy. The sports pages everywhere. Félix laughed till he coughed.',
    wednesdays: 'Wednesdays you came back from his place with your eyes square. I gave you soup and said nothing.',
    arcade: 'He told everyone about your three letters. The butcher knows. The postman knows. I know, twice a week.',
    row: 'That supper with Gaspard… I still lay the table the same way. I’m stubborn too.',
    leaving: 'When you went off to study he came here every Sunday for a month. Sat where you are. Didn’t eat much.',
    sale: 'I go past the saleroom on the 38 sometimes. I look the other way.',
    keys: 'You’ve got his keys now. Do you oil the lock? He never did, it squeaked like a mouse.',
  } as Readonly<Record<string, string>>,
  /** Over the meal, a few at a time. */
  talk: [
    'Félix sat where you are. He always took the end, to see the window.',
    'Your uncle Gaspard used to count the mushrooms in his plate. To see if Félix had more.',
    'I made this for your grandfather the day he asked me. He said yes before I did.',
    'When you were little you only ate the carrots. I gave you all the carrots.',
    'The butcher asked after you. I said you were busy with your games. He said: good for him.',
    'Félix brought his girlfriend once. Just the once. She didn’t like blanquette.',
    'Eat, eat. You can talk to me with your mouth full, I’m your grandmother.',
    'Your mother never liked cream. She gets that from her father.',
  ],
  /** Christmas at the table. */
  christmas: ['Christmas lunch! Pull your cracker. I bought them at the market, they’re rubbish.', 'Félix always fell asleep after Christmas lunch. In that armchair, with the paper over his face.'],
  /** After the fade: the coffee (the tart is the dish's: `dishOf`). */
  /** Over the meal, the bread: she asks for it, thanks the player passing it, or reaches for it herself. */
  bread: {
    ask: ['Pass me the bread, love?', 'Be a dear, the bread. My arms aren’t what they were.', 'The bread, please. Félix always kept it on his side, the wretch.'],
    thanks: ['Thank you. You were raised properly, whatever your uncle said.', 'Merci. The crust is the best bit, don’t tell the doctor.', 'There. Now we can eat like civilised people.'],
    herself: ['Never mind, I’ll get it. Dreaming again.', 'I’ll reach. I’m old, not dead.'],
  },
  dessert: ['Coffee? Of course coffee. And a square of chocolate, it’s Sunday.', 'A little coffee. No, a little. Your hands will shake on the bus.'],
  /** As she clears up. */
  clear: ['Leave it, leave it, I’ll clear. Go and sit in the armchair, you look full.', 'No, you don’t help, you’re the guest. Sit.'],
  /** The envelope, at the end, under the coffee cup. */
  envelope: 'And this is for you. Under the cup. Don’t argue, and don’t tell Gaspard.',
  /** The same, with Gaspard at the table. */
  envelopeGaspard: 'And this is for you. Under the cup. Gaspard, look the other way. You had yours.',
  /** Christmas: her present, wrapped. */
  christmasGift: 'Happy Christmas, love. It’s wrapped in the sports pages. Félix’s trick, I never found better.',
  /** Left on a lunch day without eating: the envelope found in the coat. */
  pocketed: { title: 'Mémé’s envelope', detail: 'In your coat pocket on the way down. “You didn’t eat. Buy yourself a sandwich. Don’t tell Gaspard.”' },
  christmasPresent: { title: 'Mémé’s present', detail: 'An envelope in the sports pages. “For your games. Happy Christmas.”' },
} as const;
