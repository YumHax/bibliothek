import * as THREE from 'three';
import { QUALITY } from '@/graphics/quality';
import { getPlatform } from '@/catalog/platforms';
import { seededRandom } from '@/covers/generated/canvasUtils';
import { NewsPanel } from '@/ui/NewsPanel';
import type { Zone } from '../zone/Zone';
import type { BuildContext, ZoneHandle } from '../buildContext';
import { NeonSign } from '../props/NeonSign';
import { StreetLighting } from './StreetLighting';
import { SkyDome } from './SkyDome';
import { StreetGround } from './StreetGround';
import { Buildings } from './Buildings';
import { StreetLamps } from './StreetLamps';
import { StreetTrees, type TreeSpot } from './StreetTrees';
import { StreetCars } from './StreetCars';
import { StreetFurniture } from './StreetFurniture';
import { StreetDoor } from './StreetDoor';
import { StreetBounds } from './StreetBounds';
import { Newsstand } from './Newsstand';
import { writeWeekly } from './gamingWeekly';
import { Busker } from './Busker';
import { GarageSale, isGarageSaleDay } from './GarageSale';
import { StreetCrowd } from './StreetCrowd';
import type { Walker } from '../people/Walker';
import { streetTalk } from './life/streetTalk';
import { StandingPeople } from './life/StandingPeople';
import { Terraces } from './life/Terraces';
import { Pigeons } from './life/Pigeons';
import { StrayCat } from './life/StrayCat';
import { Precipitation } from './Precipitation';
import { Snowman } from './Snowman';
import { placeDecor } from '../props/decor';
import { currentSeason } from '../props/outdoors/season';
import { FacadeRelief } from './relief/FacadeRelief';
import { ShopInteriors } from './relief/ShopInteriors';
import { Shutters } from './relief/Shutters';
import { ShopGlow } from './relief/ShopGlow';
import { WetGround } from './relief/WetGround';
import { Leaves } from './relief/Leaves';
import { StreetDetails } from './details/StreetDetails';
import { StreetSound } from './StreetSound';
import { StreetTraffic } from './traffic/StreetTraffic';
import { StreetBus } from './traffic/StreetBus';
import { BinLorry, DeliveryVan } from './traffic/ServiceVehicles';
import { StreetBikes } from './traffic/Bikes';
import { SignalHeads } from './traffic/SignalHeads';
import { Spray } from './traffic/Spray';
import { ShopSounds } from './audio/ShopSounds';
import { streetSurfaceAt } from './audio/streetSurface';
import { ShopEntrance, type ShopServices } from './shops/ShopEntrance';
import { SHOP_HOURS, clockTime, isShopOpen } from './shops/shopHours';
import { DroppedCoins } from './shops/DroppedCoins';
import { GiveawayBox, isGiveawayDay } from './shops/GiveawayBox';
import { Trader, isTraderDay } from './shops/Trader';
import { ScratchCardPanel } from '@/ui/ScratchCardPanel';
import { FACADES, OUR_LINE_GAPS, STREET_PLAN, WALKABLE, isWalkable, shopDoors, type Vec2 } from './streetPlan';
import { placeAirlock, sasBounds } from '../airlock';

const ANISOTROPY = 8;
/** Neon letters over the shopfronts: how tall. */
const SIGN_HEIGHT = 0.85;

/**
 * Builds Front Street into its zone from `STREET_PLAN` (see the map in `streetPlan.ts`): no `Room`,
 * an outdoor rig instead (the sun and sky light, the air), the sky dome, the ground, the buildings
 * with their shops and lit windows, the neon over the arcade and the retro games shop, the street
 * lamps, the trees and the park behind its hedge, the cars (parked and driving), the benches, bins
 * and bus shelter, the doors (the arcade's and the retro games shop's, with the flea market at its
 * back, travel; ours opens on the sas, the entrance hall's twin, `world/airlock`), the newsstand
 * with its paper, the busker, the garage sale on its days, the passers-by, the rain and snow, the
 * street's sound, and the invisible edges. Returns how lit the street is (for the reflections and
 * the haze) and what is underfoot.
 */
export function furnishStreet(zone: Zone, { sky, listener, covers, cssLayer, money: { wallet, purse }, home: { upgrades }, market: { stock: market }, collection: { games }, arcade: { scores } }: BuildContext): ZoneHandle {
  const plan = STREET_PLAN;
  const { dayNight } = sky;
  const origin = new THREE.Vector3();
  const at = ([x, z]: Vec2): THREE.Vector3 => new THREE.Vector3(x, 0, z);

  // Light, sky, ground and buildings.
  const lighting = zone.place(
    new StreetLighting(dayNight, listener, (out) => sky.outdoors.lightDirection(dayNight.state, out), { shadowMapSize: Math.min(2048, QUALITY.shadowMapSize * 2) }),
    origin,
  );
  zone.place(new SkyDome(dayNight, listener), origin);
  zone.place(new StreetGround(dayNight, ANISOTROPY), origin);
  const stock = market.peekToday();
  const shopGoods = stock?.map((item) => `#${getPlatform(item.game.platform).accentColor.toString(16).padStart(6, '0')}`) ?? null;
  const buildings = zone.place(new Buildings(FACADES, dayNight, { detailScale: QUALITY.level === 'low' ? 0.6 : 1, anisotropy: ANISOTROPY, shopGoods }), origin);
  for (const sign of plan.signs) {
    zone.place(new NeonSign({ text: sign.text, color: sign.color, width: sign.width, height: SIGN_HEIGHT, intensity: 0, seed: sign.seed }), new THREE.Vector3(...sign.at), sign.yaw);
  }

  // What the road users agree on: the lights at the crossing, the obstacles drivers stop for, the bus at its stop.
  const traffic = zone.place(new StreetTraffic(), origin);

  // Lamps, trees, cars, street furniture.
  const lamps = zone.place(new StreetLamps(dayNight, { lamps: plan.lamps, height: plan.lampHeight, lights: plan.lampLights, viewer: listener, flickering: plan.flickeringLamp }), origin);
  const random = seededRandom(plan.park.seed);
  const park = plan.park;
  const trees: TreeSpot[] = [
    ...plan.trees.map((spot) => ({ at: spot, scale: 1 })),
    ...Array.from({ length: park.trees }, () => ({
      at: [park.from[0] + random() * (park.to[0] - park.from[0]), park.from[1] + random() * (park.to[1] - park.from[1])] as Vec2,
      scale: 1.3 + random() * 0.6,
    })),
  ];
  zone.place(new StreetTrees(dayNight, trees), origin);
  const cars = zone.place(new StreetCars(dayNight, { parked: plan.parked, ...plan.traffic, viewer: listener, traffic }), origin);
  zone.place(new StreetFurniture({ shelter: plan.shelter, benches: plan.benches, bins: plan.bins, hedge: plan.hedge, railings: plan.railings, anisotropy: ANISOTROPY, dayNight }), origin);

  // The doors. RÉTRO JEUX (and the flea market behind it) keeps shop hours; the arcade never shuts.
  const retroShut = (): { label: string; hint: string } | null => {
    if (isShopOpen('retro', dayNight.state.hours)) return null;
    const opens = clockTime(SHOP_HOURS.retro?.open ?? 8);
    return { label: `RÉTRO JEUX is closed · opens at ${opens}`, hint: `RÉTRO JEUX is shut for the night, and the flea market behind it. It opens at ${opens}. The arcade is open all night.` };
  };
  for (const door of [plan.doors.arcade, plan.doors.market]) {
    const guard = door.to === 'market' ? retroShut : undefined;
    zone.place(new StreetDoor({ width: door.width, height: door.height, to: door.to, label: door.label, guard }), at(door.at), door.yaw);
  }
  // Our building's door is real: the sas behind it is the entrance hall's twin, walked through (`world/airlock`).
  const home = plan.doors.home;
  placeAirlock(zone, at(home.at), home.yaw, { twin: 'street', collisions: zone.collisions, viewer: listener });
  const sas = sasBounds(at(home.at), home.yaw);

  // The newsstand and its paper.
  const owns = (id: string): boolean => games.games.some((g) => g.id === id && g.status !== 'wishlist');
  const isWanted = (id: string): boolean => games.games.some((g) => g.id === id && g.status === 'wishlist');
  const panel = new NewsPanel(cssLayer.renderer.domElement.parentElement ?? document.body);
  zone.onUnload(() => panel.dispose());
  zone.place(new Newsstand({ panel, issue: () => writeWeekly({ stock: market.peekToday(), day: market.day, theme: market.theme, wanted: isWanted, news: market.news() }) }), at(plan.kiosk.at), plan.kiosk.yaw);

  // The busker by the bus shelter, the garage sale (some days), the passers-by.
  zone.place(new Busker(dayNight, { viewer: listener, hours: plan.busker.hours, tipsPerDay: plan.busker.tipsPerDay, reach: plan.busker.reach }), at(plan.busker.at), plan.busker.yaw);
  if (isGarageSaleDay(plan.garageSale.oneDayIn)) {
    zone.place(
      new GarageSale({ host: zone, covers, wallet, stock: () => market.peekToday(), price: () => market.binPrice, owns, isWanted }),
      at(plan.garageSale.at),
      plan.garageSale.yaw,
    );
  }
  // Passers-by say what is going on (`life/streetTalk`); shop doors they use ring `doorBells`.
  const talk = streetTalk({ sky: () => dayNight.state, market, games, scores });
  const doorBells: ((spot: Vec2) => void)[] = [];
  const onDoor = (spot: Vec2): void => doorBells.forEach((ring) => ring(spot));
  const fewer = QUALITY.level === 'low';
  const placeWalker = (walker: Walker, spot: THREE.Vector3): void => void zone.place(walker, spot);
  zone.place(new StreetCrowd(dayNight, { ...plan.crowd, count: fewer ? 2 : plan.crowd.count, viewer: listener, traffic, talk, onDoor, place: placeWalker }), origin);

  // --- Vehicles: the bus, the delivery van and the bin lorry, bikes, the crossing's lights (traffic/). ---
  const [line] = plan.traffic.routes;
  const vehicleBase = { traffic, viewer: listener, route: line!, stopFor: plan.traffic.stopFor, collisions: zone.collisions };
  const bus = zone.place(new StreetBus(dayNight, { ...vehicleBase, ...plan.bus }), origin);
  const van = zone.place(new DeliveryVan(dayNight, { ...vehicleBase, ...plan.delivery }), origin);
  zone.place(van.person, origin);
  const lorry = zone.place(new BinLorry(dayNight, { ...vehicleBase, bins: plan.bins, hours: plan.binLorry.hours }), origin);
  const bikes = zone.place(new StreetBikes(dayNight, { traffic, viewer: listener, routes: plan.traffic.routes, riders: plan.bikes.riders, racks: plan.bikes.racks }), origin);
  zone.place(new SignalHeads(traffic, dayNight, plan.signals.posts), origin);
  zone.place(new Spray(traffic, dayNight), origin);
  const voices = [...cars.voices, bus, van, lorry, ...bikes.voices];

  // --- People and animals: standing people, terraces, pigeons, the stray cat (life/). ---
  const seen = { drawDistance: plan.crowd.drawDistance, fade: plan.crowd.fade };
  zone.place(new StandingPeople(dayNight, { spots: plan.standing, busStop: plan.bus.stop.at, traffic, viewer: listener, talk, place: placeWalker, ...seen, busStopOnly: fewer, onDoor }), origin);
  zone.place(
    new Terraces(dayNight, { terraces: plan.terraces, viewer: listener, collisions: zone.collisions, toWorld: (p) => zone.toWorld(p), place: placeWalker, talk, ...seen, maxCustomers: fewer ? 1 : undefined }),
    origin,
  );
  zone.place(new Pigeons(dayNight, { flocks: plan.pigeons, viewer: listener, share: fewer ? 0.5 : 1 }), origin);
  zone.place(new StrayCat({ perches: plan.strayCat.perches, viewer: listener, traffic }), origin);

  // --- Facades in relief, shop interiors and shutters, glow, puddles, leaves, street details (relief/, ground details). ---
  // Awnings, balconies, sills, door surrounds and our flat's balcony; the shops seen through their windows (not on low);
  // the roller shutters; the light the shops spill on the pavement; the wet ground; autumn's leaves; the small print.
  const fronts = buildings.fronts;
  zone.place(new FacadeRelief(fronts), origin);
  if (QUALITY.level !== 'low') zone.place(new ShopInteriors(fronts, dayNight, shopGoods), origin);
  zone.place(new Shutters(fronts, dayNight), origin);
  zone.place(new ShopGlow(fronts, dayNight), origin);
  zone.place(new WetGround(dayNight, { fronts, lamps: lamps.headPoints, viewer: listener, mirror: QUALITY.reflections }), origin);
  const season = currentSeason();
  if (season.name === 'autumn') zone.place(new Leaves(dayNight, plan.trees, season), origin);
  zone.place(new StreetDetails(ANISOTROPY), origin);

  // --- Sounds of the shops, bells and sirens (audio). ---
  // The arcade's bleeps, the cafés' and bars' chatter (their terraces too), the laundry's hum, shop bells (`ring`).
  const shopSounds = zone.place(new ShopSounds(dayNight, { listener }), origin);
  doorBells.push((spot) => shopSounds.ring(spot));

  // --- Shops to go into, things to find, the trader (shops/). ---
  // Every shop door along the walkable pavements (RÉTRO JEUX and the arcade are travel doors, above).
  if (purse) {
    const scratch = new ScratchCardPanel(cssLayer.renderer.domElement.parentElement ?? document.body);
    zone.onUnload(() => scratch.dispose());
    const services: ShopServices = {
      hours: () => dayNight.state.hours,
      purse,
      market,
      isWanted,
      plants: upgrades ? { count: () => upgrades.count('plant'), add: () => upgrades.add('plant') } : undefined,
      scratch,
    };
    for (const door of shopDoors()) {
      if (door.shop.kind === 'retro' || door.shop.kind === 'arcade') continue;
      // The door's step, half a metre out on the pavement, must be somewhere the player can stand.
      const step: Vec2 = [door.at[0] + Math.sin(door.yaw) * 0.5, door.at[1] + Math.cos(door.yaw) * 0.5];
      if (!isWalkable(step)) continue;
      zone.place(new ShopEntrance(door, services), at(door.at), door.yaw);
    }
    zone.place(new DroppedCoins({ spots: plan.coins.spots, perDay: plan.coins.perDay, host: zone, purse, viewer: listener }), origin);
  }
  // A box of cast-offs by a door (some days), the collector outside RÉTRO JEUX (some days).
  if (isGiveawayDay(plan.giveaway.oneDayIn)) {
    const spots = plan.giveaway.spots;
    const spot = spots[new Date().getDate() % spots.length]!;
    zone.place(new GiveawayBox({ host: zone, covers, wallet, stock: () => market.peekToday(), owns, isWanted }), at(spot.at), spot.yaw);
  }
  if (isTraderDay(plan.trader.oneDayIn)) {
    zone.place(new Trader(dayNight, { host: zone, covers, wallet, market, owns, isWanted, hours: plan.trader.hours, viewer: listener }), at(plan.trader.at), plan.trader.yaw);
  }

  // Weather, sound, and the edges of the walkable street.
  // The holidays: lights across the street, pumpkins on the doorsteps; the snowman while the snow lies.
  placeDecor(zone, plan.decor);
  zone.place(new Snowman(), at(plan.snowman.at), plan.snowman.yaw);
  zone.place(new Precipitation(dayNight, { shelter: sas }), origin);
  zone.place(new StreetSound(dayNight, { listener, cars: voices }), origin);
  zone.place(new StreetBounds(WALKABLE, [...StreetLamps.colliders(plan.lamps), ...StreetTrees.colliders(plan.trees)], OUR_LINE_GAPS), origin);

  void traffic;
  // In the sas the feet are on the entrance hall's tiles, as in its twin.
  return { lightLevel: () => lighting.lightLevel(), surfaceAt: (local) => (sas.containsPoint(local) ? 'tiles' : streetSurfaceAt(local)) };
}
