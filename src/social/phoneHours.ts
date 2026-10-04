import { findPerson, shortName } from './people';

/*
 * When people pick up the phone (docs/social.md "The phone"): 8:00 to 22:00, a night owl from 11:00 till 1:00,
 * an early bird from 6:30 till 21:00. Out of their hours the phone rings out.
 */

/** Null when `id` picks up at game hour `hour`, else why not (the phone's line). */
export function phoneRefusal(id: string, hour: number): string | null {
  const traits = findPerson(id)?.traits ?? [];
  const [from, to] = traits.includes('nightOwl') ? [11, 25] : traits.includes('earlyBird') ? [6.5, 21] : [8, 22];
  // Hours past midnight count on from 24 (a night owl's 0:30 is 24.5).
  const at = hour < 6 ? hour + 24 : hour;
  if (at >= from && at < to) return null;
  const name = shortName(id);
  return at < from ? `It rings and rings. ${name} isn’t up yet.` : `${name} doesn’t pick up: it’s late, they’ll be asleep.`;
}

/** The phone book's note on whether `id` picks up now. */
export function phoneNote(id: string, hour: number): string {
  return phoneRefusal(id, hour) === null ? 'picks up' : 'not now';
}
