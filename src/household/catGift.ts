import type { Game } from '@/catalog/types';
import { seeded } from '@/economy/seeded';
import type { CatGift } from './Household';
import { HOUSEHOLD } from './rules';

/**
 * What the cat will leave by its kitchen bowl after a treat on market day `day`, or null: now and
 * then the booklet of a game on the shelves that lacks one (it was behind the sofa all along),
 * else a few coins from under the cushions. Seeded by the day, so a reload does not reroll it.
 */
export function drawCatGift(day: number, shelved: readonly Game[]): CatGift | null {
  const random = seeded(`catGift:${day}`);
  const { giftChance, manualChance, coins } = HOUSEHOLD.treat;
  if (random() >= giftChance) return null;
  const lacking = shelved.filter((g) => (g.status ?? 'owned') === 'owned' && g.condition === 'noManual' && !g.repro);
  if (lacking.length && random() < manualChance) {
    const game = lacking[Math.floor(random() * lacking.length)]!;
    return { kind: 'manual', gameId: game.id, title: game.title };
  }
  return { kind: 'coins', coins: coins[0] + Math.floor(random() * (coins[1] - coins[0] + 1)) };
}
