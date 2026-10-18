import { inHours } from '@/time/clock';
import { gameDays, SCHEDULES, type Schedule } from '@/time/schedule';
import { weekdayOf } from '@/time/wakefulness';
import { gameDayRandom } from '@/time/daily';
import { pick } from '@/random';
import { STREET_SHOPS } from './rules';

/*
 * Front Street's two named bars, each its own (docs/economy.md "Front Street's shops and finds"): THE ANCHOR is the
 * music pub (the jukebox, the band posters, and on Thursday nights Lou's band on the little stage at the back), THE
 * LOCAL the regulars' pub (the match on the telly, the dartboard every evening, the quiz on Tuesday nights). The
 * other bars along the street keep the plain bar's lines.
 */

/** Which of the two a bar is, by the name on its fascia; null for another bar. */
type BarId = 'anchor' | 'local';

export function barOf(name: string | undefined): BarId | null {
  return name === 'THE ANCHOR' ? 'anchor' : name === 'THE LOCAL' ? 'local' : null;
}

/** What each says when the player looks in, one line after another. */
export const BAR_LOOKS: Readonly<Record<BarId, readonly string[]>> = {
  anchor: [
    'The jukebox plays something with too much bass. A ship’s wheel over the bar, band posters everywhere.',
    'A poster by the door: LIVE ON THURSDAYS. Under it, in biro: “the bassist is the barista from the Sunny Side”.',
    'The barman is restringing a guitar behind the taps. “Thursday, you coming?”',
  ],
  local: [
    'The regulars look up, then back at the match.',
    'A chalkboard: QUIZ NIGHT TUESDAY. Under it, last week’s winners: THE USUAL SUSPECTS. Again.',
    'Somebody at the back hits a double twenty and the whole bar groans.',
  ],
};

/** THE ANCHOR's gig: Thursday nights. In the book for "what's on" (`events/whatsOnItems` may read it). */
export const ANCHOR_GIG: Schedule = SCHEDULES.register(gameDays('anchorGig', (day) => weekdayOf(day) === STREET_SHOPS.gig.weekday, { hours: [STREET_SHOPS.gig.from, STREET_SHOPS.gig.to] }));

/** THE LOCAL's quiz: Tuesday nights. In the book for "what's on". */
export const LOCAL_QUIZ: Schedule = SCHEDULES.register(gameDays('localQuiz', (day) => weekdayOf(day) === STREET_SHOPS.quiz.weekday, { hours: [STREET_SHOPS.quiz.from, STREET_SHOPS.quiz.to] }));

/** Whether Lou's band is on at THE ANCHOR at `hours` of game `day`. */
export function gigOn(day: number, hours: number): boolean {
  const { gig } = STREET_SHOPS;
  return ANCHOR_GIG.isDay(day) && inHours(hours, [gig.from, gig.to]);
}

/** Whether THE LOCAL's quiz is on at `hours` of game `day`. */
export function quizOn(day: number, hours: number): boolean {
  const { quiz } = STREET_SHOPS;
  return LOCAL_QUIZ.isDay(day) && inHours(hours, [quiz.from, quiz.to]);
}

/** Whether THE LOCAL's dartboard is free at `hours` (the evening, but not while the quiz has the room). */
export function dartsOpen(day: number, hours: number): boolean {
  return inHours(hours, [STREET_SHOPS.darts.from, 24]) && !quizOn(day, hours);
}

/** Tonight's checkout on THE LOCAL's chalkboard: what a go of three darts has to take to nought, the same all night. */
export function tonightsCheckout(day: number): number {
  return pick(gameDayRandom('darts.checkout', day), STREET_SHOPS.darts.checkouts);
}

/** What checking `checkout` out pays: the longer the finish, the more. */
export function checkoutPrize(checkout: number): number {
  const { prizes } = STREET_SHOPS.darts;
  return (prizes.find((p) => checkout <= p.upTo) ?? prizes[prizes.length - 1]!).coins;
}

/** The set Lou's band plays, a few songs a night, and what the night was like. */
export const GIG_SETS: readonly { songs: readonly string[]; night: string }[] = [
  { songs: ['a slowed-down cover of the Tetris theme', 'something of their own called “Continue?”', 'the Mario underground tune, on bass alone'], night: 'Twelve people, a dog, and a lot of noise. Lou winked at you from the stage.' },
  { songs: ['a punk version of the Zelda overworld', 'a ballad nobody asked for', 'the Sonic Green Hill Zone, far too fast'], night: 'The drummer lost a stick in the second song and carried on with a spoon.' },
  { songs: ['their one hit, “Insert Coin”', 'a medley of boss music', 'the Street Fighter Guile theme, which goes with everything'], night: 'Someone at the bar shouted for an encore. It was the barman.' },
];
