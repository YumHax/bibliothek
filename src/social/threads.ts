import type { PersonId } from './types';

/*
 * Open threads (docs/social.md "What they are waiting for"): what someone is waiting for from the player, in their
 * own words: a promise going ("Bring my parcel up, by Thursday evening"), a need they spoke of ("If you ever find a
 * piano game for my grandson…"), a word they have for the player. The People book lists them, their caption and
 * their body show they have a word (`hasWordFor`: they beckon). Features register where theirs come from.
 */

/** One thread, as the book writes it on a note in their hand. */
export interface Thread {
  person: PersonId;
  /** A promise the player made (a ticket), a need they mentioned (a sticky note), a word they have for the player. */
  kind: 'promise' | 'need' | 'word';
  /** Their words: "Bring my parcel up from the lodge." */
  text: string;
  /** When it is due, in words ("by Thursday evening"), for a promise. */
  due?: string;
  /** The game day it started (newest first in the book). */
  day: number;
}

type ThreadSource = (id: PersonId, day: number) => readonly Thread[];

const sources = new Set<ThreadSource>();

/** Adds where some threads come from (favours, conflicts, gatherings). Returns the removal. */
export function addThreadSource(source: ThreadSource): () => void {
  sources.add(source);
  return () => sources.delete(source);
}

/** `id`'s open threads on `day`, newest first. */
export function threadsOf(id: PersonId, day: number): Thread[] {
  const out: Thread[] = [];
  for (const source of sources) out.push(...source(id, day));
  return out.sort((a, b) => b.day - a.day);
}

/** Whether `id` has a word or a need for the player now (their caption says so, their body beckons). */
export function hasWordFor(id: PersonId, day: number): boolean {
  return threadsOf(id, day).some((t) => t.kind !== 'promise');
}
