import { findPerson, shortName } from './people';

/*
 * When people are up and pick up the phone (docs/social.md "The phone"): 8:00 to 22:00, a night owl from 11:00 till
 * 1:00, an early bird from 6:30 till 21:00. Out of their hours they are asleep: the phone rings out. Whoever is at
 * work does not pick up either (`phoneCalls.phoneState`, which reads `whereNow`).
 */

/** The hours `id` is up, from .. to (past midnight counts on from 24: a night owl's 1:00 is 25). */
export function phoneHours(id: string): { from: number; to: number } {
  const traits = findPerson(id)?.traits ?? [];
  const [from, to] = traits.includes('nightOwl') ? [11, 25] : traits.includes('earlyBird') ? [6.5, 21] : [8, 22];
  return { from, to };
}

/** Null when `id` is up at game hour `hour`, else why they don't pick up (the phone's line). */
export function phoneRefusal(id: string, hour: number): string | null {
  const { from, to } = phoneHours(id);
  // Hours past midnight count on from 24 (a night owl's 0:30 is 24.5).
  const at = hour < 6 ? hour + 24 : hour;
  if (at >= from && at < to) return null;
  const name = shortName(id);
  return at < from ? `It rings and rings. ${name} isn’t up yet.` : `${name} doesn’t pick up: it’s late, they’ll be asleep.`;
}
