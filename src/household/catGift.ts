import type { Game } from '@/catalog/types';
import type { CatGift } from './Household';
import { HOUSEHOLD } from './rules';
import { dayStream } from '@/time/daily';

/**
 * What the cat will leave by its kitchen bowl after a treat on market day `day`, or null: now and
 * then the booklet of a game on the shelves that lacks one (it was under the bed all along),
 * else a few coins from under the armchair. Seeded by the day, so a reload does not reroll it.
 */
export function drawCatGift(day: number, shelved: readonly Game[]): CatGift | null {
  const random = dayStream(`catGift:${day}`);
  const { giftChance, manualChance, coins } = HOUSEHOLD.treat;
  if (random() >= giftChance) return null;
  const lacking = shelved.filter((g) => (g.status ?? 'owned') === 'owned' && g.condition === 'noManual' && !g.repro);
  if (lacking.length && random() < manualChance) {
    const game = lacking[Math.floor(random() * lacking.length)]!;
    return { kind: 'manual', gameId: game.id, title: game.title };
  }
  return { kind: 'coins', coins: coins[0] + Math.floor(random() * (coins[1] - coins[0] + 1)) };
}
