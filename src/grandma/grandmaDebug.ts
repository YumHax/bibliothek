import type { GrandmaVisits } from './GrandmaVisits';

/** `?debug`: the debug panel's Now entries for Mémé (docs/checks.md "Debug mode"), as `DebugEvent`s. */
export function grandmaDebugEvents(grandma: GrandmaVisits): { label: string; run(): void }[] {
  return [
    { label: 'Mémé as on the first day (no visit, no memory)', run: () => grandma.debugReset() },
    { label: 'Mémé: every memory ready in the album', run: () => grandma.debugEveryMemory() },
    { label: 'Mémé: every memory already seen', run: () => grandma.debugSeeAll() },
    { label: 'Mémé: the Sunday envelope again', run: () => grandma.debugSundayAgain() },
  ];
}
