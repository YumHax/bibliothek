import type { HaggleVoice } from '@/economy/haggle';
import { findPerson } from '@/social/people';
import type { PersonId } from '@/social/types';

/**
 * The voice a seller haggles in (`economy/haggleLines`), from their character: proud or businesslike ones barely bend,
 * grumpy ones grumble, shy ones apologise, chatty, funny or generous ones warm to it. A seller with no card speaks plainly.
 */
export function haggleVoice(id: PersonId | undefined): HaggleVoice {
  const traits = (id && findPerson(id)?.traits) || [];
  if (traits.includes('grumpy')) return 'gruff';
  if (traits.includes('shy')) return 'shy';
  if (traits.includes('proud') || traits.includes('businesslike')) return 'proud';
  if (traits.includes('chatty') || traits.includes('funny') || traits.includes('generous')) return 'warm';
  return 'plain';
}
