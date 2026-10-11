import { dayKey } from '@/economy/calendar';
import { fnv1a, frozenRng, lcg, type Rng } from '@/random';

/*
 * The draws a day makes, one convention for the whole game (the only place a day seeds a stream). Two days exist:
 * - the REAL day (the player's local date, `dayKey`): the weather, the parked cars, the arcade's challenge;
 *   the same for everyone playing that date, and across reloads (Front Street's events and finds follow the game day:
 *   `time/streetDay`);
 * - the GAME day (`Today.gameDay`, the market's count, 10 real minutes of play each): the market's
 *   stock, themes and events, the mail, visits, the trader's pick.
 * A feature says which it follows by calling the matching helper. The seeds are the strings every
 * draw has always used (`${topic}:${day}`), so saves and today's draws are unchanged. Two older forms stay for
 * what was always drawn with them: `dayStream` (the economy's text seeds, `${day}:stock`) and `dayLcg` (a
 * number, `day * 7919 + 17`); a new draw takes `gameDayRandom` or `dailyRandom`.
 */

/** The seed of `topic` on the real day `date`. */
export function dailySeed(topic: string, date: Date = new Date()): number {
  return fnv1a(`${topic}:${dayKey(date)}`);
}

/** A random stream (0..1) for `topic`, the same all the real day `date`. */
export function dailyRandom(topic: string, date: Date = new Date()): () => number {
  return lcg(dailySeed(topic, date));
}

/** A random stream (0..1) for `topic`, the same all game day `day`. */
export function gameDayRandom(topic: string, day: number): () => number {
  return lcg(fnv1a(`${topic}:${day}`));
}

/**
 * The economy's frozen stream of a day draw seeded by text (`${day}:stock`, `cake:${plan.id}:${day}`): the text
 * is the seed every saved day was drawn with, so a caller keeps it as written.
 */
export function dayStream(seed: string): Rng {
  return frozenRng(seed);
}

/** The frozen LCG of a day draw seeded by number (`day * 7919 + 17`), kept for what was always drawn so. */
export function dayLcg(seed: number): Rng {
  return lcg(seed);
}
