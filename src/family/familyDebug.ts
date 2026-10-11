import type { FamilyStory } from './FamilyStory';

/** `?debug`: the debug panel's Now entries for the end of the family's story (docs/grandma.md), as `DebugEvent`s. */
export function familyDebugEvents(family: FamilyStory, day: () => number): { label: string; run(): void }[] {
  return [
    { label: 'Gaspard at Mémé’s table today (needs memory 4 seen; 6 for the reckoning)', run: () => family.debugGaspardToday(day()) },
    { label: 'Mémé tells where the Christmas Game Boy went (next visit; needs memory 6 seen)', run: () => family.debugGameBoyTrail() },
    { label: 'The Christmas Game Boy home, to give back to Mémé', run: () => family.debugGameBoyHome() },
    { label: 'Mémé comes to see the flat as soon as you are home', run: () => family.debugVisitToday(day()) },
  ];
}
