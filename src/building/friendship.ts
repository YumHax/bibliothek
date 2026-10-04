import { personAtDoor } from '@/social/people';
import { lastCounted as lastCountedFor, nudge, warmth } from '@/social/standing';

/*
 * The residents' friendship by their door's key (`stairwell/building.doorKey(k, i)`), as the building's systems
 * have always asked it: now the warmth of the social layer (`social/standing`, docs/social.md), read and nudged
 * through whoever lives behind that door. A door nobody is known behind reads 0 and nudges nothing.
 */

/** At or under this warmth, a resident is cross with the player (a curt hello, no invitation). */
export const COLD = -15;

/** The warmth of whoever lives behind door `key` (0 when nobody known does). */
export function friendship(key: string): number {
  const id = personAtDoor(key);
  return id ? warmth(id) : 0;
}

/**
 * Raises (or lowers, `amount` < 0) the warmth of whoever lives behind `key`. With `reason` and `day` (the game day),
 * the same reason counts once a day only. Returns whether it counted.
 */
export function befriend(key: string, amount: number, reason?: string, day?: number): boolean {
  const id = personAtDoor(key);
  if (!id) return false;
  const why = amount >= 0 ? WHY[reason ?? ''] ?? 'appreciated it' : WHY_NOT[reason ?? ''] ?? 'was put out';
  return nudge(id, { warmth: amount, trust: amount >= 10 ? 2 : 0, reason, day: day ?? 0, why, gossip: Math.abs(amount) >= 6 }) !== null || reason === undefined;
}

/** The game day `reason` last counted for whoever lives behind `key`, or null. */
export function lastCounted(key: string, reason: string): number | null {
  const id = personAtDoor(key);
  return id ? lastCountedFor(id, reason) : null;
}

/** The chip's words for the building's own reasons. */
const WHY: Record<string, string> = {
  knock: 'liked the knock on the door',
  swap: 'happy with the swap',
  chat: 'enjoyed the chat',
  watch: 'liked watching their game together',
  cat: 'brought the cat back',
  partyChat: 'enjoyed the party chat',
  partySale: 'liked the game you sold them',
  partyTournament: 'enjoyed the tournament',
};
const WHY_NOT: Record<string, string> = {
  noise: 'kept awake by your noise',
  escalated: 'heard the syndic had to step in',
};
