import type { BoxCondition, Edition, Game, PlatformId } from '@/catalog/types';
import { PLATFORM_LIST } from '@/catalog/platforms';
import { gameIdFor } from '@/catalog/nointro';
import type { IndexEntry, LibretroIndex } from '@/collection/LibretroIndex';
import type { Fame } from './Fame';
import type { HeldCopy, MarketLedger } from './MarketLedger';
import type { MarketStanding } from './MarketStanding';
import { Negotiation } from './haggle';
import { themeOf, type MarketDayTheme } from './marketDays';
import { isGrail } from './grails';
import { BARGAIN_PRICE, HOLD_DEPOSIT, MARKET_STOCK, REPRO_CAUGHT, STICKER, marketPrice } from './pricing';
import { StockItem, type StockSource, type StockTraits } from './StockItem';
import { JobLotDraw } from './JobLot';
import { MarketOrders } from './MarketOrders';
import { gameFrom } from './stockDraws';
import { drawDay, type DrawContext } from './dayDraw';
import { frozenRng, unit01 } from '@/random';
import { boughtAtStall, insultedAtStall, noHaggleLine, refusesHaggle, stallLoyalty } from '@/social/market';
import { formatCoins } from '@/text/money';

export type { JobLot } from './JobLot';

interface MarketStockDeps {
  index: LibretroIndex;
  /** The collection: what the player owns (a wishlist entry is not owned) and wishes for. */
  collection: { owns(id: string): boolean; readonly games: readonly Game[] };
  fame: Fame;
  /** The game day the stock is drawn for (see `time/Today`). */
  today: { readonly gameDay: number };
  ledger: MarketLedger;
  /** How the market knows the player: loyalty per stall (wishlist finds, kept-aside copies, better haggles). */
  standing: MarketStanding;
  /** Whether it is raining right now (stallholders haggle more readily). */
  raining?: () => boolean;
}

interface MarketStockOptions {
  /** Ordinary copies offered per platform each day, drawn in this range (a stall may be sparse or heaped). Default `MARKET_STOCK.perPlatform`. */
  perPlatform?: { min: number; max: number };
  /** Copies in the bargain bin each day. Default `MARKET_STOCK.bin`. */
  bin?: number;
  /** Chance a day that one wishlisted game turns up on its platform's stall. Default `MARKET_STOCK.wantedOdds`. */
  wantedOdds?: number;
}

/** Entries that are not a box on a shelf: hacks and translations (square brackets), prototypes, demos, pirates... */
const NOT_A_RELEASE = /\[|\((Beta|Proto|Demo|Sample|Unl|Pirate|Aftermarket|Kiosk|Virtual Console|Program|Promo|Alt[^)]*|Rev [^)]*|v\d[^)]*|Disc [2-9])\)/i;
const WESTERN_REGION = /\((USA|World|Europe)[,)]/;
const JAPANESE_REGION = /\(Japan\)/;

/** Today's stock once drawn: the stalls' copies per platform and the bargain bin. */
interface Day {
  day: number;
  items: Promise<StockItem[]>;
  /** The same list once resolved, for synchronous peeks (the catalogue). */
  ready: StockItem[] | null;
}

/**
 * What the flea market has today (a market day of the game's clock, see `MarketCalendar`), the
 * same all day and across reloads (seeded by the day). Per platform, in stall order: the copies
 * the player ordered, a showpiece (a well-known title from the built-in list), a famous game on
 * an estate-sale day, a copy kept aside for a loyal customer, maybe a game off the player's
 * wishlist, what the player sold at the WE BUY desk (`MarketLedger`), then a few ordinary copies
 * from the libretro-thumbnails index, the odd first print, budget re-release or fake among them;
 * never more than the stall shows (`fitTo`), so nothing on sale is out of sight. Plus the bargain
 * bin (worn copies of anything at a flat price, now and then a gem) and a job lot. The day's theme
 * (`marketDays`) heaps some stalls, moves prices, deepens the bin. Prices come from fame, one
 * Wikipedia lookup at a time: items are handed out at once and each `StockItem` says when its price
 * is final. Copies the player owns, and those other shoppers bought today, are left out.
 */
export class MarketStock {
  private readonly perPlatform: { min: number; max: number };
  private readonly binSize: number;
  private readonly wantedOdds: number;
  private capacity: (platform: PlatformId) => number = () => Infinity;
  /** The bins' room, or how much they hold on a day of a given kind (the Grand Flea Fair sets out more of them). */
  private binCapacity: number | ((theme: MarketDayTheme) => number) = Infinity;
  private cache: Day | null = null;
  /** The day `warm` last priced ahead. */
  private warmedDay = -1;
  /** `fitTo` was told what the stalls show (by the hall, or by the street from the market's plan): a draw can be kept. */
  private fitted = false;
  private readonly pools = new Map<PlatformId, Promise<readonly IndexEntry[]>>();

  /** Today's job lot (`JobLotDraw`). */
  readonly lot: JobLotDraw;
  /** Copies ordered at the counter (`MarketOrders`). */
  readonly orders: MarketOrders;

  constructor(private readonly deps: MarketStockDeps, options: MarketStockOptions = {}) {
    this.lot = new JobLotDraw({ ...deps, releases: (platform) => this.releases(platform) });
    this.orders = new MarketOrders(deps);
    this.perPlatform = options.perPlatform ?? MARKET_STOCK.perPlatform;
    this.binSize = options.bin ?? MARKET_STOCK.bin;
    this.wantedOdds = options.wantedOdds ?? MARKET_STOCK.wantedOdds;
  }

  /** How many copies each stall (and the bin) can show; set by the market's builder before the first draw. */
  fitTo(stall: (platform: PlatformId) => number, bin: number | ((theme: MarketDayTheme) => number)): void {
    this.capacity = stall;
    this.binCapacity = bin;
    this.fitted = true;
  }

  /**
   * The game day the stock is today's for (`Today.gameDay`), for what is bought and booked at the
   * market. What kind of day it is (theme, events, news) is `MarketDay`'s; anything else that follows
   * the days reads `Today`.
   */
  get day(): number {
    return this.deps.today.gameDay;
  }

  /** The bargain bin's price today. */
  get binPrice(): number {
    return Math.max(1, Math.round(BARGAIN_PRICE * (themeOf(this.day).bin?.price ?? 1)));
  }

  /**
   * Starts pricing today's stock ahead of the market's hall (Front Street reached, a new market day): one fame lookup per
   * copy, one at a time server-side, so a fresh day takes 15-20 s, walked off on the way there. Nothing is kept of the
   * draw unless the stalls' sizes are known (`fitTo`: the street fits them from the market's plan), and then the draw is
   * today's stock itself, so the street's finds (the collector, the garage sale, the barista, the paper) see it before
   * the hall is visited; else the lookups only land in `Fame`'s cache. Once a day.
   */
  warm(): void {
    const day = this.day;
    if (this.warmedDay === day || this.cache?.day === day) return;
    this.warmedDay = day;
    if (this.fitted) void this.current().items.catch(() => undefined);
    else void this.draw(day).catch(() => undefined);
  }

  /** Today's stock minus what the player already owns and what other shoppers bought. */
  async todays(): Promise<StockItem[]> {
    const items = await this.current().items;
    return this.available(items);
  }

  /** Today's stock if it has been drawn already (the market visited today), else null. Owned and sold copies left out. */
  peekToday(): StockItem[] | null {
    const cache = this.cache;
    if (!cache || cache.day !== this.day || !cache.ready) return null;
    return this.available(cache.ready);
  }

  /** The market day `item` belongs to: the one it was laid out for (today's, unless midnight passed with it in hand). */
  dayOf(item: StockItem): number {
    return item.drawnOn ?? this.day;
  }

  /** Whether `item` was laid out on a market day gone by (midnight passed with it on the table or in hand): no more haggles or holds on it. */
  isStale(item: StockItem): boolean {
    return this.dayOf(item) < this.day;
  }

  /**
   * Whether `negotiate` would open a haggle over `item` (priced, not a flat price or a sale, not haggled over today, a
   * copy of today's, and a stallholder not so soured by insults that they would walk at the first offer).
   */
  canNegotiate(item: StockItem): boolean {
    if (!item.priced || item.firm || item.source === 'bin' || item.source === 'ordered' || item.sale < 1 || this.isStale(item)) return false;
    // A stallholder the player fell out with won't haggle at all (`social/market`).
    if (refusesHaggle(item.game.platform)) return false;
    const day = this.dayOf(item);
    if (Negotiation.patienceFor(this.deps.ledger.moodOf(day, item.game.platform), this.deps.ledger.hadCoffee(day)) <= 0) return false;
    return this.deps.ledger.haggleOf(day, item.game.id) === undefined;
  }

  /** Opens a haggle over `item`, or says why there is none (still pricing, the bin, already agreed today, a soured stall). */
  negotiate(item: StockItem): Negotiation | { line: string } {
    const platform = item.game.platform;
    if (!item.priced) return { line: 'Hang on, I’m still working out what it’s worth.' };
    if (item.source === 'bin') return { line: `It’s the bargain bin, friend. ${formatCoins(this.binPrice)}, that’s the deal.` };
    if (item.source === 'ordered') return { line: `That’s your order: ${formatCoins(item.price)}, as agreed.` };
    if (item.firm) return { line: `I paid good money for that one. ${formatCoins(item.price)}, not a coin less.` };
    if (item.sale < 1) return { line: `It’s a clearance, friend: ${formatCoins(item.price)}, already slashed. No haggling.` };
    if (this.isStale(item)) return { line: `We’re packing up yesterday’s table, friend. ${formatCoins(item.price)} or put it back.` };
    const { ledger, standing } = this.deps;
    const day = this.dayOf(item);
    const agreed = ledger.haggleOf(day, item.game.id);
    if (agreed !== undefined) return { line: agreed < 1 ? `We already shook on ${formatCoins(item.price)}.` : `I said ${item.price}. My last word.` };
    if (refusesHaggle(platform)) return { line: noHaggleLine(item.price) };
    const soured = ledger.moodOf(day, platform);
    const coffee = ledger.hadCoffee(day);
    // Insulted enough today, the stallholder will not even start: a haggle that would open already lost.
    if (Negotiation.patienceFor(soured, coffee) <= 0) return { line: `Not today, friend. ${formatCoins(item.price)}, like the tag says.` };
    return new Negotiation(item, {
      day,
      soured,
      loyalty: stallLoyalty(platform, standing.loyalty(platform)),
      coffee,
      rain: this.deps.raining?.() ?? false,
    });
  }

  /** A haggle ended: its price holds all day (the copy's day); an insult sours the stall. */
  settle(item: StockItem, negotiation: Negotiation, insults: number): void {
    const platform = item.game.platform;
    const factor = negotiation.factor;
    const day = this.dayOf(item);
    this.deps.ledger.recordHaggle(day, item.game.id, factor);
    for (let i = 0; i < insults; i++) this.deps.ledger.sour(day, platform);
    insultedAtStall(platform, day, insults);
    item.setHaggle(factor);
    if (factor < 1) this.deps.standing.record('deal');
  }

  /** What holding `item` for the day costs (a deposit counted towards its price). */
  holdDeposit(item: StockItem): number {
    return Math.max(1, Math.round(item.price * HOLD_DEPOSIT));
  }

  /** The deposit on `item` is paid: other shoppers leave it alone today, and the copy stays on its stall all day whatever happens. */
  hold(item: StockItem, deposit: number): void {
    this.deps.ledger.hold(this.dayOf(item), item.game.id, deposit, heldCopyOf(item));
    item.setDeposit(deposit);
  }

  /** `item` changed hands (bought): its hold or order is done, and the stall remembers the custom. */
  sold(item: StockItem): void {
    this.deps.ledger.release(this.dayOf(item), item.game.id);
    if (item.source === 'ordered') this.deps.ledger.fulfil(item.game.id);
    if (item.source !== 'bin') this.deps.standing.record('buy', item.game.platform);
    if (item.source !== 'bin') boughtAtStall(item.game.platform, this.dayOf(item), item.deposit > 0 && item.source !== 'ordered');
  }

  /** The player found out a fake on the stall: the stallholder lets it go cheap, and does not argue. False when it is no fake, or already found out. */
  expose(item: StockItem): boolean {
    if (!item.repro || item.exposed) return false;
    this.deps.ledger.catchRepro(this.dayOf(item), item.game.id);
    item.expose(REPRO_CAUGHT);
    return true;
  }

  /** Another shopper bought `item`: gone for the day. */
  soldToRival(item: StockItem): void {
    this.deps.ledger.recordRivalSale(this.dayOf(item), item.game.id);
  }

  /** The player sold `game`: it goes on its stall from tomorrow. */
  consign(game: Game): void {
    this.deps.ledger.consign(game, this.day);
  }

  get hadCoffee(): boolean {
    return this.deps.ledger.hadCoffee(this.day);
  }

  /** A coffee from the cart: stallholders find the player easier to deal with for the rest of the day. */
  drinkCoffee(): void {
    this.deps.ledger.recordCoffee(this.day);
  }

  /** How many copies other shoppers bought today. */
  get soldToRivals(): number {
    return this.deps.ledger.rivalSold(this.day).size;
  }

  /** The index's Japanese releases for `platform`: the odd import on a stall. */
  private async imports(platform: PlatformId): Promise<readonly IndexEntry[]> {
    const entries = await this.deps.index.load(platform);
    return entries.filter((e) => JAPANESE_REGION.test(e.name) && !NOT_A_RELEASE.test(e.name));
  }

  /** The index's plausible western releases for `platform` (loaded once). */
  releases(platform: PlatformId): Promise<readonly IndexEntry[]> {
    let pool = this.pools.get(platform);
    if (!pool) {
      pool = this.deps.index.load(platform).then((entries) => {
        // A grail never turns up in an ordinary crate (nor in a lot, nor on a private seller's card): only on its day.
        const releases = entries.filter((e) => !NOT_A_RELEASE.test(e.name) && WESTERN_REGION.test(e.name) && !isGrail(gameIdFor(platform, e.name)));
        return releases.length ? releases : entries;
      });
      pool.catch(() => this.pools.delete(platform));
      this.pools.set(platform, pool);
    }
    return pool;
  }

  /** `count` games from the index at large, seeded by `seed` (the private sellers' cards). */
  async randomGames(seed: string, count: number): Promise<Game[]> {
    const rng = frozenRng(seed);
    const games: Game[] = [];
    for (let i = 0; i < count * 3 && games.length < count; i++) {
      const platform = PLATFORM_LIST[Math.floor(rng() * PLATFORM_LIST.length)]!.id;
      const pool = await this.releases(platform).catch(() => [] as readonly IndexEntry[]);
      const entry = pool[Math.floor(rng() * pool.length)];
      if (entry) games.push(gameFrom(entry, platform));
    }
    return games;
  }

  private available(items: StockItem[]): StockItem[] {
    const gone = this.deps.ledger.rivalSold(this.day);
    const { collection } = this.deps;
    // An upgrade is for a game the player owns, until their copy is a first print.
    const upgradable = (id: string) => (collection.games.find((g) => g.id === id)?.edition ?? 'standard') !== 'firstPrint';
    return items.filter((item) => (item.source === 'upgrade' ? upgradable(item.game.id) : !collection.owns(item.game.id)) && !gone.has(item.game.id));
  }

  private current(): Day {
    const day = this.day;
    if (!this.cache || this.cache.day !== day) {
      const entry: Day = { day, items: this.draw(day), ready: null };
      void entry.items.then((items) => (entry.ready = items), () => undefined);
      this.cache = entry;
    }
    return this.cache;
  }

  /** Today's stock, drawn step by step (`dayDraw`): the stalls platform by platform, the bargain bin, the ledger's memory of each copy. */
  private draw(day: number): Promise<StockItem[]> {
    return drawDay(day, this.drawContext());
  }

  /** What the draw reads and asks of the market: the stores, the stalls' room, the index pools, the pricing. */
  private drawContext(): DrawContext {
    const { collection, ledger, standing } = this.deps;
    return {
      collection,
      ledger,
      standing,
      perPlatform: this.perPlatform,
      binSize: this.binSize,
      wantedOdds: this.wantedOdds,
      capacity: (platform) => this.capacity(platform),
      binCapacity: (theme) => (typeof this.binCapacity === 'number' ? this.binCapacity : this.binCapacity(theme)),
      releases: (platform) => this.releases(platform),
      imports: (platform) => this.imports(platform),
      priced: (game, condition, source, discount, traits) => this.priced(game, condition, source, discount, traits),
    };
  }

  /** The item at the price its known fame gives, final once the lookup lands (a failed lookup leaves it ordinary). */
  private priced(game: Game, condition: BoxCondition, source: StockSource, discount: number, traits: StockTraits): StockItem {
    const { fame, ledger } = this.deps;
    const edition: Edition = traits.edition ?? 'standard';
    const known = fame.peek(game);
    const settle = known !== undefined ? undefined : fame.lookup(game).then((views) => marketPrice(game, views, condition, discount, edition));
    // An old shop's price sticker on some ordinary copies (peeled off at home: docs/household.md). A hash of its own, so no other draw moves.
    // Never on a clearance stall: the sale and the sticker's cut together would go under what the WE BUY desk pays once peeled.
    const sticker = source === 'stall' && traits.sale === undefined && unit01(`${this.day}:sticker:${game.id}`) < STICKER.odds;
    const item = new StockItem(game, condition, source, { list: marketPrice(game, known, condition, discount, edition), final: known !== undefined, settle }, sticker ? { ...traits, sticker } : traits);
    const agreed = ledger.haggleOf(this.day, game.id);
    if (agreed !== undefined) item.setHaggle(agreed);
    return item;
  }
}

/** What the ledger keeps of a held copy: enough to put it back on its stall as it was. */
function heldCopyOf(item: StockItem): HeldCopy {
  return {
    game: item.game,
    condition: item.condition,
    source: item.source,
    list: item.tagPrice,
    ...(item.edition !== 'standard' ? { edition: item.edition } : {}),
    ...(item.repro ? { repro: true } : {}),
    ...(item.gem ? { gem: true } : {}),
  };
}
