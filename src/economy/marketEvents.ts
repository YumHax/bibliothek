import type { Game, PlatformId } from '@/catalog/types';
import { PLATFORM_LIST, getPlatform } from '@/catalog/platforms';
import type { Views } from './Fame';
import { grailGame, grailOn, isGrail, upcomingGrail, type Grail } from './grails';
import { BROCANTE, GRAIL, SALES, shopPrice } from './pricing';
import { seeded } from './seeded';

/*
 * THE MARKET'S CALENDAR OF EVENTS, by market day (`MarketCalendar`'s count): the grail of the day,
 * the monthly Grande Brocante, the mail-order sale, a stall's clearance. Pure functions of the day,
 * so the stock, the tags, the papers and the rumours all tell the same story on every reload.
 */

/** A stall clearing out today: its platform, and the share of its prices it asks. */
export interface Clearance {
  platform: PlatformId;
  factor: number;
}

/** What is on at the market on a day. */
export interface MarketEvents {
  day: number;
  /** The grail on its stall today, if any (`grails.ts`). */
  grail: Grail | null;
  /** The Grande Brocante: the hall full to the rafters. */
  brocante: boolean;
  /** The mail-order counter's price factor on new copies today (null: no sale). */
  catalogueSale: number | null;
  clearance: Clearance | null;
}

/** Whether market day `day` is the month's Grande Brocante. */
export function isBrocante(day: number): boolean {
  const k = day - BROCANTE.offset;
  return k >= 0 && k % BROCANTE.month === 0;
}

/** The first Grande Brocante on or after `day`. */
export function nextBrocante(day: number): number {
  if (day <= BROCANTE.offset) return BROCANTE.offset;
  const k = day - BROCANTE.offset;
  return BROCANTE.offset + Math.ceil(k / BROCANTE.month) * BROCANTE.month;
}

/** The mail-order sale's factor on `day`, or null. */
export function catalogueSaleOn(day: number): number | null {
  const { every, offset, factor } = SALES.catalogue;
  const k = day - offset;
  return k >= 0 && k % every === 0 ? factor : null;
}

/** The stall clearing out on `day`, if one is (drawn from the day). */
export function clearanceOn(day: number): Clearance | null {
  const rng = seeded(`${day}:clearance`);
  if (rng() >= SALES.clearance.odds) return null;
  const platform = PLATFORM_LIST[Math.floor(rng() * PLATFORM_LIST.length)]!.id;
  return { platform, factor: SALES.clearance.factor };
}

export function eventsOn(day: number): MarketEvents {
  return { day, grail: grailOn(day), brocante: isBrocante(day), catalogueSale: catalogueSaleOn(day), clearance: clearanceOn(day) };
}

/**
 * What a new copy of `game` costs at the mail-order counter on `day`: the shop price, less the
 * sale when there is one. A grail is not in the catalogue (null): out of print, it only turns up
 * at the market.
 */
export function mailOrderPrice(game: Pick<Game, 'id' | 'platform'>, views: Views, day: number): number | null {
  if (isGrail(game.id)) return null;
  return Math.max(1, Math.round(shopPrice(game, views) * (catalogueSaleOn(day) ?? 1)));
}

/** Something coming up at the market that people talk about, `inDays` from today (0: today). */
export interface MarketNews {
  kind: 'grail' | 'brocante' | 'catalogueSale' | 'clearance';
  day: number;
  inDays: number;
  /** The grail concerned (kind 'grail'). */
  grail?: Grail;
  /** The stall concerned (kind 'clearance'). */
  platform?: PlatformId;
}

/**
 * What is worth telling from `day` on: the next grail (within `GRAIL.rumourDays`, unless the
 * player owns it: nobody bothers them with it), the next Grande Brocante (within
 * `BROCANTE.announceDays`), today's and tomorrow's mail-order sale, today's and tomorrow's clearance.
 * Most pressing first: today's, then by kind, then by date.
 */
export function marketNews(day: number, owns: (id: string) => boolean = () => false): MarketNews[] {
  const news: MarketNews[] = [];
  const grail = upcomingGrail(day, GRAIL.rumourDays);
  if (grail && !owns(grailGame(grail.grail).id)) news.push({ kind: 'grail', day: grail.day, inDays: grail.inDays, grail: grail.grail });
  const brocante = nextBrocante(day);
  if (brocante - day <= BROCANTE.announceDays) news.push({ kind: 'brocante', day: brocante, inDays: brocante - day });
  for (const d of [day, day + 1]) {
    if (catalogueSaleOn(d)) news.push({ kind: 'catalogueSale', day: d, inDays: d - day });
    const clearance = clearanceOn(d);
    if (clearance) news.push({ kind: 'clearance', day: d, inDays: d - day, platform: clearance.platform });
  }
  // What is on today first, then the grail before the Brocante before the sales, then the soonest.
  return news.sort((a, b) => Number(a.inDays > 0) - Number(b.inDays > 0) || weight(a) - weight(b) || a.inDays - b.inDays);
}

/** "today", "tomorrow", "in 3 days", in market days. */
export function whenText(inDays: number): string {
  return inDays === 0 ? 'today' : inDays === 1 ? 'tomorrow' : `in ${inDays} days`;
}

/** The stall's name for a platform: "the SNES stall". */
export function stallName(platform: PlatformId): string {
  return `the ${getPlatform(platform).shortName} stall`;
}

const WEIGHT: Record<MarketNews['kind'], number> = { grail: 0, brocante: 1, clearance: 2, catalogueSale: 3 };
function weight(news: MarketNews): number {
  return WEIGHT[news.kind];
}
