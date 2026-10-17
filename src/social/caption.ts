import { knowsBirthday } from './life/birthdays';
import { findPerson } from './people';
import { isBirthday, moodOf } from './mood';
import { standing } from './standing';
import { hasWordFor } from './threads';
import { tierInfo, tierName, tierOf } from './tiers';
import type { PersonId, TierId } from './types';
import { capitalise } from '@/text/strings';

/** How the hover caption says a mood worth knowing before going up to them (a fine one says nothing). */
const MOOD_WORDS = { good: 'in a good mood', low: 'feeling low', annoyed: 'annoyed' } as const;

/*
 * The hover caption of someone the player can talk to (docs/social.md "Before talking"): their name once met (their
 * role before), how you stand in a word (`tierName`: a clerk reads on the short ladder), their state when it is worth
 * knowing before going up to them (a mood and why, their birthday, a word they have for the player), then the verb:
 * "Mrs Dubois · Friend · annoyed (the power cut) · talk". The Overlay draws a known person's caption on two lines with
 * their face (`personCaption`); anywhere else it reads as the usual "Name · verb".
 */

/** What the Overlay draws of a known person's caption: their face and tier, the state on a second line. */
interface PersonCaption {
  id: PersonId;
  name: string;
  tier: TierId;
  /** The tier's word for them, and its colour. */
  word: string;
  colour: string;
  /** Their state now, in words, or null. */
  state: string | null;
}

/** The captions made lately, by the part that names the person ("Mrs Dubois · Friend · annoyed"). */
const recent = new Map<string, PersonCaption>();
const RECENT = 48;

export function socialCaption(id: PersonId, verb = 'talk', clock?: { day: number; hour: number }): string {
  const card = findPerson(id);
  if (!card) return verb;
  const s = standing(id);
  if (s.met === null) return `${capitalise(card.role)} · ${verb}`;
  const tier = tierOf(s.warmth, s.trust);
  const name = card.short ?? card.name;
  const word = tierName(tier, id);
  let state: string | null = null;
  if (clock) {
    if (isBirthday(id, clock.day) && knowsBirthday(id)) state = 'birthday today';
    else if (hasWordFor(id, clock.day)) state = 'has a word for you';
    else {
      const { mood, why } = moodOf(id, clock.day, clock.hour);
      if (mood !== 'fine') state = why ? `${MOOD_WORDS[mood]} (${why})` : MOOD_WORDS[mood];
    }
  }
  const head = `${name} · ${word}${state ? ` · ${state}` : ''}`;
  // Refreshed each time (a light person's word covers two tiers: the same words, another ring), and kept most recent.
  recent.delete(head);
  if (recent.size >= RECENT) recent.delete(recent.keys().next().value!);
  recent.set(head, { id, name, tier, word, colour: tierInfo(tier).colour, state });
  return `${head} · ${verb}`;
}

/**
 * The person a caption names, when it is one `socialCaption` made (alone, or after a place's name: "Café · Lou ·
 * Regular · coffee and a chat"), with where their part starts and ends in it; else null.
 */
export function personCaption(text: string): { person: PersonCaption; start: number; end: number } | null {
  let best: { person: PersonCaption; start: number; end: number } | null = null;
  for (const [head, person] of recent) {
    const start = text.indexOf(head);
    // The part must be whole: at the start or after a separator, and followed by one.
    if (start < 0 || (start > 0 && text.slice(start - 3, start) !== ' · ') || text.slice(start + head.length, start + head.length + 3) !== ' · ') continue;
    if (!best || head.length > best.end - best.start) best = { person, start, end: start + head.length };
  }
  return best;
}
