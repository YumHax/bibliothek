import * as THREE from 'three';
import type { SessionActions } from '@/game/SessionActions';
import type { ZoneId } from '../zoneIds';
import { formatCoins } from '@/text/money';
import { QUALITY } from '@/graphics/quality';
import { getPlatform } from '@/catalog/platforms';
import { STREET_TREES } from '../city/trees';
import type { Zone } from '../zone/Zone';
import type { ArcadeContext, BuildContext, HomeContext, MarketContext, MoneyContext, ZoneHandle } from '../buildContext';
import { NeonSign } from '../props/NeonSign';
import { StreetLighting } from './StreetLighting';
import { SkyDome } from './SkyDome';
import { SkyBirds } from './SkyBirds';
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
import { ParkLife } from './life/ParkLife';
import { SchoolRun } from './life/SchoolRun';
import { Rendezvous } from './life/Rendezvous';
import { StreetRounds } from './life/StreetRounds';
import { StreetReactions } from './life/StreetReactions';
import { pigeonPerches } from './life/pigeonPerches';
import { randomLook } from '../people/looks';
import { castDress } from '@/world/people/castLook';
import { findPerson } from '@/social/people';
import { STAIRWELL_PLAN } from '../stairwell/stairwellPlan'; // imports-ok: the building's residents walk Front Street at their hours: the street reads who they are
import { movedAway, residentName } from '@/building/residentsHome';
import { Precipitation } from './Precipitation';
import { Snowman } from './Snowman';
import { placeDecor } from '../props/decor';
import { currentHoliday, currentSeason, type Season } from '@/time/season';
import { StreetChristmas } from './StreetChristmas';
import { StreetHolidays } from './StreetHolidays';
import { ChimneySmoke } from './ChimneySmoke';
import { awningShelters } from './relief/FacadeRelief';
import { ShopInteriors } from './relief/ShopInteriors';
import { buildStreetFixtures, paintStreetBase, sceneryAnisotropy, streetBaseSteps, streetFrontsSteps, type AddScenery } from './streetScenery';
import type { Buildings } from './Buildings';
import type { StreetPark } from './StreetPark';
import type { Shopfronts } from './shopfronts/Shopfronts';
import { ShopSpill } from './shopfronts/ShopSpill';
import { WetGround } from './relief/WetGround';
import { Leaves } from './relief/Leaves';
import { StreetClutter } from './clutter/StreetClutter';
import { StreetDetails } from './details/StreetDetails';
import { StreetFixtures } from './details/StreetFixtures';
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
import { ParkSounds } from './audio/ParkSounds';
import { LiveMusic } from './audio/LiveMusic';
import { gigOn } from '@/streetShops/bars';
import { Ambulance } from './traffic/Ambulance';
import { PoliceCar } from './traffic/PoliceCar';
import { FireEngine } from './traffic/FireEngine';
import { TaxiRank } from './traffic/TaxiRank';
import { ParkingWarden } from './traffic/ParkingWarden';
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
import { FACADES, doorOnPavement, shopDoors, walkInShops, walkedFacades } from '@/world/city/facades';
import { PARK_WALK, WALKABLE } from '@/world/measures/street';
import { closures, frontWorksMoved, syncWorks } from './details/roadworks';
import { WorksOpened } from './details/WorksOpened';
import { STREET_PLACES } from './streetPlacesPlan';
import { StepAnswerer } from './life/StepAnswerer';
import { Flagger } from './details/Flagger';
import { BenchSeat, type BenchSpot } from './details/BenchSeats';
import { SwingSeat } from './details/SwingSeat';
import { playTaxiRide } from '@/ui/taxiRide/TaxiRide';
import { kidsOut, playgroundDay } from '@/building/kids/yardKids';
import { benchExtras, parkOverheard, placeStreetEvents } from './events/placeStreetEvents';
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
import { withLeads } from './townsfolk/streetLeads';
import { TownRounds } from './townsfolk/TownRounds';
import { placeSecrets } from './secrets/placeSecrets';
import { POP_UP_FACADE, StreetCounters } from './shops/counters';
import { PopUpBoard } from './shops/PopUpBoard';
import { popUpOpened } from '@/streetShops/popUp';
import { STREET_SHOPS } from '@/streetShops/rules';
import { placeKioskPrize, placeNewsagent } from './shops/Newsagent';
import { rafflePrize } from './events/RaffleDrum';

/** What Front Street's builder reads of the `BuildContext`: the sky and the camera, the day, the panels its shops open, the stock, the money, the arcade's day, the collection, the story and the people. */
type StreetBuild = Pick<BuildContext, 'sky' | 'listener' | 'covers' | 'today' | 'panels' | 'collection' | 'story' | 'classifieds' | 'social' | 'notices'> & {
  money: Pick<MoneyContext, 'wallet' | 'purse'>;
  market: Pick<MarketContext, 'stock' | 'day' | 'lots' | 'fame'>;
  arcade: Pick<ArcadeContext, 'scores' | 'daily' | 'tournament' | 'jackpot'>;
  home: Pick<HomeContext, 'upgrades' | 'household' | 'strayHome'>;
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
  buildings?: Buildings;
  park?: StreetPark;
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
  /** The spray off the wheels: its `splashes` counter (a sheet of water over the kerb), for the sound. */
  splashes?: Spray;
  cues?: StreetCues;
  // Life.
  standing?: StandingPeople;
  terraces?: Terraces;
  pigeons?: Pigeons;
  strayCat?: StrayCat;
  /** People made before the people budget (a door's answerer): placed with it, away till they answer. */
  lateWalkers: { walker: Walker; at: THREE.Vector3 }[];
  // Fronts.
  shopfronts?: Shopfronts;
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
function* raiseGroundAndBuildings(site: StreetSite): Generator<void, void, void> {
  const { zone, plan, dayNight, origin, scenery, build: { sky, listener, today, market: { stock: market } } } = site;
  site.lighting = zone.place(
    new StreetLighting(dayNight, listener, (out) => sky.outdoors.lightDirection(dayNight.state, out), { shadowMapSize: Math.min(2048, QUALITY.shadowMapSize * 2), nearReach: QUALITY.level === 'low' ? 0 : 9 }),
    origin,
  );
  const dome = zone.place(new SkyDome(dayNight, listener), origin);
  // Swifts over the roofs in summer, a murmuration over the park at dusk in autumn and winter.
  zone.place(new SkyBirds(dayNight), origin);
  // Today's stock is drawn as the street is built (the stalls' sizes from the market's plan), not only once the hall is
  // visited: the collector's case, the garage sale, the free box, the barista's tip and the paper have it on the way there.
  fitStockToStalls(market);
  market.warm();
  const stock = market.peekToday();
  site.shopGoods = stock?.map((item) => `#${getPlatform(item.game.platform).accentColor.toString(16).padStart(6, '0')}`) ?? null;
  const detailScale = streetDetailScale();
  // Our building's lit windows follow its residents (`building/rearWindows`).
  const windowLife = buildingWindowLife({ day: () => today.gameDay, hours: () => dayNight.state.hours });
  // The ground, the park's near stretch over the hedge (its walked gardens), the facades (`streetScenery`, shared with the window views).
  const facades = streetFacades();
  const base = yield* streetBaseSteps(scenery, { dayNight, facades, detailScale, shopGoods: site.shopGoods, windowLife, walkable: true });
  site.buildings = base.buildings;
  site.park = base.park;
  // The rows stand in what the street reflects (the glass, the paint, the wet setts), taken again as the player walks on.
  if (QUALITY.level !== 'low') dome.reflectRows(site.buildings, QUALITY.level === 'high' ? 7 : 14);
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
  const { zone, plan, dayNight, origin, at, anisotropy, scenery, build: { listener, today, arcade: { daily, tournament, jackpot } } } = site;
  const traffic = (site.traffic = zone.place(new StreetTraffic(dayNight), origin));
  const { column } = plan.details;
  const bills = (site.bills = zone.place(new WhatsOnBills({ day: () => today.gameDay, daily, tournament, jackpot, radius: column.radius, height: column.height, anisotropy }), at(column.at)));
  const { lamps, cars } = buildStreetFixtures(scenery, {
    dayNight, viewer: listener, traffic, lampLights: plan.lampLights,
    cars: { bays: plan.parked, collisions: zone.collisions, taxiStops: plan.taxi.stops, taxiEvery: plan.taxi.every, speaks: true, weekday: () => site.weekday(), drivers: 2, season: site.season.name },
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
  const { zone, plan, dayNight, at, build: { listener, today, panels, collection, classifieds, market: { stock: market, day: marketDay }, arcade: { daily, tournament, jackpot } } } = site;
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
  const news = (site.news = (): string[] => streetNews({ weather: () => dayNight.state, gameDay: () => today.gameDay, challenge: daily ? () => daily.challenge() : undefined, tournamentOn: tournament ? () => tournament.isOn : undefined, jackpot: () => (jackpot.newsworthy ? jackpot.value : null) }));
  zone.place(new Newsstand({ panel: panels.news, issue: () => writeWeekly({ stock: market.peekToday(), day: today.gameDay, theme: marketDay.theme, wanted: isWanted, news: marketDay.news(), classifieds: smallAds(), street: news() }) }), at(plan.kiosk.at), plan.kiosk.yaw);
  // The Mansions' bells: a seller's visit due (the small ads), else the residents (favours, a find on the step); a
  // favour done, the resident comes down to the street door for it.
  const mansionsDoor = STREET_PLACES.halloween.find((door) => door.id === 'mansions');
  let mansionsAnswerer: StepAnswerer | undefined;
  if (mansionsDoor) {
    const step = at(mansionsDoor.at).add(new THREE.Vector3(Math.sin(mansionsDoor.yaw), 0, Math.cos(mansionsDoor.yaw)).multiplyScalar(0.45));
    mansionsAnswerer = zone.place(new StepAnswerer({ viewer: site.build.listener, seed: 7811, label: 'A resident of the Mansions', step, yaw: mansionsDoor.yaw }), new THREE.Vector3());
    // Their body goes in with the street's people, once the people budget is there (`openShops`).
    site.lateWalkers.push({ walker: mansionsAnswerer.walker, at: step.clone() });
  }
  zone.place(
    new MansionBell({
      book: classifieds?.book,
      host: zone,
      covers: site.build.covers,
      wallet: site.build.money.wallet,
      purse: site.build.money.purse,
      randomGames: (seed, count) => market.randomGames(seed, count),
      owns: (id) => collection.owns(id),
      isWanted: (id) => collection.isWanted(id),
      day: () => today.gameDay,
      ...(mansionsAnswerer ? { answerer: mansionsAnswerer } : {}),
    }),
    new THREE.Vector3(plan.mansionBell.at[0], plan.mansionBell.y, plan.mansionBell.at[1]),
    plan.mansionBell.yaw,
  );
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
  const busker = zone.place(new Busker(dayNight, { viewer: listener, hours: plan.busker.hours, tipsPerDay: plan.busker.tipsPerDay, reach: plan.busker.reach, collisions: zone.collisions, social, day: () => today.gameDay, upgrades, wallet }), at(plan.busker.at), plan.busker.yaw);
  // The loft's own games (never the flea market's stalls) and the neighbour selling them.
  const garage = isGarageSaleDay(plan.garageSale.oneDayIn, today.gameDay)
    ? zone.place(
        new GarageSale({ host: zone, covers, wallet, randomGames: (seed, count) => market.randomGames(seed, count), viewer: listener, price: () => market.binPrice, owns, isWanted }),
        at(plan.garageSale.at),
        plan.garageSale.yaw,
      )
    : null;
  // A passer-by's word, and now and then the day's lead instead (`townsfolk/streetLeads`: the journal writes it down).
  const talk = (site.talk = withLeads(streetTalk({ sky: () => dayNight.state, market, marketDay, games: collection.games, scores, strayTrust: () => site.strayCat?.trust ?? 0, fairDay: () => isBrocante(today.gameDay), day: () => today.gameDay }), () => today.gameDay, owns));
  const onDoor = onDoorIn(site);
  const level = QUALITY.level;
  site.budget = zone.place(new PeopleBudget(listener, plan.crowd.budgetByQuality[level]), origin);
  // Those made before the budget (a door's answerer), away till they come to their door.
  for (const { walker, at: spot } of site.lateWalkers) {
    placeWalkerIn(site)(walker, spot);
    walker.setPresent(false);
  }
  if (garage) site.budget.join(garage.figure);
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
      fairDay: () => isBrocante(today.gameDay),
      buskerResting: () => busker.betweenSongs,
      placeDog: (dog) => zone.place(dog, origin),
      // The residents and the regulars who keep hours are people to talk to (`townsfolk/knownFaces`).
      social,
      owns,
    }),
    origin,
  );
  // Smokers outside the bars of an evening, neighbours catching up by day; the morning queue at the bakery.
  // Further down the street than the 3D people are drawn: flat figures walking the pavements, faded in past them.
  const far = plan.crowd.far;
  if (far.countByQuality[level] > 0) zone.place(new FarWalkers(dayNight, { lanes: far.lanes, count: far.countByQuality[level], viewer: listener, near: plan.crowd.drawDistance - 4, fade: 6 }), origin);
  // Victor's espresso at nine and his walk to the market, Lou's break outside her café (`townsfolk/TownRounds`).
  zone.place(new TownRounds(dayNight, { viewer: listener, day: () => today.gameDay, social, rival: site.build.market.lots?.rival, place: placeWalker }), origin);
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
  const weekdayNow = (): ReturnType<StreetSite['weekday']> => site.weekday();
  const vehicleBase = { traffic, viewer: listener, route: line!, stopFor: plan.traffic.stopFor, collisions: zone.collisions, weekday: weekdayNow };
  const { destinations } = plan.busRide;
  // Line 38's stops on now (Mémé's in her waking hours, REPLAY in its); two on, the driver is told which (`ui/street/ChoicePanel`).
  const stopsOn = () => destinations.filter((d) => !d.hours || inHours(dayNight.state.hours, d.hours));
  const choice = site.build.panels.choice;
  const ride = {
    fare: plan.busRide.fare,
    destination: () => {
      const on = stopsOn();
      if (on.length < 2) return on[0] ?? null;
      return { to: on[0]!.to, label: on.map((d) => d.label).join(' or '), board: on[0]!.board };
    },
    closed: () => {
      const first = destinations[0];
      return first?.hours ? `${first.shut ?? 'nobody’s up'}, the first bus there is after ${clockShort(first.hours[0])}` : null;
    },
    choose: (session: SessionActions, board: (to: ZoneId, label: string) => void): boolean => {
      const on = stopsOn();
      if (on.length < 2 || !choice) return false;
      choice.show({
        title: `Bus ${plan.bus.line}`,
        intro: `${formatCoins(plan.busRide.fare)}, the way back included. Where to?`,
        look: { kind: 'bus', line: plan.bus.line, fare: plan.busRide.fare, from: 'Front Street' },
        who: { name: 'The driver', seed: plan.bus.driverSeed, line: `${formatCoins(plan.busRide.fare)} there and back. Where are we off to?` },
        choices: on.map((d) => ({ id: d.to, label: d.label, ...(d.detail ? { detail: d.detail } : {}) })),
        pick: (id) => {
          const stop = on.find((d) => d.to === id);
          if (stop) board(stop.to, stop.label);
        },
      });
      session.openPanel(choice);
      return true;
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
  const motorbikes = zone.place(new Motorbikes(dayNight, { traffic, viewer: listener, routes: plan.traffic.routes, riders: twoWheelers.ridersByQuality[QUALITY.level], gap: twoWheelers.gap, courier: twoWheelers.courier, moto: twoWheelers.moto, weekday: weekdayNow }), origin);
  zone.place(new SignalHeads(traffic, dayNight, plan.signals.posts), origin);
  const spray = zone.place(new Spray(traffic, dayNight, listener), origin);
  const cars = ready(site.cars, 'the cars');
  // The people who walk to and from the parked cars.
  for (const person of cars.people) placeWalker(person, origin);
  // Now and then a call on this street (crew in at a door), or the police pulling a driver over.
  const callBase = { traffic, viewer: listener, routes: plan.traffic.routes, stopFor: plan.traffic.stopFor, collisions: zone.collisions, calls: plan.emergencyCalls, cars, day: () => site.build.today.gameDay };
  const ambulance = zone.place(new Ambulance(dayNight, { ...callBase, ...plan.ambulance }), origin);
  const police = zone.place(new PoliceCar(dayNight, { ...callBase, ...plan.police }), origin);
  const fireEngine = zone.place(new FireEngine(dayNight, { ...callBase, ...plan.fireEngine }), origin);
  for (const person of [...ambulance.crew, ...police.crew, ...fireEngine.crew]) placeWalker(person, origin);
  // The taxi rank: hail one, get in, off wherever the bus goes (`traffic/TaxiRank`); the warden's round (`traffic/ParkingWarden`).
  const { rank } = plan.taxi;
  // At night, a drive the bus never gives: along the river and back to the rank, the back seat over the dark.
  const pastimes = site.build.home.household?.pastimes;
  const drive = pastimes ? { ...plan.taxi.drive, pastimes, backSeat: (ride: Parameters<typeof playTaxiRide>[1]) => playTaxiRide(document.body, ride) } : undefined;
  zone.place(new TaxiRank({ cars, dayNight, stop: rank.stop, at: rank.at, yaw: rank.yaw, fare: plan.taxi.fare, destinations: () => plan.busRide.destinations, ...(choice ? { choice } : {}), ...(drive ? { drive } : {}) }), origin);
  const warden = zone.place(new ParkingWarden({ cars, dayNight, viewer: listener, weekday: weekdayNow, ...plan.warden }), origin);
  placeWalker(warden.walker, origin);
  site.splashes = spray;
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
  const shelterSeat = { at: shelterBench(plan.shelter), yaw: plan.shelter.yaw };
  const standing = (site.standing = zone.place(new StandingPeople(dayNight, { spots: plan.standing, busStop: plan.bus.stop.at, shelterSeat, traffic, viewer: listener, talk, weekday, place: placeWalker, ...seen, busStopOnly: fewer, onDoor }), origin));
  site.terraces = zone.place(
    new Terraces(dayNight, { terraces: plan.terraces, viewer: listener, collisions: zone.collisions, toWorld: (p) => zone.toWorld(p), place: placeWalker, talk, weekday, season: season.name, ...seen, maxCustomers: fewer ? 1 : undefined }),
    origin,
  );
  // Some of them up on the lamps' arms and the cornices by day; a flock on the stretch the works opened, once they moved on.
  const flocks = frontWorksMoved() ? [...plan.pigeons, plan.pigeonsStretch] : plan.pigeons;
  const pigeons = (site.pigeons = zone.place(
    new Pigeons(dayNight, { flocks, viewer: listener, share: fewer ? 0.5 : 1, walkers: site.walkers, dogs: crowd.dogs, onTakeOff: (spot) => cues.flutter(spot), onCoo: (spot) => cues.coo(spot), perches: pigeonPerches(plan.lamps, plan.lampHeight), crumbs: () => site.terraces?.crumbs() ?? [] }),
    origin,
  ));
  const feed = (spot: Vec2): boolean => pigeons.feedAt(spot);
  // The strollers turn back at the gardens' hoop fence (`PARK_WALK`), never walking through it.
  if (!fewer) zone.place(new ParkStrollers(dayNight, { viewer: listener, place: placeWalker, count: 2, drawDistance: 70, fade: 10, reach: PARK_WALK.minX + 1.5, talk }), origin);
  // In the gardens: children at the playground with a parent, a brisk walker, an old man feeding the pigeons.
  const gate = plan.parkGate.at;
  zone.place(
    new ParkLife(dayNight, {
      viewer: listener,
      place: placeWalker,
      talk,
      gate: [gate[0] - 2.2, gate[1]],
      hours: plan.parkGate.hours,
      walkTo: plan.parkLife.walkTo,
      feeder: plan.parkLife.feeder,
      feed,
      drawDistance: 60,
      fade: 8,
      fewer,
      swings: site.park?.swings ?? [],
      cues,
    }),
    origin,
  );
  // The school run, someone waiting by the clock for a friend, the street's rounds by the clock (shutters, night shift, sweeper, Rémi's crusts).
  zone.place(new SchoolRun(dayNight, { walks: plan.schoolRun, viewer: listener, place: placeWalker, talk, day: () => today.gameDay, ...seen, onDoor }), origin);
  if (!fewer) zone.place(new Rendezvous(dayNight, { spec: plan.rendezvous, viewer: listener, place: placeWalker, talk, ...seen }), origin);
  const remi = findPerson('remi');
  zone.place(
    new StreetRounds(dayNight, {
      spec: plan.rounds,
      viewer: listener,
      place: placeWalker,
      talk,
      feed,
      remi: remi ? { name: remi.short ?? remi.name, lines: [remi.intro, ...(remi.facts ?? []).map((f) => f.says)], look: randomLook(remi.look.seed, remi.look.role, castDress('remi', { season: season.name })) } : undefined,
      onDoor,
      ...seen,
    }),
    origin,
  );
  // Heads turning at a horn, a bark, a siren; a word for a player in the way.
  zone.place(new StreetReactions({ walkers: site.walkers, voices: site.voices, sirens: traffic.sirens, barkers: crowd.barkers, viewer: listener }), origin);
  // The benches and the shelter's, to sit on (the bench's reader keeps the bench they are on).
  const benchSpots: BenchSpot[] = [
    ...plan.benches.map((b, i) => ({ at: b.at, yaw: b.yaw, seat: 0.46, length: 1.6, name: b.park ? 'Park bench' : 'Bench', taken: i === 0 ? () => standing.benchTaken : () => standing.benchTakenAt(b.at), ...(b.park ? { overhear: parkOverheard } : {}) })),
    { at: shelterBench(plan.shelter), yaw: plan.shelter.yaw, seat: 0.48, length: plan.shelter.length * 0.6, name: 'Bus shelter bench' },
  ];
  // A free chair at each terrace while it is laid out: the waiter comes over (`life/Terraces` `playerChair`).
  const terraces = site.terraces;
  if (terraces) {
    plan.terraces.forEach((_, i) => {
      const chair = terraces.playerChair(i);
      if (!chair) return;
      benchSpots.push({
        at: [chair.at.x, chair.at.z],
        yaw: chair.yaw,
        seat: chair.seat,
        length: 0.45,
        name: 'Terrace chair',
        taken: () => terraces.chairTaken(i),
        away: () => !terraces.chairOut(i),
        onSit: () => terraces.sitDown(i, (line) => site.build.notices.say(line, 'The waiter')),
        onStand: () => terraces.standUp(i),
      });
    });
  }
  // Seated, a while waited out and something overheard (`events/placeStreetEvents` `benchExtras`).
  // (The park's bench hears the gardens, not the street.)
  for (const spot of benchSpots) zone.place(new BenchSeat({ ...spot, ...benchExtras(site.build, dayNight, site.news), ...(spot.overhear ? { overhear: spot.overhear } : {}) }), at(spot.at), spot.yaw);
  // The playground's swings, to sit on and swing (`details/SwingSeat`): the view rides the seat.
  // On a Sunday the building's kids sit on them (`events/placeStreetEvents` `YardKids`): a swing a kid is on is taken.
  const kidOn = (swing: { rest: THREE.Vector3 }): (() => boolean) | undefined => {
    const kid = Object.entries(STREET_PLACES.park.kids).find(([, spot]) => spot.seat !== null && Math.hypot(spot.at[0] - swing.rest.x, spot.at[1] - swing.rest.z) < 0.4)?.[0];
    if (!kid) return undefined;
    return () => playgroundDay(today.gameDay) && kidsOut(today.gameDay, dayNight.state.hours, dayNight.state, today.realDate()).some((k) => k.id === kid);
  };
  for (const swing of site.park?.swings ?? []) {
    const taken = kidOn(swing);
    zone.place(new SwingSeat({ swing, viewer: listener, creak: (spot) => cues.swing(spot), ...(taken ? { taken } : {}) }), origin);
  }
  const lorry = ready(site.lorry, 'the bin lorry');
  site.strayCat = zone.place(new StrayCat({ perches: plan.strayCat.perches, viewer: listener, traffic, purse, gameDay: () => today.gameDay, taken: (on) => (on === 'bench' ? standing.benchTaken : lorry.active), home: site.build.home.strayHome, dogs: crowd.dogs }), origin);
}

/**
 * Facades in relief, shop interiors and shutters, glow, puddles, leaves, street details (relief/, ground details):
 * awnings, balconies, sills, door surrounds and our flat's balcony (it shows what has been bought for it); the shops seen
 * through their windows (not on low); the roller shutters; the light the shops spill on the pavement; RETRO GAMES on a
 * new market day as seen from the flat; the Fair's day; the wet ground; autumn's leaves; the small print; a roadworker
 * in the road's gap at each works in his shift.
 */
function* dressFronts(site: StreetSite): Generator<void, void, void> {
  const { zone, plan, dayNight, origin, season, fewer, seen, anisotropy, scenery, build: { listener, today, home: { upgrades }, market: { day: marketDay } } } = site;
  const buildings = ready(site.buildings, 'the buildings');
  const cues = ready(site.cues, 'the cues');
  const talk = ready(site.talk, 'the talk');
  const placeWalker = placeWalkerIn(site);
  const fronts = buildings.fronts;
  const { shopfronts } = yield* streetFrontsSteps(scenery, fronts, dayNight, { upgrades, onRoll: (spot) => cues.rattle(spot) });
  site.shopfronts = shopfronts;
  const interiors = zone.place(new ShopInteriors(fronts, dayNight, site.shopGoods ?? null, { cheap: QUALITY.level === 'low' }), origin);
  yield;
  const onStock = (colors: readonly string[]): void => {
    buildings.repaintGoods(colors);
    interiors?.repaintGoods(colors);
  };
  const marketBusy = () => ({ crowd: marketDay.theme.crowd ?? 1, grail: marketDay.news().some((n) => n.kind === 'grail' && n.inDays === 0) });
  zone.place(new RetroLure({ ...plan.retroLure, queue: fewer ? plan.retroLure.queue.slice(0, 3) : plan.retroLure.queue, door: plan.doors.market.at, viewer: listener, place: placeWalker, talk, ...seen, onStock, day: marketBusy, sky: () => dayNight.state }), origin);
  if (isBrocante(today.gameDay)) zone.place(new FairDay({ viewer: listener, place: placeWalker, talk, ...seen, sky: () => dayNight.state }), origin);
  zone.place(new ShopSpill(dayNight, { spots: plan.shopSpill, board: plan.chalkBoard, collisions: zone.collisions }), origin);
  yield;
  // The wet road's mirror leaves the people out (a passer-by's draw calls twice over are not worth a puddle).
  const lamps = ready(site.lamps, 'the lamps');
  const cars = ready(site.cars, 'the cars');
  zone.place(new WetGround(dayNight, { fronts, lamps: lamps.headPoints, viewer: listener, mirror: QUALITY.reflections, cars: cars.lamps, unmirrored: () => site.walkers }), origin);
  if (season.name === 'autumn') zone.place(new Leaves(dayNight, plan.trees, season), origin);
  zone.place(new StreetClutter(dayNight, { trees: plan.trees, bins: plan.bins, benches: plan.benches, binHours: plan.binLorry.hours, viewer: listener }), origin);
  zone.place(new StreetDetails(anisotropy, dayNight), origin);
  zone.place(new StreetFixtures(), origin);
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
  zone.place(new ParkSounds(dayNight, { listener }), origin);
  // Lou's band at THE ANCHOR on Thursday nights, heard through the bar's door (the regulars clap between songs).
  const anchor = shopDoors().find((door) => door.shop.name === 'THE ANCHOR');
  if (anchor) zone.place(new LiveMusic({ listener, at: anchor.at, throughDoor: true, styles: ['FUNK', 'SYNTHWAVE'], seed: 4417, audience: () => 8, playing: () => (gigOn(today.gameDay, dayNight.state.hours) ? 1 : 0) }), origin);
}

/**
 * Shops to go into, things to find, the trader (shops/): every shop door along the walkable pavements (RETRO GAMES and
 * the arcade are travel doors), the coins dropped on the pavement, a box of cast-offs by a door (some days), the
 * collector outside RETRO GAMES (some days).
 */
function openShops(site: StreetSite): void {
  const { zone, plan, dayNight, origin, at, build: { listener, covers, today, panels, social, story, collection, classifieds, home: { household }, money: { wallet, purse }, market: { stock: market, day: marketDay, lots, fame } } } = site;
  const owns = (id: string): boolean => collection.owns(id);
  const isWanted = (id: string): boolean => collection.isWanted(id);
  if (purse) {
    // What the doors do beyond their plain offers: the bookshops, the basket and the tart, the board, the bars' nights, the pop-up.
    const counters = panels.streetShops
      ? new StreetCounters({
          day: () => today.gameDay,
          hours: () => dayNight.state.hours,
          purse,
          panels: panels.streetShops,
          games: () => collection.games.games,
          owns,
          homeLife: household?.life,
          pastimes: household?.pastimes,
          classifieds: classifieds?.book,
          buyGame: lots ? (game, price, where) => lots.tx.winAuctionLot(game, price, where) : undefined,
          fame,
          cues: site.cues,
        })
      : undefined;
    const services: ShopServices = { hours: () => dayNight.state.hours, purse, market, marketDay, isWanted, scratch: panels.scratch, streetNews: ready(site.news, 'the news'), social, day: () => today.gameDay, counters };
    // The walk-in shops' doors travel (`StreetDoor`); a second shop of a walk-in kind (GREEN FINGERS, past the works) is a plain door.
    const walkIn = new Set(walkInShops().map(({ door }) => door.shop));
    for (const door of shopDoors()) {
      if (door.shop.kind === 'retro' || door.shop.kind === 'arcade' || walkIn.has(door.shop)) continue;
      // The door's step, half a metre out on the pavement, must be somewhere the player can stand.
      if (!doorOnPavement(door)) continue;
      zone.place(new ShopEntrance(door, services), at(door.at), door.yaw);
    }
    zone.place(new DroppedCoins({ spots: plan.coins.spots, perDay: plan.coins.perDay, host: zone, purse, viewer: listener, today }), origin);
  }
  if (isGiveawayDay(plan.giveaway.oneDayIn, today.gameDay)) {
    const spot = giveawaySpot(plan.giveaway.spots, today.gameDay);
    zone.place(new GiveawayBox({ host: zone, covers, wallet, stock: () => market.peekToday(), owns, isWanted }), at(spot.at), spot.yaw);
  }
  if (isTraderDay(plan.trader.oneDayIn, today.gameDay)) {
    const trader = zone.place(new Trader(dayNight, { host: zone, covers, wallet, market, today, owns, isWanted, hours: plan.trader.hours, viewer: listener, collisions: zone.collisions, talk: () => story?.atTrader() ?? null, rival: lots?.rival, social }), at(plan.trader.at), plan.trader.yaw);
    ready(site.budget, 'the people budget').join(trader.figure);
  }
  // CONTINUE?, the pop-up in the empty shop by the butcher, once it has opened: its A-board out by the door.
  const popUp = popUpOpened(today.gameDay) ? shopDoors().find((d) => d.facade.id === POP_UP_FACADE && d.shop.kind === 'shut') : undefined;
  if (popUp && doorOnPavement(popUp)) {
    const { open, close } = STREET_SHOPS.popUp.hours;
    const out = new THREE.Vector3(Math.sin(popUp.yaw), 0, Math.cos(popUp.yaw));
    const along = new THREE.Vector3(out.z, 0, -out.x);
    zone.place(new PopUpBoard(`${clockShort(open)}–${clockShort(close)}`), at(popUp.at).addScaledVector(out, 1).addScaledVector(along, 1.6), popUp.yaw + Math.PI / 2);
  }
  // The newsagent in the kiosk's hatch: today's paper to keep, its cover cards, a subscription to the doormat.
  if (purse && panels.streetShops) {
    const kiosk = { at: at(plan.kiosk.at), yaw: plan.kiosk.yaw };
    const newsagent = placeNewsagent({ viewer: listener, kiosk, place: placeWalkerIn(site), counter: panels.streetShops.counter, day: () => today.gameDay, purse });
    // A raffle prize won at a Fair and left on its stall: the newsagent has it on her ledge.
    placeKioskPrize({ kiosk, day: today.gameDay, prize: (fair) => rafflePrize(market, fair), host: zone, covers, wallet, keeper: newsagent });
  }
  // The first time out after the works have moved on, a word that the far stretch is open.
  zone.place(new WorksOpened({ occupied: () => zone.isOccupied, notices: site.build.notices }), origin);
  // What nobody points out: the dusty TO LET window, the children's chalk, the initials in the railing (`secrets/`).
  placeSecrets({ zone, covers, wallet, purse, randomGames: (seed, count) => market.randomGames(seed, count), owns, isWanted });
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
  const holiday = currentHoliday();
  if (holiday) zone.place(new StreetHolidays(ready(site.buildings, 'the buildings').fronts, holiday, dayNight), origin);
  zone.place(new ChimneySmoke(ready(site.buildings, 'the buildings').chimneyTops, dayNight), origin);
  zone.place(new Snowman({ viewer: listener, collisions: zone.collisions }), at(plan.snowman.at), plan.snowman.yaw);
  const roof = shelterRoof(plan.shelter.length);
  const kiosk = NEWSSTAND_ROOF;
  const sas = ready(site.sas, 'the sas');
  const fronts = ready(site.buildings, 'the buildings').fronts;
  const shelters = [sas, standingBox(plan.shelter.at, plan.shelter.yaw, roof.length, roof.depth, roof.height), standingBox(plan.kiosk.at, plan.kiosk.yaw, kiosk.width, kiosk.depth, kiosk.height), ...awningShelters(fronts), ...ready(site.shopfronts, 'the shopfronts').colliders];
  zone.place(new Precipitation(dayNight, { shelters, petals: season.name === 'spring' && season.depth < 0.6 }), origin);
  zone.place(new StreetSound(dayNight, { listener, cars: site.voices, roles: site.roles, traffic: ready(site.traffic, 'the traffic'), shelters, parked: ready(site.cars, 'the cars') }), origin);
  zone.place(new StreetBounds(FACADES, [...StreetLamps.colliders(plan.lamps), ...StreetTrees.colliders(plan.trees)]), origin);
  const lighting = ready(site.lighting, 'the lighting');
  // The sun's shadow fades out towards its map's edge on everything the street built, into the rows' far shadow (no hard square 28 m out).
  fadeSunShadowEdges(zone.group, lighting.far);
  return { lightLevel: () => lighting.lightLevel(), surfaceAt: (local) => (sas.containsPoint(local) ? 'tiles' : streetSurfaceAt(local)) };
}

/** The facades are walked past a metre off: on high they are painted a third finer (the shopfronts sharp up close). */
function streetDetailScale(): number {
  return QUALITY.level === 'low' ? 0.6 : QUALITY.level === 'high' ? 1.35 : 1;
}

/** Every facade, the rows along the stretch the roadworks opened (`syncWorks` ran first) painted as walked past, not as seen from afar. */
function streetFacades(): ReturnType<typeof walkedFacades> {
  return walkedFacades(FACADES, WALKABLE.maxX);
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
    lateWalkers: [],
    voices: [],
    roles: new Map(),
  };
  // The facades' atlas first, a facade a step: the heaviest painting, never in one idle moment.
  for (const _ of paintStreetBase({ facades: streetFacades(), detailScale: streetDetailScale() })) yield;
  yield* raiseGroundAndBuildings(site);
  yield;
  placeTrafficAndFixtures(site);
  yield;
  hangDoors(site);
  yield;
  placePeople(site);
  yield;
  // The passers-by's bodies made ahead, one a step (a street's worth would hitch the first minutes of the walk).
  yield* ready(site.crowd, 'the crowd').prebuild(Math.ceil(plan.crowd.countByQuality[QUALITY.level] * 1.5));
  runVehicles(site);
  yield;
  placeLife(site);
  yield;
  yield* dressFronts(site);
  yield;
  playSounds(site);
  yield;
  openShops(site);
  yield;
  // The post box and the phone box, the park's gardens, the Fair's stalls, the holidays' (`events/placeStreetEvents`).
  placeStreetEvents(zone, build, { placeWalker: placeWalkerIn(site), news: site.news, cues: site.cues });
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
