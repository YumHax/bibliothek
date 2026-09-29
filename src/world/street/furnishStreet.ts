import * as THREE from 'three';
import { QUALITY } from '@/graphics/quality';
import { getPlatform } from '@/catalog/platforms';
import { PARK_TREES, STREET_TREES } from '../city/trees';
import { PARKED_CARS } from '../city/parkedCars';
import type { Zone } from '../zone/Zone';
import type { BuildContext, ZoneHandle } from '../buildContext';
import { NeonSign } from '../props/NeonSign';
import { StreetLighting } from './StreetLighting';
import { SkyDome } from './SkyDome';
import { LAWN_REACH, LAWN_Y, StreetGround } from './StreetGround';
import { StreetPark } from './StreetPark';
import { ParkStrollers } from './life/ParkStrollers';
import { Buildings } from './Buildings';
import { StreetLamps } from './StreetLamps';
import { StreetTrees, type TreeSpot } from './StreetTrees';
import { StreetCars } from './StreetCars';
import { StreetFurniture, shelterRoof } from './StreetFurniture';
import { StreetDoor } from './StreetDoor';
import { StreetBounds } from './StreetBounds';
import { NEWSSTAND_ROOF, Newsstand } from './Newsstand';
import { writeWeekly } from './gamingWeekly';
import { Busker } from './Busker';
import { RetroLure } from './RetroLure';
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
import { currentHoliday, currentSeason } from '@/time/season';
import { StreetChristmas } from './StreetChristmas';
import { FacadeRelief, awningShelters } from './relief/FacadeRelief';
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
import { StreetCues } from './audio/StreetCues';
import { Ambulance } from './traffic/Ambulance';
import { streetSurfaceAt } from './audio/streetSurface';
import { ShopEntrance, type ShopServices } from './shops/ShopEntrance';
import { retroShutNotice, shopShutNotice } from './shops/shopHours';
import { SHOP_TALK, shopName } from './shops/shopPlan';
import { DroppedCoins } from './shops/DroppedCoins';
import { GiveawayBox, giveawaySpot, isGiveawayDay } from './shops/GiveawayBox';
import { Trader, isTraderDay } from './shops/Trader';
import { FACADES, SHOP_ZONE_OF, STREET_PLAN, doorOnPavement, shopDoors, walkInShops, type Vec2 } from './streetPlan';
import { CLOSURES } from './details/roadworks';
import { Flagger } from './details/Flagger';
import { placeAirlock, sasBounds } from '../airlock';
import { dailySeed } from '@/time/daily';
import { fadeSunShadowEdges } from './shadowFade';
import { SHOP_DOOR } from '../shop/shopPlan';

const ANISOTROPY = 8;
/** Neon letters over the shopfronts: how tall. */
const SIGN_HEIGHT = 0.85;
/** What the roadworkers say when asked (`Flagger`). */
const FLAGGER_LINES = {
  front: ['The road’s up all the way to the side street. Pavements are shut both sides, so it’s back the way you came.', 'Gas main. We’ll be here till spring, the way it’s going.', 'Cars through, one at a time. People on foot: sorry, not past me.'],
  park: ['Water main burst under Park Street. Both pavements are shut past here; the shops are all back on Front Street.', '', 'Mind the cars, they squeeze past me all day.'],
} as const;
/** Why the park's gate is shut today (the park roadworker's second line, one a real day: `time/daily`). */
const GATE_EXCUSES = [
  'You want the park? The gate’s back there, but the gardeners have it locked today.',
  'The park? They’re reseeding the lawns. Gate’s chained till the grass takes, they say.',
  'Park’s shut for the tree surgeons: a big limb came down on the path last night.',
  'Some festival setting up in there. Gate’s locked till the marquees are up.',
  'The pond’s being drained, apparently. Nobody in or out of the gate this week.',
  'Wasps’ nest by the bandstand. The gardeners locked the gate and ran.',
  'They’re filming something in the park. Gate’s locked and there’s a man with a clipboard.',
];

/**
 * Builds Front Street into its zone from `STREET_PLAN` (see the map in `streetPlan.ts`): no `Room`,
 * an outdoor rig instead (the sun and sky light, the air), the sky dome, the ground, the buildings
 * with their shops and lit windows, the neon over the arcade and the retro games shop, the street
 * lamps, the trees and the park behind its hedge, the cars (parked and driving), the benches, bins
 * and bus shelter, the doors (the arcade's and the retro games shop's, with the flea market at its
 * back, travel; ours opens on the sas, the entrance hall's twin, `world/airlock`), the newsstand
 * with its paper, the busker, the garage sale on its days, the passers-by, the rain and snow, the
 * street's sound, and the edges (the facades, the railings, the roadworks and their roadworkers). Returns how lit the street is (for the reflections and
 * the haze) and what is underfoot.
 */
export function furnishStreet(zone: Zone, { sky, listener, covers, today, panels, money: { wallet, purse }, market: { stock: market, day: marketDay }, collection, arcade: { scores } }: BuildContext): ZoneHandle {
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
  // The park's near stretch over the hedge: its gravel paths and flower beds, as the window view paints them.
  zone.place(new StreetPark({ anisotropy: ANISOTROPY, lawnY: LAWN_Y, reach: LAWN_REACH.x }), origin);
  const stock = market.peekToday();
  const shopGoods = stock?.map((item) => `#${getPlatform(item.game.platform).accentColor.toString(16).padStart(6, '0')}`) ?? null;
  // The facades are walked past a metre off: on high they are painted a third finer (the shopfronts sharp up close).
  const detailScale = QUALITY.level === 'low' ? 0.6 : QUALITY.level === 'high' ? 1.35 : 1;
  const buildings = zone.place(new Buildings(FACADES, dayNight, { detailScale, anisotropy: ANISOTROPY, shopGoods, nightScale: QUALITY.level === 'high' ? 0.5 : 0.25 }), origin);
  for (const sign of plan.signs) {
    zone.place(new NeonSign({ text: sign.text, color: sign.color, width: sign.width, height: SIGN_HEIGHT, intensity: 0, seed: sign.seed }), new THREE.Vector3(...sign.at), sign.yaw);
  }

  // What the road users agree on: the lights at the crossing, the obstacles drivers stop for, the bus at its stop.
  const traffic = zone.place(new StreetTraffic(), origin);

  // Lamps, trees, cars, street furniture.
  const lamps = zone.place(new StreetLamps(dayNight, { lamps: plan.lamps, height: plan.lampHeight, lights: plan.lampLights, viewer: listener, flickering: plan.flickeringLamp }), origin);
  // The trees the window view paints too (`city/trees`): the street's and the park's, at their sizes.
  const trees: TreeSpot[] = [...STREET_TREES, ...PARK_TREES];
  zone.place(new StreetTrees(dayNight, trees), origin);
  // More cars on the better qualities, as busy as the window view's streets.
  const cars = zone.place(new StreetCars(dayNight, { parked: PARKED_CARS, ...plan.traffic, cars: plan.traffic.carsByQuality[QUALITY.level], viewer: listener, traffic }), origin);
  zone.place(
    new StreetFurniture({ shelter: plan.shelter, benches: plan.benches, bins: plan.bins, hedge: plan.hedge, railings: plan.railings, gate: { z: plan.parkGate.at[1], width: plan.parkGate.width }, anisotropy: ANISOTROPY, dayNight }),
    origin,
  );

  // The doors. RETRO GAMES (and the flea market behind it) keeps shop hours; the arcade never shuts.
  for (const door of [plan.doors.arcade, plan.doors.market]) {
    const guard = door.to === 'market' ? () => retroShutNotice(dayNight.state.hours) : undefined;
    zone.place(new StreetDoor({ width: door.width, height: door.height, to: door.to, label: door.label, guard }), at(door.at), door.yaw);
  }
  // The shops one walks into (the furniture shop, the TV repair shop, the pet shop, the florist: `world/shop/`), in shop hours.
  for (const { zone: to, door } of walkInShops()) {
    const { kind } = door.shop;
    const name = shopName(door.shop);
    const guard = () => shopShutNotice(kind, name, SHOP_TALK[kind].closed, dayNight.state.hours);
    zone.place(new StreetDoor({ width: SHOP_DOOR.width, height: SHOP_DOOR.height, to, label: `${name} · go in`, guard }), at(door.at), door.yaw);
  }
  // Our building's door is real: the sas behind it is the entrance hall's twin, walked through (`world/airlock`).
  const home = plan.doors.home;
  placeAirlock(zone, at(home.at), home.yaw, { twin: 'street', collisions: zone.collisions, viewer: listener });
  const sas = sasBounds(at(home.at), home.yaw);

  // The newsstand and its paper.
  const { games } = collection;
  const owns = (id: string): boolean => collection.owns(id);
  const isWanted = (id: string): boolean => collection.isWanted(id);
  zone.place(new Newsstand({ panel: panels.news, issue: () => writeWeekly({ stock: market.peekToday(), day: today.gameDay, theme: marketDay.theme, wanted: isWanted, news: marketDay.news() }) }), at(plan.kiosk.at), plan.kiosk.yaw);

  // The busker by the bus shelter, the garage sale (some days), the passers-by.
  zone.place(new Busker(dayNight, { viewer: listener, hours: plan.busker.hours, tipsPerDay: plan.busker.tipsPerDay, reach: plan.busker.reach, collisions: zone.collisions }), at(plan.busker.at), plan.busker.yaw);
  if (isGarageSaleDay(plan.garageSale.oneDayIn)) {
    zone.place(
      new GarageSale({ host: zone, covers, wallet, stock: () => market.peekToday(), price: () => market.binPrice, owns, isWanted }),
      at(plan.garageSale.at),
      plan.garageSale.yaw,
    );
  }
  // Passers-by say what is going on (`life/streetTalk`); shop doors they use ring `doorBells`.
  const talk = streetTalk({ sky: () => dayNight.state, market, marketDay, games, scores });
  const doorBells: ((spot: Vec2) => void)[] = [];
  const onDoor = (spot: Vec2): void => doorBells.forEach((ring) => ring(spot));
  const fewer = QUALITY.level === 'low';
  // Every walker placed goes on `walkers` too: the pigeons take off for them as for the player.
  const walkers: Walker[] = [];
  const placeWalker = (walker: Walker, spot: THREE.Vector3): void => {
    walkers.push(walker);
    zone.place(walker, spot);
  };
  const crowd = zone.place(new StreetCrowd(dayNight, { ...plan.crowd, count: fewer ? 2 : plan.crowd.count, viewer: listener, traffic, talk, onDoor, place: placeWalker }), origin);

  // --- Vehicles: the bus, the delivery van and the bin lorry, bikes, the crossing's lights (traffic/). ---
  const [line] = plan.traffic.routes;
  const vehicleBase = { traffic, viewer: listener, route: line!, stopFor: plan.traffic.stopFor, collisions: zone.collisions };
  const bus = zone.place(new StreetBus(dayNight, { ...vehicleBase, ...plan.bus }), origin);
  const van = zone.place(new DeliveryVan(dayNight, { ...vehicleBase, ...plan.delivery }), origin);
  zone.place(van.person, origin);
  const lorry = zone.place(new BinLorry(dayNight, { ...vehicleBase, bins: plan.bins, hours: plan.binLorry.hours }), origin);
  const bikes = zone.place(new StreetBikes(dayNight, { traffic, viewer: listener, routes: plan.traffic.routes, riders: plan.bikes.ridersByQuality[QUALITY.level], racks: plan.bikes.racks }), origin);
  zone.place(new SignalHeads(traffic, dayNight, plan.signals.posts), origin);
  zone.place(new Spray(traffic, dayNight), origin);
  // Now and then an ambulance down Front Street, siren on (heard by the cues below).
  const ambulance = zone.place(new Ambulance(dayNight, { ...vehicleBase, ...plan.ambulance }), origin);
  const voices = [...cars.voices, bus, van, lorry, ambulance, ...bikes.voices];
  // The street's one-off sounds: wings, barks, the crossing's beeper, shutters, the siren.
  const cues = zone.place(new StreetCues({ listener, crossing: traffic, beepers: plan.signals.posts.map((p) => p.at), barkers: crowd.barkers, sirens: [ambulance] }), origin);

  // --- People and animals: standing people, terraces, pigeons, the stray cat (life/). ---
  const seen = { drawDistance: plan.crowd.drawDistance, fade: plan.crowd.fade };
  const standing = zone.place(new StandingPeople(dayNight, { spots: plan.standing, busStop: plan.bus.stop.at, traffic, viewer: listener, talk, place: placeWalker, ...seen, busStopOnly: fewer, onDoor }), origin);
  zone.place(
    new Terraces(dayNight, { terraces: plan.terraces, viewer: listener, collisions: zone.collisions, toWorld: (p) => zone.toWorld(p), place: placeWalker, talk, ...seen, maxCustomers: fewer ? 1 : undefined }),
    origin,
  );
  zone.place(new Pigeons(dayNight, { flocks: plan.pigeons, viewer: listener, share: fewer ? 0.5 : 1, walkers, onTakeOff: (spot) => cues.flutter(spot) }), origin);
  if (!fewer) zone.place(new ParkStrollers(dayNight, { viewer: listener, place: placeWalker, count: 2, drawDistance: 70, fade: 10, reach: LAWN_REACH.x + 10 }), origin);
  zone.place(new StrayCat({ perches: plan.strayCat.perches, viewer: listener, traffic, taken: (on) => (on === 'bench' ? standing.benchTaken : lorry.active) }), origin);

  // --- Facades in relief, shop interiors and shutters, glow, puddles, leaves, street details (relief/, ground details). ---
  // Awnings, balconies, sills, door surrounds and our flat's balcony; the shops seen through their windows (not on low);
  // the roller shutters; the light the shops spill on the pavement; the wet ground; autumn's leaves; the small print.
  const fronts = buildings.fronts;
  zone.place(new FacadeRelief(fronts), origin);
  const interiors = QUALITY.level !== 'low' ? zone.place(new ShopInteriors(fronts, dayNight, shopGoods), origin) : null;
  // RETRO GAMES on a new market day, as seen from the flat: the NEW IN banner, the queue; its window restocked each market day.
  const onStock = (colors: readonly string[]): void => {
    buildings.repaintGoods(colors);
    interiors?.repaintGoods(colors);
  };
  zone.place(new RetroLure({ ...plan.retroLure, queue: fewer ? plan.retroLure.queue.slice(0, 3) : plan.retroLure.queue, door: plan.doors.market.at, viewer: listener, place: placeWalker, talk, ...seen, onStock }), origin);
  zone.place(new Shutters(fronts, dayNight, (spot) => cues.rattle(spot)), origin);
  zone.place(new ShopGlow(fronts, dayNight), origin);
  zone.place(new WetGround(dayNight, { fronts, lamps: lamps.headPoints, viewer: listener, mirror: QUALITY.reflections, cars: cars.lamps }), origin);
  const season = currentSeason();
  if (season.name === 'autumn') zone.place(new Leaves(dayNight, plan.trees, season), origin);
  zone.place(new StreetDetails(ANISOTROPY), origin);
  // A roadworker in the road's gap at each works: the one way through no barrier closes (the traffic's).
  for (const [i, closure] of CLOSURES.entries()) {
    const lines = FLAGGER_LINES[closure.id].map((line) => line || GATE_EXCUSES[dailySeed('park-gate') % GATE_EXCUSES.length]!);
    zone.place(new Flagger({ closure, seed: 901 + i, viewer: listener, place: placeWalker, lines }), origin);
  }

  // --- Sounds of the shops, bells and sirens (audio). ---
  // The arcade's bleeps, the cafés' and bars' chatter (their terraces too), the laundry's hum, shop bells (`ring`).
  const shopSounds = zone.place(new ShopSounds(dayNight, { listener }), origin);
  doorBells.push((spot) => shopSounds.ring(spot));

  // --- Shops to go into, things to find, the trader (shops/). ---
  // Every shop door along the walkable pavements (RETRO GAMES and the arcade are travel doors, above).
  if (purse) {
    const scratch = panels.scratch;
    const services: ShopServices = { hours: () => dayNight.state.hours, purse, market, marketDay, isWanted, scratch };
    for (const door of shopDoors()) {
      // RETRO GAMES, the arcade and the shops one walks into are travel doors (above).
      if (door.shop.kind === 'retro' || door.shop.kind === 'arcade' || SHOP_ZONE_OF[door.shop.kind]) continue;
      // The door's step, half a metre out on the pavement, must be somewhere the player can stand.
      if (!doorOnPavement(door)) continue;
      zone.place(new ShopEntrance(door, services), at(door.at), door.yaw);
    }
    zone.place(new DroppedCoins({ spots: plan.coins.spots, perDay: plan.coins.perDay, host: zone, purse, viewer: listener }), origin);
  }
  // A box of cast-offs by a door (some days), the collector outside RETRO GAMES (some days).
  if (isGiveawayDay(plan.giveaway.oneDayIn)) {
    const spot = giveawaySpot(plan.giveaway.spots, today.realDate());
    zone.place(new GiveawayBox({ host: zone, covers, wallet, stock: () => market.peekToday(), owns, isWanted }), at(spot.at), spot.yaw);
  }
  if (isTraderDay(plan.trader.oneDayIn)) {
    zone.place(new Trader(dayNight, { host: zone, covers, wallet, market, today, owns, isWanted, hours: plan.trader.hours, viewer: listener, collisions: zone.collisions }), at(plan.trader.at), plan.trader.yaw);
  }

  // Weather, sound, and the edges of the walkable street.
  // The holidays: lights across the street, pumpkins on the doorsteps; the snowman while the snow lies.
  placeDecor(zone, plan.decor);
  // At Christmas the street trees wear bulbs and the park's fir is lit, as seen from the flat.
  if (currentHoliday() === 'christmas') zone.place(new StreetChristmas(dayNight, { trees: STREET_TREES }), origin);
  zone.place(new Snowman({ viewer: listener, collisions: zone.collisions }), at(plan.snowman.at), plan.snowman.yaw);
  // Nothing falls in the sas, under the awnings, the bus shelter's roof or the kiosk's; petals blow about while the trees flower.
  const roof = shelterRoof(plan.shelter.length);
  const kiosk = NEWSSTAND_ROOF;
  const shelters = [sas, standingBox(plan.shelter.at, plan.shelter.yaw, roof.length, roof.depth, roof.height), standingBox(plan.kiosk.at, plan.kiosk.yaw, kiosk.width, kiosk.depth, kiosk.height), ...awningShelters(fronts)];
  zone.place(new Precipitation(dayNight, { shelters, petals: season.name === 'spring' && season.depth < 0.6 }), origin);
  zone.place(new StreetSound(dayNight, { listener, cars: voices }), origin);
  zone.place(new StreetBounds(FACADES, [...StreetLamps.colliders(plan.lamps), ...StreetTrees.colliders(plan.trees)]), origin);

  // The sun's shadow fades out towards its map's edge on everything the street built (no hard square 28 m out).
  fadeSunShadowEdges(zone.group);

  // In the sas the feet are on the entrance hall's tiles, as in its twin.
  return { lightLevel: () => lighting.lightLevel(), surfaceAt: (local) => (sas.containsPoint(local) ? 'tiles' : streetSurfaceAt(local)) };
}

/** A box standing on the pavement round `at` (zone-local), `length` along its yaw's x, `depth` across, from under the ground up to `height`. */
function standingBox([x, z]: Vec2, yaw: number, length: number, depth: number, height: number): THREE.Box3 {
  const across = Math.abs(Math.sin(yaw)) > 0.5;
  const hx = (across ? depth : length) / 2;
  const hz = (across ? length : depth) / 2;
  return new THREE.Box3(new THREE.Vector3(x - hx, -0.5, z - hz), new THREE.Vector3(x + hx, height, z + hz));
}
