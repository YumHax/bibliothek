import * as THREE from 'three';
import { QUALITY } from '@/graphics/quality';
import { getPlatform } from '@/catalog/platforms';
import { STREET_TREES } from '../city/trees';
import type { Zone } from '../zone/Zone';
import type { ArcadeContext, BuildContext, HomeContext, MarketContext, MoneyContext, ZoneHandle } from '../buildContext';
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
import { FarWalkers } from './FarWalkers';
import { castCrowd, residentMember } from './life/crowdCast';
import { attractionStops, windowStops } from './life/crowdTrips';
import { pavementClutter } from './life/pavementClutter';
import { Loiterers } from './life/Loiterers';
import { ShopQueue } from './life/ShopQueue';
import { STAIRWELL_PLAN } from '../stairwell/stairwellPlan'; // imports-ok: the building's residents walk Front Street at their hours: the street reads who they are
import { movedAway, residentName } from '@/building/residentsHome';
import { Precipitation } from './Precipitation';
import { Snowman } from './Snowman';
import { placeDecor } from '../props/decor';
import { currentHoliday, currentSeason, type Season } from '@/time/season';
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
import { SHOP_HOURS, retroShutNotice, shopShutNotice } from './shops/shopHours';
import { inHours } from '@/time/clock';
import { clockShort } from '@/text/clock';
import { SHOP_TALK, shopName } from './shops/shopPlan';
import { DroppedCoins } from './shops/DroppedCoins';
import { streetNews } from './shops/streetNews';
import { GiveawayBox, giveawaySpot, isGiveawayDay } from './shops/GiveawayBox';
import { Trader, isTraderDay } from './shops/Trader';
import { STREET_PLAN, WAYFINDING, type ShopKind, type Vec2 } from './streetPlan';
import { HOUSEHOLD } from '@/household/rules';
import { FACADES, SHOP_ZONE_OF, doorOnPavement, shopDoors, walkInShops, walkedFacades } from '@/world/city/facades';
import { PARK_WALK, WALKABLE } from '@/world/measures/street';
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

/** What Front Street's builder reads of the `BuildContext`: the sky and the camera, the day, the panels its shops open, the stock, the money, the arcade's day, the collection, the story and the people. */
type StreetBuild = Pick<BuildContext, 'sky' | 'listener' | 'covers' | 'today' | 'panels' | 'collection' | 'story' | 'classifieds' | 'social'> & {
  money: Pick<MoneyContext, 'wallet' | 'purse'>;
  market: Pick<MarketContext, 'stock' | 'day' | 'lots'>;
  arcade: Pick<ArcadeContext, 'scores' | 'daily' | 'tournament'>;
  home: Pick<HomeContext, 'upgrades' | 'household'>;
};

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
  return `You want the park? The gate’s back there on this side: open from ${clockShort(open)} to ${clockShort(shut)}.`;
}

/** What one step built that a later one reads; asked before it is built, it is a bug named here, not an undefined. */
function ready<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`[street] ${what} is read before its step built it`);
  return value;
}

/**
 * The street as it goes up: what every step reads (the zone, the context, the plan, the helpers) and what each step
 * leaves for the later ones, in the order the steps run (`furnishStreetSteps`). A later step's part read by an
 * earlier one's closure (the crowd's dogs and the pigeons) goes through `ready`, at call time.
 */
interface StreetSite {
  zone: Zone;
  build: StreetBuild;
  plan: typeof STREET_PLAN;
  dayNight: StreetBuild['sky']['dayNight'];
  anisotropy: number;
  origin: THREE.Vector3;
  at(spot: Vec2): THREE.Vector3;
  season: Season;
  weekday(): ReturnType<typeof weekdayOf>;
  fewer: boolean;
  /** How far a passer-by is drawn and faded, as every life builder takes it. */
  seen: { drawDistance: number; fade: number };
  scenery: AddScenery;
  // Ground and buildings.
  lighting?: StreetLighting;
  buildings?: ReturnType<typeof buildStreetBase>['buildings'];
  shopGoods?: string[] | null;
  // Traffic and fixtures.
  traffic?: StreetTraffic;
  bills?: WhatsOnBills;
  lamps?: ReturnType<typeof buildStreetFixtures>['lamps'];
  cars?: ReturnType<typeof buildStreetFixtures>['cars'];
  // Doors.
  sas?: THREE.Box3;
  news?: () => string[];
  // People.
  talk?: ReturnType<typeof streetTalk>;
  doorBells: ((spot: Vec2) => void)[];
  walkers: Walker[];
  budget?: PeopleBudget;
  doorGaps?: DoorGaps;
  crowd?: StreetCrowd;
  // Vehicles.
  voices: CarVoice[];
  roles: Map<CarVoice, VehicleRole>;
  lorry?: BinLorry;
  cues?: StreetCues;
  // Life.
  standing?: StandingPeople;
  terraces?: Terraces;
  pigeons?: Pigeons;
  strayCat?: StrayCat;
  // Fronts.
  shopfronts?: ReturnType<typeof buildStreetFronts>['shopfronts'];
}

/** Passers-by say what is going on; every walker placed goes on `walkers` too: the pigeons take off for them, passers-by keep right of them. */
function placeWalkerIn(site: StreetSite): (walker: Walker, spot: THREE.Vector3) => void {
  return (walker, spot) => {
    site.walkers.push(walker);
    ready(site.budget, 'the people budget').join(walker);
    site.zone.place(walker, spot);
  };
}

/** A shop door used rings the shop's bell (`ShopSounds.ring`, wired when the sounds are built). */
function onDoorIn(site: StreetSite): (spot: Vec2) => void {
  return (spot) => site.doorBells.forEach((ring) => ring(spot));
}

/** Light, sky, ground and buildings. */
function raiseGroundAndBuildings(site: StreetSite): void {
  const { zone, plan, dayNight, origin, scenery, build: { sky, listener, today, market: { stock: market } } } = site;
  site.lighting = zone.place(
    new StreetLighting(dayNight, listener, (out) => sky.outdoors.lightDirection(dayNight.state, out), { shadowMapSize: Math.min(2048, QUALITY.shadowMapSize * 2) }),
    origin,
  );
  zone.place(new SkyDome(dayNight, listener), origin);
  // Today's stock is drawn as the street is built (the stalls' sizes from the market's plan), not only once the hall is
  // visited: the collector's case, the garage sale, the free box, the barista's tip and the paper have it on the way there.
  fitStockToStalls(market);
  market.warm();
  const stock = market.peekToday();
  site.shopGoods = stock?.map((item) => `#${getPlatform(item.game.platform).accentColor.toString(16).padStart(6, '0')}`) ?? null;
  // The facades are walked past a metre off: on high they are painted a third finer (the shopfronts sharp up close).
  const detailScale = QUALITY.level === 'low' ? 0.6 : QUALITY.level === 'high' ? 1.35 : 1;
  // Our building's lit windows follow its residents (`building/rearWindows`).
  const windowLife = buildingWindowLife({ day: () => today.gameDay, hours: () => dayNight.state.hours });
  // The ground, the park's near stretch over the hedge (its walked gardens), the facades (`streetScenery`, shared with the window views).
  // The rows along the stretch the roadworks opened (`syncWorks` ran first) painted as walked past, not as seen from afar.
  const facades = walkedFacades(FACADES, WALKABLE.maxX);
  site.buildings = buildStreetBase(scenery, { dayNight, facades, detailScale, shopGoods: site.shopGoods, windowLife, walkable: true }).buildings;
  for (const sign of plan.signs) {
    zone.place(new NeonSign({ text: sign.text, color: sign.color, width: sign.width, height: SIGN_HEIGHT, intensity: 0, seed: sign.seed }), new THREE.Vector3(...sign.at), sign.yaw);
  }
}

/**
 * What the road users agree on (the lights at the crossing, the obstacles drivers stop for, the bus at its stop); what's
 * on (the Morris column's bill, repainted as the market day turns); lamps, the trees the window view paints too, cars
 * (parked ones pull out, drivers park now and then, taxis drop off and pick up at their stands), the benches, bins and
 * shelter, the park's railings and gate; finding the way: the fingerpost, the plan on the wall, the clock by RETRO GAMES.
 */
function placeTrafficAndFixtures(site: StreetSite): void {
  const { zone, plan, dayNight, origin, at, anisotropy, scenery, build: { listener, today, arcade: { daily, tournament } } } = site;
  const traffic = (site.traffic = zone.place(new StreetTraffic(dayNight), origin));
  const { column } = plan.details;
  const bills = (site.bills = zone.place(new WhatsOnBills({ day: () => today.gameDay, daily, tournament, radius: column.radius, height: column.height, anisotropy }), at(column.at)));
  const { lamps, cars } = buildStreetFixtures(scenery, {
    dayNight, viewer: listener, traffic, lampLights: plan.lampLights,
    cars: { bays: plan.parked, collisions: zone.collisions, taxiStops: plan.taxi.stops, taxiEvery: plan.taxi.every, speaks: true },
    furniture: { gateHours: plan.parkGate.hours, collisions: zone.collisions, viewer: listener, ad: bills.ad },
    ...(site.buildings ? { washed: [site.buildings] } : {}),
    ...(site.lighting ? { farShadow: site.lighting.far } : {}),
  });
  site.lamps = lamps;
  site.cars = cars;
  if (cars.fare) zone.place(cars.fare, origin);
  const { signpost, planBoard, clock } = WAYFINDING;
  zone.place(new Signpost(signpost.at, signpost.arms, anisotropy), at(signpost.at));
  zone.place(new StreetPlanBoard({ at: planBoard.at, width: planBoard.width, height: planBoard.height, places: signpost.arms, far: frontWorksMoved }, anisotropy), new THREE.Vector3(planBoard.at[0], planBoard.y, planBoard.at[1]), planBoard.yaw);
  const closingSoon = (hours: number): string | null => {
    if (hours >= plan.parkGate.hours[1] - 1 && hours < plan.parkGate.hours[1]) return `The park shuts at ${clockShort(plan.parkGate.hours[1])}.`;
    const shop = SHOP_HOURS.furniture;
    if (shop && hours >= shop.close - 1 && hours < shop.close) return `The shops shut at ${clockShort(shop.close)}.`;
    if (shop && hours < shop.open) return `The shops open at ${clockShort(shop.open)}.`;
    return null;
  };
  zone.place(new StreetClock(dayNight, clock.height, closingSoon), at(clock.at), clock.yaw);
}

/**
 * The doors: RETRO GAMES (and the flea market behind it) keeps shop hours, the arcade never shuts, the walk-in shops
 * (the furniture shop, the TV repair shop, the pet shop, the florist) in theirs; our building's door is real, the sas
 * behind it the entrance hall's twin. The newsstand and its paper (with the small ads, known to the phone at home once
 * read here), and the bells of Park Corner Mansions, where the small ads' sellers live.
 */
function hangDoors(site: StreetSite): void {
  const { zone, plan, dayNight, at, build: { listener, today, panels, collection, classifieds, market: { stock: market, day: marketDay }, arcade: { daily, tournament } } } = site;
  // A shut door a short while before opening time offers to wait on the step (a fade, the clock wound on to it).
  const pastimes = site.build.home.household?.pastimes;
  const waitFor = (kind: ShopKind) => (): (() => void) | null => {
    const open = SHOP_HOURS[kind]?.open;
    if (!pastimes || open === undefined) return null;
    const minutes = Math.ceil((((open - dayNight.state.hours) % 24) + 24) % 24 * 60) + 1;
    if (minutes > HOUSEHOLD.pastimeMaxMinutes) return null;
    return () => void pastimes.run({ minutes, outMs: 700, darkMs: 1400, inMs: 800 }, () => undefined);
  };
  for (const door of [plan.doors.arcade, plan.doors.market]) {
    const guard = door.to === 'market' ? () => retroShutNotice(dayNight.state.hours) : undefined;
    // Open, its caption says till when (shut, the guard's says when it opens).
    const label = door.to === 'market' ? `${door.label} · till ${clockShort(SHOP_HOURS.retro?.close ?? 23)}` : door.label;
    zone.place(new StreetDoor({ width: door.width, height: door.height, to: door.to, label, guard, wait: door.to === 'market' ? waitFor('retro') : undefined }), at(door.at), door.yaw);
  }
  for (const { zone: to, door } of walkInShops()) {
    const { kind } = door.shop;
    const name = shopName(door.shop);
    const guard = () => shopShutNotice(kind, name, SHOP_TALK[kind].closed, dayNight.state.hours);
    zone.place(new StreetDoor({ width: SHOP_DOOR.width, height: SHOP_DOOR.height, to, label: `${name} · go in · till ${clockShort(SHOP_HOURS[kind]?.close ?? 21)}`, guard, wait: waitFor(kind) }), at(door.at), door.yaw);
  }
  const home = plan.doors.home;
  placeAirlock(zone, at(home.at), home.yaw, { twin: 'street', collisions: zone.collisions, viewer: listener });
  site.sas = sasBounds(at(home.at), home.yaw);

  const isWanted = (id: string): boolean => collection.isWanted(id);
  const smallAds = () => {
    const ads = classifieds?.book.inPaper() ?? [];
    classifieds?.book.markSeen(ads);
    return ads;
  };
  // What is on along the street today and tomorrow (the garage sale, the free box, the collector, the arcade, the rain): the paper and the bar pass it on.
  const news = (site.news = (): string[] => streetNews({ weather: () => dayNight.state, gameDay: () => today.gameDay, challenge: daily ? () => daily.challenge() : undefined, tournamentOn: tournament ? () => tournament.isOn : undefined }));
  zone.place(new Newsstand({ panel: panels.news, issue: () => writeWeekly({ stock: market.peekToday(), day: today.gameDay, theme: marketDay.theme, wanted: isWanted, news: marketDay.news(), classifieds: smallAds(), street: news() }) }), at(plan.kiosk.at), plan.kiosk.yaw);
  if (classifieds) zone.place(new MansionBell(classifieds.book), new THREE.Vector3(plan.mansionBell.at[0], plan.mansionBell.y, plan.mansionBell.at[1]), plan.mansionBell.yaw);
}

/**
 * The busker by the bus shelter, the garage sale (some days), and the passers-by: who walks today (the regulars, the
 * day's strangers, someone with a child or a friend, the dogs; the building's residents at their hours), where they stop
 * on the way, the smokers outside the bars of an evening, the morning queue at the bakery. People are the costly meshes:
 * only the nearest few are drawn (`life/PeopleBudget`).
 */
function placePeople(site: StreetSite): void {
  const { zone, plan, dayNight, origin, at, season, weekday, build: { listener, covers, today, social, home: { upgrades }, money: { wallet }, collection, market: { stock: market, day: marketDay }, arcade: { scores } } } = site;
  const owns = (id: string): boolean => collection.owns(id);
  const isWanted = (id: string): boolean => collection.isWanted(id);
  zone.place(new Busker(dayNight, { viewer: listener, hours: plan.busker.hours, tipsPerDay: plan.busker.tipsPerDay, reach: plan.busker.reach, collisions: zone.collisions, social, day: () => today.gameDay, upgrades, wallet }), at(plan.busker.at), plan.busker.yaw);
  if (isGarageSaleDay(plan.garageSale.oneDayIn)) {
    zone.place(
      new GarageSale({ host: zone, covers, wallet, stock: () => market.peekToday(), price: () => market.binPrice, owns, isWanted }),
      at(plan.garageSale.at),
      plan.garageSale.yaw,
    );
  }
  const talk = (site.talk = streetTalk({ sky: () => dayNight.state, market, marketDay, games: collection.games, scores }));
  const onDoor = onDoorIn(site);
  const level = QUALITY.level;
  site.budget = zone.place(new PeopleBudget(listener, plan.crowd.budgetByQuality[level]), origin);
  const placeWalker = placeWalkerIn(site);
  // The painted doors open for whoever goes through (and say where a shop's door really is).
  const buildings = ready(site.buildings, 'the buildings');
  const doorGaps = (site.doorGaps = zone.place(new DoorGaps(buildings.fronts, dayNight, [plan.doors.arcade.at, plan.doors.market.at, ...walkInShops().map((s) => s.door.at)]), origin));
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
  site.crowd = zone.place(
    new StreetCrowd(dayNight, {
      routes: plan.crowd.routes,
      cast,
      count: plan.crowd.countByQuality[level],
      drawDistance: plan.crowd.drawDistance,
      fade: plan.crowd.fade,
      viewer: listener,
      traffic: ready(site.traffic, 'the traffic'),
      talk,
      onDoor,
      place: placeWalker,
      doors: doorGaps,
      stops,
      weekday,
      boost: () => (isBrocante(today.gameDay) ? 1.3 : 1),
      crowd: () => site.walkers,
      dogBait: (): THREE.Vector3[] => {
        bait.length = 0;
        bait.push(...ready(site.pigeons, 'the pigeons').onTheGround(), ready(site.strayCat, 'the stray cat').position);
        return bait;
      },
      barkAt: (spot) => ready(site.cues, 'the cues').barkAt(spot),
      residents: plan.crowd.residents,
      day: () => today.gameDay,
    }),
    origin,
  );
  // Smokers outside the bars of an evening, neighbours catching up by day; the morning queue at the bakery.
  // Further down the street than the 3D people are drawn: flat figures walking the pavements, faded in past them.
  const far = plan.crowd.far;
  if (far.countByQuality[level] > 0) zone.place(new FarWalkers(dayNight, { lanes: far.lanes, count: far.countByQuality[level], viewer: listener, near: plan.crowd.drawDistance - 4, fade: 6 }), origin);
  zone.place(new Loiterers(dayNight, { spots: plan.loiterers, viewer: listener, place: placeWalker, talk, drawDistance: plan.crowd.drawDistance, fade: plan.crowd.fade, season: season.name }), origin);
  zone.place(new ShopQueue(dayNight, { queues: plan.shopQueues, viewer: listener, place: placeWalker, talk, drawDistance: plan.crowd.drawDistance, fade: plan.crowd.fade, season: season.name, doors: doorGaps, onDoor }), origin);
}

/**
 * Vehicles (traffic/): the bus (boarded at the stop while its doors are open, to the first destination on now: Mémé's
 * in her waking hours), the delivery van and the bin lorry, the parcel van double-parked twice a
 * day, bikes, scooters and couriers, the crossing's lights, the spray; now and then an ambulance, a police car or a fire
 * engine, siren on: the drivers pull over. Then the street's one-off sounds: wings, barks, the beeper, shutters, the siren.
 */
function runVehicles(site: StreetSite): void {
  const { zone, plan, dayNight, origin, at, build: { listener } } = site;
  const traffic = ready(site.traffic, 'the traffic');
  const placeWalker = placeWalkerIn(site);
  const [line] = plan.traffic.routes;
  const vehicleBase = { traffic, viewer: listener, route: line!, stopFor: plan.traffic.stopFor, collisions: zone.collisions };
  const { destinations } = plan.busRide;
  const ride = {
    fare: plan.busRide.fare,
    destination: () => destinations.find((d) => !d.hours || inHours(dayNight.state.hours, d.hours)) ?? null,
    closed: () => {
      const first = destinations[0];
      return first?.hours ? `${first.shut ?? 'nobody’s up'}, the first bus there is after ${clockShort(first.hours[0])}` : null;
    },
  };
  const bus = zone.place(new StreetBus(dayNight, { ...vehicleBase, ...plan.bus, ride }), origin);
  const pole = plan.busRide.pole;
  const towards = plan.busRide.destinations.map((d) => d.board).join(', ');
  zone.place(new BusStopPole({ line: plan.bus.line, towards: 'CENTRAL STATION', stops: towards || 'the town', fare: plan.busRide.fare, every: plan.bus.every, nightEvery: plan.bus.nightEvery, dueIn: () => bus.dueIn, dayNight }), at(pole.at), pole.yaw);
  const van = zone.place(new DeliveryVan(dayNight, { ...vehicleBase, ...plan.delivery }), origin);
  placeWalker(van.person, origin);
  const lorry = (site.lorry = zone.place(new BinLorry(dayNight, { ...vehicleBase, bins: plan.bins, hours: plan.binLorry.hours, later: plan.binLorry.later }), origin));
  const parcels = zone.place(new DeliveryVan(dayNight, { ...vehicleBase, ...plan.parcels, cargo: 'parcel' }), origin);
  placeWalker(parcels.person, origin);
  const bikes = zone.place(new StreetBikes(dayNight, { traffic, viewer: listener, routes: plan.traffic.routes, riders: plan.bikes.ridersByQuality[QUALITY.level], racks: plan.bikes.racks }), origin);
  const { twoWheelers } = plan;
  const motorbikes = zone.place(new Motorbikes(dayNight, { traffic, viewer: listener, routes: plan.traffic.routes, riders: twoWheelers.ridersByQuality[QUALITY.level], gap: twoWheelers.gap, courier: twoWheelers.courier, moto: twoWheelers.moto }), origin);
  zone.place(new SignalHeads(traffic, dayNight, plan.signals.posts), origin);
  zone.place(new Spray(traffic, dayNight), origin);
  const callBase = { traffic, viewer: listener, routes: plan.traffic.routes, stopFor: plan.traffic.stopFor, collisions: zone.collisions };
  const ambulance = zone.place(new Ambulance(dayNight, { ...callBase, ...plan.ambulance }), origin);
  const police = zone.place(new PoliceCar(dayNight, { ...callBase, ...plan.police }), origin);
  const fireEngine = zone.place(new FireEngine(dayNight, { ...callBase, ...plan.fireEngine }), origin);
  const cars = ready(site.cars, 'the cars');
  site.voices.push(...cars.voices, bus, van, parcels, lorry, ambulance, police, fireEngine, ...bikes.voices, ...motorbikes.voices);
  site.roles = new Map<CarVoice, VehicleRole>([[bus, 'bus'], [van, 'van'], [parcels, 'van'], [lorry, 'lorry']]);
  site.cues = zone.place(new StreetCues({ listener, crossing: traffic, beepers: plan.signals.posts.map((p) => p.at), barkers: ready(site.crowd, 'the crowd').barkers, sirens: [ambulance, police, fireEngine] }), origin);
}

/** People and animals (life/): standing people, terraces, pigeons, the park's strollers, the benches to sit on, the stray cat. */
function placeLife(site: StreetSite): void {
  const { zone, plan, dayNight, origin, at, season, weekday, fewer, seen, build: { listener, today, money: { purse } } } = site;
  const traffic = ready(site.traffic, 'the traffic');
  const talk = ready(site.talk, 'the talk');
  const crowd = ready(site.crowd, 'the crowd');
  const cues = ready(site.cues, 'the cues');
  const placeWalker = placeWalkerIn(site);
  const onDoor = onDoorIn(site);
  const standing = (site.standing = zone.place(new StandingPeople(dayNight, { spots: plan.standing, busStop: plan.bus.stop.at, traffic, viewer: listener, talk, weekday, place: placeWalker, ...seen, busStopOnly: fewer, onDoor }), origin));
  site.terraces = zone.place(
    new Terraces(dayNight, { terraces: plan.terraces, viewer: listener, collisions: zone.collisions, toWorld: (p) => zone.toWorld(p), place: placeWalker, talk, weekday, season: season.name, ...seen, maxCustomers: fewer ? 1 : undefined }),
    origin,
  );
  site.pigeons = zone.place(new Pigeons(dayNight, { flocks: plan.pigeons, viewer: listener, share: fewer ? 0.5 : 1, walkers: site.walkers, dogs: crowd.dogs, onTakeOff: (spot) => cues.flutter(spot), onCoo: (spot) => cues.coo(spot) }), origin);
  // The strollers turn back at the gardens' hoop fence (`PARK_WALK`), never walking through it.
  if (!fewer) zone.place(new ParkStrollers(dayNight, { viewer: listener, place: placeWalker, count: 2, drawDistance: 70, fade: 10, reach: PARK_WALK.minX + 1.5 }), origin);
  // The benches and the shelter's, to sit on (the bench's reader keeps the bench they are on).
  const benchSpots: BenchSpot[] = [
    ...plan.benches.map((b, i) => ({ at: b.at, yaw: b.yaw, seat: 0.46, length: 1.6, name: 'Bench', taken: i === 0 ? () => standing.benchTaken : undefined })),
    { at: shelterBench(plan.shelter), yaw: plan.shelter.yaw, seat: 0.48, length: plan.shelter.length * 0.6, name: 'Bus shelter bench' },
  ];
  for (const spot of benchSpots) zone.place(new BenchSeat(spot), at(spot.at), spot.yaw);
  const lorry = ready(site.lorry, 'the bin lorry');
  site.strayCat = zone.place(new StrayCat({ perches: plan.strayCat.perches, viewer: listener, traffic, purse, gameDay: () => today.gameDay, taken: (on) => (on === 'bench' ? standing.benchTaken : lorry.active) }), origin);
}

/**
 * Facades in relief, shop interiors and shutters, glow, puddles, leaves, street details (relief/, ground details):
 * awnings, balconies, sills, door surrounds and our flat's balcony (it shows what has been bought for it); the shops seen
 * through their windows (not on low); the roller shutters; the light the shops spill on the pavement; RETRO GAMES on a
 * new market day as seen from the flat; the Fair's day; the wet ground; autumn's leaves; the small print; a roadworker
 * in the road's gap at each works in his shift.
 */
function dressFronts(site: StreetSite): void {
  const { zone, plan, dayNight, origin, season, fewer, seen, anisotropy, scenery, build: { listener, today, home: { upgrades }, market: { day: marketDay } } } = site;
  const buildings = ready(site.buildings, 'the buildings');
  const cues = ready(site.cues, 'the cues');
  const talk = ready(site.talk, 'the talk');
  const placeWalker = placeWalkerIn(site);
  const fronts = buildings.fronts;
  const { shopfronts } = buildStreetFronts(scenery, fronts, dayNight, { upgrades, onRoll: (spot) => cues.rattle(spot) });
  site.shopfronts = shopfronts;
  const interiors = zone.place(new ShopInteriors(fronts, dayNight, site.shopGoods ?? null, { cheap: QUALITY.level === 'low' }), origin);
  const onStock = (colors: readonly string[]): void => {
    buildings.repaintGoods(colors);
    interiors?.repaintGoods(colors);
  };
  const marketBusy = () => ({ crowd: marketDay.theme.crowd ?? 1, grail: marketDay.news().some((n) => n.kind === 'grail' && n.inDays === 0) });
  zone.place(new RetroLure({ ...plan.retroLure, queue: fewer ? plan.retroLure.queue.slice(0, 3) : plan.retroLure.queue, door: plan.doors.market.at, viewer: listener, place: placeWalker, talk, ...seen, onStock, day: marketBusy }), origin);
  if (isBrocante(today.gameDay)) zone.place(new FairDay({ viewer: listener, place: placeWalker, talk, ...seen }), origin);
  zone.place(new ShopSpill(dayNight, { spots: plan.shopSpill, board: plan.chalkBoard, collisions: zone.collisions }), origin);
  // The wet road's mirror leaves the people out (a passer-by's draw calls twice over are not worth a puddle).
  const lamps = ready(site.lamps, 'the lamps');
  const cars = ready(site.cars, 'the cars');
  zone.place(new WetGround(dayNight, { fronts, lamps: lamps.headPoints, viewer: listener, mirror: QUALITY.reflections, cars: cars.lamps, unmirrored: () => site.walkers }), origin);
  if (season.name === 'autumn') zone.place(new Leaves(dayNight, plan.trees, season), origin);
  zone.place(new StreetClutter(dayNight, { trees: plan.trees, bins: plan.bins, benches: plan.benches, binHours: plan.binLorry.hours, viewer: listener }), origin);
  zone.place(new StreetDetails(anisotropy, dayNight), origin);
  for (const [i, closure] of closures().entries()) {
    const said = closure.id === 'front' && frontWorksMoved() ? FLAGGER_LINES.moved : FLAGGER_LINES[closure.id];
    const lines = said.map((line) => line || gateLine(plan.parkGate.hours));
    zone.place(new Flagger({ closure, seed: 901 + i, viewer: listener, place: placeWalker, lines, dayNight, hours: plan.flaggerHours, ...seen }), origin);
  }
}

/** Sounds of the shops, bells and sirens (audio): the arcade's bleeps, the cafés' chatter, shop bells; the walkers' footsteps and murmur; the roadworks in working hours. */
function playSounds(site: StreetSite): void {
  const { zone, dayNight, origin, build: { listener, today } } = site;
  const terraces = ready(site.terraces, 'the terraces');
  const shopSounds = zone.place(new ShopSounds(dayNight, { listener, seated: (i) => terraces.seated(i) }), origin);
  site.doorBells.push((spot) => shopSounds.ring(spot));
  zone.place(new PeopleSounds(dayNight, { listener, walkers: site.walkers, surfaceAt: streetSurfaceAt }), origin);
  zone.place(new RoadworksSound(dayNight, { listener, weekday: () => weekdayOf(today.gameDay) }), origin);
}

/**
 * Shops to go into, things to find, the trader (shops/): every shop door along the walkable pavements (RETRO GAMES and
 * the arcade are travel doors), the coins dropped on the pavement, a box of cast-offs by a door (some days), the
 * collector outside RETRO GAMES (some days).
 */
function openShops(site: StreetSite): void {
  const { zone, plan, dayNight, origin, at, build: { listener, covers, today, panels, social, story, collection, money: { wallet, purse }, market: { stock: market, day: marketDay, lots } } } = site;
  const owns = (id: string): boolean => collection.owns(id);
  const isWanted = (id: string): boolean => collection.isWanted(id);
  if (purse) {
    const services: ShopServices = { hours: () => dayNight.state.hours, purse, market, marketDay, isWanted, scratch: panels.scratch, streetNews: ready(site.news, 'the news'), social, day: () => today.gameDay };
    for (const door of shopDoors()) {
      if (door.shop.kind === 'retro' || door.shop.kind === 'arcade' || SHOP_ZONE_OF[door.shop.kind]) continue;
      // The door's step, half a metre out on the pavement, must be somewhere the player can stand.
      if (!doorOnPavement(door)) continue;
      zone.place(new ShopEntrance(door, services), at(door.at), door.yaw);
    }
    zone.place(new DroppedCoins({ spots: plan.coins.spots, perDay: plan.coins.perDay, host: zone, purse, viewer: listener, today }), origin);
  }
  if (isGiveawayDay(plan.giveaway.oneDayIn)) {
    const spot = giveawaySpot(plan.giveaway.spots, today.realDate());
    zone.place(new GiveawayBox({ host: zone, covers, wallet, stock: () => market.peekToday(), owns, isWanted }), at(spot.at), spot.yaw);
  }
  if (isTraderDay(plan.trader.oneDayIn, today.gameDay)) {
    const trader = zone.place(new Trader(dayNight, { host: zone, covers, wallet, market, today, owns, isWanted, hours: plan.trader.hours, viewer: listener, collisions: zone.collisions, talk: () => story?.atTrader() ?? null, rival: lots?.rival, social }), at(plan.trader.at), plan.trader.yaw);
    ready(site.budget, 'the people budget').join(trader.figure);
  }
}

/**
 * Weather, sound, and the edges of the walkable street: the holidays' decoration, the snowman while the snow lies,
 * what nothing falls in (the sas, the awnings, the shelter's roof, the kiosk's, the walk-in shops' glass), the street's
 * sound, the bounds, and the sun's shadow fading out towards its map's edge. Returns how lit the street is and what
 * is underfoot (in the sas the feet are on the entrance hall's tiles, as in its twin).
 */
function finishWeatherAndEdges(site: StreetSite): ZoneHandle {
  const { zone, plan, dayNight, origin, at, season, build: { listener } } = site;
  placeDecor(zone, plan.decor);
  if (currentHoliday() === 'christmas') zone.place(new StreetChristmas(dayNight, { trees: STREET_TREES }), origin);
  zone.place(new Snowman({ viewer: listener, collisions: zone.collisions }), at(plan.snowman.at), plan.snowman.yaw);
  const roof = shelterRoof(plan.shelter.length);
  const kiosk = NEWSSTAND_ROOF;
  const sas = ready(site.sas, 'the sas');
  const fronts = ready(site.buildings, 'the buildings').fronts;
  const shelters = [sas, standingBox(plan.shelter.at, plan.shelter.yaw, roof.length, roof.depth, roof.height), standingBox(plan.kiosk.at, plan.kiosk.yaw, kiosk.width, kiosk.depth, kiosk.height), ...awningShelters(fronts), ...ready(site.shopfronts, 'the shopfronts').colliders];
  zone.place(new Precipitation(dayNight, { shelters, petals: season.name === 'spring' && season.depth < 0.6 }), origin);
  zone.place(new StreetSound(dayNight, { listener, cars: site.voices, roles: site.roles, traffic: ready(site.traffic, 'the traffic'), shelters }), origin);
  zone.place(new StreetBounds(FACADES, [...StreetLamps.colliders(plan.lamps), ...StreetTrees.colliders(plan.trees)]), origin);
  const lighting = ready(site.lighting, 'the lighting');
  // The sun's shadow fades out towards its map's edge on everything the street built, into the rows' far shadow (no hard square 28 m out).
  fadeSunShadowEdges(zone.group, lighting.far);
  return { lightLevel: () => lighting.lightLevel(), surfaceAt: (local) => (sas.containsPoint(local) ? 'tiles' : streetSurfaceAt(local)) };
}

/**
 * Builds Front Street into its zone from `STREET_PLAN` (see the map in `streetPlan.ts`): no `Room`, an outdoor rig
 * instead, step by step (the functions above, in this order): the light, sky, ground and buildings; the traffic and
 * the fixtures; the doors and the newsstand; the people; the vehicles; the life; the fronts; the sounds; the shops;
 * the weather and the edges. As steps: it yields between its sections, so a build got ready ahead (`World.prepareZone`
 * from the stairs) is spread over idle moments (`Zone.buildSliced`); `furnishStreet` runs them at once.
 */
function* furnishStreetSteps(zone: Zone, build: StreetBuild): Generator<void, ZoneHandle, void> {
  const plan = STREET_PLAN;
  // The roadworks as they stand today (moved on past the first stretch after a while): the walkable street's end follows.
  syncWorks(build.today.gameDay);
  const origin = new THREE.Vector3();
  const season = currentSeason();
  const site: StreetSite = {
    zone,
    build,
    plan,
    dayNight: build.sky.dayNight,
    anisotropy: sceneryAnisotropy(),
    origin,
    at: ([x, z]: Vec2): THREE.Vector3 => new THREE.Vector3(x, 0, z),
    season,
    weekday: () => weekdayOf(build.today.gameDay),
    fewer: QUALITY.level === 'low',
    seen: { drawDistance: plan.crowd.drawDistance, fade: plan.crowd.fade },
    scenery: (item) => zone.place(item, origin),
    doorBells: [],
    walkers: [],
    voices: [],
    roles: new Map(),
  };
  raiseGroundAndBuildings(site);
  yield;
  placeTrafficAndFixtures(site);
  yield;
  hangDoors(site);
  yield;
  placePeople(site);
  yield;
  runVehicles(site);
  yield;
  placeLife(site);
  yield;
  dressFronts(site);
  yield;
  playSounds(site);
  yield;
  openShops(site);
  yield;
  return finishWeatherAndEdges(site);
}

/** The street built in one go (`furnishStreetSteps` run through); `sliced`: the steps, for a build spread over idle moments. */
export function furnishStreet(zone: Zone, build: StreetBuild): ZoneHandle {
  const steps = furnishStreetSteps(zone, build);
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
