import { dayKey } from '@/economy/calendar';
import { hashString, seededRandom } from '@/graphics/canvas';

/*
 * The draws a day makes, one convention for the whole game. Two days exist:
 * - the REAL day (the player's local date, `dayKey`): street events, finds, daily tallies, the
 *   arcade's challenge; the same for everyone playing that date, and across reloads;
 * - the GAME day (`Today.gameDay`, the market's count, 10 real minutes of play each): the market's
 *   stock, themes and events, the mail, visits, the trader's pick.
 * A feature says which it follows by calling the matching helper. The seeds are the strings every
 * draw has always used (`${topic}:${day}`), so saves and today's draws are unchanged.
 */

/** The seed of `topic` on the real day `date`. */
export function dailySeed(topic: string, date: Date = new Date()): number {
  return hashString(`${topic}:${dayKey(date)}`);
}

/**
 * Whether a one-day-in-`oneIn` event of `topic` falls on the real day `date`. `phase` picks which
 * day of the cycle (two events drawn alike but on different days).
 */
export function isEventDay(topic: string, oneIn: number, { date = new Date(), phase = 0 }: { date?: Date; phase?: number } = {}): boolean {
  return dailySeed(topic, date) % oneIn === phase % oneIn;
}

/** A random stream (0..1) for `topic`, the same all the real day `date`. */
export function dailyRandom(topic: string, date: Date = new Date()): () => number {
  return seededRandom(dailySeed(topic, date));
}

/** A random stream (0..1) for `topic`, the same all game day `day`. */
export function gameDayRandom(topic: string, day: number): () => number {
  return seededRandom(hashString(`${topic}:${day}`));
}
