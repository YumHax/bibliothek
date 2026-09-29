import * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import type { BuildContext } from '../buildContext';
import type { Platform, PlatformId } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import type { StockItem } from '@/economy/StockItem';
import type { MarketNews } from '@/economy/marketEvents';
import type { MarketDayTheme } from '@/economy/marketDays';
import { flyerRumour, noticeRumour, stallRumour } from '@/economy/rumours';
import { BIN_WHERE, RIVAL_BUYING } from '@/economy/pricing';
import type { SaleReaction } from '@/game/SessionActions';
import { playBoxClack } from '@/audio/boxClack';
import type { SkyState } from '../props/DayNight';
import type { Vendor } from '../people/Vendor';
import type { BrowseSpot, Shopper } from '../people/Shopper';
import { ForSaleBox } from './ForSaleBox';
import { BargainBin } from './BargainBin';
import type { DisplaySlot, StallLike } from './stallTypes';
import type { CrowdSound } from './CrowdSound';
import type { InfoBoard, InfoRow } from './InfoBoard';
import { NOTICE_BOARD_MAX_CARDS, type NoticeBoard } from './NoticeBoard';
import type { LotCrate } from './LotCrate';
import type { WishPennant } from './WishPennant';
import { REACTIONS, stallLines } from './stallTalk';

/** One stall as the hall keeps track of it: what stands there, who sells, what is on it and what went. */
export interface FloorStall {
  /** Its place in the stall order (the stallholder's pick of rumours follows it). */
  index: number;
  platform: Platform;
  stall: StallLike;
  vendor: Vendor;
  boxes: Set<ForSaleBox>;
  sold: number;
  pennant: WishPennant | null;
}

export interface MarketFloorOptions {
  /** The market's zone: the day's boxes are placed into it and taken out of it. */
  zone: Zone;
  context: BuildContext;
  /** One per platform, in stall order, their stallholders and pennants placed. */
  stalls: FloorStall[];
  /** The bargain bins: the first always, the Flea Fair's extra ones after it. */
  bins: readonly BargainBin[];
  shoppers: readonly Shopper[];
  /** How many shoppers still browse after dark. */
  nightShoppers: number;
  crowdSound: CrowdSound;
  /** By the way in: where each platform's stall is (a star where a wishlist game waits). */
  directory: InfoBoard;
  /** By the way in: today's theme, the days ahead, the talk of the hall. */
  program: InfoBoard;
  /** The notice board (none without the hall's services). */
  noticeBoard: NoticeBoard | null;
  /** The job lot's crate (none without the hall's services). */
  lotCrate: LotCrate | null;
}

/** How loud the hall's murmur is by day and after dark (0..1). */
const CROWD_LEVEL = { day: 1, night: 0.3, bigDay: 1.35 };
/** Rain this hard keeps half the shoppers at home. */
const RAIN_KEEPS_AWAY = 0.45;
/** How keen the other shoppers are to buy, by day, in the rain, at night. */
const KEENNESS = { day: 1, rain: 0.5, night: 0.3 };
/** Chance a stallholder says something when a box of theirs is picked up (every other move always gets a word). */
const PICK_UP_REMARK = 0.45;

/**
 * The market's day on the floor, once the hall stands: lays the day's stock out as `ForSaleBox`es
 * on the stalls and in the bins (fetched after the hall is built; nothing is placed once the zone
 * has unloaded), takes copies off as they are sold (to the player or to a rival shopper) and puts
 * a copy handed back where it stood, has the stallholders answer what is done with their stock,
 * flies a stall's pennant (and stars it on the directory) while a wishlist game is on its table,
 * sends the shoppers home after dark and in heavy rain, keeps the notice board's cards and the job
 * lot's sign up to date, and takes a stall copy off when the player gets the game another way.
 * `dispose()` (on the zone's unload) stops it.
 */
export class MarketFloor {
  /** Every copy on show, stalls and bins (the price scanner reads them). */
  readonly displayed = new Set<ForSaleBox>();
  private theme: MarketDayTheme;
  /** What the stallholders have heard about the days ahead (a grail coming, the Flea Fair, a sale); the same all day. */
  private news: MarketNews[];
  private heard: MarketNews[];
  private night = false;
  /** The sky was followed once already (the shoppers were set in place when the hall was built). */
  private skyFollowed = false;
  private wet: boolean;
  /** Copies laid out on the stalls today (the rivals' cap is a share of it). */
  private stallStock = 0;
  /** False once the zone has unloaded: async work arriving later places nothing. */
  private live = true;
  private readonly unsubscribe: Array<() => void> = [];

  constructor(private readonly options: MarketFloorOptions) {
    const { context } = options;
    const { stock: market, day: marketDay } = context.market;
    this.theme = marketDay.theme;
    this.news = marketDay.news();
    this.heard = this.news.filter((n) => n.inDays > 0 || n.kind !== 'clearance');
    // The stock is drawn to fit: never a copy on sale that is not on a table.
    market.fitTo((id) => this.stallOf(id).stall.capacityFor(getPlatform(id).boxDimensions.width), BargainBin.capacity * options.bins.length);

    // The sky: after dark (and in heavy rain) shoppers go home and the murmur drops.
    this.wet = this.raining();
    this.unsubscribe.push(context.sky.dayNight.onChange((state) => this.followSky(state)));

    this.stockUp();
    this.showProgram();
    this.refreshDirectory();
    this.followLot();
    // Midnight with the player in the hall: yesterday's copies are packed up and the new day's laid out.
    this.unsubscribe.push(context.today.onNewGameDay(() => this.newDay()));

    // A copy ordered from the catalogue (or imported) while its twin sits on a stall: the stall copy goes too
    // (not the one in the player's hand: that one leaves through the sale). The pennants and cards follow the wishlist.
    const { collection } = context;
    const { games } = collection;
    this.unsubscribe.push(games.subscribe(() => {
      for (const box of [...this.displayed]) {
        const id = box.item.game.id;
        // An upgrade stays until the player's own copy is a first print.
        const gone = collection.owns(id) && (box.item.source !== 'upgrade' || games.games.some((g) => g.id === id && g.status !== 'wishlist' && g.edition === 'firstPrint'));
        if (gone && !box.isHeld) this.takeOff(box);
      }
      this.refreshPennants();
    }));
  }

  /** Fetches the day's stock and lays it out (nothing once the zone has unloaded, nor if the day turned meanwhile). */
  private stockUp(): void {
    const { stock: market } = this.options.context.market;
    const day = market.day;
    void market.todays().then((items) => {
      if (!this.live || market.day !== day) return;
      this.layOut(items);
      this.refreshPennants();
      this.refreshNotices();
    }).catch((err) => console.warn('[market] no stock today', err));
  }

  /**
   * A new market day while the hall stands: every stallholder packs up yesterday's table and lays out today's (the
   * copy in the player's hand stays there, at yesterday's price, and leaves when bought or put back: a hold on it has
   * lapsed, its deposit comes back with the others', so it is due in full). The boards, the talk and the crowd follow.
   */
  private newDay(): void {
    if (!this.live) return;
    const { context, stalls } = this.options;
    const marketDay = context.market.day;
    this.theme = marketDay.theme;
    this.news = marketDay.news();
    this.heard = this.news.filter((n) => n.inDays > 0 || n.kind !== 'clearance');
    for (const box of [...this.displayed]) {
      if (!box.isHeld) {
        this.takeOff(box);
        continue;
      }
      if (box.item.source !== 'ordered') box.item.setDeposit(0);
      this.retireWhenBack(box);
    }
    for (const entry of stalls) entry.sold = 0;
    this.stallStock = 0;
    stalls[0]?.vendor.say('New day, new stock! Give us a minute to set out.');
    this.stockUp();
    this.showProgram();
    this.refreshDirectory();
    this.followLot();
  }

  /** Yesterday's copy still in the player's hand: taken off its stall once it is back in its place (put back). */
  private retireWhenBack(box: ForSaleBox): void {
    const check = (): void => {
      if (!this.live || !this.displayed.has(box)) return;
      if (box.isHeld) requestAnimationFrame(check);
      else this.takeOff(box);
    };
    requestAnimationFrame(check);
  }

  /** What `entry`'s stallholder has to say right now: their table, the hour, the day, the talk. */
  linesAt(entry: FloorStall): readonly string[] {
    const { theme } = this;
    return stallLines({
      platform: entry.platform.name,
      items: [...entry.boxes].filter((b) => !b.isHeld).map((b) => b.item),
      sold: entry.sold,
      night: this.night,
      isWanted: (id) => this.options.context.collection.isWanted(id),
      loyalty: this.options.context.market.hall?.standing.loyaltyName(entry.platform.id),
      theme: theme.kind === 'ordinary' ? undefined : theme.title,
      news: this.heard.map((n, k) => stallRumour(n, entry.index + k)),
    });
  }

  /** How keen the other shoppers are to buy right now. */
  keenness(): number {
    return this.night ? KEENNESS.night : this.raining() ? KEENNESS.rain : KEENNESS.day;
  }

  /** Whether the rivals may still buy today (a share of the stalls' stock). */
  rivalMayBuy(): boolean {
    const { stock: market } = this.options.context.market;
    return this.stallStock > 0 && market.soldToRivals < Math.floor(this.stallStock * RIVAL_BUYING.maxShare);
  }

  /** A rival browsing at `spot` buys a copy off the stall there (never a held one, a grail or one behind glass). */
  rivalBuysAt(spot: BrowseSpot): boolean {
    const { zone } = this.options;
    const entry = this.nearestStall(zone.toWorld(new THREE.Vector3(spot.at[0], 0, spot.at[1])));
    // Nobody else can afford a grail: after all the rumours, it waits for the player all day.
    const choices = entry ? [...entry.boxes].filter((b) => !b.isHeld && b.item.priced && !b.item.reserved && b.item.source !== 'grail' && !entry.stall.behindGlass) : [];
    const box = choices[Math.floor(Math.random() * choices.length)];
    if (!entry || !box) return false;
    this.options.context.market.stock.soldToRival(box.item);
    entry.vendor.say(REACTIONS.bought[Math.floor(Math.random() * REACTIONS.bought.length)]!);
    this.takeOff(box);
    return true;
  }

  /** The notice board's cards: today's ads, a rumour pinned up, the collectors' club. */
  refreshNotices(): void {
    const { noticeBoard, context } = this.options;
    const hall = context.market.hall;
    if (!noticeBoard || !hall) return;
    void hall.notices.cards().then((ads) => {
      if (!this.live) return;
      // A card pinned up about what is coming (a grail, the Flea Fair, a sale), when there is talk of one.
      const rumour = this.news[0] ? flyerRumour(this.news[0]) : null;
      const pinned = [
        ...(rumour ? [{ title: rumour.title, lines: rumour.lines, color: '#ffd9b8', tilt: -0.04 }] : []),
        { title: 'COLLECTORS’ CLUB', lines: ['complete a set,', 'claim a reward', 'ask at the board'], color: '#f6d2e0', tilt: 0.03 },
      ];
      noticeBoard.setCards(ads.slice(0, NOTICE_BOARD_MAX_CARDS - pinned.length).map((ad, i) => ({
        title: ad.kind === 'wanted' ? 'WANTED' : 'FOR SALE',
        lines: [ad.game.title, `${ad.kind === 'wanted' ? `paying ${ad.pay}` : `${ad.price}`} coins`, `— ${ad.from}`],
        color: ad.kind === 'wanted' ? '#fff1a8' : '#d6ecff',
        tilt: ((i * 37) % 9 - 4) * 0.02,
      })).concat(pinned));
    }, () => undefined);
  }

  dispose(): void {
    this.live = false;
    for (const stop of this.unsubscribe.splice(0)) stop();
  }

  private raining(): boolean {
    return this.options.context.sky.weather.state.rain >= RAIN_KEEPS_AWAY;
  }

  private stallOf(platform: PlatformId): FloorStall {
    return this.options.stalls.find((e) => e.platform.id === platform)!;
  }

  /** After dark only a few shoppers stay, in heavy rain half; the murmur follows them. */
  private followSky(state: SkyState): void {
    const { shoppers, nightShoppers, crowdSound } = this.options;
    const rain = this.raining();
    if (state.night === this.night && rain === this.wet && this.skyFollowed) return;
    // The first time is the hall being built: whoever is not there is simply not there. After that they walk out by the door.
    const instant = !this.skyFollowed;
    this.skyFollowed = true;
    this.night = state.night;
    this.wet = rain;
    const present = this.night ? nightShoppers : rain ? Math.ceil(shoppers.length / 2) : shoppers.length;
    shoppers.forEach((shopper, i) => shopper.setPresent(i < present, instant));
    const day = CROWD_LEVEL.day * Math.min(CROWD_LEVEL.bigDay, this.theme.crowd ?? 1);
    crowdSound.setCrowd(this.night ? CROWD_LEVEL.night : rain ? (day + CROWD_LEVEL.night) / 2 : day);
  }

  /** The day's copies, stall by stall where each stall's `layout()` puts them, then the bins. */
  private layOut(items: readonly StockItem[]): void {
    const { stalls, bins } = this.options;
    for (const entry of stalls) {
      const { platform, stall } = entry;
      const onTable = items.filter((item) => item.source !== 'bin' && item.game.platform === platform.id);
      const slots = stall.layout(platform.boxDimensions.width, onTable.length);
      if (slots.length < onTable.length) console.warn(`[market] ${onTable.length - slots.length} ${platform.shortName} copies do not fit the stall`);
      slots.forEach((slot, i) => this.display(onTable[i]!, slot, entry));
      this.stallStock += slots.length;
    }
    // The bin's copies, crate by crate (the Flea Fair's extra bins take what the first cannot hold).
    const inBin = items.filter((item) => item.source === 'bin');
    bins.forEach((crate, b) => {
      const mine = inBin.slice(b * BargainBin.capacity, (b + 1) * BargainBin.capacity);
      crate.slots(mine.length).forEach((slot, i) => this.display(mine[i]!, slot, null, crate));
    });
  }

  /** Puts `item` on show at `slot` of `entry`'s stall (or in `crate`, a bargain bin, when `entry` is null). */
  private display(item: StockItem, slot: DisplaySlot | { position: THREE.Vector3; angle: number }, entry: FloorStall | null, crate: BargainBin = this.options.bins[0]!): ForSaleBox {
    const { zone, context } = this.options;
    const { collection } = context;
    const flat = 'pose' in slot && slot.pose === 'flat';
    const box = new ForSaleBox(item, context.covers, {
      pose: flat ? { kind: 'flat' } : { kind: 'lean', angle: slot.angle },
      tag: entry !== null,
      wallet: context.money.wallet,
      isWanted: () => collection.isWanted(item.game.id),
      where: entry ? `the ${entry.platform.shortName} stall` : BIN_WHERE,
      behindGlass: entry?.stall.behindGlass,
      react: (reaction) => this.reactAt(entry, reaction),
      speak: entry ? (line) => entry.vendor.speak(line) : undefined,
    });
    box.onSold = () => {
      if (entry) entry.sold++;
      this.takeOff(box);
    };
    // Handed back straight after buying: a fresh box of the same copy goes back where it stood.
    box.restock = () => {
      if (!this.live) return;
      if (entry) entry.sold = Math.max(0, entry.sold - 1);
      this.display(item, slot, entry, crate);
      this.refreshPennants();
    };
    this.displayed.add(box);
    const holder = entry?.stall ?? crate;
    const yaw = 'yaw' in slot ? slot.yaw : 0;
    zone.place(box, zone.toLocal(holder.localToWorld(slot.position.clone())), holder.rotation.y + yaw);
    entry?.boxes.add(box);
    return box;
  }

  private takeOff(box: ForSaleBox): void {
    this.displayed.delete(box);
    for (const entry of this.options.stalls) entry.boxes.delete(box);
    this.options.zone.remove(box);
    box.dispose();
    this.refreshPennants();
  }

  /** The stallholder answers: the clack of the box, a word in a bubble, a shrug or a cheer. */
  private reactAt(entry: FloorStall | null, reaction: SaleReaction): void {
    if (reaction === 'pickUp' || reaction === 'putBack') playBoxClack(reaction === 'putBack');
    if (!entry || (reaction === 'pickUp' && Math.random() > PICK_UP_REMARK)) return;
    const lines = REACTIONS[reaction];
    entry.vendor.say(lines[Math.floor(Math.random() * lines.length)]!);
    if (reaction === 'bought' || reaction === 'haggleWon') entry.vendor.gesture('cheer');
    else if (reaction === 'insult' || reaction === 'locked' || reaction === 'haggleLost') entry.vendor.gesture('hips');
    else if (reaction === 'caught') entry.vendor.gesture('think');
  }

  /** A stall's pennant flies while it has a wishlist game on the table. */
  private refreshPennants(): void {
    const { collection } = this.options.context;
    for (const entry of this.options.stalls) {
      if (entry.pennant) entry.pennant.visible = [...entry.boxes].some((b) => !b.isHeld && collection.isWanted(b.item.game.id));
    }
    this.refreshDirectory();
  }

  private refreshDirectory(): void {
    const { zone, stalls, directory } = this.options;
    const rows: InfoRow[] = stalls.map((entry) => ({
      text: entry.platform.name,
      right: whereIs(zone.toLocal(entry.stall.getWorldPosition(new THREE.Vector3()))),
      star: entry.pennant?.visible ?? false,
    }));
    rows.push({ text: 'Mail order · We buy', right: 'back wall' }, { text: 'Household · notice board', right: 'by the door' });
    directory.setContent('THIS WAY', rows);
  }

  /** Today's theme, the three days after it, today's sales and the talk of the hall (a grail on its way). */
  private showProgram(): void {
    const { theme, news } = this;
    const marketDay = this.options.context.market.day;
    const week: InfoRow[] = [{ text: theme.blurb }, { text: '' }, { text: 'COMING UP' }];
    for (let i = 1; i <= 3; i++) week.push({ text: marketDay.themeIn(i).title, right: i === 1 ? 'tomorrow' : `in ${i} days` });
    // The Flea Fair is in the days above already.
    const talk = news.filter((n) => n.kind !== 'brocante').slice(0, 2);
    if (talk.length) week.push({ text: '' }, ...talk.map((n) => ({ text: noticeRumour(n) })));
    this.options.program.setContent(`TODAY: ${theme.title}`, week);
  }

  /** The job lot's crate shows whether it went today and what its card says; it follows a purchase. */
  private followLot(): void {
    const { lotCrate: crate, context } = this.options;
    const lotPanel = context.market.hall?.lot;
    if (!crate || !lotPanel) return;
    const { stock: market } = context.market;
    const refreshLot = (): void => {
      crate.setSold(market.lot.sold);
      void lotPanel.sign().then((text) => this.live && crate.setSign(text), () => crate.setSign('back soon'));
    };
    lotPanel.onBought = refreshLot;
    this.unsubscribe.push(() => {
      if (lotPanel.onBought === refreshLot) lotPanel.onBought = undefined;
    });
    refreshLot();
  }

  /** The stall whose spot is nearest `world`. */
  private nearestStall(world: THREE.Vector3): FloorStall | null {
    let best: FloorStall | null = null;
    let bestDistance = Infinity;
    const at = new THREE.Vector3();
    for (const entry of this.options.stalls) {
      const d = entry.stall.getWorldPosition(at).distanceTo(world);
      if (d < bestDistance) {
        bestDistance = d;
        best = entry;
      }
    }
    return best;
  }
}

/** "left, back row": where a stall stands, as the directory tells it (zone-local, seen from the way in). */
function whereIs(local: THREE.Vector3): string {
  const side = local.x < -1 ? 'left' : local.x > 1 ? 'right' : 'middle';
  return `${side}, ${local.z < 0 ? 'back' : 'front'} row`;
}
