import * as THREE from 'three';
import { QUALITY } from '@/graphics/quality';
import { getPlatform } from '@/catalog/platforms';
import { STREET_TREES } from '../city/trees';
import type { Zone } from '../zone/Zone';
import type { BuildContext, ZoneHandle } from '../buildContext';
import { NeonSign } from '../props/NeonSign';
import { StreetLighting } from './StreetLighting';
import { SkyDome } from './SkyDome';
import { ParkStrollers } from './life/ParkStrollers';
import { StreetLamps } from './StreetLamps';
import { StreetTrees } from './StreetTrees';
import type { CarVoice } from './StreetCars';
import type { VehicleRole } from './audio/VehicleVoice';
import { weekdayOf } from '@/time/wakefulness';
import { SHELTER, shelterRoof } from './StreetFurniture';
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
import { PeopleBudget } from './life/PeopleBudget';
import { DoorGaps } from './life/DoorGaps';
import { castCrowd, residentMember } from './life/crowdCast';
import { attractionStops, windowStops } from './life/crowdTrips';
import { pavementClutter } from './life/pavementClutter';
import { Loiterers } from './life/Loiterers';
import { ShopQueue } from './life/ShopQueue';
import { STAIRWELL_PLAN } from '../stairwell/stairwellPlan';
import { movedAway, residentName } from '@/building/residentsHome';
import { Precipitation } from './Precipitation';
import { Snowman } from './Snowman';
import { placeDecor } from '../props/decor';
import { currentHoliday, currentSeason } from '@/time/season';
import { StreetChristmas } from './StreetChristmas';
import { awningShelters } from './relief/FacadeRelief';
import { ShopInteriors } from './relief/ShopInteriors';
import { buildStreetBase, buildStreetFixtures, buildStreetFronts, sceneryAnisotropy, type AddScenery } from './streetScenery';
import { ShopSpill } from './shopfronts/ShopSpill';
import { WetGround } from './relief/WetGround';
import { Leaves } from './relief/Leaves';
import { StreetClutter } from './clutter/StreetClutter';
import { StreetDetails } from './details/StreetDetails';
import { StreetSound } from './StreetSound';
import { StreetTraffic } from './traffic/StreetTraffic';
import { StreetBus } from './traffic/StreetBus';
import { BinLorry, DeliveryVan } from './traffic/ServiceVehicles';
import { StreetBikes } from './traffic/Bikes';
import { Motorbikes } from './traffic/Motorbikes';
import { SignalHeads } from './traffic/SignalHeads';
import { Spray } from './traffic/Spray';
import { ShopSounds } from './audio/ShopSounds';
import { StreetCues } from './audio/StreetCues';
import { PeopleSounds } from './audio/PeopleSounds';
import { RoadworksSound } from './audio/RoadworksSound';
import { Ambulance } from './traffic/Ambulance';
import { PoliceCar } from './traffic/PoliceCar';
import { FireEngine } from './traffic/FireEngine';
import { streetSurfaceAt } from './audio/streetSurface';
import { ShopEntrance, type ShopServices } from './shops/ShopEntrance';
import { SHOP_HOURS, clockTime, isShopOpen, retroShutNotice, shopShutNotice } from './shops/shopHours';
import { SHOP_TALK, shopName } from './shops/shopPlan';
import { DroppedCoins } from './shops/DroppedCoins';
import { streetNews } from './shops/streetNews';
import { GiveawayBox, giveawaySpot, isGiveawayDay } from './shops/GiveawayBox';
import { Trader, isTraderDay } from './shops/Trader';
import { FACADES, PARK_WALK, SHOP_ZONE_OF, STREET_PLAN, WAYFINDING, doorOnPavement, shopDoors, walkInShops, type Vec2 } from './streetPlan';
import { closures, frontWorksMoved, syncWorks } from './details/roadworks';
import { Flagger } from './details/Flagger';
import { BenchSeat, type BenchSpot } from './details/BenchSeats';
import { Signpost } from './wayfinding/Signpost';
import { StreetPlanBoard } from './wayfinding/StreetPlanBoard';
import { StreetClock } from './wayfinding/StreetClock';
import { BusStopPole } from './wayfinding/BusStopPole';
import { WhatsOnBills } from './events/WhatsOnBills';
import { FairDay } from './events/FairDay';
import { isBrocante } from '@/economy/marketEvents';
import { placeAirlock, sasBounds } from '../airlock';
import { buildingWindowLife } from '@/building/rearWindows';
import { fadeSunShadowEdges } from './shadowFade';
import { SHOP_DOOR } from '../shop/shopPlan';
import { fitStockToStalls } from '../market/stockFit';
import { MansionBell } from './MansionBell';

/** Neon letters over the shopfronts: how tall. */
const SIGN_HEIGHT = 0.85;
/** What the roadworkers say when asked (`Flagger`); Front Street's once its works moved on to the side street (`moved`). */
const FLAGGER_LINES = {
  front: ['The road’s up all the way to the side street. Pavements are shut both sides, so it’s back the way you came.', 'Gas main. We’ll be here till spring, the way it’s going.', 'Cars through, one at a time. People on foot: sorry, not past me.'],
  moved: ['We’re done back there: the pavements are open again behind you, all the way along. The side street’s next.', 'Gas main, the last stretch. Then the side street, then home.', 'Cars through, one at a time. People on foot: sorry, not past me.'],
  park: ['Water main burst under Park Street. Both pavements are shut past here; the shops are all back on Front Street.', '', 'Mind the cars, they squeeze past me all day.'],
} as const;
/** The park roadworker's second line: where the park's gate is and when it is open (`STREET_PLAN.parkGate.hours`). */
function gateLine([open, shut]: readonly [number, number]): string {
  return `You want the park? The gate’s back there on this side: open from ${clockTime(open)} to ${clockTime(shut)}.`;
}

/**
 * Builds Front Street into its zone from `STREET_PLAN` (see the map in `streetPlan.ts`): no `Room`,
 * an outdoor rig instead (the sun and sky light, the air), the sky dome, the ground, the buildings
 * with their shops and lit windows, the neon over the arcade and the retro games shop, the street
 * lamps, the trees and the park behind its hedge, the cars (parked and driving), the benches, bins
 * and bus shelter, the doors (the arcade's and the retro games shop's, with the flea market at its
 * back, travel; ours opens on the sas, the entrance hall's twin, `world/airlock`), the newsstand
 * with its paper, the busker, the garage sale on its days, the passers-by, the rain and snow, the
 * street's sound, and the edges (the facades, the railings, the roadworks and their roadworkers). Returns how lit the street is (for the reflections and
 * the haze) and what is underfoot. As steps: it yields between its sections, so a build got ready ahead
 * (`World.prepareZone` from the stairs) is spread over idle moments (`Zone.buildSliced`); `furnishStreet` runs them at once.
 */
function* furnishStreetSteps(zone: Zone, { sky, listener, covers, today, panels, money: { wallet, purse }, market: { stock: market, day: marketDay, lots }, collection, arcade: { scores, daily, tournament }, story, classifieds, home: { upgrades } }: BuildContext): Generator<void, ZoneHandle, void> {
  const plan = STREET_PLAN;
  const { dayNight } = sky;
  const ANISOTROPY = sceneryAnisotropy();
  // The roadworks as they stand today (moved on past the first stretch after a while): the walkable street's end follows.
  syncWorks(today.gameDay);
  const origin = new THREE.Vector3();
  const at = ([x, z]: Vec2): THREE.Vector3 => new THREE.Vector3(x, 0, z);

  // Light, sky, ground and buildings.
  const lighting = zone.place(
    new StreetLighting(dayNight, listener, (out) => sky.outdoors.lightDirection(dayNight.state, out), { shadowMapSize: Math.min(2048, QUALITY.shadowMapSize * 2) }),
    origin,
  );
  zone.place(new SkyDome(dayNight, listener), origin);
  // Today's stock is drawn as the street is built (the stalls' sizes from the market's plan), not only once the hall is
  // visited: the collector's case, the garage sale, the free box, the barista's tip and the paper have it on the way there.
  fitStockToStalls(market);
  market.warm();
  const stock = market.peekToday();
  const shopGoods = stock?.map((item) => `#${getPlatform(item.game.platform).accentColor.toString(16).padStart(6, '0')}`) ?? null;
  // The facades are walked past a metre off: on high they are painted a third finer (the shopfronts sharp up close).
  const detailScale = QUALITY.level === 'low' ? 0.6 : QUALITY.level === 'high' ? 1.35 : 1;
  // Our building's lit windows follow its residents (`building/rearWindows`).
  const windowLife = buildingWindowLife({ day: () => today.gameDay, hours: () => dayNight.state.hours });
  // The ground, the park's near stretch over the hedge (its walked gardens), the facades (`streetScenery`, shared with the window views).
  const scenery: AddScenery = (item) => zone.place(item, origin);
  const { buildings } = buildStreetBase(scenery, { dayNight, facades: FACADES, detailScale, shopGoods, windowLife, walkable: true });
  for (const sign of plan.signs) {
    zone.place(new NeonSign({ text: sign.text, color: sign.color, width: sign.width, height: SIGN_HEIGHT, intensity: 0, seed: sign.seed }), new THREE.Vector3(...sign.at), sign.yaw);
  }

  yield;
  // What the road users agree on: the lights at the crossing, the obstacles drivers stop for, the bus at its stop.
  const traffic = zone.place(new StreetTraffic(dayNight), origin);

  // What's on: a fresh bill on the Morris column and the shelter's poster for the Fair (repainted as the market day turns).
  const { column } = plan.details;
  const bills = zone.place(new WhatsOnBills({ day: () => today.gameDay, daily, tournament, radius: column.radius, height: column.height, anisotropy: ANISOTROPY }), at(column.at));
  // Lamps, the trees the window view paints too (`city/trees`), cars, street furniture. Parked cars pull out and drivers
  // park now and then (solid in their bays while parked); taxis drop off and pick up at their stands. The benches, bins
  // and shelter, the park's railings and its gate (open in the park's hours, never on someone still inside).
  const { lamps, cars } = buildStreetFixtures(scenery, {
    dayNight, viewer: listener, traffic, lampLights: plan.lampLights,
    cars: { bays: plan.parked, collisions: zone.collisions, taxiStops: plan.taxi.stops, taxiEvery: plan.taxi.every, speaks: true },
    furniture: { gateHours: plan.parkGate.hours, collisions: zone.collisions, viewer: listener, ad: bills.ad },
  });
  if (cars.fare) zone.place(cars.fare, origin);
  // Finding the way: the fingerpost by our door, the plan on the wall, the clock by RETRO GAMES.
  const { signpost, planBoard, clock } = WAYFINDING;
  zone.place(new Signpost(signpost.at, signpost.arms, ANISOTROPY), at(signpost.at));
  zone.place(new StreetPlanBoard({ at: planBoard.at, width: planBoard.width, height: planBoard.height, places: signpost.arms, far: frontWorksMoved }, ANISOTROPY), new THREE.Vector3(planBoard.at[0], planBoard.y, planBoard.at[1]), planBoard.yaw);
  const closingSoon = (hours: number): string | null => {
    if (hours >= plan.parkGate.hours[1] - 1 && hours < plan.parkGate.hours[1]) return `The park shuts at ${clockTime(plan.parkGate.hours[1])}.`;
    const shop = SHOP_HOURS.furniture;
    if (shop && hours >= shop.close - 1 && hours < shop.close) return `The shops shut at ${clockTime(shop.close)}.`;
    if (shop && hours < shop.open) return `The shops open at ${clockTime(shop.open)}.`;
    return null;
  };
  zone.place(new StreetClock(dayNight, clock.height, closingSoon), at(clock.at), clock.yaw);

  yield;
  // The doors. RETRO GAMES (and the flea market behind it) keeps shop hours; the arcade never shuts.
  for (const door of [plan.doors.arcade, plan.doors.market]) {
    const guard = door.to === 'market' ? () => retroShutNotice(dayNight.state.hours) : undefined;
    // Open, its caption says till when (shut, the guard's says when it opens).
    const label = door.to === 'market' ? `${door.label} · till ${clockTime(SHOP_HOURS.retro?.close ?? 23)}` : door.label;
    zone.place(new StreetDoor({ width: door.width, height: door.height, to: door.to, label, guard }), at(door.at), door.yaw);
  }
  // The shops one walks into (the furniture shop, the TV repair shop, the pet shop, the florist: `world/shop/`), in shop hours.
  for (const { zone: to, door } of walkInShops()) {
    const { kind } = door.shop;
    const name = shopName(door.shop);
    const guard = () => shopShutNotice(kind, name, SHOP_TALK[kind].closed, dayNight.state.hours);
    zone.place(new StreetDoor({ width: SHOP_DOOR.width, height: SHOP_DOOR.height, to, label: `${name} · go in · till ${clockTime(SHOP_HOURS[kind]?.close ?? 21)}`, guard }), at(door.at), door.yaw);
  }
  // Our building's door is real: the sas behind it is the entrance hall's twin, walked through (`world/airlock`).
  const home = plan.doors.home;
  placeAirlock(zone, at(home.at), home.yaw, { twin: 'street', collisions: zone.collisions, viewer: listener });
  const sas = sasBounds(at(home.at), home.yaw);

  // The newsstand and its paper.
  const { games } = collection;
  const owns = (id: string): boolean => collection.owns(id);
  const isWanted = (id: string): boolean => collection.isWanted(id);
  // Its small ads (`classifieds/`): read here, they are known to the phone at home.
  const smallAds = () => {
    const ads = classifieds?.book.inPaper() ?? [];
    classifieds?.book.markSeen(ads);
    return ads;
  };
  // What is on along the street today and tomorrow (the garage sale, the free box, the collector, the arcade, the rain): the paper and the bar pass it on.
  const news = (): string[] => streetNews({ weather: () => dayNight.state, challenge: daily ? () => daily.challenge() : undefined, tournamentOn: tournament ? () => tournament.isOn : undefined });
  zone.place(new Newsstand({ panel: panels.news, issue: () => writeWeekly({ stock: market.peekToday(), day: today.gameDay, theme: marketDay.theme, wanted: isWanted, news: marketDay.news(), classifieds: smallAds(), street: news() }) }), at(plan.kiosk.at), plan.kiosk.yaw);
  // The bells of Park Corner Mansions, where the small ads' sellers live: rung at the hour agreed, the door lets the player up.
  if (classifieds) zone.place(new MansionBell(classifieds.book), new THREE.Vector3(plan.mansionBell.at[0], plan.mansionBell.y, plan.mansionBell.at[1]), plan.mansionBell.yaw);

  yield;
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
  const level = QUALITY.level;
  // People are the costly meshes: only the nearest few are drawn, whoever they are (`life/PeopleBudget`).
  const budget = zone.place(new PeopleBudget(listener, plan.crowd.budgetByQuality[level]), origin);
  // Every walker placed goes on `walkers` too: the pigeons take off for them as for the player, passers-by keep right of them.
  const walkers: Walker[] = [];
  const placeWalker = (walker: Walker, spot: THREE.Vector3): void => {
    walkers.push(walker);
    budget.join(walker);
    zone.place(walker, spot);
  };
  // The painted doors open for whoever goes through (and say where a shop's door really is).
  const doorGaps = zone.place(new DoorGaps(buildings.fronts, dayNight, [plan.doors.arcade.at, plan.doors.market.at, ...walkInShops().map((s) => s.door.at)]), origin);
  const season = currentSeason();
  const weekday = () => weekdayOf(today.gameDay);
  // Who walks today: the regulars, the day's strangers, someone with a child or a friend, the dogs; the building's residents at their hours.
  const residents = STAIRWELL_PLAN.residents
    .filter((r) => !movedAway(r.k, r.i))
    .map((r) => residentMember({ key: `${r.k}:${r.i}`, name: residentName(r.k, r.i), seed: r.seed, out: r.out, back: r.back, lines: [...r.hello, ...r.lines.filter((l): l is string => typeof l === 'string')] }));
  const cast = [
    ...castCrowd({ regulars: plan.crowd.seeds, strangers: plan.crowd.strangersByQuality[level], companions: plan.crowd.companionsByQuality[level], dogs: plan.crowd.dogsByQuality[level], day: today.gameDay, season: season.name }),
    ...residents,
  ];
  // Where they stop on the way: shop windows clear of what stands on the pavement, the newsstand, the busker, the column.
  const clear = pavementClutter();
  const stops = [...windowStops(buildings.fronts, clear), ...attractionStops(plan.crowd.attractions)];
  // What the dogs pull towards (the pigeons on the ground, the stray cat), filled afresh each look.
  const bait: THREE.Vector3[] = [];
  const crowd = zone.place(
    new StreetCrowd(dayNight, {
      routes: plan.crowd.routes,
      cast,
      count: plan.crowd.countByQuality[level],
      drawDistance: plan.crowd.drawDistance,
      fade: plan.crowd.fade,
      viewer: listener,
      traffic,
      talk,
      onDoor,
      place: placeWalker,
      doors: doorGaps,
      stops,
      weekday,
      boost: () => (isBrocante(today.gameDay) ? 1.3 : 1),
      crowd: () => walkers,
      dogBait: (): THREE.Vector3[] => {
        bait.length = 0;
        bait.push(...pigeons.onTheGround(), strayCat.position);
        return bait;
      },
      barkAt: (spot) => cues.barkAt(spot),
      residents: plan.crowd.residents,
      day: () => today.gameDay,
    }),
    origin,
  );
  // Smokers outside the bars of an evening, neighbours catching up by day; the morning queue at the bakery.
  zone.place(new Loiterers(dayNight, { spots: plan.loiterers, viewer: listener, place: placeWalker, talk, drawDistance: plan.crowd.drawDistance, fade: plan.crowd.fade, season: season.name }), origin);
  zone.place(new ShopQueue(dayNight, { queues: plan.shopQueues, viewer: listener, place: placeWalker, talk, drawDistance: plan.crowd.drawDistance, fade: plan.crowd.fade, season: season.name, doors: doorGaps, onDoor }), origin);

  yield;
  // --- Vehicles: the bus, the delivery van and the bin lorry, bikes, the crossing's lights (traffic/). ---
  const [line] = plan.traffic.routes;
  const vehicleBase = { traffic, viewer: listener, route: line!, stopFor: plan.traffic.stopFor, collisions: zone.collisions };
  // The bus: boarded at the stop while its doors are open, to the first of `busRide.destinations` open now (the Old
  // Market Hall keeps RETRO GAMES' hours: no fare paid to land in a shut hall and be put out).
  const marketOpen = () => isShopOpen('retro', dayNight.state.hours);
  const ride = {
    fare: plan.busRide.fare,
    destination: () => plan.busRide.destinations.find((d) => d.to !== 'market' || marketOpen()) ?? null,
    closed: () => `the market hall is shut, the first bus there is after ${clockTime(SHOP_HOURS.retro?.open ?? 8)}`,
  };
  const bus = zone.place(new StreetBus(dayNight, { ...vehicleBase, ...plan.bus, ride }), origin);
  const pole = plan.busRide.pole;
  const towards = plan.busRide.destinations.map((d) => d.board).join(', ');
  zone.place(new BusStopPole({ line: plan.bus.line, towards: 'CENTRAL STATION', stops: towards || 'the town', fare: plan.busRide.fare, every: plan.bus.every, nightEvery: plan.bus.nightEvery, dueIn: () => bus.dueIn, dayNight }), at(pole.at), pole.yaw);
  const van = zone.place(new DeliveryVan(dayNight, { ...vehicleBase, ...plan.delivery }), origin);
  placeWalker(van.person, origin);
  const lorry = zone.place(new BinLorry(dayNight, { ...vehicleBase, bins: plan.bins, hours: plan.binLorry.hours, later: plan.binLorry.later }), origin);
  // The parcel van, double-parked a while late morning and late afternoon, its courier running a parcel in.
  const parcels = zone.place(new DeliveryVan(dayNight, { ...vehicleBase, ...plan.parcels, cargo: 'parcel' }), origin);
  placeWalker(parcels.person, origin);
  const bikes = zone.place(new StreetBikes(dayNight, { traffic, viewer: listener, routes: plan.traffic.routes, riders: plan.bikes.ridersByQuality[QUALITY.level], racks: plan.bikes.racks }), origin);
  // Scooters, motorbikes and couriers in the car lanes.
  const { twoWheelers } = plan;
  const motorbikes = zone.place(new Motorbikes(dayNight, { traffic, viewer: listener, routes: plan.traffic.routes, riders: twoWheelers.ridersByQuality[QUALITY.level], gap: twoWheelers.gap, courier: twoWheelers.courier, moto: twoWheelers.moto }), origin);
  zone.place(new SignalHeads(traffic, dayNight, plan.signals.posts), origin);
  zone.place(new Spray(traffic, dayNight), origin);
  // Now and then an ambulance, a police car or (rarely) a fire engine along either route, siren on (heard by the cues below): the drivers pull over.
  const callBase = { traffic, viewer: listener, routes: plan.traffic.routes, stopFor: plan.traffic.stopFor, collisions: zone.collisions };
  const ambulance = zone.place(new Ambulance(dayNight, { ...callBase, ...plan.ambulance }), origin);
  const police = zone.place(new PoliceCar(dayNight, { ...callBase, ...plan.police }), origin);
  const fireEngine = zone.place(new FireEngine(dayNight, { ...callBase, ...plan.fireEngine }), origin);
  const voices = [...cars.voices, bus, van, parcels, lorry, ambulance, police, fireEngine, ...bikes.voices, ...motorbikes.voices];
  // The street's one-off sounds: wings, barks, the crossing's beeper, shutters, the siren.
  const cues = zone.place(new StreetCues({ listener, crossing: traffic, beepers: plan.signals.posts.map((p) => p.at), barkers: crowd.barkers, sirens: [ambulance, police, fireEngine] }), origin);

  yield;
  // --- People and animals: standing people, terraces, pigeons, the stray cat (life/). ---
  const seen = { drawDistance: plan.crowd.drawDistance, fade: plan.crowd.fade };
  const standing = zone.place(new StandingPeople(dayNight, { spots: plan.standing, busStop: plan.bus.stop.at, traffic, viewer: listener, talk, weekday, place: placeWalker, ...seen, busStopOnly: fewer, onDoor }), origin);
  const terraces = zone.place(
    new Terraces(dayNight, { terraces: plan.terraces, viewer: listener, collisions: zone.collisions, toWorld: (p) => zone.toWorld(p), place: placeWalker, talk, weekday, season: season.name, ...seen, maxCustomers: fewer ? 1 : undefined }),
    origin,
  );
  const pigeons = zone.place(new Pigeons(dayNight, { flocks: plan.pigeons, viewer: listener, share: fewer ? 0.5 : 1, walkers, dogs: crowd.dogs, onTakeOff: (spot) => cues.flutter(spot), onCoo: (spot) => cues.coo(spot) }), origin);
  // The strollers turn back at the gardens' hoop fence (`PARK_WALK`), never walking through it.
  if (!fewer) zone.place(new ParkStrollers(dayNight, { viewer: listener, place: placeWalker, count: 2, drawDistance: 70, fade: 10, reach: PARK_WALK.minX + 1.5 }), origin);
  // The benches and the shelter's, to sit on (the bench's reader keeps the bench they are on).
  const benchSpots: BenchSpot[] = [
    ...plan.benches.map((b, i) => ({ at: b.at, yaw: b.yaw, seat: 0.46, length: 1.6, name: 'Bench', taken: i === 0 ? () => standing.benchTaken : undefined })),
    { at: shelterBench(plan.shelter), yaw: plan.shelter.yaw, seat: 0.48, length: plan.shelter.length * 0.6, name: 'Bus shelter bench' },
  ];
  for (const spot of benchSpots) zone.place(new BenchSeat(spot), at(spot.at), spot.yaw);
  const strayCat = zone.place(new StrayCat({ perches: plan.strayCat.perches, viewer: listener, traffic, purse, taken: (on) => (on === 'bench' ? standing.benchTaken : lorry.active) }), origin);

  yield;
  // --- Facades in relief, shop interiors and shutters, glow, puddles, leaves, street details (relief/, ground details). ---
  // Awnings, balconies, sills, door surrounds and our flat's balcony; the shops seen through their windows (not on low);
  // the roller shutters; the light the shops spill on the pavement; the wet ground; autumn's leaves; the small print.
  const fronts = buildings.fronts;
  // Our balcony seen from down here shows what has been bought for it; the awnings wind up at closing. RETRO GAMES' and
  // the arcade's fronts in relief; the pharmacy's cross and the newsagent's diamond on their brackets; the walk-in shops'
  // fronts in 3D (display windows on their risers, the displays, signs, the door's card); the shutters; the shops' glow.
  const { shopfronts } = buildStreetFronts(scenery, fronts, dayNight, { upgrades, onRoll: (spot) => cues.rattle(spot) });
  // The shops seen through their windows; on low the rooms only (no displays, nobody inside).
  const interiors = zone.place(new ShopInteriors(fronts, dayNight, shopGoods, { cheap: QUALITY.level === 'low' }), origin);
  // RETRO GAMES on a new market day, as seen from the flat: the NEW IN banner, the queue; its window restocked each market day.
  const onStock = (colors: readonly string[]): void => {
    buildings.repaintGoods(colors);
    interiors?.repaintGoods(colors);
  };
  const marketBusy = () => ({ crowd: marketDay.theme.crowd ?? 1, grail: marketDay.news().some((n) => n.kind === 'grail' && n.inDays === 0) });
  zone.place(new RetroLure({ ...plan.retroLure, queue: fewer ? plan.retroLure.queue.slice(0, 3) : plan.retroLure.queue, door: plan.doors.market.at, viewer: listener, place: placeWalker, talk, ...seen, onStock, day: marketBusy }), origin);
  // The Grand Flea Fair's day: bunting across the street, a banner and a board at RETRO GAMES, people waiting by its door.
  if (isBrocante(today.gameDay)) zone.place(new FairDay({ viewer: listener, place: placeWalker, talk, ...seen }), origin);
  // What they put out on the pavement while open.
  zone.place(new ShopSpill(dayNight, { spots: plan.shopSpill, board: plan.chalkBoard, collisions: zone.collisions }), origin);
  // The wet road's mirror leaves the people out (a passer-by's draw calls twice over are not worth a puddle).
  zone.place(new WetGround(dayNight, { fronts, lamps: lamps.headPoints, viewer: listener, mirror: QUALITY.reflections, cars: cars.lamps, unmirrored: () => walkers }), origin);
  if (season.name === 'autumn') zone.place(new Leaves(dayNight, plan.trees, season), origin);
  // The bags and bins out for the bin lorry, today's litter, spring's petals on the pavement (clutter/).
  zone.place(new StreetClutter(dayNight, { trees: plan.trees, bins: plan.bins, benches: plan.benches, binHours: plan.binLorry.hours, viewer: listener }), origin);
  zone.place(new StreetDetails(ANISOTROPY, dayNight), origin);
  // A roadworker in the road's gap at each works in his shift: the one way through no barrier closes (the traffic's).
  for (const [i, closure] of closures().entries()) {
    const said = closure.id === 'front' && frontWorksMoved() ? FLAGGER_LINES.moved : FLAGGER_LINES[closure.id];
    const lines = said.map((line) => line || gateLine(plan.parkGate.hours));
    zone.place(new Flagger({ closure, seed: 901 + i, viewer: listener, place: placeWalker, lines, dayNight, hours: plan.flaggerHours, ...seen }), origin);
  }

  yield;
  // --- Sounds of the shops, bells and sirens (audio). ---
  // The arcade's bleeps, the cafés' and bars' chatter (their terraces too), the laundry's hum, shop bells (`ring`).
  const shopSounds = zone.place(new ShopSounds(dayNight, { listener, seated: (i) => terraces.seated(i) }), origin);
  doorBells.push((spot) => shopSounds.ring(spot));
  // The walkers' footsteps and the murmur of people about; the roadworks' hammer, generator and beeper in working hours.
  zone.place(new PeopleSounds(dayNight, { listener, walkers, surfaceAt: streetSurfaceAt }), origin);
  zone.place(new RoadworksSound(dayNight, { listener, weekday: () => weekdayOf(today.gameDay) }), origin);

  yield;
  // --- Shops to go into, things to find, the trader (shops/). ---
  // Every shop door along the walkable pavements (RETRO GAMES and the arcade are travel doors, above).
  if (purse) {
    const scratch = panels.scratch;
    const services: ShopServices = { hours: () => dayNight.state.hours, purse, market, marketDay, isWanted, scratch, streetNews: news };
    for (const door of shopDoors()) {
      // RETRO GAMES, the arcade and the shops one walks into are travel doors (above).
      if (door.shop.kind === 'retro' || door.shop.kind === 'arcade' || SHOP_ZONE_OF[door.shop.kind]) continue;
      // The door's step, half a metre out on the pavement, must be somewhere the player can stand.
      if (!doorOnPavement(door)) continue;
      zone.place(new ShopEntrance(door, services), at(door.at), door.yaw);
    }
    zone.place(new DroppedCoins({ spots: plan.coins.spots, perDay: plan.coins.perDay, host: zone, purse, viewer: listener, today }), origin);
  }
  // A box of cast-offs by a door (some days), the collector outside RETRO GAMES (some days).
  if (isGiveawayDay(plan.giveaway.oneDayIn)) {
    const spot = giveawaySpot(plan.giveaway.spots, today.realDate());
    zone.place(new GiveawayBox({ host: zone, covers, wallet, stock: () => market.peekToday(), owns, isWanted }), at(spot.at), spot.yaw);
  }
  if (isTraderDay(plan.trader.oneDayIn)) {
    const trader = zone.place(new Trader(dayNight, { host: zone, covers, wallet, market, today, owns, isWanted, hours: plan.trader.hours, viewer: listener, collisions: zone.collisions, talk: () => story?.atTrader() ?? null, rival: lots?.rival }), at(plan.trader.at), plan.trader.yaw);
    budget.join(trader.figure);
  }

  yield;
  // Weather, sound, and the edges of the walkable street.
  // The holidays: lights across the street, pumpkins on the doorsteps; the snowman while the snow lies.
  placeDecor(zone, plan.decor);
  // At Christmas the street trees wear bulbs and the park's fir is lit, as seen from the flat.
  if (currentHoliday() === 'christmas') zone.place(new StreetChristmas(dayNight, { trees: STREET_TREES }), origin);
  zone.place(new Snowman({ viewer: listener, collisions: zone.collisions }), at(plan.snowman.at), plan.snowman.yaw);
  // Nothing falls in the sas, under the awnings, the bus shelter's roof or the kiosk's, behind the walk-in shops' glass; petals blow about while the trees flower.
  const roof = shelterRoof(plan.shelter.length);
  const kiosk = NEWSSTAND_ROOF;
  const shelters = [sas, standingBox(plan.shelter.at, plan.shelter.yaw, roof.length, roof.depth, roof.height), standingBox(plan.kiosk.at, plan.kiosk.yaw, kiosk.width, kiosk.depth, kiosk.height), ...awningShelters(fronts), ...shopfronts.colliders];
  zone.place(new Precipitation(dayNight, { shelters, petals: season.name === 'spring' && season.depth < 0.6 }), origin);
  const roles = new Map<CarVoice, VehicleRole>([[bus, 'bus'], [van, 'van'], [parcels, 'van'], [lorry, 'lorry']]);
  zone.place(new StreetSound(dayNight, { listener, cars: voices, roles, traffic, shelters }), origin);
  zone.place(new StreetBounds(FACADES, [...StreetLamps.colliders(plan.lamps), ...StreetTrees.colliders(plan.trees)]), origin);

  // The sun's shadow fades out towards its map's edge on everything the street built, into the rows' far shadow (no hard square 28 m out).
  fadeSunShadowEdges(zone.group, lighting.far);

  // In the sas the feet are on the entrance hall's tiles, as in its twin.
  return { lightLevel: () => lighting.lightLevel(), surfaceAt: (local) => (sas.containsPoint(local) ? 'tiles' : streetSurfaceAt(local)) };
}

/** The street built in one go (`furnishStreetSteps` run through); `sliced`: the steps, for a build spread over idle moments. */
export function furnishStreet(zone: Zone, ctx: BuildContext): ZoneHandle {
  const steps = furnishStreetSteps(zone, ctx);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}
furnishStreet.sliced = furnishStreetSteps;

/** A box standing on the pavement round `at` (zone-local), `length` along its yaw's x, `depth` across, from under the ground up to `height`. */
function standingBox([x, z]: Vec2, yaw: number, length: number, depth: number, height: number): THREE.Box3 {
  const across = Math.abs(Math.sin(yaw)) > 0.5;
  const hx = (across ? depth : length) / 2;
  const hz = (across ? length : depth) / 2;
  return new THREE.Box3(new THREE.Vector3(x - hx, -0.5, z - hz), new THREE.Vector3(x + hx, height, z + hz));
}

/** The middle of the bus shelter's bench (zone-local): along the shelter's back, inside it. */
function shelterBench({ at: [x, z], yaw }: { at: Vec2; yaw: number }): Vec2 {
  const back = -SHELTER.depth / 2 + 0.22;
  return [x + Math.sin(yaw) * back, z + Math.cos(yaw) * back];
}
