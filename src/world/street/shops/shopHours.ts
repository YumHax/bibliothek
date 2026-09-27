import type { ShopKind } from '../streetPlan';

/** When a shop is open, in game hours: from `open` to `close` (past 24 means after midnight: 25 = 1:00). */
export interface ShopHours {
  open: number;
  close: number;
}

/**
 * Opening hours by kind of shop, every day alike: the bakery at dawn, the bars till late, the
 * arcade never shut, RETRO GAMES (and the flea market behind it) from 8:00 to 23:00. A `shut` shop
 * never opens. Its roller shutter, its window light, its sounds and its door all follow this.
 */
export const SHOP_HOURS: Record<ShopKind, ShopHours | null> = {
  bakery: { open: 6.5, close: 19.5 },
  cafe: { open: 7, close: 20 },
  pharmacy: { open: 8.5, close: 19.5 },
  books: { open: 9.5, close: 19 },
  grocer: { open: 8, close: 20.5 },
  florist: { open: 9, close: 19 },
  tabac: { open: 7, close: 21 },
  bar: { open: 11, close: 26 },
  butcher: { open: 8, close: 19 },
  laundry: { open: 7, close: 23 },
  retro: { open: 8, close: 23 },
  arcade: { open: 0, close: 24 },
  furniture: { open: 9, close: 19 },
  electronics: { open: 9, close: 19 },
  pets: { open: 9, close: 19 },
  shut: null,
};

/** Whether a shop of `kind` is open at `hours` (0 ≤ hours < 24). */
export function isShopOpen(kind: ShopKind, hours: number): boolean {
  const h = SHOP_HOURS[kind];
  if (!h) return false;
  if (h.close - h.open >= 24) return true;
  return (hours >= h.open && hours < h.close) || hours + 24 < h.close;
}

/**
 * Why RETRO GAMES' door (and the flea market behind it) will not open at `hours`: its caption and
 * the hint on a click, or null while it is open. The arcade never shuts.
 */
export function retroShutNotice(hours: number): { label: string; hint: string } | null {
  if (isShopOpen('retro', hours)) return null;
  const opens = clockTime(SHOP_HOURS.retro?.open ?? 8);
  return { label: `RETRO GAMES is closed · opens at ${opens}`, hint: `RETRO GAMES is shut for the night, and the flea market behind it. It opens at ${opens}. The arcade is open all night.` };
}

/** "8:00", "19:30": a game hour as a clock reading. */
export function clockTime(hours: number): string {
  const h = Math.floor(hours) % 24;
  const m = Math.round((hours - Math.floor(hours)) * 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}
