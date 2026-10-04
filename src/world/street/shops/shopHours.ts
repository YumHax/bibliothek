import type { ShopKind } from '../streetPlan';
import { inHours } from '@/time/clock';
import { clockShort } from '@/text/clock';
import { capitalise } from '@/text/strings';

/** When a shop is open, in game hours: from `open` to `close` (past 24 means after midnight: 25 = 1:00). */
interface ShopHours {
  open: number;
  close: number;
}

/**
 * Opening hours by kind of shop, every day alike: the bakery at dawn, the bars till late, the
 * arcade never shut, the flat's shops (furniture, TV repair, pets, the florist) from 9:00 to 21:00, RETRO GAMES (and the flea market behind it) from 8:00 to 23:00. A `shut` shop
 * never opens. Its roller shutter, its window light, its sounds and its door all follow this.
 */
export const SHOP_HOURS: Record<ShopKind, ShopHours | null> = {
  bakery: { open: 6.5, close: 19.5 },
  cafe: { open: 7, close: 20 },
  pharmacy: { open: 8.5, close: 19.5 },
  books: { open: 9.5, close: 19 },
  grocer: { open: 8, close: 20.5 },
  florist: { open: 9, close: 21 },
  tabac: { open: 7, close: 21 },
  bar: { open: 11, close: 26 },
  butcher: { open: 8, close: 19 },
  laundry: { open: 7, close: 23 },
  retro: { open: 8, close: 23 },
  arcade: { open: 0, close: 24 },
  // The flat's shops (docs/economy.md "The bare flat") stay open into the evening: the whole flat is bought there.
  furniture: { open: 9, close: 21 },
  electronics: { open: 9, close: 21 },
  pets: { open: 9, close: 21 },
  shut: null,
};

/** Whether a shop of `kind` is open at `hours` (0 ≤ hours < 24): its span, past midnight included (`time/clock`). */
export function isShopOpen(kind: ShopKind, hours: number): boolean {
  const h = SHOP_HOURS[kind];
  return h !== null && inHours(hours, { from: h.open, to: h.close });
}

/**
 * Why RETRO GAMES' door (and the flea market behind it) will not open at `hours`: its caption and
 * the hint on a click, or null while it is open. The arcade never shuts.
 */
export function retroShutNotice(hours: number): { label: string; hint: string } | null {
  if (isShopOpen('retro', hours)) return null;
  const opens = clockShort(SHOP_HOURS.retro?.open ?? 8);
  return { label: `RETRO GAMES is closed · opens at ${opens}`, hint: `RETRO GAMES is shut for the night, and the flea market behind it. It opens at ${opens}. The arcade is open all night.` };
}

/**
 * Why the door of a shop one walks into (`SHOP_ZONE_OF`) will not open at `hours`: its caption and the hint on a click
 * (`closed`, the shop's word when shut), or null while it is open. `name` is what the player calls it ("the florist").
 */
export function shopShutNotice(kind: ShopKind, name: string, closed: string, hours: number): { label: string; hint: string } | null {
  if (isShopOpen(kind, hours)) return null;
  const opens = clockShort(SHOP_HOURS[kind]?.open ?? 8);
  const Name = capitalise(name);
  return { label: `${Name} · closed, opens at ${opens}`, hint: `${Name} is closed. ${closed} Opens at ${opens}.` };
}
