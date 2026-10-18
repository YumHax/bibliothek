import { isAuctionDay } from '@/economy/AuctionHouse';
import { rivalAtMarket, rivalOnFrontStreet } from '@/economy/rivalCollector';
import { clockShort } from '@/text/clock';
import { inHours } from '@/time/clock';
import { doorKey } from '@/world/stairwell/building';
import { STAIRWELL_PLAN } from '@/world/stairwell/stairwellPlan';
import { hoursOn } from '@/world/street/shops/shopHours';
import type { ShopKind } from '@/world/street/streetPlan';
import { REGULARS } from '@/world/street/townsfolk/regularsPlan';
import { TOWNSFOLK_PLAN } from '@/world/street/townsfolk/townsfolkPlan';
import { findPerson, personAtDoor } from './people';
import { phoneHours } from './phoneHours';
import type { PersonId } from './types';

/*
 * Where someone is now, and until when (docs/social.md "The People book", "The phone"): read off the schedules the
 * world already keeps (the residents' hours out on the stairs, the regulars' rounds, the shops' hours for whoever works
 * behind a counter, the flea market, Victor's rounds), and the hours they sleep (`phoneHours`). Best effort: null when
 * nothing is known of their day (the book then says their card's `whereabouts`).
 */

/** Where they are, in words ("Behind the counter at SUNNY SIDE CAFE"), until which game hour (or null), and what it is. */
interface WhereNow {
  where: string;
  until: number | null;
  /** `asleep` and `work` keep them off the phone (`phoneCalls`, the contacts); `out` and `home` do not. */
  kind: 'home' | 'out' | 'work' | 'asleep';
}

/** Who works behind which counter (their shift: the shop's hours today), and how it is said. */
const COUNTERS: Readonly<Record<PersonId, { kind: ShopKind; where: string }>> = {
  lou: { kind: 'cafe', where: 'Behind the counter at SUNNY SIDE CAFE' },
  remi: { kind: 'cafe', where: 'Behind the counter at PARKSIDE CAFE' },
  'clerk-furniture': { kind: 'furniture', where: 'At SECOND HOME, the furniture shop' },
  'clerk-tv': { kind: 'electronics', where: 'At TV REPAIR' },
  'clerk-pets': { kind: 'pets', where: 'At PAWS & CLAWS' },
  'clerk-florist': { kind: 'florist', where: 'At the florist’s' },
  butcher: { kind: 'butcher', where: 'At the butcher’s counter' },
  baker: { kind: 'bakery', where: 'At the bakery’s counter' },
  pharmacist: { kind: 'pharmacy', where: 'At the pharmacy’s counter' },
  bookseller: { kind: 'books', where: 'At CORNER BOOKS' },
  attendant: { kind: 'arcade', where: 'At the arcade’s counter' },
};

/** The next start of a span at or after `hour` among `spans`, or null. */
function nextStart(spans: readonly (readonly [number, number])[], hour: number): number | null {
  const later = spans.map(([from]) => from).filter((from) => from > hour);
  return later.length ? Math.min(...later) : null;
}

/** Where `id` is at game hour `hour` of `day`, or null when nothing is known of their day. */
export function whereNow(id: PersonId, day: number, hour: number): WhereNow | null {
  const card = findPerson(id);
  if (!card) return null;
  const sleep = phoneHours(id);
  const at = hour < 6 ? hour + 24 : hour;
  if (at < sleep.from || at >= sleep.to) return { where: 'Asleep', until: sleep.from % 24, kind: 'asleep' };

  // The residents: out between their hours (`STAIRWELL_PLAN.residents`), home the rest of the day.
  for (const r of STAIRWELL_PLAN.residents) {
    if (personAtDoor(doorKey(r.k, r.i)) !== id) continue;
    if (inHours(hour, [r.out, r.back])) return { where: 'Out for the day', until: r.back, kind: 'out' };
    return { where: 'At home', until: hour < r.out ? r.out : null, kind: 'home' };
  }
  // The regulars who keep hours: on Front Street within them.
  const regular = REGULARS.find((r) => r.person === id);
  if (regular) {
    const span = regular.hours.find((s) => inHours(hour, [s[0], s[1]]));
    if (span) return { where: 'On Front Street', until: span[1], kind: 'out' };
    return { where: 'At home', until: nextStart(regular.hours, hour), kind: 'home' };
  }
  // Lou's breaks outside her café's door, then her counter.
  if (id === 'lou') {
    const brk = TOWNSFOLK_PLAN.lou.breaks.find((b) => inHours(hour, [b[0], b[1]]));
    if (brk) return { where: 'On a break outside SUNNY SIDE CAFE', until: brk[1], kind: 'out' };
  }
  const counter = COUNTERS[id];
  if (counter) {
    const shop = hoursOn(counter.kind);
    if (shop && inHours(hour, { from: shop.open, to: shop.close })) return { where: counter.where, until: shop.close >= 24 && shop.open === 0 ? null : shop.close % 24, kind: 'work' };
    return { where: 'Off work', until: shop && hour < shop.open ? shop.open : null, kind: 'home' };
  }
  // The stallholders keep RETRO GAMES' hours behind it.
  if (id.startsWith('stall-')) {
    const retro = hoursOn('retro');
    if (retro && inHours(hour, { from: retro.open, to: retro.close })) return { where: 'At their stall, the flea market', until: retro.close % 24, kind: 'work' };
    return { where: 'Off till the market opens', until: retro && hour < retro.open ? retro.open : null, kind: 'home' };
  }
  if (id === 'victor') {
    const { toCafe, toMarket } = TOWNSFOLK_PLAN.victor;
    if (inHours(hour, [toCafe.hours[0], toMarket.hours[0]]) && rivalOnFrontStreet(day)) return { where: 'Having his espresso at SUNNY SIDE CAFE', until: toMarket.hours[0], kind: 'out' };
    if (isAuctionDay(day) && inHours(hour, [10, 18])) return { where: 'In the saleroom’s front row', until: 18, kind: 'out' };
    if (rivalAtMarket(day) && inHours(hour, [toMarket.hours[0], 13])) return { where: 'Hunting at the flea market', until: 13, kind: 'out' };
    return null;
  }
  return null;
}

/** The book's and the phone's words for `w`: "At home until 9:30", "Asleep until 8:00". */
export function whereWords(w: WhereNow): string {
  return w.until === null ? w.where : `${w.where} until ${clockShort(w.until)}`;
}
