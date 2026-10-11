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

/** Her words at the table. */
export const LUNCH_LINES = {
  /** Calling the player to the table, on the way in. */
  call: ['À table! It’s getting cold, and so am I.', 'Lunch is ready. Wash your hands. I’m joking. Sort of.', 'Sit, sit, I’ve laid your place. The blanquette won’t wait.'],
  /** Said when lunch is still to come (on the way in before her hours, on a lunch day). */
  later: 'Stay for lunch, there’s blanquette. Noon, not one minute after.',
  /** Serving. */
  serve: ['There. Rice under, sauce over. Félix did it the other way round, the barbarian.', 'Take more sauce. More. You’re too thin, your mother says so too.'],
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
  /** After the fade: the tart and the coffee. */
  dessert: ['Plum tart. From my plums. Well, the market’s plums, but I stoned them.', 'Coffee? Of course coffee. And a square of chocolate, it’s Sunday.'],
  /** As she clears up. */
  clear: ['Leave it, leave it, I’ll clear. Go and sit in the armchair, you look full.', 'No, you don’t help, you’re the guest. Sit.'],
  /** The envelope, at the end, under the coffee cup. */
  envelope: 'And this is for you. Under the cup. Don’t argue, and don’t tell Gaspard.',
  /** Christmas: her present, wrapped. */
  christmasGift: 'Happy Christmas, love. It’s wrapped in the sports pages. Félix’s trick, I never found better.',
  /** Left on a lunch day without eating: the envelope found in the coat. */
  pocketed: { title: 'Mémé’s envelope', detail: 'In your coat pocket on the way down. “You didn’t eat. Buy yourself a sandwich. Don’t tell Gaspard.”' },
  christmasPresent: { title: 'Mémé’s present', detail: 'An envelope in the sports pages. “For your games. Happy Christmas.”' },
} as const;
