import { findPerson } from './people';
import { moodOf } from './mood';
import { standing } from './standing';
import { tierInfo, tierOf } from './tiers';
import type { PersonId } from './types';
import { capitalise } from '@/text/strings';

/** How the hover caption says a mood worth knowing before going up to them (a fine one says nothing). */
const MOOD_WORDS = { good: 'in a good mood', low: 'feeling low', annoyed: 'annoyed' } as const;

/*
 * The hover caption of someone the player can talk to (docs/social.md "Clarity"): their name once met (their
 * role before), how you stand in a word, their mood when it is worth knowing, then the verb:
 * "Mrs Dubois · Friend · annoyed · talk".
 */
export function socialCaption(id: PersonId, verb = 'talk', clock?: { day: number; hour: number }): string {
  const card = findPerson(id);
  if (!card) return verb;
  const s = standing(id);
  if (s.met === null) return `${capitalise(card.role)} · ${verb}`;
  const tier = tierInfo(tierOf(s.warmth, s.trust));
  const mood = clock ? moodOf(id, clock.day, clock.hour).mood : 'fine';
  return `${card.short ?? card.name} · ${tier.name}${mood === 'fine' ? '' : ` · ${MOOD_WORDS[mood]}`} · ${verb}`;
}
