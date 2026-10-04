import type { HomeShop } from '@/economy/homeGoods';
import { discountToday } from '../conversation';
import { effectValue } from '../perks';
import { countedToday, nudge } from '../standing';
import type { PersonId } from '../types';

/*
 * What Front Street's people do for the player (docs/social.md "Front Street and the arcade"): the walk-in shops'
 * prices by how the player stands with the clerk (a discount from Friendly, a markup from Cold), the discount talked
 * out of them today (`askDiscount`: 10% at the till, once), and the once-a-day gifts (a free coffee, a pouch of
 * treats, a free credit). Home goods are never sold back, so a discount cannot make buying to sell pay.
 */

/** Who stands behind each walk-in shop's counter. */
const SHOP_CLERKS: Partial<Record<HomeShop, PersonId>> = {
  furniture: 'clerk-furniture',
  electronics: 'clerk-tv',
  pets: 'clerk-pets',
  florist: 'clerk-florist',
};

/** Today's discount talked out of a clerk (`askDiscount` landed): this much off at the till, once. */
const TALKED_DOWN = 0.9;

/** The clerk of `shop`, or null (the market's household stall, the agency). */
export function clerkOf(shop: HomeShop): PersonId | null {
  return SHOP_CLERKS[shop] ?? null;
}

/** The factor on `shop`'s prices from how the player stands with its clerk: under 1 a discount, over 1 a markup. */
export function shopFactor(shop: HomeShop): number {
  const clerk = clerkOf(shop);
  if (!clerk) return 1;
  return effectValue(clerk, 'discount', 1) * effectValue(clerk, 'markup', 1);
}

/** Whether the discount talked out of `shop`'s clerk today is still to be used at the till. */
function talkedDown(shop: HomeShop, day: number): boolean {
  const clerk = clerkOf(shop);
  return !!clerk && discountToday(clerk, day) && !countedToday(clerk, 'discountUsed', day);
}

/** The factor at `shop`'s till on `day`: the standing's, and today's discount on top while it is unused. */
export function tillFactor(shop: HomeShop, day: number): number {
  return shopFactor(shop) * (talkedDown(shop, day) ? TALKED_DOWN : 1);
}

/** `base` coins at `factor`, rounded, never under 1 (a free piece stays free). */
export function priced(base: number, factor: number): number {
  return base <= 0 ? base : Math.max(1, Math.round(base * factor));
}

/** A piece was bought at `shop`'s till on `day`: today's talked-down discount is spent. */
export function spendTalkedDown(shop: HomeShop, day: number): void {
  const clerk = clerkOf(shop);
  if (clerk && talkedDown(shop, day)) nudge(clerk, { reason: 'discountUsed', day });
}

/** True (and marked) the first time `reason` is asked of `id` on `day`: a free coffee, a pouch of treats. */
export function onceToday(id: PersonId, reason: string, day: number): boolean {
  if (countedToday(id, reason, day)) return false;
  nudge(id, { reason, day });
  return true;
}

/** Whether `reason` was used with `id` on `day` already. */
export function usedToday(id: PersonId, reason: string, day: number): boolean {
  return countedToday(id, reason, day);
}
