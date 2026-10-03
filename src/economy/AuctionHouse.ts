import type { BoxCondition, Edition, Game, PlatformId } from '@/catalog/types';
import { SEED_GAMES } from '@/catalog';
import { KEYS, PersistedStore } from '@/persistence';
import type { Views } from './Fame';
import { isGrail } from './grails';
import { seeded } from './seeded';
import { drawCondition } from './stockDraws';
import { drawSealedLot, type SealedLot } from './boxLots';
import { describeVariant, dressCopy } from './copyTraits';
import { AUCTION, marketPrice } from './pricing';

/*
 * THE SALEROOM'S SALES: which market days there is one (`isAuctionDay`), what goes under the hammer (`lotsFor`:
 * the same for everyone and every reload, seeded by the day), and how each lot went (`bibliothek.auction.v1`, the
 * sale day's results only). The bidding itself is `auction.ts`; the room is `world/saleroom/`.
 */

/** `?auction` in the URL makes every market day a sale day, to try it (read here, so nothing needs wiring). */
const EVERY_DAY = typeof location !== 'undefined' && new URLSearchParams(location.search).has('auction');

/** Whether market day `day` has a sale in the saleroom. */
export function isAuctionDay(day: number): boolean {
  return EVERY_DAY || ((day - AUCTION.offset) % AUCTION.every + AUCTION.every) % AUCTION.every === 0;
}

/** The first sale day from `day` on (`day` itself when it is one). */
export function nextAuctionDay(day: number): number {
  let d = day;
  while (!isAuctionDay(d)) d++;
  return d;
}

/** One lot of a sale: a game (a copy, its state drawn) or a sealed carton. */
export interface AuctionLot {
  /** Its number in the sale, from 1. */
  number: number;
  kind: 'game' | 'sealed';
  /** The copy (a game lot). */
  game?: Game;
  /** The carton (a sealed lot). */
  sealed?: SealedLot;
  /** What the board and the catalogue call it. */
  title: string;
  /** The auctioneer's line on it. */
  blurb: string;
  /** What the room expects it to fetch, and where it opens (coins). */
  estimate: number;
  reserve: number;
  /** The lot the sale was put together around (the rival is after it). */
  star: boolean;
  platform?: PlatformId;
}

/** How a lot went: to the player (`'you'`), to a bidder of the room (their id), or passed. */
export interface LotResult {
  to: string;
  price: number;
}

interface AuctionFile {
  day: number;
  results: Record<number, LotResult>;
}

export interface AuctionHouseDeps {
  /** The index at large (the flea market's draw): ordinary games for the lots and the cartons. */
  randomGames(seed: string, count: number): Promise<Game[]>;
  fame: { lookup(game: Pick<Game, 'id' | 'title' | 'platform'>): Promise<Views> };
}

const BLURBS: Record<BoxCondition, readonly string[]> = {
  complete: ['Boxed, with its manual. Lovely example.', 'Complete in box, and it has been looked after.', 'Box, manual, the lot. A collector’s copy.'],
  noManual: ['Boxed, no manual. Plays perfectly, I am told.', 'The box and the game; the manual has wandered off.'],
  worn: ['A bit tired, this one. Honest wear. Priced to match.', 'It has been played, ladies and gentlemen. Loved, even.'],
};

/**
 * A copy's state, from `rng`: the star is complete (a first print now and then), the others as the stalls draw them;
 * then its variant and past (`dressCopy`, from a stream of the copy's own: `seed`), the star as a collector's copy.
 */
function dress(game: Game, rng: () => number, star: boolean, seed: string): { game: Game; condition: BoxCondition; edition: Edition } {
  const condition: BoxCondition = star ? 'complete' : drawCondition(rng());
  const edition: Edition = rng() < (star ? AUCTION.firstPrintOdds * 1.6 : AUCTION.firstPrintOdds) ? 'firstPrint' : 'standard';
  const copy = dressCopy(seeded(seed), { ...game, condition, status: 'owned', edition: edition === 'standard' ? undefined : edition }, { condition, kind: star ? 'collector' : 'ordinary' });
  return { game: copy, condition, edition };
}

/** The sale days' lots and results. */
export class AuctionHouse {
  private state: AuctionFile;
  private readonly store: PersistedStore<AuctionFile>;
  private cache: { day: number; lots: Promise<AuctionLot[]> } | null = null;

  constructor(private readonly deps: AuctionHouseDeps, storage?: Storage | null) {
    this.store = new PersistedStore<AuctionFile>({ key: KEYS.auction, version: 1, defaults: () => ({ day: -1, results: {} }), read: readFile, ...(storage !== undefined ? { storage } : {}) });
    this.state = this.store.load();
  }

  /**
   * Sale day `day`'s lots, in order: ordinary games and cartons first, the star lot (a well-known title) second to
   * last, a carton to close. Priced once each game's fame is known (a game whose fame cannot be had is ordinary).
   */
  lotsFor(day: number): Promise<AuctionLot[]> {
    if (this.cache?.day === day) return this.cache.lots;
    const lots = this.draw(day);
    lots.catch(() => {
      if (this.cache?.day === day) this.cache = null;
    });
    this.cache = { day, lots };
    return lots;
  }

  resultOf(day: number, number: number): LotResult | undefined {
    return this.state.day === day ? this.state.results[number] : undefined;
  }

  /** How lot `number` of day `day`'s sale went. */
  settle(day: number, number: number, result: LotResult): void {
    const results = this.state.day === day ? { ...this.state.results } : {};
    results[number] = result;
    this.state = { day, results };
    this.store.save(this.state);
  }

  private async draw(day: number): Promise<AuctionLot[]> {
    const rng = seeded(`auction:${day}`);
    const { games, sealed } = AUCTION.lots;
    // Nothing here depends on what the player owns: the day's lots stay the same lots (their results are kept by
    // number) however the collection changes; a lot the player has already is refused at the bid.
    const pool = await this.deps.randomGames(`auction:${day}:lots`, games * 3).catch(() => [] as Game[]);
    const ordinary = pool.slice(0, games - 1);
    const famous = SEED_GAMES.filter((g) => g.externalIds?.libretroName && !isGrail(g.id));
    const starGame = famous[Math.floor(rng() * famous.length)];
    const priced = async (game: Game, star: boolean): Promise<AuctionLot> => {
      // Every draw before the lookup: the lookups land in any order, the day's numbers must not.
      const { game: copy, condition, edition } = dress(game, rng, star, `auction:${day}:copy:${game.id}`);
      const factor = AUCTION.estimate[0] + rng() * (AUCTION.estimate[1] - AUCTION.estimate[0]);
      const lines = BLURBS[condition];
      const line = lines[Math.floor(rng() * lines.length)]!;
      const views = await this.deps.fame.lookup(copy);
      const estimate = marketPrice(copy, views, condition, factor, edition);
      const reserve = marketPrice(copy, views, condition, AUCTION.reserve, edition);
      const variant = describeVariant(copy);
      const print = `${edition === 'firstPrint' ? ' A first print, mind.' : ''}${variant ? ` ${variant}.` : ''}`;
      return { number: 0, kind: 'game', game: copy, title: copy.title, blurb: `${line}${print}`, estimate: Math.max(estimate, reserve + 2), reserve, star, platform: copy.platform };
    };
    const cartonPool = await this.deps.randomGames(`auction:${day}:cartons`, 14).catch(() => [] as Game[]);
    const carton = (i: number): AuctionLot => {
      const lot = drawSealedLot(`auction:${day}:${i}`, cartonPool);
      return {
        number: 0, kind: 'sealed', sealed: lot, title: `Sealed carton: ${lot.label}`,
        blurb: `A sealed carton, unopened, sold as seen. ${lot.hint.charAt(0).toUpperCase()}${lot.hint.slice(1)}. Who knows?`,
        estimate: lot.price, reserve: Math.max(4, Math.round(lot.price * 0.55)), star: false,
      };
    };
    const lots: AuctionLot[] = [];
    const pending = ordinary.map((g) => priced(g, false));
    const starLot = starGame ? priced(starGame, true) : null;
    const ordinaryLots = await Promise.all(pending);
    const cartons = Array.from({ length: sealed }, (_, i) => carton(i));
    // Ordinary lots with a carton among them, the star second to last, the last carton to close.
    lots.push(...ordinaryLots.slice(0, 1), ...cartons.slice(0, Math.max(0, sealed - 1)), ...ordinaryLots.slice(1));
    if (starLot) lots.push(await starLot);
    lots.push(...cartons.slice(Math.max(0, sealed - 1)));
    return lots.map((lot, i) => ({ ...lot, number: i + 1 }));
  }
}

function readFile(data: unknown): AuctionFile | null {
  if (typeof data !== 'object' || data === null) return null;
  const { day, results } = data as Partial<Record<keyof AuctionFile, unknown>>;
  if (typeof day !== 'number' || typeof results !== 'object' || results === null) return null;
  const out: Record<number, LotResult> = {};
  for (const [key, value] of Object.entries(results as Record<string, unknown>)) {
    const n = Number(key);
    if (!Number.isInteger(n) || typeof value !== 'object' || value === null) continue;
    const { to, price } = value as Partial<LotResult>;
    if (typeof to === 'string' && typeof price === 'number') out[n] = { to, price };
  }
  return { day, results: out };
}
