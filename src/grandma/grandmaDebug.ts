import type { GrandmaVisits } from './GrandmaVisits';
import type { GrandmaHints } from './GrandmaHints';
import type { AlbumFinds } from './AlbumFinds';
import type { GrandmaPresence } from './GrandmaPresence';
import { memePastimes } from './pastimes';
import type { Keepsakes } from './Keepsakes';
import type { BreadErrand } from './breadErrand';
import type { SharedRide } from './sharedRide';
import type { Game } from '@/catalog/types';
import { FELIX_LOTS } from '@/economy/felixLots';
import { canonicalGameId } from '@/catalog';

/** `?debug`: the debug panel's Now entries for Mémé (docs/checks.md "Debug mode"), as `DebugEvent`s. */
export function grandmaDebugEvents(grandma: GrandmaVisits): { label: string; run(): void }[] {
  return [
    { label: 'Mémé as on the first day (no visit, no memory)', run: () => grandma.debugReset() },
    { label: 'Mémé: every memory ready in the album', run: () => grandma.debugEveryMemory() },
    { label: 'Mémé: every memory already seen', run: () => grandma.debugSeeAll() },
    { label: 'Mémé: the Sunday envelope again', run: () => grandma.debugSundayAgain() },
    // docs/grandma.md "Things to do with her".
    { label: 'Mémé: the quiz, the crossword and the wool open again today', run: () => memePastimes().debugAgain(false) },
    { label: 'Mémé: one more go at the wool and the scarf is done', run: () => memePastimes().debugAgain(true) },
  ];
}

/** `?debug`: the album's other photos (docs/grandma.md "The album's other photos"): every snapshot found, or none. */
export function albumDebugEvents(finds: AlbumFinds): { label: string; run(): void }[] {
  return [
    { label: 'Mémé’s album: every snapshot found', run: () => finds.debugFindAll() },
    { label: 'Mémé’s album: no snapshot found yet', run: () => finds.debugReset() },
  ];
}

/** `?debug`: her own memory of the player (docs/grandma.md "Her presence"): stories and news afresh, Gaspard free to ring. */
export function presenceDebugEvents(presence: GrandmaPresence): { label: string; run(): void }[] {
  return [
    { label: 'Mémé: her stories and the news told afresh', run: () => presence.debugReset() },
    { label: 'Mémé: Gaspard may ring at the next visit', run: () => presence.debugGaspard() },
  ];
}

/** `?debug`: her ring on the bedroom's phone and her letter in the post, now (docs/grandma.md "Hints toward the next memory"). */
export function grandmaHintDebugEvents(hints: GrandmaHints): { label: string; run(): void }[] {
  return [
    { label: 'Mémé rings the bedroom’s phone now (a memory made ready)', run: () => hints.debugRing() },
    { label: 'Mémé’s letter in the next post (a memory made ready)', run: () => hints.debugLetter() },
  ];
}

/**
 * `?debug`: what the memories leave behind (docs/grandma.md "What the memories leave behind"): every keepsake on Félix's
 * shelf; the debug collection's copies of his lots made his (his sticker), so "Lot … is home!" can be told at hers;
 * every lot but the first told (telling it brings the stickers).
 */
export function keepsakeDebugEvents(keepsakes: Keepsakes, collection: { owns(id: string): boolean; update(id: string, patch: Partial<Omit<Game, 'id'>>): void }): { label: string; run(): void }[] {
  return [
    { label: 'Mémé: every keepsake given (Félix’s shelf full)', run: () => keepsakes.debugGiveAll() },
    {
      label: 'Félix’s lots: the owned copies of his lots made his',
      run: () => {
        for (const lot of FELIX_LOTS) if (collection.owns(canonicalGameId(lot.id))) collection.update(canonicalGameId(lot.id), { felixLot: lot.lot });
      },
    },
    { label: 'Mémé: every lot told home but the first, or none again', run: () => keepsakes.debugTold() },
  ];
}

/** `?debug`: Linden Avenue round her flat (docs/grandma.md "Around her flat"): her bread asked for, her on the next 38. */
export function lindenDebugEvents(bread: BreadErrand, ride: SharedRide, day: () => number): { label: string; run(): void }[] {
  return [
    { label: 'Mémé: she wants a baguette from Lebrun’s', run: () => bread.askNow(day()) },
    { label: 'Mémé: on the next 38 to hers with the player', run: () => ride.forceNext(day()) },
  ];
}
