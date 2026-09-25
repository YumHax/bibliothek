import type { BoxCondition, Game } from '@/catalog/types';
import type { Fame } from './Fame';
import type { MarketLedger } from './MarketLedger';
import type { StockItem } from './StockItem';
import { FOR_SALE_AD, WANTED_AD, shopPrice } from './pricing';
import { seeded } from './seeded';

export const NOTICES_STORAGE_KEY = 'bibliothek.notices.v1';

/** A collector's card: they want `game` and pay `pay` coins for it, until the card comes down. */
export interface WantedAd {
  id: string;
  kind: 'wanted';
  /** The market day it went up. */
  day: number;
  game: Game;
  pay: number;
  from: string;
}

/** A private seller's card: `game` for `price` coins, today only, delivered to the parcel. */
export interface ForSaleAd {
  id: string;
  kind: 'forSale';
  day: number;
  game: Game;
  price: number;
  from: string;
}

export type NoticeAd = WantedAd | ForSaleAd;

const NAMES = ['Dave', 'Sandra', 'Marco', 'Priya', 'Tom', 'Yuki', 'Hélène', 'Kwame', 'Olga', 'Ben', 'Inès', 'Rafael', 'Mei', 'Jonas', 'Aisha', 'Pete'];

/**
 * The notice board's cards. Collectors pin WANTED cards (a game and what they pay, well over
 * the WE BUY desk; up for `WANTED_AD.days` market days), private sellers pin FOR SALE cards
 * (a copy at a fair price, today only). A day's cards are drawn once, the first time the board is
 * looked at that day, from the collection and the day's stalls (so a wanted game can often be
 * found on a stall, or is already on the shelf), priced by fame, and kept (localStorage) so they
 * stay the same across reloads. Which ones were dealt with is the ledger's business.
 */
export class MarketNotices {
  private ads: NoticeAd[];
  private drawing: Promise<void> | null = null;
  private drawingDay = -1;

  constructor(
    private readonly deps: { fame: Fame; ledger: MarketLedger },
    private readonly storage: Storage | null = safeLocalStorage(),
    private readonly key = NOTICES_STORAGE_KEY,
  ) {
    this.ads = this.load();
  }

  /** The cards up on `day` (drawing that day's first if needed), minus the ones dealt with. */
  async onBoard(day: number, sources: { collection: readonly Game[]; stock: readonly StockItem[]; pool: () => Promise<Game[]> }): Promise<NoticeAd[]> {
    if (!this.ads.some((ad) => ad.day === day)) {
      if (!this.drawing || this.drawingDay !== day) {
        this.drawingDay = day;
        this.drawing = this.draw(day, sources);
      }
      await this.drawing;
    }
    return this.current(day);
  }

  /** The cards up on `day` already drawn, minus the ones dealt with. */
  current(day: number): NoticeAd[] {
    const { ledger } = this.deps;
    return this.ads.filter((ad) => !ledger.cardDone(ad.id) && (ad.kind === 'wanted' ? day - ad.day < WANTED_AD.days && ad.day <= day : ad.day === day));
  }

  private async draw(day: number, sources: { collection: readonly Game[]; stock: readonly StockItem[]; pool: () => Promise<Game[]> }): Promise<void> {
    const rng = seeded(`${day}:notices`);
    const name = () => NAMES[Math.floor(rng() * NAMES.length)]!;
    const fresh: NoticeAd[] = [];
    const taken = new Set<string>();
    // Wanted: one game from the collection when there is one, the rest from today's stalls.
    const mine = sources.collection.filter((g) => g.status === 'owned');
    const onStalls = sources.stock.filter((item) => item.source === 'stall' || item.source === 'showpiece' || item.source === 'consigned').map((item) => item.game);
    const wantedPicks: Game[] = [];
    if (mine.length) wantedPicks.push(mine[Math.floor(rng() * mine.length)]!);
    for (let i = 0; i < 20 && wantedPicks.length < WANTED_AD.perDay && onStalls.length; i++) {
      const game = onStalls[Math.floor(rng() * onStalls.length)]!;
      if (!wantedPicks.some((g) => g.id === game.id)) wantedPicks.push(game);
    }
    for (const game of wantedPicks) {
      taken.add(game.id);
      const views = await this.deps.fame.lookup(game);
      const share = WANTED_AD.share[0] + rng() * (WANTED_AD.share[1] - WANTED_AD.share[0]);
      const clean: Game = { id: game.id, title: game.title, platform: game.platform, region: game.region, externalIds: game.externalIds, status: 'owned' };
      fresh.push({ id: `w:${day}:${game.id}`, kind: 'wanted', day, game: clean, pay: Math.max(1, Math.round(shopPrice(game, views) * share)), from: name() });
    }
    // For sale: a few copies from the index at large.
    const pool = await sources.pool().catch(() => [] as Game[]);
    for (let i = 0; i < 20 && fresh.filter((ad) => ad.kind === 'forSale').length < FOR_SALE_AD.perDay && pool.length; i++) {
      const game = pool[Math.floor(rng() * pool.length)]!;
      if (taken.has(game.id) || sources.collection.some((g) => g.id === game.id && g.status !== 'wishlist')) continue;
      taken.add(game.id);
      const condition: BoxCondition = rng() < 0.6 ? 'complete' : 'noManual';
      const views = await this.deps.fame.lookup(game);
      const share = FOR_SALE_AD.share[0] + rng() * (FOR_SALE_AD.share[1] - FOR_SALE_AD.share[0]);
      const factor = condition === 'complete' ? 1 : 0.8;
      fresh.push({ id: `s:${day}:${game.id}`, kind: 'forSale', day, game: { ...game, condition: condition === 'complete' ? undefined : condition }, price: Math.max(1, Math.round(shopPrice(game, views) * share * factor)), from: name() });
    }
    // Keep a week of cards: the older ones are down anyway.
    this.ads = [...this.ads.filter((ad) => day - ad.day < 7 && ad.day !== day), ...fresh];
    this.save();
  }

  private save(): void {
    try {
      this.storage?.setItem(this.key, JSON.stringify(this.ads));
    } catch (err) {
      console.warn('[market] could not persist the notices', err);
    }
  }

  private load(): NoticeAd[] {
    const text = this.storage?.getItem(this.key);
    if (!text) return [];
    try {
      const ads = JSON.parse(text) as NoticeAd[];
      return Array.isArray(ads) ? ads.filter((ad) => ad && typeof ad.day === 'number' && ad.game) : [];
    } catch {
      return [];
    }
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
