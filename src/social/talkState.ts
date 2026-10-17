import type { PersonId } from './types';

/*
 * Whether a conversation is open, and with whom (docs/social.md "Talking"): the conversation panel says so
 * (`setTalking`); what must not happen mid-conversation waits for its end (a tier's banner and its scene,
 * `onTalkEnd`).
 */

let current: PersonId | null = null;
const ends = new Set<(id: PersonId) => void>();

/** The panel opened a conversation with `id`, or (null) closed it. */
export function setTalking(id: PersonId | null): void {
  const was = current;
  current = id;
  if (was && id === null) for (const cb of [...ends]) cb(was);
}

/** Who the player is talking to now, or null. */
export function talkingWith(): PersonId | null {
  return current;
}

/** Hears every conversation's end (with whom). Returns the unsubscribe. */
export function onTalkEnd(cb: (id: PersonId) => void): () => void {
  ends.add(cb);
  return () => ends.delete(cb);
}
