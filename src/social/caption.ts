import { findPerson } from './people';
import { standing } from './standing';
import { tierInfo, tierOf } from './tiers';
import type { PersonId } from './types';
import { capitalise } from '@/text/strings';

/*
 * The hover caption of someone the player can talk to (docs/social.md "Clarity"): their name once met (their
 * role before), their tier's glyph and name, then the verb: "Mrs Dubois · ♥ Friend · talk".
 */
export function socialCaption(id: PersonId, verb = 'talk'): string {
  const card = findPerson(id);
  if (!card) return verb;
  const s = standing(id);
  if (s.met === null) return `${capitalise(card.role)} · ${verb}`;
  const tier = tierInfo(tierOf(s.warmth, s.trust));
  return `${card.short ?? card.name} · ${tier.glyph} ${tier.name} · ${verb}`;
}

