import type { BoxCondition, Edition, Game, PlatformId } from '@/catalog/types';
import { PLATFORM_LIST } from '@/catalog/platforms';
import { SEED_GAMES } from '@/catalog';
import type { IndexEntry } from '@/collection/LibretroIndex';
import type { HeldCopy, MarketLedger } from './MarketLedger';
import type { MarketStanding } from './MarketStanding';
import { appliesTo, themeOf, type MarketDayTheme } from './marketDays';
import { eventsOn } from './marketEvents';
import { grailGame, isGrail } from './grails';
import {
  BARGAIN_PRICE, BIN_GEM_ODDS, BOOTLEG, EDITION_ODDS, HOMEBREW, IMPORT, LOYALTY, MARKET_DISCOUNT, MARKET_STOCK, REPRO_CAUGHT,
  REPRO_ODDS, REPUTATION, UPGRADE_ODDS,
} from './pricing';
import { StockItem, type StockSource, type StockTraits } from './StockItem';
import { drawCondition, gameFrom } from './stockDraws';
import { HOMEBREW_CARTS } from '@/emulator/homebrew';
import { dressCopy, drawBootleg } from './copyTraits';
import { shuffled } from '@/random';
import { dayStream } from '@/time/daily';
import { hidesShowpiece, stallLoyalty, stallMarkup } from '@/social/market';

/** What a day's draw reads and asks of the market (`MarketStock` hands itself over): the stores, the stalls' room, the index, the pricing. */
export interface DrawContext {
  /** The collection: what the player owns (a wishlist entry is not owned) and wishes for. */
  collection: { owns(id: string): boolean; readonly games: readonly Game[] };
  ledger: MarketLedger;
  standing: MarketStanding;
  /** Ordinary copies offered per platform each day, drawn in this range. */
  perPlatform: { min: number; max: number };
  /** Copies in the bargain bin each day, before the day's theme and the bins' room. */
  binSize: number;
  /** Chance a day that one wishlisted game turns up on its platform's stall. */
  wantedOdds: number;
  /** How many copies the platform's stall shows. */
  capacity(platform: PlatformId): number;
  /** How many copies the bins hold on a day of this kind. */
  binCapacity(theme: MarketDayTheme): number;
  /** The index's plausible western releases for the platform; rejects when the index cannot be loaded. */
  releases(platform: PlatformId): Promise<readonly IndexEntry[]>;
  /** The index's Japanese releases for the platform; rejects when the index cannot be loaded. */
  imports(platform: PlatformId): Promise<readonly IndexEntry[]>;
  /** The item at the price its fame gives (`MarketStock.priced`). */
  priced(game: Game, condition: BoxCondition, source: StockSource, discount: number, traits: StockTraits): StockItem;
}

type Held = HeldCopy & { deposit: number };

/**
 * One market day's stock, drawn step by step: the stalls platform by platform (the orders, the grail, a homebrew cart,
 * the showpieces, a copy kept aside, a wishlist find, what the player sold, the day's finds, the holds left over), then
 * the bargain bin, then what the ledger remembers of each copy. Every draw has a seed of its own (`${day}:<slot>`,
 * `rngOf`), so nothing moves another: a platform's index failing to load, a copy bought, a game on the wishlist, a
 * platform added. Each step reads its stream in the order the one long method before them did, so a saved day draws
 * the same stock. Held copies are put back as they were paid for, in their place when the draw gives them again, else
 * after the rest (room is kept for them).
 */
export async function drawDay(day: number, ctx: DrawContext): Promise<StockItem[]> {
  const draw = new DayDraw(day, ctx);
  const items: StockItem[] = [];
  const binCandidates: BinCandidate[] = [];
  for (const platform of PLATFORM_LIST) {
    const stall = await draw.stall(platform.id, platform.shortName);
    items.push(...stall.items);
    binCandidates.push(...stall.binCandidates);
  }
  items.push(...draw.bin(items, binCandidates));
  draw.remember(items);
  return items;
}

interface BinCandidate {
  entry: IndexEntry;
  platform: PlatformId;
}

class DayDraw {
  readonly theme: MarketDayTheme;
  /** The day's discount on ordinary copies, before a theme's price factor. */
  private readonly baseDiscount: number;
  private readonly consigned: readonly Game[];
  private readonly ordered: readonly { game: Game; day: number; price: number; deposit: number }[];
  private readonly held: readonly Held[];
  private readonly wishlist: readonly Game[];
  /** Now and then a first print of a game the player owns in an ordinary printing: a reason to look at their own games again. */
  private readonly upgradePick: Game | undefined;
  /** The day's events: a grail on its stall, a stall clearing out (its ordinary copies cheaper, no haggling). */
  private readonly grail: ReturnType<typeof eventsOn>['grail'];
  private readonly clearance: ReturnType<typeof eventsOn>['clearance'];

  constructor(
    readonly day: number,
    readonly ctx: DrawContext,
  ) {
    const { collection, ledger } = ctx;
    this.theme = themeOf(day);
    this.baseDiscount = MARKET_DISCOUNT.min + this.rngOf('discount')() * (MARKET_DISCOUNT.max - MARKET_DISCOUNT.min);
    this.consigned = ledger.consignedOn(day);
    this.ordered = ledger.orders.filter((o) => o.day <= day);
    this.held = ledger.heldCopies(day);
    this.wishlist = collection.games.filter((g) => g.status === 'wishlist');
    const upgradable = collection.games.filter((g) => g.status === 'owned' && (g.edition ?? 'standard') !== 'firstPrint' && !g.repro);
    const upgradeRng = this.rngOf('upgrade');
    const upgradeRoll = upgradeRng();
    const upgradeAt = upgradeRng();
    this.upgradePick = upgradeRoll < UPGRADE_ODDS ? upgradable[Math.floor(upgradeAt * upgradable.length)] : undefined;
    const { grail, clearance } = eventsOn(day);
    this.grail = grail;
    this.clearance = clearance;
  }

  /** A stream of the day's own for `slot`: what one step draws never moves another. */
  rngOf(slot: string): () => number {
    return dayStream(`${this.day}:${slot}`);
  }

  owns(id: string): boolean {
    return this.ctx.collection.owns(id);
  }

  /** One platform's stall, in stall order. */
  async stall(p: PlatformId, shortName: string): Promise<Stall> {
    // No index (offline): no ordinary finds, but the orders, the holds, the showpieces and what the player sold still stand.
    const pool = await this.ctx.releases(p).catch((err: unknown) => {
      console.warn(`[market] no index for ${shortName}`, err);
      return [] as readonly IndexEntry[];
    });
    const { theme } = this;
    const discount = this.baseDiscount * (appliesTo(theme.priceFactor, p) ? theme.priceFactor!.factor : 1);
    const sale = this.clearance?.platform === p ? this.clearance.factor : undefined;
    const stall = new Stall(this, p, {
      discount,
      sale,
      room: this.ctx.capacity(p),
      // A hostile stallholder prices dearer for this player, and keeps the showpiece back (`social/market`).
      markup: stallMarkup(p),
      held: this.held.filter((h) => h.game.platform === p),
    });
    this.placeOrders(stall);
    this.placeGrail(stall);
    if (p === 'nes') this.placeHomebrew(stall);
    const unowned = this.placeShowpieces(stall);
    this.placeKeptAside(stall, unowned);
    this.placeWanted(stall);
    this.placeConsigned(stall);
    await this.placeFinds(stall, pool);
    // The copies held for the player that the draw did not give again: paid for, so on the stall all the same.
    stall.putLeftoverHolds();
    // A deeper bin (a bin day, the Flea Fair) needs more to choose from.
    for (const entry of pickDistinct(pool, Math.ceil(3 * (theme.bin?.size ?? 1)), this.rngOf(`${p}:bin`))) stall.binCandidates.push({ entry, platform: p });
    return stall;
  }

  /** What the player ordered comes first: it is theirs, deposit paid, at the agreed price. */
  private placeOrders(stall: Stall): void {
    for (const order of this.ordered.filter((o) => o.game.platform === stall.platform)) {
      if (stall.items.length >= stall.room || this.owns(order.game.id) || stall.has(order.game.id)) continue;
      const item = new StockItem(order.game, 'complete', 'ordered', { list: order.price, final: true });
      item.setDeposit(order.deposit);
      stall.push(item);
    }
  }

  /** The grail, on its day: front and centre, at its own price (the day's discount does not touch it). */
  private placeGrail(stall: Stall): void {
    const { grail } = this;
    if (grail?.platform !== stall.platform) return;
    const game = grailGame(grail);
    const hold = stall.holdOf(game.id);
    if (hold) stall.putHeld(hold);
    else if (!this.owns(game.id) && !stall.has(game.id) && stall.hasRoomKeepingHolds()) {
      const item = new StockItem(game, 'complete', 'grail', { list: grail.price, final: true });
      const agreed = this.ctx.ledger.haggleOf(this.day, game.id);
      if (agreed !== undefined) item.setHaggle(agreed);
      stall.push(item);
    }
  }

  /** A homebrew cart now and then on the NES stall (`emulator/homebrew`: it really plays on the TV), new, at its own price. */
  private placeHomebrew(stall: Stall): void {
    const brewRng = this.rngOf('nes:homebrew');
    const unownedBrews = brewRng() < HOMEBREW.odds ? HOMEBREW_CARTS.filter((c) => !this.owns(c.game.id)) : [];
    const brew = unownedBrews[Math.floor(brewRng() * unownedBrews.length)]?.game;
    const brewHold = brew && stall.holdOf(brew.id);
    if (brewHold) stall.putHeld(brewHold);
    else if (brew && !stall.has(brew.id) && stall.hasRoomKeepingHolds()) {
      stall.push(new StockItem(brew, 'complete', 'stall', { list: HOMEBREW.price, final: true }));
    }
  }

  /**
   * The showpiece: a title everyone knows, complete, front and centre (under the id the index gives it, so owning either
   * copy counts). The day shuffles the platform's famous games; the first the player does not own is the showpiece. An
   * estate sale puts another famous game on every stall, and a trusted player gets first pick of one more, before the
   * crowd; the day's upgrade (a first print of a game the player owns) comes with them. Returns the famous games the
   * player does not own, in the day's order, for the copy kept aside.
   */
  private placeShowpieces(stall: Stall): Game[] {
    const p = stall.platform;
    const { theme } = this;
    const showRng = this.rngOf(`${p}:showpiece`);
    const order = shuffled(showRng, famous(p));
    const firstPrint = showRng() < MARKET_STOCK.showpieceFirstPrint;
    const unowned = order.filter((g) => !this.owns(g.id));
    // Each copy is dressed from a stream of its own (`copyTraits`): a collector's piece is sealed more often.
    const collectorPiece = (game: Game, slot: string) => dressCopy(this.rngOf(`${p}:dress:${slot}`), game, { kind: 'collector' });
    if (unowned[0] && !hidesShowpiece(p)) stall.offer(collectorPiece(unowned[0], 'showpiece'), 'complete', 'showpiece', { edition: firstPrint ? 'firstPrint' : 'standard' });
    if (theme.estate && unowned[1]) stall.offer(collectorPiece(unowned[1], 'estate:1'), 'complete', 'estate');
    if (theme.estate && this.ctx.standing.reputation.level >= REPUTATION.earlyAccessLevel && unowned[2]) stall.offer(collectorPiece(unowned[2], 'estate:2'), 'complete', 'estate');
    if (this.upgradePick?.platform === p) stall.offer(this.upgradePick, 'complete', 'upgrade', { edition: 'firstPrint' });
    return unowned;
  }

  /** A friend of the stall gets a copy kept aside: something off the wishlist, else another classic. */
  private placeKeptAside(stall: Stall, unowned: readonly Game[]): void {
    const p = stall.platform;
    const wanted = this.wishlist.filter((g) => g.platform === p);
    const keptRoll = this.rngOf(`${p}:keptAside`)();
    if (stall.loyalty < 2) return;
    const pick = wanted[Math.floor(keptRoll * wanted.length)] ?? unowned[Math.floor(keptRoll * unowned.length)];
    if (pick) stall.offer(dressCopy(this.rngOf(`${p}:dress:keptAside`), pick, { kind: 'collector' }), 'complete', 'keptAside');
  }

  /** Word got round of what the player is after (more readily for a regular). */
  private placeWanted(stall: Stall): void {
    const p = stall.platform;
    const wanted = this.wishlist.filter((g) => g.platform === p);
    const wantedRng = this.rngOf(`${p}:wanted`);
    const wantedRoll = wantedRng();
    const wantedPick = wanted[Math.floor(wantedRng() * wanted.length)];
    const wantedCondition = drawCondition(wantedRng());
    const odds = this.ctx.wantedOdds * (stall.loyalty >= 1 ? LOYALTY.wantedOddsBoost : 1);
    if (wantedPick && wantedRoll < odds) stall.offer(dressCopy(this.rngOf(`${p}:dress:wanted`), wantedPick, { condition: wantedCondition }), wantedCondition, 'wanted');
  }

  /** What the player sold, in the state they sold it. */
  private placeConsigned(stall: Stall): void {
    for (const game of this.consigned.filter((g) => g.platform === stall.platform)) {
      stall.offer(game, game.condition ?? 'complete', 'consigned', { edition: game.edition, repro: game.repro });
    }
  }

  /** The day's finds: now and then a first print, a budget re-release, a fake, a Japanese import (cheaper: the text is Japanese). */
  private async placeFinds(stall: Stall, pool: readonly IndexEntry[]): Promise<void> {
    const p = stall.platform;
    const { theme } = this;
    const { min, max } = this.ctx.perPlatform;
    const extra = appliesTo(theme.extraCopies, p) ? theme.extraCopies!.count : 0;
    const count = min + Math.floor(this.rngOf(`${p}:count`)() * (max - min + 1)) + extra;
    const imports = await this.ctx.imports(p).catch(() => [] as readonly IndexEntry[]);
    const { sale } = stall;
    pickDistinct(pool, count, this.rngOf(`${p}:finds`)).forEach((found, i) => {
      const r = this.rngOf(`${p}:find:${i}`);
      const [importRoll, importAt, conditionRoll, editionRoll, reproRoll] = [r(), r(), r(), r(), r()];
      const imported = imports.length > 0 && importRoll < IMPORT.odds;
      const entry = imported ? imports[Math.floor(importAt * imports.length)]! : found;
      const condition = drawCondition(conditionRoll);
      const edition = drawEdition(editionRoll, theme.firstPrintBoost ?? 1);
      const repro = condition !== 'worn' && reproRoll < REPRO_ODDS;
      // Now and then an unlicensed cartridge instead (`catalog/bootlegs`): a curiosity, priced like any obscure game.
      const odd = this.rngOf(`${p}:bootleg:${i}`);
      const bootleg = !imported && odd() < BOOTLEG.stallOdds ? drawBootleg(odd, p, { condition }) : null;
      if (bootleg && !this.owns(bootleg.id)) stall.offer(bootleg, condition, 'stall', { sale }, sale ?? 1);
      else stall.offer(dressCopy(this.rngOf(`${p}:dress:${i}`), gameFrom(entry, p), { condition, repro }), condition, 'stall', { edition, repro, sale }, (imported ? IMPORT.price : 1) * (sale ?? 1));
    });
  }

  /** The bargain bin: worn copies of anything, one price, and on a lucky day a gem among them (the gems hide among the rest, not on top). */
  bin(items: readonly StockItem[], candidates: readonly BinCandidate[]): StockItem[] {
    const { theme } = this;
    const binPrice = Math.max(1, Math.round(BARGAIN_PRICE * (theme.bin?.price ?? 1)));
    const binRoom = Math.min(Math.round(this.ctx.binSize * (theme.bin?.size ?? 1)), this.ctx.binCapacity(theme));
    const inStock = new Set(items.map((item) => item.game.id));
    const bin: StockItem[] = [];
    const gems = (this.rngOf('gems')() < BIN_GEM_ODDS ? 1 : 0) + (theme.estate?.gems ?? 0) + (theme.gems ?? 0);
    for (let i = 0; i < gems && bin.length < binRoom; i++) {
      const r = this.rngOf(`gem:${i}`);
      const platform = PLATFORM_LIST[Math.floor(r() * PLATFORM_LIST.length)]!.id;
      const gem = shuffled(r, famous(platform)).find((g) => !inStock.has(g.id) && !this.owns(g.id));
      if (!gem) continue;
      inStock.add(gem.id);
      bin.push(new StockItem(dressCopy(this.rngOf(`dress:gem:${i}`), gem, { condition: 'worn', kind: 'bin' }), 'worn', 'bin', { list: binPrice, final: true }, { gem: true }));
    }
    // A bootleg among the worn copies, most days (a stream of its own: nothing else in the bin moves).
    const odd = this.rngOf('bin:bootleg');
    if (odd() < BOOTLEG.binOdds && bin.length < binRoom) {
      const bootleg = drawBootleg(odd, undefined, { condition: 'worn', kind: 'bin' });
      if (bootleg && !inStock.has(bootleg.id) && !this.owns(bootleg.id)) {
        inStock.add(bootleg.id);
        bin.push(new StockItem(bootleg, 'worn', 'bin', { list: binPrice, final: true }));
      }
    }
    for (const { entry, platform } of shuffled(this.rngOf('bin'), candidates)) {
      if (bin.length >= binRoom) break;
      const game = gameFrom(entry, platform);
      if (inStock.has(game.id) || this.owns(game.id)) continue;
      inStock.add(game.id);
      bin.push(new StockItem(dressCopy(this.rngOf(`dress:bin:${game.id}`), game, { condition: 'worn', kind: 'bin' }), 'worn', 'bin', { list: binPrice, final: true }));
    }
    return shuffled(this.rngOf('binOrder'), bin);
  }

  /** Held copies keep their deposit (those held before copies were kept, when the draw gave them again); fakes found out keep their knock-down price. */
  remember(items: readonly StockItem[]): void {
    const { ledger } = this.ctx;
    for (const item of items) {
      item.drawnOn = this.day;
      const deposit = ledger.holdOf(this.day, item.game.id);
      if (deposit !== undefined) item.setDeposit(deposit);
      if (item.repro && ledger.isCaught(this.day, item.game.id)) item.expose(REPRO_CAUGHT);
    }
  }
}

interface StallTerms {
  /** The day's discount on this stall's ordinary copies. */
  discount: number;
  /** A clearance's factor, when this stall is clearing out. */
  sale: number | undefined;
  /** How many copies the stall shows. */
  room: number;
  /** A hostile stallholder's markup for this player. */
  markup: number;
  /** The copies held for the player on this stall. */
  held: readonly Held[];
}

/** One stall being laid out: its copies in order, which games it has, the holds still to place, and the room left. */
class Stall {
  readonly items: StockItem[] = [];
  readonly binCandidates: BinCandidate[] = [];
  readonly sale: number | undefined;
  readonly room: number;
  /** How much of a friend of the stall the player is (`social/market`). */
  readonly loyalty: number;
  private readonly discount: number;
  private readonly markup: number;
  private readonly held: readonly Held[];
  private readonly taken = new Set<string>();

  constructor(
    private readonly draw: DayDraw,
    readonly platform: PlatformId,
    terms: StallTerms,
  ) {
    this.discount = terms.discount;
    this.sale = terms.sale;
    this.room = terms.room;
    this.markup = terms.markup;
    this.held = terms.held;
    this.loyalty = stallLoyalty(platform, draw.ctx.standing.loyalty(platform));
  }

  has(id: string): boolean {
    return this.taken.has(id);
  }

  holdOf(id: string): Held | undefined {
    return this.held.find((h) => h.game.id === id);
  }

  /** Whether another copy fits, the holds not placed yet keeping their room. */
  hasRoomKeepingHolds(): boolean {
    return this.items.length + this.unplacedHolds() < this.room;
  }

  /** A copy that is not an offer (an order, the grail, a homebrew cart): on the stall as it is. */
  push(item: StockItem): void {
    this.taken.add(item.game.id);
    this.items.push(item);
  }

  /** A held copy back on the stall as it was paid for: its list price, its haggle, its deposit. */
  putHeld(hold: Held): StockItem {
    this.taken.add(hold.game.id);
    const onSale = this.sale !== undefined && hold.source === 'stall' ? this.sale : undefined;
    const item = new StockItem(hold.game, hold.condition, hold.source, { list: hold.list, final: true }, { edition: hold.edition, repro: hold.repro, gem: hold.gem, sale: onSale });
    const agreed = this.draw.ctx.ledger.haggleOf(this.draw.day, hold.game.id);
    if (agreed !== undefined) item.setHaggle(agreed);
    item.setDeposit(hold.deposit);
    this.items.push(item);
    return item;
  }

  /** A copy offered at the day's price: the held one when the player holds it, none when the stall is full or the player owns the game. */
  offer(game: Game, condition: BoxCondition, source: StockSource, traits: StockTraits = {}, factor = 1): StockItem | null {
    if (this.taken.has(game.id)) return null;
    const hold = this.holdOf(game.id);
    if (hold) return this.putHeld(hold);
    if (!this.hasRoomKeepingHolds() || (this.draw.owns(game.id) && source !== 'upgrade')) return null;
    this.taken.add(game.id);
    const item = this.draw.ctx.priced(game, condition, source, this.discount * factor * this.markup, traits);
    this.items.push(item);
    return item;
  }

  /** The holds the draw did not give again, after the rest. */
  putLeftoverHolds(): void {
    for (const hold of this.held) if (!this.taken.has(hold.game.id)) this.putHeld(hold);
  }

  private unplacedHolds(): number {
    return this.held.filter((h) => !this.taken.has(h.game.id)).length;
  }
}

/** The built-in list's games on `platform` that the index knows (their ids are the index's: see `SEED_GAMES`). */
function famous(platform: PlatformId): Game[] {
  return SEED_GAMES.filter((g) => g.platform === platform && g.externalIds?.libretroName && !isGrail(g.id));
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
