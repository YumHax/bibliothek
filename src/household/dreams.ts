import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { hash01 } from '@/economy/seeded';
import type { StockItem, StockSource } from '@/economy/StockItem';
import { HOUSEHOLD } from './rules';

/** A night's dream: one of the morning's copies, half remembered. */
export interface Dream {
  game: Game;
  /** Where it lay in the dream ("in the bargain bin", "on the NES stall"). */
  where: string;
  /** What the dream felt like, one line. */
  line: string;
}

/** What is worth dreaming of, best first: a grail, a wishlist game, a famous game from an estate, the bin's gem, a stall's pride. */
const WORTH: Partial<Record<StockSource, number>> = { grail: 0, wanted: 1, estate: 2, bin: 3, showpiece: 4 };

/**
 * Whether the night before market day `day` brings a dream (`HOUSEHOLD.dreamChance`, seeded by the
 * day), and of what among the morning's stock (`items`: what is on the stalls today, the owned
 * copies left out): the most remarkable copy. Null for a dreamless night.
 */
export function dreamOf(day: number, items: readonly StockItem[]): Dream | null {
  if (hash01(`dream:${day}`) >= HOUSEHOLD.dreamChance) return null;
  const worth = (item: StockItem) => (item.source === 'bin' && !item.gem ? undefined : WORTH[item.source]);
  const ranked = items.filter((item) => worth(item) !== undefined).sort((a, b) => worth(a)! - worth(b)!);
  const best = ranked[0];
  if (!best) return null;
  const tied = ranked.filter((item) => worth(item) === worth(best));
  const item = tied[Math.floor(hash01(`dream-pick:${day}`) * tied.length)]!;
  const where = item.source === 'bin' ? 'in the bargain bin, under a pile of sports games' : `on the ${getPlatform(item.game.platform).shortName} stall`;
  const line = item.source === 'grail' ? 'The whole hall had gone quiet around it.'
    : item.source === 'wanted' ? 'You had been looking for it for ages, and there it was.'
    : item.source === 'bin' ? 'Nobody else had seen it.'
    : 'The stallholder was polishing the box and smiling.';
  return { game: item.game, where, line };
}
