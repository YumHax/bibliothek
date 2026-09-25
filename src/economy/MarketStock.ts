import type { BoxCondition, Edition, Game, PlatformId } from '@/catalog/types';
import { PLATFORM_LIST } from '@/catalog/platforms';
import { SEED_GAMES } from '@/catalog';
import { gameIdFor } from '@/catalog/nointro';
import type { IndexEntry, LibretroIndex } from '@/collection/LibretroIndex';
import type { Fame } from './Fame';
import type { HeldCopy, MarketLedger } from './MarketLedger';
import type { MarketStanding } from './MarketStanding';
import { Negotiation } from './haggle';
import { appliesTo, themeOf, type MarketDayTheme } from './marketDays';
import { eventsOn, marketNews, type MarketEvents, type MarketNews } from './marketEvents';
import { grailGame, isGrail } from './grails';
import {
  BARGAIN_PRICE, BIN_GEM_ODDS, CONDITION_ODDS, EDITION_ODDS, HOLD_DEPOSIT, IMPORT, JOB_LOT, LOYALTY, MARKET_DISCOUNT, MARKET_ORDER, MARKET_STOCK,
  REPRO_CAUGHT, REPRO_ODDS, REPUTATION, UPGRADE_ODDS, marketPrice, shopPrice,
} from './pricing';
import { StockItem, type StockSource, type StockTraits } from './StockItem';
import { seeded } from './seeded';

export { StockItem } from './StockItem';

export interface MarketStockDeps {
  index: LibretroIndex;
  /** The collection: what the player owns (a wishlist entry is not owned) and wishes for. */
  collection: { owns(id: string): boolean; readonly games: readonly Game[] };
  fame: Fame;
  /** Today's market day (see `MarketCalendar`). */
  calendar: { readonly day: number };
  ledger: MarketLedger;
  /** How the market knows the player: loyalty per stall (wishlist finds, kept-aside copies, better haggles). */
  standing: MarketStanding;
  /** Whether it is raining right now (stallholders haggle more readily). */
  raining?: () => boolean;
}

export interface MarketStockOptions {
  /** Ordinary copies offered per platform each day, drawn in this range (a stall may be sparse or heaped). Default `MARKET_STOCK.perPlatform`. */
  perPlatform?: { min: number; max: number };
  /** Copies in the bargain bin each day. Default `MARKET_STOCK.bin`. */
  bin?: number;
  /** Chance a day that one wishlisted game turns up on its platform's stall. Default `MARKET_STOCK.wantedOdds`. */
  wantedOdds?: number;
}

/** The day's job lot: a few games sold together, cheaper than one by one. */
export interface JobLot {
  games: Game[];
  /** What they would cost one by one on the stalls. */
  worth: number;
  price: number;
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
  private binCapacity = Infinity;
  private cache: Day | null = null;
  private lotCache: { day: number; lot: Promise<JobLot> } | null = null;
  private readonly pools = new Map<PlatformId, Promise<readonly IndexEntry[]>>();

  constructor(private readonly deps: MarketStockDeps, options: MarketStockOptions = {}) {
    this.perPlatform = options.perPlatform ?? MARKET_STOCK.perPlatform;
    this.binSize = options.bin ?? MARKET_STOCK.bin;
    this.wantedOdds = options.wantedOdds ?? MARKET_STOCK.wantedOdds;
  }

  /** How many copies each stall (and the bin) can show; set by the market's builder before the first draw. */
  fitTo(stall: (platform: PlatformId) => number, bin: number): void {
    this.capacity = stall;
    this.binCapacity = bin;
  }

  get day(): number {
    return this.deps.calendar.day;
  }

  /** What kind of day it is. */
  get theme(): MarketDayTheme {
    return themeOf(this.day);
  }

  /** What is on today: the grail, the Grande Brocante, the sales (`marketEvents`). */
  get events(): MarketEvents {
    return eventsOn(this.day);
  }

  /** What people are saying about the days ahead (grail rumours, the next Brocante, sales), for the stalls, the papers and the flyers. */
  news(): MarketNews[] {
    return marketNews(this.day, (id) => this.deps.collection.owns(id));
  }

  /** The bargain bin's price today. */
  get binPrice(): number {
    return Math.max(1, Math.round(BARGAIN_PRICE * (this.theme.bin?.price ?? 1)));
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

  /** Opens a haggle over `item`, or says why there is none (still pricing, the bin, already agreed today). */
  negotiate(item: StockItem): Negotiation | { line: string } {
    const platform = item.game.platform;
    if (!item.priced) return { line: 'Hang on, I’m still working out what it’s worth.' };
    if (item.source === 'bin') return { line: `It's the bargain bin, friend. ${this.binPrice} coins, that's the deal.` };
    if (item.source === 'ordered') return { line: `That's your order: ${item.price} coins, as agreed.` };
    if (item.sale < 1) return { line: `It's a clearance, friend: ${item.price} coins, already slashed. No haggling.` };
    const { ledger, standing } = this.deps;
    const agreed = ledger.haggleOf(this.day, item.game.id);
    if (agreed !== undefined) return { line: agreed < 1 ? `We already shook on ${item.price} coins.` : `I said ${item.price}. My last word.` };
    return new Negotiation(item, {
      day: this.day,
      soured: ledger.moodOf(this.day, platform),
      loyalty: standing.loyalty(platform),
      coffee: ledger.hadCoffee(this.day),
      rain: this.deps.raining?.() ?? false,
    });
  }

  /** A haggle ended: its price holds all day; an insult sours the stall. */
  settle(item: StockItem, negotiation: Negotiation, insults: number): void {
    const platform = item.game.platform;
    const factor = negotiation.factor;
    this.deps.ledger.recordHaggle(this.day, item.game.id, factor);
    for (let i = 0; i < insults; i++) this.deps.ledger.sour(this.day, platform);
    item.setHaggle(factor);
    if (factor < 1) this.deps.standing.record('deal');
  }

  /** What holding `item` for the day costs (a deposit counted towards its price). */
  holdDeposit(item: StockItem): number {
    return Math.max(1, Math.round(item.price * HOLD_DEPOSIT));
  }

  /** The deposit on `item` is paid: other shoppers leave it alone today, and the copy stays on its stall all day whatever happens. */
  hold(item: StockItem, deposit: number): void {
    this.deps.ledger.hold(this.day, item.game.id, deposit, heldCopyOf(item));
    item.setDeposit(deposit);
  }

  /** `item` changed hands (bought): its hold or order is done, and the stall remembers the custom. */
  sold(item: StockItem): void {
    this.deps.ledger.release(this.day, item.game.id);
    if (item.source === 'ordered') this.deps.ledger.fulfil(item.game.id);
    if (item.source !== 'bin') this.deps.standing.record('buy', item.game.platform);
  }

  /** The player found out a fake on the stall: the stallholder lets it go cheap, and does not argue. False when it is no fake, or already found out. */
  expose(item: StockItem): boolean {
    if (!item.repro || item.exposed) return false;
    this.deps.ledger.catchRepro(this.day, item.game.id);
    item.expose(REPRO_CAUGHT);
    return true;
  }

  /** Another shopper bought `item`: gone for the day. */
  soldToRival(item: StockItem): void {
    this.deps.ledger.recordRivalSale(this.day, item.game.id);
  }

  /** The player sold `game`: it goes on its stall from tomorrow. */
  consign(game: Game): void {
    this.deps.ledger.consign(game, this.day);
  }

  /** What ordering a used copy of `game` at the counter costs, once its fame is known. */
  async orderQuote(game: Game): Promise<{ price: number; deposit: number; day: number }> {
    const views = await this.deps.fame.lookup(game);
    const price = Math.max(1, Math.round(shopPrice(game, views) * MARKET_ORDER.share));
    return { price, deposit: Math.max(1, Math.round(price * MARKET_ORDER.deposit)), day: this.day + MARKET_ORDER.days };
  }

  /** Books a used copy of `game` (deposit already paid): it waits on its stall from `day`. */
  order(game: Game, quote: { price: number; deposit: number; day: number }): void {
    this.deps.ledger.order({ game: { ...game, status: 'owned' }, day: quote.day, deposit: quote.deposit, price: quote.price });
  }

  /** The copies on order, due or not. */
  get orders(): readonly { game: Game; day: number; deposit: number; price: number }[] {
    return this.deps.ledger.orders;
  }

  /** Today's job lot (the same all day). */
  jobLot(): Promise<JobLot> {
    const day = this.day;
    if (!this.lotCache || this.lotCache.day !== day) this.lotCache = { day, lot: this.drawLot(day) };
    return this.lotCache.lot;
  }

  get lotSold(): boolean {
    return this.deps.ledger.lotBought(this.day);
  }

  /** The job lot was bought: the crate is empty for the day. */
  sellLot(): void {
    this.deps.ledger.recordLot(this.day);
    this.deps.standing.record('lot');
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
    const rng = seeded(seed);
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

  /**
   * Today's stock. Every draw has a seed of its own (`${day}:<platform>:<slot>`), so nothing moves
   * another: a platform's index failing to load, a copy bought, a game on the wishlist, a platform
   * added. Held copies are put back as they were paid for, in their place when the draw gives
   * them again, else after the rest (room is kept for them).
   */
  private async draw(day: number): Promise<StockItem[]> {
    const rngOf = (slot: string) => seeded(`${day}:${slot}`);
    const theme = themeOf(day);
    const baseDiscount = MARKET_DISCOUNT.min + rngOf('discount')() * (MARKET_DISCOUNT.max - MARKET_DISCOUNT.min);
    const { collection, ledger, standing } = this.deps;
    const owns = (id: string) => collection.owns(id);
    const consigned = ledger.consignedOn(day);
    const ordered = ledger.orders.filter((o) => o.day <= day);
    const held = ledger.heldCopies(day);
    const wishlist = collection.games.filter((g) => g.status === 'wishlist');
    const items: StockItem[] = [];
    const binCandidates: { entry: IndexEntry; platform: PlatformId }[] = [];
    // Now and then a first print of a game the player owns in an ordinary printing: a reason to look at their own games again.
    const upgradable = collection.games.filter((g) => g.status === 'owned' && (g.edition ?? 'standard') !== 'firstPrint' && !g.repro);
    const upgradeRng = rngOf('upgrade');
    const upgradeRoll = upgradeRng();
    const upgradeAt = upgradeRng();
    const upgradePick = upgradeRoll < UPGRADE_ODDS ? upgradable[Math.floor(upgradeAt * upgradable.length)] : undefined;
    // The day's events: a grail on its stall, a stall clearing out (its ordinary copies cheaper, no haggling).
    const { grail, clearance } = eventsOn(day);

    for (const platform of PLATFORM_LIST) {
      const p = platform.id;
      // No index (offline): no ordinary finds, but the orders, the holds, the showpieces and what the player sold still stand.
      const pool = await this.releases(p).catch((err: unknown) => {
        console.warn(`[market] no index for ${platform.shortName}`, err);
        return [] as readonly IndexEntry[];
      });
      const discount = baseDiscount * (appliesTo(theme.priceFactor, p) ? theme.priceFactor!.factor : 1);
      const sale = clearance?.platform === p ? clearance.factor : undefined;
      const room = this.capacity(p);
      const stall: StockItem[] = [];
      const taken = new Set<string>();
      const heldHere = held.filter((h) => h.game.platform === p);
      const unplacedHolds = () => heldHere.filter((h) => !taken.has(h.game.id)).length;
      const putHeld = (hold: HeldCopy & { deposit: number }): StockItem => {
        taken.add(hold.game.id);
        const onSale = sale !== undefined && hold.source === 'stall' ? sale : undefined;
        const item = new StockItem(hold.game, hold.condition, hold.source, { list: hold.list, final: true }, { edition: hold.edition, repro: hold.repro, gem: hold.gem, sale: onSale });
        const agreed = ledger.haggleOf(day, hold.game.id);
        if (agreed !== undefined) item.setHaggle(agreed);
        item.setDeposit(hold.deposit);
        stall.push(item);
        return item;
      };
      const offer = (game: Game, condition: BoxCondition, source: StockSource, traits: StockTraits = {}, factor = 1): StockItem | null => {
        if (taken.has(game.id)) return null;
        const hold = heldHere.find((h) => h.game.id === game.id);
        if (hold) return putHeld(hold);
        if (stall.length + unplacedHolds() >= room || (owns(game.id) && source !== 'upgrade')) return null;
        taken.add(game.id);
        const item = this.priced(game, condition, source, discount * factor, traits);
        stall.push(item);
        return item;
      };

      // What the player ordered comes first: it is theirs, deposit paid, at the agreed price.
      for (const order of ordered.filter((o) => o.game.platform === p)) {
        if (stall.length >= room || owns(order.game.id) || taken.has(order.game.id)) continue;
        taken.add(order.game.id);
        const item = new StockItem(order.game, 'complete', 'ordered', { list: order.price, final: true });
        item.setDeposit(order.deposit);
        stall.push(item);
      }
      // The grail, on its day: front and centre, at its own price (the day's discount does not touch it).
      if (grail?.platform === p) {
        const game = grailGame(grail);
        const hold = heldHere.find((h) => h.game.id === game.id);
        if (hold) putHeld(hold);
        else if (!owns(game.id) && !taken.has(game.id) && stall.length + unplacedHolds() < room) {
          taken.add(game.id);
          const item = new StockItem(game, 'complete', 'grail', { list: grail.price, final: true });
          const agreed = ledger.haggleOf(day, game.id);
          if (agreed !== undefined) item.setHaggle(agreed);
          stall.push(item);
        }
      }
      // The showpiece: a title everyone knows, complete, front and centre (under the id the index gives it, so owning either
      // copy counts). The day shuffles the platform's famous games; the first the player does not own is the showpiece.
      const showRng = rngOf(`${p}:showpiece`);
      const shuffled = shuffle([...famous(p)], showRng);
      const firstPrint = showRng() < MARKET_STOCK.showpieceFirstPrint;
      const unowned = shuffled.filter((g) => !owns(g.id));
      if (unowned[0]) offer(unowned[0], 'complete', 'showpiece', { edition: firstPrint ? 'firstPrint' : 'standard' });
      // An estate sale: another famous game on every stall; a trusted player gets first pick of one more, before the crowd.
      if (theme.estate && unowned[1]) offer(unowned[1], 'complete', 'estate');
      if (theme.estate && standing.reputation.level >= REPUTATION.earlyAccessLevel && unowned[2]) offer(unowned[2], 'complete', 'estate');
      if (upgradePick?.platform === p) offer(upgradePick, 'complete', 'upgrade', { edition: 'firstPrint' });
      // A friend of the stall gets a copy kept aside: something off the wishlist, else another classic.
      const loyalty = standing.loyalty(p);
      const wanted = wishlist.filter((g) => g.platform === p);
      const keptRoll = rngOf(`${p}:keptAside`)();
      if (loyalty >= 2) {
        const pick = wanted[Math.floor(keptRoll * wanted.length)] ?? unowned[Math.floor(keptRoll * unowned.length)];
        if (pick) offer(pick, 'complete', 'keptAside');
      }
      // Word got round of what the player is after (more readily for a regular).
      const wantedRng = rngOf(`${p}:wanted`);
      const wantedRoll = wantedRng();
      const wantedPick = wanted[Math.floor(wantedRng() * wanted.length)];
      const wantedCondition = drawCondition(wantedRng());
      const odds = this.wantedOdds * (loyalty >= 1 ? LOYALTY.wantedOddsBoost : 1);
      if (wantedPick && wantedRoll < odds) offer(wantedPick, wantedCondition, 'wanted');
      // What the player sold, in the state they sold it.
      for (const game of consigned.filter((g) => g.platform === p)) {
        offer(game, game.condition ?? 'complete', 'consigned', { edition: game.edition, repro: game.repro });
      }
      // Then the day's finds: now and then a first print, a budget re-release, a fake, a Japanese import (cheaper: the text is Japanese).
      const { min, max } = this.perPlatform;
      const extra = appliesTo(theme.extraCopies, p) ? theme.extraCopies!.count : 0;
      const count = min + Math.floor(rngOf(`${p}:count`)() * (max - min + 1)) + extra;
      const imports = await this.imports(p).catch(() => [] as readonly IndexEntry[]);
      pickDistinct(pool, count, rngOf(`${p}:finds`)).forEach((found, i) => {
        const r = rngOf(`${p}:find:${i}`);
        const [importRoll, importAt, conditionRoll, editionRoll, reproRoll] = [r(), r(), r(), r(), r()];
        const imported = imports.length > 0 && importRoll < IMPORT.odds;
        const entry = imported ? imports[Math.floor(importAt * imports.length)]! : found;
        const condition = drawCondition(conditionRoll);
        const edition = drawEdition(editionRoll, theme.firstPrintBoost ?? 1);
        const repro = condition !== 'worn' && reproRoll < REPRO_ODDS;
        offer(gameFrom(entry, p), condition, 'stall', { edition, repro, sale }, (imported ? IMPORT.price : 1) * (sale ?? 1));
      });
      // The copies held for the player that the draw did not give again: paid for, so on the stall all the same.
      for (const hold of heldHere) if (!taken.has(hold.game.id)) putHeld(hold);
      items.push(...stall);
      // A deeper bin (a bin day, the Brocante) needs more to choose from.
      for (const entry of pickDistinct(pool, Math.ceil(3 * (theme.bin?.size ?? 1)), rngOf(`${p}:bin`))) binCandidates.push({ entry, platform: p });
    }

    // The bargain bin: worn copies of anything, one price, and on a lucky day a gem among them.
    const binPrice = Math.max(1, Math.round(BARGAIN_PRICE * (theme.bin?.price ?? 1)));
    const binRoom = Math.min(Math.round(this.binSize * (theme.bin?.size ?? 1)), this.binCapacity);
    const inStock = new Set(items.map((item) => item.game.id));
    const bin: StockItem[] = [];
    const gems = (rngOf('gems')() < BIN_GEM_ODDS ? 1 : 0) + (theme.estate?.gems ?? 0) + (theme.gems ?? 0);
    for (let i = 0; i < gems && bin.length < binRoom; i++) {
      const r = rngOf(`gem:${i}`);
      const platform = PLATFORM_LIST[Math.floor(r() * PLATFORM_LIST.length)]!.id;
      const gem = shuffle([...famous(platform)], r).find((g) => !inStock.has(g.id) && !owns(g.id));
      if (!gem) continue;
      inStock.add(gem.id);
      bin.push(new StockItem(gem, 'worn', 'bin', { list: binPrice, final: true }, { gem: true }));
    }
    for (const { entry, platform } of shuffle(binCandidates, rngOf('bin'))) {
      if (bin.length >= binRoom) break;
      const game = gameFrom(entry, platform);
      if (inStock.has(game.id) || owns(game.id)) continue;
      inStock.add(game.id);
      bin.push(new StockItem(game, 'worn', 'bin', { list: binPrice, final: true }));
    }
    // The gems hide among the rest, not on top.
    items.push(...shuffle(bin, rngOf('binOrder')));

    // Held copies keep their deposit (those held before copies were kept, when the draw gave them again); fakes found out keep their knock-down price.
    for (const item of items) {
      const deposit = ledger.holdOf(day, item.game.id);
      if (deposit !== undefined) item.setDeposit(deposit);
      if (item.repro && ledger.isCaught(day, item.game.id)) item.expose(REPRO_CAUGHT);
    }
    return items;
  }

  /** A crate of a few games from anywhere, at a share of what they would fetch one by one. Each pick has a seed of its own. */
  private async drawLot(day: number): Promise<JobLot> {
    const rng = seeded(`${day}:lot`);
    const size = JOB_LOT.min + Math.floor(rng() * (JOB_LOT.max - JOB_LOT.min + 1));
    const games: Game[] = [];
    for (let i = 0; i < size * 3 && games.length < size; i++) {
      const r = seeded(`${day}:lot:${i}`);
      const [platformRoll, entryRoll, conditionRoll] = [r(), r(), r()];
      const platform = PLATFORM_LIST[Math.floor(platformRoll * PLATFORM_LIST.length)]!.id;
      const pool = await this.releases(platform).catch(() => [] as readonly IndexEntry[]);
      const entry = pool[Math.floor(entryRoll * pool.length)];
      if (!entry) continue;
      const game = gameFrom(entry, platform);
      const condition = drawCondition(conditionRoll);
      if (games.some((g) => g.id === game.id) || this.deps.collection.owns(game.id)) continue;
      games.push({ ...game, condition: condition === 'complete' ? undefined : condition });
    }
    // Priced once every lookup is back (a failed one leaves its game ordinary).
    const views = await Promise.all(games.map((g) => this.deps.fame.lookup(g)));
    const worth = games.reduce((sum, g, i) => sum + marketPrice(g, views[i], g.condition ?? 'complete', (MARKET_DISCOUNT.min + MARKET_DISCOUNT.max) / 2), 0);
    return { games, worth, price: Math.max(1, Math.round(worth * JOB_LOT.share)) };
  }

  /** The item at the price its known fame gives, final once the lookup lands (a failed lookup leaves it ordinary). */
  private priced(game: Game, condition: BoxCondition, source: StockSource, discount: number, traits: StockTraits): StockItem {
    const { fame, ledger } = this.deps;
    const edition: Edition = traits.edition ?? 'standard';
    const known = fame.peek(game);
    const settle = known !== undefined ? undefined : fame.lookup(game).then((views) => marketPrice(game, views, condition, discount, edition));
    const item = new StockItem(game, condition, source, { list: marketPrice(game, known, condition, discount, edition), final: known !== undefined, settle }, traits);
    const agreed = ledger.haggleOf(this.day, game.id);
    if (agreed !== undefined) item.setHaggle(agreed);
    return item;
  }
}

/** The built-in list's games on `platform` that the index knows (their ids are the index's: see `SEED_GAMES`). */
function famous(platform: PlatformId): Game[] {
  return SEED_GAMES.filter((g) => g.platform === platform && g.externalIds?.libretroName && !isGrail(g.id));
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

function gameFrom(entry: IndexEntry, platform: PlatformId): Game {
  return {
    id: gameIdFor(platform, entry.name),
    title: entry.title,
    platform,
    region: entry.region,
    status: 'owned',
    externalIds: { libretroName: entry.name },
  };
}

/** Most copies are complete; some lack the manual; a few have seen better days (`CONDITION_ODDS`). */
function drawCondition(u: number): BoxCondition {
  return u < CONDITION_ODDS.worn ? 'worn' : u < CONDITION_ODDS.worn + CONDITION_ODDS.noManual ? 'noManual' : 'complete';
}

/** Now and then a first print (more on a collectors' fair), more often a budget re-release. */
function drawEdition(u: number, firstPrintBoost: number): Edition {
  const first = EDITION_ODDS.firstPrint * firstPrintBoost;
  return u < first ? 'firstPrint' : u < first + EDITION_ODDS.budget ? 'budget' : 'standard';
}

function pickDistinct<T>(pool: readonly T[], count: number, rng: () => number): T[] {
  const picked: T[] = [];
  const taken = new Set<number>();
  const n = Math.min(count, pool.length);
  while (picked.length < n) {
    const i = Math.floor(rng() * pool.length);
    if (taken.has(i)) continue;
    taken.add(i);
    picked.push(pool[i]!);
  }
  return picked;
}

function shuffle<T>(list: T[], rng: () => number): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j]!, list[i]!];
  }
  return list;
}
