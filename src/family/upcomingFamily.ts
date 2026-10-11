import type { Upcoming } from '@/journal/upcoming';
import { EPILOGUE_TALK } from '@/grandma/epilogueLines';
import type { FamilyStory } from './FamilyStory';

/** The journal's line about the family's story (docs/grandma.md "The end of the story"): Mémé's Saturday at the flat, once planned. */
export function upcomingFamily(family: FamilyStory, day: number): Upcoming[] {
  const planned = family.visitDay;
  if (planned === null || planned < day) return [];
  return [{ kind: 'social', text: EPILOGUE_TALK.upcoming, inDays: planned - day }];
}
