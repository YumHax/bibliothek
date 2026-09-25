import * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import type { BuildContext, ZoneHandle } from '../layout';
import { PLATFORM_LIST, getPlatform } from '@/catalog/platforms';
import type { Platform, PlatformId } from '@/catalog/types';
import type { StockItem } from '@/economy/StockItem';
import type { MarketStanding } from '@/economy/MarketStanding';
import type { NoticeAd } from '@/economy/MarketNotices';
import { themeOf } from '@/economy/marketDays';
import { HOME_GOODS } from '@/economy/homeGoods';
import type { HomeUpgrade } from '@/economy/HomeUpgrades';
import { COFFEE_PRICE, RIVAL_BUYING } from '@/economy/pricing';
import type { ModalLike } from '@/game/SessionParts';
import type { SaleReaction } from '@/game/SessionActions';
import { playBoxClack } from '@/audio/boxClack';
import { furnishShell } from '../shell';
import { TiledWainscot } from '../props/TiledWainscot';
import { IndustrialPendant } from '../props/IndustrialPendant';
import { placeDecor } from '../props/decor';
import { TravelDoor } from '../travel/TravelDoor';
import { Vendor } from '../people/Vendor';
import { Shopper, type BrowseSpot } from '../people/Shopper';
import { ForSaleBox } from './ForSaleBox';
import { HallRoof } from './HallRoof';
import { MarketStall } from './MarketStall';
import { GlassCaseStall } from './GlassCaseStall';
import { BlanketStall } from './BlanketStall';
import { RiserStall } from './RiserStall';
import type { DisplaySlot, StallLike, StallStyle } from './stallTypes';
import { OrderCounter } from './OrderCounter';
import { BuyBackDesk } from './BuyBackDesk';
import { BargainBin } from './BargainBin';
import { TransistorRadio } from './TransistorRadio';
import { DemoTelly } from './DemoTelly';
import { CrowdSound } from './CrowdSound';
import { RoofRain } from './RoofRain';
import { CoffeeCart } from './CoffeeCart';
import { NoticeBoard, NOTICE_BOARD_MAX_CARDS } from './NoticeBoard';
import { InfoBoard, type InfoRow } from './InfoBoard';
import { LotCrate } from './LotCrate';
import { homeGoodsItems, type HomeGoodsItem } from './HomeGoodsDisplay';
import { WishPennant } from './WishPennant';
import { PriceScanner } from './PriceScanner';
import { RivalBuyers } from './RivalBuyers';
import { REACTIONS, callOuts, stallLines } from './stallTalk';
import { MARKET_PLAN } from './marketPlan';

/** What the market's hall needs beyond the shared services: the panels it opens, and how the market knows the player. */
export interface MarketHallServices {
  standing: MarketStanding;
  /** The notice board's panel; `cards()` gives today's cards for the board's face. */
  notices: ModalLike & { cards(): Promise<NoticeAd[]> };
  /** The job lot's panel; `sign()` is what the crate's card says; `onBought` is set by the hall. */
  lot: ModalLike & { sign(): Promise<string>; onBought?: () => void };
}

/** One stall as the builder keeps track of it: what stands there, who sells, what is on it and what went. */
interface StallEntry {
  platform: Platform;
  stall: StallLike;
  vendor: Vendor;
  boxes: Set<ForSaleBox>;
  sold: number;
  pennant: WishPennant | null;
}

/** How loud the hall's murmur is by day and after dark (0..1). */
const CROWD_LEVEL = { day: 1, night: 0.3 };
/** Rain this hard keeps half the shoppers at home. */
const RAIN_KEEPS_AWAY = 0.45;
/** How keen the other shoppers are to buy, by day, in the rain, at night. */
const KEENNESS = { day: 1, rain: 0.5, night: 0.3 };
/** Held to float titles and prices over the boxes (physical key). */
const SCAN_KEY = 'KeyQ';
/** Chance a stallholder says something when a box of theirs is picked up (every other move always gets a word). */
const PICK_UP_REMARK = 0.45;

/**
 * Builds the flea market into its zone from `MARKET_PLAN`: the hall (brick wainscot, trussed roof
 * with its roof light following the sky, a row of pendants chained to the room's light), one stall
 * per platform of the kind its spot says (table, risers, blanket, glass case) with its stallholder,
 * the mail-order counter and the WE BUY desk with their clerks, the household stall (furniture for
 * the flat, one click per piece), the coffee cart, the notice board, the bargain bin and the day's
 * job lot, the boards by the way in (where each stall is, the week's market days), the radio and
 * the demo telly, the crowd's murmur and the rain on the roof, the exit door, the decor; then, once
 * the day's stock arrives, a `ForSaleBox` per copy on the matching stall or in the bin. Other
 * shoppers buy copies too (`RivalBuyers`); a stall with a wishlist game flies a red pennant; Q held
 * reads the tables from the aisle (`PriceScanner`). After dark, and in heavy rain, shoppers stay away.
 */
export function furnishMarket(zone: Zone, context: BuildContext): ZoneHandle {
  const { sky, covers, market, games, listener, wallet, input, marketHall } = context;
  const plan = MARKET_PLAN;
  if (PLATFORM_LIST.length > plan.stalls.length) {
    throw new Error(`[market] ${PLATFORM_LIST.length} platforms but ${plan.stalls.length} stall spots: add one to MARKET_PLAN.stalls`);
  }
  const room = furnishShell(zone, sky, plan.room);
  // Wainscot and roof wrap the whole shell, so they stand at the room's origin like the Room does.
  zone.place(new TiledWainscot(plan.room, plan.wainscot), new THREE.Vector3());
  const roof = zone.place(new HallRoof(plan.room, plan.roof), new THREE.Vector3());
  // The pendants are the hall's visible light: clicking any of them switches them all, and the room's lamp with them.
  const pendants: IndustrialPendant[] = [];
  const switchAll = (on: boolean): void => {
    room.setLampOn(on);
    for (const pendant of pendants) if (pendant.isOn !== on) pendant.setOn(on);
  };
  for (const at of plan.pendants) pendants.push(zone.placeAt(new IndustrialPendant({ ...plan.pendant, onSwitch: switchAll }), at));

  // The desks at the back, a clerk behind each.
  const counter = zone.placeAt(new OrderCounter({ wallBehind: plan.counter.wallBehind }), plan.counter.at);
  const buyBack = zone.placeAt(new BuyBackDesk({ wallBehind: plan.buyBack.wallBehind }), plan.buyBack.at);
  const behind = (item: THREE.Object3D, [x, z]: [number, number]) => zone.toLocal(item.localToWorld(new THREE.Vector3(x, 0, z)));
  const onTop = (item: THREE.Object3D, local: THREE.Vector3) => zone.toLocal(item.localToWorld(local.clone()));
  zone.place(new Vendor({ viewer: listener, seed: 31, ...plan.clerks.counter, focus: [0, 1.05, 0.4] }), behind(counter, plan.counter.clerkAt), counter.rotation.y);
  zone.place(new Vendor({ viewer: listener, seed: 37, ...plan.clerks.buyBack, focus: [0.3, 1.05, 0.4] }), behind(buyBack, plan.buyBack.clerkAt), buyBack.rotation.y);

  zone.placeAt(new TravelDoor({ style: 'glazed', label: 'Click to go out to the street', to: 'street' }), plan.exit);
  placeDecor(zone, plan.decor);
  const bin = zone.placeAt(new BargainBin({ price: market.binPrice }), plan.bin);

  const isWanted = (id: string): boolean => games.games.some((g) => g.id === id && g.status === 'wishlist');
  const theme = market.theme;
  let night = false;

  // The stalls and their stallholders, who talk about what is on their table and cry out to passers-by.
  const stalls: StallEntry[] = PLATFORM_LIST.map((platform, i) => {
    const spot = plan.stalls[i]!;
    const stall = zone.placeAt(buildStall(spot.style, { sign: platform.name, cloth: spot.cloth, accent: platform.accentColor, seed: i + 1 }), spot.at);
    const lines = () => stallLines({
      platform: platform.name,
      items: [...entry.boxes].filter((b) => !b.isHeld).map((b) => b.item),
      sold: entry.sold,
      night,
      isWanted,
      loyalty: marketHall?.standing.loyaltyName(platform.id),
      theme: theme.kind === 'ordinary' ? undefined : theme.title,
    });
    const vendor = zone.place(new Vendor({ viewer: listener, lines, seed: i + 1, callOuts: callOuts(platform.shortName) }), behind(stall, stall.vendorAt), stall.rotation.y);
    const pennant = stall.pennantAt ? zone.place(new WishPennant(i + 1), onTop(stall, stall.pennantAt), stall.rotation.y) : null;
    if (pennant) pennant.visible = false;
    const entry: StallEntry = { platform, stall, vendor, boxes: new Set(), sold: 0, pennant };
    return entry;
  });
  const stallOf = (platform: PlatformId) => stalls.find((e) => e.platform.id === platform)!;
  // The stock is drawn to fit: never a copy on sale that is not on a table.
  market.fitTo((id) => stallOf(id).stall.capacityFor(getPlatform(id).boxDimensions.width), BargainBin.capacity);

  const radioStall = stalls[plan.radio.stall]?.stall;
  if (radioStall) zone.place(new TransistorRadio({ listener, color: plan.radio.color }), onTop(radioStall, radioStall.crateTop(plan.radio.x)), radioStall.rotation.y);
  const tellyStall = stalls[plan.telly.stall]?.stall;
  if (tellyStall) zone.place(new DemoTelly({ title: plan.telly.title }), onTop(tellyStall, tellyStall.crateTop(plan.telly.x)), tellyStall.rotation.y);
  const crowdSound = zone.place(new CrowdSound(), new THREE.Vector3());
  zone.place(new RoofRain(() => sky.weather.state.rain), new THREE.Vector3());

  furnishHousehold(zone, context);
  furnishCoffee(zone, context);

  // Shoppers set down along the aisle, each starting at their own spot, never two at one spot.
  const { crowd } = plan;
  const claims = new Set<BrowseSpot>();
  const shoppers: Shopper[] = [];
  for (let i = 0; i < crowd.shoppers; i++) {
    const x = THREE.MathUtils.lerp(crowd.aisle.x[0], crowd.aisle.x[1], (i + 0.5) / crowd.shoppers);
    shoppers.push(zone.place(new Shopper({ viewer: listener, spots: crowd.browseSpots, aisle: crowd.aisle, claims, seed: i + 1, speed: 0.65 + i * 0.08 }), new THREE.Vector3(x, 0, crowd.aisle.z), i % 2 ? Math.PI / 2 : -Math.PI / 2));
  }
  const raining = () => sky.weather.state.rain >= RAIN_KEEPS_AWAY;

  // The sky: the roof light follows it; after dark (and in heavy rain) shoppers go home and the murmur drops.
  let wet = raining();
  zone.onUnload(sky.dayNight.onChange((state) => {
    roof.setDaylight(state.daylight, state.ambient);
    const rain = raining();
    if (state.night === night && rain === wet && shoppers.length) return;
    night = state.night;
    wet = rain;
    const present = night ? crowd.nightShoppers : rain ? Math.ceil(shoppers.length / 2) : shoppers.length;
    shoppers.forEach((shopper, i) => shopper.setPresent(i < present));
    crowdSound.setCrowd(night ? CROWD_LEVEL.night : rain ? (CROWD_LEVEL.day + CROWD_LEVEL.night) / 2 : CROWD_LEVEL.day);
  }));

  // The stock is fetched (the index, once per platform) after the hall stands; a zone unloaded
  // meanwhile must not get boxes placed into it.
  let live = true;
  zone.onUnload(() => {
    live = false;
  });
  const displayed = new Set<ForSaleBox>();
  let stallStock = 0;

  /** The stallholder answers: the clack of the box, a word in a bubble, a shrug or a cheer. */
  const reactAt = (entry: StallEntry | null, reaction: SaleReaction): void => {
    if (reaction === 'pickUp' || reaction === 'putBack') playBoxClack(reaction === 'putBack');
    if (!entry || (reaction === 'pickUp' && Math.random() > PICK_UP_REMARK)) return;
    const lines = REACTIONS[reaction];
    entry.vendor.say(lines[Math.floor(Math.random() * lines.length)]!);
    if (reaction === 'bought' || reaction === 'haggleWon') entry.vendor.gesture('cheer');
    else if (reaction === 'insult' || reaction === 'locked' || reaction === 'haggleLost') entry.vendor.gesture('hips');
    else if (reaction === 'caught') entry.vendor.gesture('think');
  };

  /** A stall's pennant flies while it has a wishlist game on the table. */
  const refreshPennants = (): void => {
    for (const entry of stalls) {
      if (entry.pennant) entry.pennant.visible = [...entry.boxes].some((b) => !b.isHeld && isWanted(b.item.game.id));
    }
    refreshDirectory();
  };

  const takeOff = (box: ForSaleBox): void => {
    displayed.delete(box);
    for (const entry of stalls) entry.boxes.delete(box);
    zone.remove(box);
    box.dispose();
    refreshPennants();
  };

  /** Puts `item` on show at `slot` of `entry`'s stall (or in the bin when `entry` is null). */
  const display = (item: StockItem, slot: DisplaySlot | { position: THREE.Vector3; angle: number }, entry: StallEntry | null): ForSaleBox => {
    const flat = 'pose' in slot && slot.pose === 'flat';
    const box = new ForSaleBox(item, covers, {
      pose: flat ? { kind: 'flat' } : { kind: 'lean', angle: slot.angle },
      tag: entry !== null,
      wallet,
      isWanted: () => isWanted(item.game.id),
      where: entry ? `the ${entry.platform.shortName} stall` : 'the bargain bin',
      behindGlass: entry?.stall.behindGlass,
      react: (reaction) => reactAt(entry, reaction),
    });
    box.onSold = () => {
      if (entry) entry.sold++;
      takeOff(box);
    };
    // Handed back straight after buying: a fresh box of the same copy goes back where it stood.
    box.restock = () => {
      if (!live) return;
      if (entry) entry.sold = Math.max(0, entry.sold - 1);
      display(item, slot, entry);
      refreshPennants();
    };
    displayed.add(box);
    const holder = entry?.stall ?? bin;
    const yaw = 'yaw' in slot ? slot.yaw : 0;
    zone.place(box, zone.toLocal(holder.localToWorld(slot.position.clone())), holder.rotation.y + yaw);
    entry?.boxes.add(box);
    return box;
  };

  void market.todays().then((items) => {
    if (!live) return;
    for (const entry of stalls) {
      const { platform, stall } = entry;
      const onTable = items.filter((item) => item.source !== 'bin' && item.game.platform === platform.id);
      const slots = stall.layout(platform.boxDimensions.width, onTable.length);
      if (slots.length < onTable.length) console.warn(`[market] ${onTable.length - slots.length} ${platform.shortName} copies do not fit the stall`);
      slots.forEach((slot, i) => display(onTable[i]!, slot, entry));
      stallStock += slots.length;
    }
    const inBin = items.filter((item) => item.source === 'bin');
    bin.slots(inBin.length).forEach((slot, i) => display(inBin[i]!, slot, null));
    refreshPennants();
    refreshNotices();
  }).catch((err) => console.warn('[market] no stock today', err));

  // Other shoppers buy too: a copy leaves the stall they browse at (never one held for the player).
  zone.place(new RivalBuyers({
    shoppers,
    meanSeconds: RIVAL_BUYING.meanSeconds,
    keenness: () => (night ? KEENNESS.night : raining() ? KEENNESS.rain : KEENNESS.day),
    mayBuy: () => stallStock > 0 && market.soldToRivals < Math.floor(stallStock * RIVAL_BUYING.maxShare),
    buyAt: (spot) => {
      const entry = nearestStall(stalls, zone.toWorld(new THREE.Vector3(spot.at[0], 0, spot.at[1])));
      const choices = entry ? [...entry.boxes].filter((b) => !b.isHeld && b.item.priced && !b.item.reserved && !entry.stall.behindGlass) : [];
      const box = choices[Math.floor(Math.random() * choices.length)];
      if (!entry || !box) return false;
      market.soldToRival(box.item);
      entry.vendor.say(REACTIONS.bought[Math.floor(Math.random() * REACTIONS.bought.length)]!);
      takeOff(box);
      return true;
    },
  }), new THREE.Vector3());

  // Q held: the titles and prices float over the boxes in front of the player.
  zone.place(new PriceScanner({ input, key: SCAN_KEY, viewer: listener, boxes: () => displayed }), new THREE.Vector3());

  // By the way in: where each platform's stall is (a star where a wishlist game waits), and the week.
  const directory = zone.placeAt(new InfoBoard({ accent: 0x2a4a6b, label: 'THIS WAY' }), plan.directory);
  const program = zone.placeAt(new InfoBoard({ accent: 0x6b2f2a, label: theme.title }), plan.program);
  function refreshDirectory(): void {
    const rows: InfoRow[] = stalls.map((entry) => ({
      text: entry.platform.name,
      right: whereIs(zone.toLocal(entry.stall.getWorldPosition(new THREE.Vector3()))),
      star: entry.pennant?.visible ?? false,
    }));
    rows.push({ text: 'Mail order · We buy', right: 'back wall' }, { text: 'Household · notice board', right: 'by the door' });
    directory.setContent('THIS WAY', rows);
  }
  const week: InfoRow[] = [{ text: theme.blurb }, { text: '' }, { text: 'COMING UP' }];
  for (let i = 1; i <= 3; i++) week.push({ text: themeOf(market.day + i).title, right: i === 1 ? 'tomorrow' : `in ${i} days` });
  program.setContent(`TODAY: ${theme.title}`, week);
  refreshDirectory();

  // The notice board, and the job lot's crate.
  const noticeBoard = marketHall ? zone.placeAt(new NoticeBoard({
    label: () => 'Click to read the notice board: wanted cards, private sales, the collectors’ club',
    onActivate: (session) => {
      session.openPanel(marketHall.notices);
      refreshNotices();
    },
  }), plan.noticeBoard) : null;
  function refreshNotices(): void {
    if (!noticeBoard || !marketHall) return;
    void marketHall.notices.cards().then((ads) => {
      if (!live) return;
      noticeBoard.setCards(ads.slice(0, NOTICE_BOARD_MAX_CARDS - 1).map((ad, i) => ({
        title: ad.kind === 'wanted' ? 'WANTED' : 'FOR SALE',
        lines: [ad.game.title, `${ad.kind === 'wanted' ? `paying ${ad.pay}` : `${ad.price}`} coins`, `— ${ad.from}`],
        color: ad.kind === 'wanted' ? '#fff1a8' : '#d6ecff',
        tilt: ((i * 37) % 9 - 4) * 0.02,
      })).concat([{ title: 'COLLECTORS’ CLUB', lines: ['complete a set,', 'claim a reward', 'ask at the board'], color: '#f6d2e0', tilt: 0.03 }]));
    }, () => undefined);
  }
  if (marketHall) {
    const lotPanel = marketHall.lot;
    const crate = zone.placeAt(new LotCrate({
      label: () => (market.lotSold ? 'The job lot: sold today' : 'Click to see the job lot: a crate of games sold as one'),
      onActivate: (session) => session.openPanel(lotPanel),
    }), plan.lot);
    const refreshLot = (): void => {
      crate.setSold(market.lotSold);
      void lotPanel.sign().then((text) => live && crate.setSign(text), () => crate.setSign('back soon'));
    };
    lotPanel.onBought = refreshLot;
    zone.onUnload(() => {
      if (lotPanel.onBought === refreshLot) lotPanel.onBought = undefined;
    });
    refreshLot();
  }

  // A copy ordered from the catalogue (or imported) while its twin sits on a stall: the stall copy goes too
  // (not the one in the player's hand: that one leaves through the sale). The pennants and cards follow the wishlist.
  zone.onUnload(games.subscribe(() => {
    const owned = new Map(games.games.filter((g) => g.status !== 'wishlist').map((g) => [g.id, g]));
    for (const box of [...displayed]) {
      const mine = owned.get(box.item.game.id);
      // An upgrade stays until the player's own copy is a first print.
      const gone = mine && (box.item.source !== 'upgrade' || mine.edition === 'firstPrint');
      if (gone && !box.isHeld) takeOff(box);
    }
    refreshPennants();
  }));

  return { room };
}

/** The furniture a stall spot holds. */
function buildStall(style: StallStyle, options: { sign: string; cloth: number; accent: number; seed: number }): StallLike {
  switch (style) {
    case 'glass': return new GlassCaseStall(options);
    case 'blanket': return new BlanketStall(options);
    case 'risers': return new RiserStall(options);
    default: return new MarketStall(options);
  }
}

/** The household stall: furniture for the flat (`HOME_GOODS`), each piece bought with a click; one-offs vanish once bought. */
function furnishHousehold(zone: Zone, { listener, upgrades }: BuildContext): void {
  const plan = MARKET_PLAN.household;
  const stall = zone.placeAt(new MarketStall({ sign: plan.sign, cloth: plan.cloth, seed: 17 }), plan.at);
  zone.place(new Vendor({
    viewer: listener,
    seed: 41,
    lines: [
      'Furniture for the flat! Bookcases for your games, a lamp, a rug, a telly for the kitchen.',
      "The bookcases flat-pack. They'll be standing in your bedroom by the time you're home.",
      'Everything here is one of a kind. Bar the bookcases, I get those by the lorry.',
    ],
    callOuts: ['Furniture! Lamps!', 'Bookcases here!'],
  }), zone.toLocal(stall.localToWorld(new THREE.Vector3(stall.vendorAt[0], 0, stall.vendorAt[1]))), stall.rotation.y);
  if (!upgrades) return;
  const goodOf = (id: string) => HOME_GOODS.find((g) => g.id === id);
  const owned = (id: string) => (goodOf(id)?.repeatable ? false : upgrades.count(id as HomeUpgrade) > 0);
  const items: HomeGoodsItem[] = homeGoodsItems({
    label: (id) => {
      const good = goodOf(id);
      return good ? `${good.name} — ${good.price} coins · ${good.blurb} · click to buy` : '';
    },
    onActivate: (id, session) => {
      const good = goodOf(id);
      if (!good) return;
      if (owned(id)) {
        session.hint(`You have the ${good.name.toLowerCase()} already.`);
        return;
      }
      session.buyUpgrade({ title: good.name, price: good.price, bought: () => upgrades.add(good.id) });
    },
  }).filter((item) => goodOf(item.goodsId));
  for (const item of items) {
    const at = item.offset.clone().add(new THREE.Vector3(0, stall.topHeight + 0.012, 0.1));
    zone.place(item, zone.toLocal(stall.localToWorld(at)), stall.rotation.y);
  }
  const refresh = () => {
    for (const item of items) item.setAvailable(!owned(item.goodsId));
  };
  refresh();
  zone.onUnload(upgrades.subscribe(refresh));
}

/** The coffee cart and its barista: a coffee a day makes the stallholders easier (see `NEGOTIATION.coffee`). */
function furnishCoffee(zone: Zone, { listener, market }: BuildContext): void {
  const plan = MARKET_PLAN.coffee;
  let barista: Vendor | null = null;
  const cart = zone.placeAt(new CoffeeCart({
    price: COFFEE_PRICE,
    label: () => (market.hadCoffee ? 'The coffee cart · you have had your coffee today' : `Click for a coffee: ${COFFEE_PRICE} coins · the stallholders go easier on you all day`),
    onActivate: (session) => {
      if (market.hadCoffee) {
        session.hint('“Another one? You’ll be haggling in your sleep.” One a day is plenty.');
        return;
      }
      session.buyUpgrade({
        title: 'A coffee',
        price: COFFEE_PRICE,
        bought: () => {
          market.drinkCoffee();
          barista?.say('Enjoy!');
        },
      });
    },
  }), plan.at);
  barista = zone.place(new Vendor({ viewer: listener, seed: 53, lines: plan.lines, label: 'Click to chat with the barista', focus: [0, 1.0, 0.5], callOuts: ['Coffee! Hot coffee!'] }), zone.toLocal(cart.localToWorld(cart.serveAt.clone())), cart.rotation.y);
}

/** The stall whose spot is nearest `world`. */
function nearestStall(stalls: readonly StallEntry[], world: THREE.Vector3): StallEntry | null {
  let best: StallEntry | null = null;
  let bestDistance = Infinity;
  const at = new THREE.Vector3();
  for (const entry of stalls) {
    const d = entry.stall.getWorldPosition(at).distanceTo(world);
    if (d < bestDistance) {
      bestDistance = d;
      best = entry;
    }
  }
  return best;
}

/** "left, back row": where a stall stands, as the directory tells it (zone-local, seen from the way in). */
function whereIs(local: THREE.Vector3): string {
  const side = local.x < -1 ? 'left' : local.x > 1 ? 'right' : 'middle';
  return `${side}, ${local.z < 0 ? 'back' : 'front'} row`;
}
