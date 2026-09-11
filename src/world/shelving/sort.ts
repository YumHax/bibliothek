import type { Game } from '@/catalog/types';
import { PLATFORMS } from '@/catalog/platforms';

export type SortMode = 'platform' | 'year' | 'title';

export const SORT_MODES: readonly SortMode[] = ['platform', 'year', 'title'];

export function nextSortMode(mode: SortMode): SortMode {
  return SORT_MODES[(SORT_MODES.indexOf(mode) + 1) % SORT_MODES.length];
}

/** Title without a leading article so "The Legend of Zelda" files under L. */
function sortTitle(game: Game): string {
  return game.title.replace(/^(the|a|an|le|la|les)\s+/i, '');
}

function year(game: Game): number {
  const y = game.releaseDate ? Number.parseInt(game.releaseDate.slice(0, 4), 10) : Number.NaN;
  return Number.isFinite(y) ? y : Number.MAX_SAFE_INTEGER; // unknown dates go last
}

const platformOrder = Object.keys(PLATFORMS);

function platformRank(game: Game): number {
  const i = platformOrder.indexOf(game.platform);
  return i === -1 ? platformOrder.length : i;
}

const byTitle = (a: Game, b: Game) => sortTitle(a).localeCompare(sortTitle(b), undefined, { sensitivity: 'base', numeric: true });

const COMPARATORS: Record<SortMode, (a: Game, b: Game) => number> = {
  platform: (a, b) => platformRank(a) - platformRank(b) || byTitle(a, b),
  year: (a, b) => year(a) - year(b) || byTitle(a, b),
  title: byTitle,
};

export function sortGames(games: readonly Game[], mode: SortMode): Game[] {
  return [...games].sort(COMPARATORS[mode]);
}

/**
 * Rows never mix two groups: when sorting by platform each row holds one platform,
 * when sorting by year each row holds one decade. Title order flows freely.
 */
export function rowGroupKey(game: Game, mode: SortMode): string {
  switch (mode) {
    case 'platform':
      return game.platform;
    case 'year':
      return String(Math.floor(year(game) / 10));
    case 'title':
      return '';
  }
}
