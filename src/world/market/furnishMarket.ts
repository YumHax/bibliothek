import * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import type { BuildContext, ZoneHandle } from '../buildContext';
import { PLATFORM_LIST } from '@/catalog/platforms';
import { RIVAL_BUYING } from '@/economy/pricing';
import { furnishShell } from '../shell';
import { TiledWainscot } from '../props/TiledWainscot';
import { IndustrialPendant } from '../props/IndustrialPendant';
import { placeDecor } from '../props/decor';
import { TravelDoor } from '../travel/TravelDoor';
import { Vendor } from '../people/Vendor';
import { Shopper, type BrowseSpot } from '../people/Shopper';
import { HallRoof } from './HallRoof';
import { MarketStall } from './MarketStall';
import { GlassCaseStall } from './GlassCaseStall';
import { BlanketStall } from './BlanketStall';
import { RiserStall } from './RiserStall';
import type { StallLike, StallStyle } from './stallTypes';
import { OrderCounter } from './OrderCounter';
import { BuyBackDesk } from './BuyBackDesk';
import { BargainBin } from './BargainBin';
import { TransistorRadio } from './TransistorRadio';
import { DemoTelly } from './DemoTelly';
import { CrowdSound } from './CrowdSound';
import { RoofRain } from './RoofRain';
import { NoticeBoard } from './NoticeBoard';
import { InfoBoard } from './InfoBoard';
import { LotCrate } from './LotCrate';
import { WishPennant } from './WishPennant';
import { PriceScanner } from './PriceScanner';
import { RivalBuyers } from './RivalBuyers';
import { callOuts } from './stallTalk';
import { MarketFloor, type FloorStall } from './MarketFloor';
import { furnishHousehold } from './furnishHousehold';
import { furnishCoffee } from './furnishCoffee';
import { furnishCarton } from './furnishCarton';
import { RivalInHall } from './RivalInHall';
import { MARKET_PLAN } from './marketPlan';
import { primaryCode } from '@/input/actions';

/** Held to float titles and prices over the boxes (physical key). */
const SCAN_KEY = primaryCode('readStalls');

/**
 * Builds the flea market into its zone from `MARKET_PLAN`: the hall (brick wainscot, trussed roof
 * with its roof light following the sky, a row of pendants chained to the room's light), one stall
 * per platform of the kind its spot says (table, risers, blanket, glass case) with its stallholder,
 * the mail-order counter and the WE BUY desk with their clerks, the household stall (furniture for
 * the flat, one click per piece), the coffee cart, the notice board, the bargain bin and the day's
 * job lot, the boards by the way in (where each stall is, the week's market days), the radio and
 * the demo telly, the crowd's murmur and the rain on the roof, the exit door, the decor; then, once
 * the day's stock arrives, a `ForSaleBox` per copy on the matching stall or in the bin (`MarketFloor`
 * runs the day: sales, reactions, pennants, the boards, the crowd). Other shoppers buy copies too
 * (`RivalBuyers`); Q held reads the tables from the aisle (`PriceScanner`).
 */
export function furnishMarket(zone: Zone, context: BuildContext): ZoneHandle {
  const { sky, listener, input, market: { stock: market, day: marketDay, hall: marketHall } } = context;
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
  // The roof light follows the sky.
  zone.onUnload(sky.dayNight.onChange((state) => roof.setDaylight(state.daylight, state.ambient)));

  // The desks at the back, a clerk behind each.
  const counter = zone.placeAt(new OrderCounter({ wallBehind: plan.counter.wallBehind }), plan.counter.at);
  const buyBack = zone.placeAt(new BuyBackDesk({ wallBehind: plan.buyBack.wallBehind }), plan.buyBack.at);
  const behind = (item: THREE.Object3D, [x, z]: [number, number]) => zone.toLocal(item.localToWorld(new THREE.Vector3(x, 0, z)));
  const onTop = (item: THREE.Object3D, local: THREE.Vector3) => zone.toLocal(item.localToWorld(local.clone()));
  zone.place(new Vendor({ viewer: listener, seed: 31, ...plan.clerks.counter, focus: [0, 1.05, 0.4] }), behind(counter, plan.counter.clerkAt), counter.rotation.y);
  zone.place(new Vendor({ viewer: listener, seed: 37, ...plan.clerks.buyBack, focus: [0.3, 1.05, 0.4] }), behind(buyBack, plan.buyBack.clerkAt), buyBack.rotation.y);

  zone.placeAt(new TravelDoor({ style: 'glazed', shopfront: true, ...plan.door, label: 'Front Street · go out', to: 'street' }), plan.exit);
  // The saleroom behind the hall: its door at the back, a sign over it (the auctions, docs/economy.md "The saleroom").
  const { saleroom } = plan;
  zone.placeAt(new TravelDoor({ style: 'panelled', leafColor: 0x4a2a1a, width: saleroom.door.width, height: saleroom.door.height, label: 'The saleroom · go in (the weekly auction, lots on view)', to: 'saleroom' }), saleroom.door.at);
  placeDecor(zone, [{ kind: 'flyer', at: saleroom.sign, options: { title: 'SALEROOM', lines: ['weekly auction', 'lots on view'], accent: 0x6b1f2a, seed: 6 } }]);
  placeDecor(zone, plan.decor);
  const bin = zone.placeAt(new BargainBin({ price: market.binPrice }), plan.bin);

  const theme = marketDay.theme;
  // The Grand Flea Fair: more bins at the aisle's ends, the hall dressed up.
  const bins = [bin, ...(theme.extraBins ? plan.brocante.bins.map((at) => zone.placeAt(new BargainBin({ price: market.binPrice }), at)) : [])];
  if (theme.bunting) placeDecor(zone, plan.brocante.decor);

  // The stalls and their stallholders, who talk about what is on their table (the floor knows) and cry out to passers-by.
  const stalls: FloorStall[] = PLATFORM_LIST.map((platform, i) => {
    const spot = plan.stalls[i]!;
    const stall = zone.placeAt(buildStall(spot.style, { sign: platform.name, cloth: spot.cloth, accent: platform.accentColor, seed: i + 1 }), spot.at);
    // A story the player follows (the lost prototype) is asked first: its clue, when this stallholder has it.
    const talk = (): readonly string[] => {
      const told = context.story?.atStall(platform.id);
      return told ? [told] : floor.linesAt(entry);
    };
    const vendor = zone.place(new Vendor({ viewer: listener, lines: talk, seed: i + 1, callOuts: callOuts(platform.shortName), label: 'The stallholder · chat' }), behind(stall, stall.vendorAt), stall.rotation.y);
    const pennant = stall.pennantAt ? zone.place(new WishPennant(i + 1), onTop(stall, stall.pennantAt), stall.rotation.y) : null;
    if (pennant) pennant.visible = false;
    const entry: FloorStall = { index: i, platform, stall, vendor, boxes: new Set(), sold: 0, pennant };
    return entry;
  });

  const radioStall = stalls[plan.radio.stall]?.stall;
  if (radioStall) zone.place(new TransistorRadio({ listener, color: plan.radio.color }), onTop(radioStall, radioStall.crateTop(plan.radio.x)), radioStall.rotation.y);
  const tellyStall = stalls[plan.telly.stall]?.stall;
  if (tellyStall) zone.place(new DemoTelly({ title: plan.telly.title }), onTop(tellyStall, tellyStall.crateTop(plan.telly.x)), tellyStall.rotation.y);
  const crowdSound = zone.place(new CrowdSound({ listener, sources: stalls.map((s) => s.stall) }), new THREE.Vector3());
  zone.place(new RoofRain(() => sky.weather.state.rain), new THREE.Vector3());

  furnishHousehold(zone, context);
  furnishCoffee(zone, context);

  // Shoppers set down along the aisle, each starting at their own spot, never two at one spot.
  const { crowd } = plan;
  const claims = new Set<BrowseSpot>();
  const shoppers: Shopper[] = [];
  // A big day brings more of them (never more than there are spots to browse at).
  const shopperCount = Math.min(crowd.browseSpots.length - 1, Math.round(crowd.shoppers * (theme.crowd ?? 1)));
  for (let i = 0; i < shopperCount; i++) {
    const x = THREE.MathUtils.lerp(crowd.aisle.x[0], crowd.aisle.x[1], (i + 0.5) / shopperCount);
    shoppers.push(zone.place(new Shopper({ viewer: listener, spots: crowd.browseSpots, aisle: crowd.aisle, exit: crowd.exit, claims, seed: i + 1, speed: 0.65 + i * 0.08 }), new THREE.Vector3(x, 0, crowd.aisle.z), i % 2 ? Math.PI / 2 : -Math.PI / 2));
  }

  // By the way in: where each platform's stall is (a star where a wishlist game waits), and the week.
  const directory = zone.placeAt(new InfoBoard({ accent: 0x2a4a6b, label: 'THIS WAY' }), plan.directory);
  const program = zone.placeAt(new InfoBoard({ accent: 0x6b2f2a, label: theme.title }), plan.program);

  // The notice board, and the job lot's crate.
  const noticeBoard = marketHall ? zone.placeAt(new NoticeBoard({
    label: () => 'The notice board · read (wanted cards, private sales, the collectors’ club)',
    onActivate: (session) => {
      session.openPanel(marketHall.notices);
      floor.refreshNotices();
    },
  }), plan.noticeBoard) : null;
  const lotCrate = marketHall ? zone.placeAt(new LotCrate({
    label: () => (market.lot.sold ? 'The job lot: sold today' : 'The job lot · look (a crate of games sold as one)'),
    onActivate: (session) => session.openPanel(marketHall.lot),
  }), plan.lot) : null;

  // The sealed carton of the day by the way in (sold as seen, opened at home).
  const lots = context.market.lots;
  if (lots) furnishCarton(zone, context, lots);

  // The day on the floor: the stock laid out, sold, reacted to; the pennants, the boards and the crowd follow it.
  const floor = new MarketFloor({ zone, context, stalls, bins, shoppers, nightShoppers: crowd.nightShoppers, crowdSound, directory, program, noticeBoard, lotCrate });
  zone.onUnload(() => floor.dispose());

  // Other shoppers buy too: a copy leaves the stall they browse at (never one held for the player).
  zone.place(new RivalBuyers({
    shoppers,
    meanSeconds: RIVAL_BUYING.meanSeconds,
    keenness: () => floor.keenness(),
    mayBuy: () => floor.rivalMayBuy(),
    buyAt: (spot) => floor.rivalBuysAt(spot),
  }), new THREE.Vector3());

  // The rival collector, some days: after the priciest copy on the stalls, and he says so (docs/economy.md "The rival collector").
  if (lots) {
    const rival = zone.place(new RivalInHall({
      viewer: listener,
      floor,
      rival: lots.rival,
      dayNight: sky.dayNight,
      day: () => context.today.gameDay,
      owns: (id) => context.collection.owns(id),
      entrance: [...crowd.exit.out].reverse(),
      gaps: crowd.exit.gaps,
      rowZ: crowd.exit.rowZ,
      aisleZ: crowd.aisle.z,
      spots: crowd.browseSpots,
      claims,
    }), new THREE.Vector3());
    rival.placeIn(zone);
  }

  // Q held: the titles and prices float over the boxes in front of the player.
  zone.place(new PriceScanner({ input, key: SCAN_KEY, viewer: listener, boxes: () => floor.displayed }), new THREE.Vector3());

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
