import type { GrandmaRituals } from './GrandmaRituals';

/** `?debug`: the debug panel's Now entries for Mémé's ways (docs/grandma.md "Sunday lunch, recipes and favours"). */
export function ritualsDebugEvents(rituals: GrandmaRituals): { label: string; run(): void }[] {
  return [
    { label: 'Mémé: lunch again today, a favour on the next visit', run: () => rituals.debugAgain() },
    { label: 'Mémé: every recipe taught', run: () => rituals.debugLearnAll() },
    { label: 'Mémé: her ways as on the first day', run: () => rituals.debugReset() },
    { label: 'Mémé: her birthday today', run: () => rituals.debugForce('birthday') },
    { label: 'Mémé: Christmas today (the tree, lunch)', run: () => rituals.debugForce('christmas') },
    { label: 'Mémé: All Saints today', run: () => rituals.debugForce('allSaints') },
    { label: 'Mémé: the calendar’s occasions again', run: () => rituals.debugForce(null) },
  ];
}
