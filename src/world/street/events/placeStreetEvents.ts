import * as THREE from 'three';
import type { SessionActions } from '@/game/SessionActions';
import type { Ad } from '@/classifieds/ads';
import type { SellerKind } from '@/classifieds/rules';
import { PLATFORM_LIST } from '@/catalog/platforms';
import { StockItem } from '@/economy/StockItem';
import { isBrocante } from '@/economy/marketEvents';
import { KIDS, type KidId } from '@/building/kids/kidsPlan';
import { kidsOut, playgroundDay } from '@/building/kids/yardKids';
import { WRAPPED_MAX, giftWrap } from '@/holidays/giftWrap';
import { postCards } from '@/post/cards';
import { everyone, shortName } from '@/social/people';
import { isMet, nudge } from '@/social/standing';
import { markStreet, streetMarked } from '@/social/street/streetMarks';
import { isKeepsake } from '@/economy/Transactions';
import { HOUSEHOLD } from '@/household/rules';
import { currentHoliday, seasonOf } from '@/time/season';
import { inHours } from '@/time/clock';
import { weekdayOf } from '@/time/wakefulness';
import { clockShort } from '@/text/clock';
import { formatCoins } from '@/text/money';
import { gameDayRandom } from '@/time/daily';
import { pick, random } from '@/random';
import type { BuildContext, HomeContext, MarketContext, MoneyContext } from '../../buildContext';
import type { Zone } from '../../zone/Zone';
import type { DayNight } from '../../props/DayNight';
import { Walker } from '../../people/Walker';
import { randomLook } from '../../people/looks';
import { placeDecor, type DecorEntry } from '../../props/decor';
import { MarketStall } from '../../market/MarketStall';
import { showOnStall } from '../../build/showOnStall';
import { YardKids, type KidSpot } from '../../courtyard/YardKids';
import { frontWorksMoved } from '../details/roadworks';
import { hoursOn } from '../shops/shopHours';
import type { ShopKind, Vec2 } from '../streetPlan';
import { STREET_PLACES } from '../streetPlacesPlan';
import { PostBox } from '../wayfinding/PostBox';
import { Postie } from '../wayfinding/Postie';
import { PhoneBox } from '../wayfinding/PhoneBox';
import { ParkDucks } from '../park/ParkDucks';
import { PondBank } from '../park/PondBank';
import { ParkConcert } from '../park/ParkConcert';
import { RaffleDrum, rafflePrize } from './RaffleDrum';
import { FairPitch, type Pitch } from './FairPitch';
import { CrepeCart } from './CrepeCart';
import { ChristmasStall } from './ChristmasStall';
import { DoorKnock } from './HalloweenDoors';
import { TrickOrTreaters } from './TrickOrTreaters';
import { StepAnswerer } from '../life/StepAnswerer';
import { BenchSeat, type BenchSpot, type BenchWait } from '../details/BenchSeats';
import { BandstandPlaque } from '../park/BandstandPlaque';
import type { StreetCues } from '../audio/StreetCues';
import { LiveMusic } from '../audio/LiveMusic';

/** What the street's places and events read of the `BuildContext`. */
type StreetEventsBuild = Pick<BuildContext, 'sky' | 'listener' | 'covers' | 'today' | 'panels' | 'collection' | 'classifieds' | 'social' | 'notices' | 'story'> & {
  money: Pick<MoneyContext, 'wallet' | 'purse'>;
  market: Pick<MarketContext, 'stock'>;
  home: Pick<HomeContext, 'household'>;
};

/** What the street's builder hands over: where a person is placed (ticked, in the people budget), the street's news. */
interface StreetEventsSite {
  placeWalker: (walker: Walker, at: THREE.Vector3) => void;
  news?: () => string[];
  /** The street's one-off sounds (`audio/StreetCues`). */
  cues?: Pick<StreetCues, 'quack' | 'plop' | 'letterDrop' | 'coinSlot' | 'cheer' | 'phoneRing'>;
}

const plan = STREET_PLACES;
/** A card from the newsagent's rack, stamped; a call from the phone box. */
const CARD_PRICE = 2;
const CALL_PRICE = 1;
/** The warmth a card brings (once a game week a person). */
const CARD_WARMTH = 5;
/** The Christmas stall: the paper and ribbon for a game, a cone of chestnuts. */
const WRAP_PRICE = 1;
const CHESTNUTS_PRICE = 2;
/** The Christmas stall's keeper: the look their walker wears, and their face on the stall's menu (`ui/street/ChoicePanel`). */
const STALL_KEEPER_SEED = 6203;
/** The phone box's calls that are not wrong numbers: how often each comes when it rings (Félix's old friend calls once). */
const FELIX_CALL = 0.35;
const COLLECTOR_CALL = 0.5;
/** A Fair stallholder's word as a copy goes, and the crêpe man's. */
const FAIR_SOLD = ['That one’s found a good home.', 'Another one gone! I’ll be home by lunch at this rate.', 'Lovely. Mind the corners of the box.', 'Sold! Tell your friends, there’s plenty more.'];
const CREPE_LINES = ['Sugar, lemon, chocolate. Nothing fancier.', 'First one’s always a disaster. That one’s mine.', 'Thirty years at this Fair. Same pan.', 'Chocolate? Good choice. Napkin, you’ll need it.'];
/** The Fair's stalls: how many copies each lays out. */
const FAIR_COPIES = { overflow: 6, roadshow: 6 };

const at = ([x, z]: Vec2, y = 0): THREE.Vector3 => new THREE.Vector3(x, y, z);

/**
 * Front Street's places and events (`STREET_PLACES`, docs/zones.md "The street"): the pillar box and the phone box;
 * in the park's gardens the ducks and the pond's bank, Sunday's concert, the kids at the playground on Sundays; on the
 * Grand Flea Fair's day the stalls on the pavements (the overflow stall and its raffle, a dealer who only comes that
 * day, the crêpe cart); in December the Christmas stall; on Halloween's evenings the doors that answer a knock.
 */
export function placeStreetEvents(zone: Zone, build: StreetEventsBuild, site: StreetEventsSite): void {
  const dayNight = build.sky.dayNight;
  placePostAndPhone(zone, build, site, dayNight);
  placeParkLife(zone, build, site, dayNight);
  if (isBrocante(build.today.gameDay)) {
    // Out in their hours only: set up at the morning's opening, packed away at the evening's closing (`FairPitch`).
    zone.place(new FairPitch({ zone, hours: () => dayNight.state.hours % 24, open: plan.fair.hours, setUp: (pitch) => placeFairStalls(pitch, build, site, dayNight) }), new THREE.Vector3());
  }
  const holiday = currentHoliday();
  if (holiday === 'christmas') placeChristmasStall(zone, build, site, dayNight);
  if (holiday === 'halloween') placeHalloweenDoors(zone, build, site, dayNight);
}

/** The pillar box (a card to someone the player knows) and the phone box (the phone's book, for a coin). */
function placePostAndPhone(zone: Zone, build: StreetEventsBuild, site: StreetEventsSite, dayNight: DayNight): void {
  const { today, panels, home } = build;
  const post = (session: SessionActions): void => {
    const day = today.gameDay;
    const people = everyone().filter((p) => p.group === 'friends' && isMet(p.id));
    if (!people.length) {
      session.react('A card needs somebody to be glad of it. Nobody you know lives far enough away yet.');
      return;
    }
    const send = (id: string): void => {
      session.pay({
        price: CARD_PRICE,
        title: 'A postcard, posted',
        paid: () => {
          postCards.post(id, day);
          site.cues?.letterDrop(plan.postBox.at);
          nudge(id, { warmth: CARD_WARMTH, day, reason: 'postcard', why: 'loved your card', memory: 'you sent me a card' });
          return `A card from the newsagent’s rack, a stamp, a few lines. In it goes: ${shortName(id)} will have it in a day or two.`;
        },
      });
    };
    const choice = panels.choice;
    if (!choice) {
      const first = people.find((p) => !postCards.sentThisWeek(p.id, day));
      if (first) send(first.id);
      else session.react('You have written to everyone this week.');
      return;
    }
    choice.show({
      title: 'A card in the post',
      intro: `A card off the newsagent’s rack and a stamp, ${formatCoins(CARD_PRICE)}. Who is it for?`,
      look: { kind: 'post', price: CARD_PRICE },
      choices: people.map((p) => ({ id: p.id, person: p.id, label: shortName(p.id), detail: p.whereabouts, ...(postCards.sentThisWeek(p.id, day) ? { unavailable: 'Sent a card this week' } : {}) })),
      pick: send,
    });
    session.openPanel(choice);
  };
  const { postBox, phoneBox } = plan;
  zone.place(new PostBox(post), at(postBox.at), postBox.yaw);
  // The postie at the last collection, emptying it.
  const postie = zone.place(new Postie({ dayNight, viewer: build.listener, weekday: () => weekdayOf(today.gameDay), box: { at: at(postBox.at), yaw: postBox.yaw }, postedToday: () => postCards.postedOn(today.gameDay) }), new THREE.Vector3());
  site.placeWalker(postie.walker, at(postBox.at));
  postie.walker.setPresent(false);
  const call = (session: SessionActions): void => {
    const phone = home.household?.phone;
    if (!phone) {
      session.react('You lift the receiver. No tone: the line is dead.');
      return;
    }
    session.pay({
      price: CALL_PRICE,
      title: 'A call from the box',
      paid: () => {
        site.cues?.coinSlot(plan.phoneBox.at);
        session.openPanel(phone);
        return 'The coin drops. A dialling tone.';
      },
    });
  };
  const rings = STREET_PLACES.phoneRings;
  const ringing = {
    every: rings.every,
    for: rings.for,
    bell: rings.bell,
    ring: () => site.cues?.phoneRing(phoneBox.at),
    answer: (session: SessionActions) => {
      // Not every call is a wrong number: an old friend of Félix's asking after him (once), the collector's swap.
      if (!streetMarked('phoneFelix') && random() < FELIX_CALL) {
        markStreet('phoneFelix');
        session.say(rings.felix, 'On the line');
        return;
      }
      if (build.story?.stage === 'arcade' && random() < COLLECTOR_CALL) {
        session.say(rings.collector, 'On the line');
        return;
      }
      session.say(pick(random, rings.wrongNumbers), 'On the line');
    },
  };
  zone.place(new PhoneBox(dayNight, { price: CALL_PRICE, call, ringing }), at(phoneBox.at), phoneBox.yaw);
}

/** The park's gardens: the ducks and the bank, the concert on Sundays, the kids at the playground on Sundays. */
function placeParkLife(zone: Zone, build: StreetEventsBuild, site: StreetEventsSite, dayNight: DayNight): void {
  const { listener, today, money, social, home, market, panels, notices } = build;
  const { bank, ducks, concert, kids, bandstand } = plan.park;
  const flock = zone.place(new ParkDucks({ count: ducks.count, water: ducks.water, fedAt: ducks.fedAt, ...(site.cues ? { quack: (spot: Vec2) => site.cues?.quack(spot) } : {}) }), new THREE.Vector3());
  // The bank's click box lies along the fence (z): turned so its length runs along z, out over the water (-x).
  zone.place(new PondBank({ length: bank.length, ducks: flock, day: () => today.gameDay, wallet: money.wallet, plop: () => site.cues?.plop(ducks.fedAt) }), at(bank.at), -Math.PI / 2);
  const stage = zone.place(
    new ParkConcert(dayNight, { viewer: listener, band: concert.band, chairs: concert.chairs, place: site.placeWalker, day: () => today.gameDay, ...(social ? { social } : {}), ...(home.household?.pastimes ? { pastimes: home.household.pastimes } : {}) }),
    at(concert.stage.at),
    concert.stage.yaw,
  );
  stage.placePeople();
  // The band in the open: the street's live music while it plays, the chairs clapping between songs.
  zone.place(new LiveMusic({ listener, at: concert.stage.at, playing: () => (stage.playing ? 1 : 0), styles: ['FUNK', 'SYNTHWAVE'], audience: () => (stage.playing ? concert.chairs.length : 0), seed: 1977, halfAt: 16 }), new THREE.Vector3());
  // The bandstand at the end of its lane: its steps to sit on (the lawn's talk overheard), its plaque to read.
  const { steps } = bandstand;
  const heard = { at: 0 };
  const overhear = (): string => (stage.playing ? BANDSTAND_CONCERT : BANDSTAND_OVERHEARD[heard.at++ % BANDSTAND_OVERHEARD.length]!);
  zone.place(
    new BenchSeat({ at: steps.at, yaw: steps.yaw, seat: bandstand.seat, length: 1.2, name: 'Bandstand steps', ...benchExtras(build, dayNight, site.news), overhear, tell: (line) => notices.say(line, 'Someone on the lawn') }),
    at(steps.at),
    steps.yaw,
  );
  zone.place(new BandstandPlaque(), at(bandstand.plaque.at), bandstand.plaque.yaw);
  // The building's kids: at the playground on Sundays (in the courtyard the other days, `courtyard/placeKids`).
  const spots = Object.fromEntries(
    KIDS.map((kid) => {
      const spot = kids[kid.id];
      const placed: KidSpot = { at: at(spot.at, -0.02), yaw: spot.yaw, seat: spot.seat, ...('lean' in spot ? { lean: spot.lean } : {}) };
      return [kid.id, placed];
    }),
  ) as Record<KidId, KidSpot>;
  zone.place(
    new YardKids({
      host: zone,
      viewer: listener,
      spots,
      out: () => (playgroundDay(today.gameDay) ? kidsOut(today.gameDay, dayNight.state.hours, dayNight.state, today.realDate()) : []),
      day: () => today.gameDay,
      date: () => today.realDate(),
      season: () => seasonOf(today.realDate()).name,
      carts: (seed, count, platforms) => market.stock.randomGames(seed, count, platforms),
      ...(panels.kids ? { panels: panels.kids } : {}),
      notices,
      ...(social ? { social } : {}),
    }),
    new THREE.Vector3(),
  );
}

/** A dealer's lot drawn as a small ad's is (`classifieds/sellerLot`, priced and kept for the session): for a stall that is not the market's. */
function dealerLot(build: StreetEventsBuild, id: string, kind: SellerKind, seed: number, platformPick: number): Promise<StockItem[]> {
  const classifieds = build.classifieds;
  if (!classifieds) return Promise.resolve([]);
  const platform = PLATFORM_LIST[Math.floor(platformPick * PLATFORM_LIST.length)]!.id;
  const day = build.today.gameDay;
  const ad: Ad = { id, day, until: day, kind, name: 'the Fair', flat: '', platform, text: '', hours: [0, 24], seed };
  return classifieds.lot(ad).then((lot) => lot.items.filter((item) => !build.collection.owns(item.game.id)));
}

/** A stallholder behind a stall (stall-local `vendorAt`), facing the pavement. */
function keeperFor(zone: Pitch, site: StreetEventsSite, build: StreetEventsBuild, stall: THREE.Object3D, vendorAt: readonly [number, number], seed: number, label: string, lines: readonly string[]): Walker {
  let line = 0;
  const season = seasonOf(build.today.realDate()).name;
  const keeper = new Walker({ viewer: build.listener, seed, look: randomLook(seed, 'vendor', { season }), label, talk: () => lines[line++ % lines.length]!, labelWithin: 5 });
  stall.updateMatrixWorld(true);
  site.placeWalker(keeper, zone.toLocal(stall.localToWorld(new THREE.Vector3(vendorAt[0], 0, vendorAt[1]))));
  keeper.stand(stall.rotation.y, 'crossed', 'viewer');
  zone.keep(keeper);
  return keeper;
}

/**
 * The Grand Flea Fair's day on the pavements: the overflow stall by the butcher's (a house clearance's games at clearance
 * prices, the raffle's drum at its end), a dealer from out of town who comes only on the Fair's day (boxed copies of one
 * platform), the crêpe cart by RETRO GAMES.
 */
function placeFairStalls(zone: Pitch, build: StreetEventsBuild, site: StreetEventsSite, dayNight: DayNight): void {
  const { today, covers, money, collection, market } = build;
  const day = today.gameDay;
  const draw = gameDayRandom('fair-stalls', day);
  const boxOptions = (where: string, speak: (line: string) => void) => (item: StockItem) => ({ wallet: money.wallet, where, isWanted: () => collection.isWanted(item.game.id), thanks: () => '“Lovely. Enjoy it.”', speak });

  const overflow = plan.fair.overflow;
  // The overflow stall: what did not fit in the hall, at clearance prices; the raffle at its end.
  const overflowStall = zone.place(new MarketStall({ sign: 'FAIR OVERFLOW', cloth: 0x8a2a2a, accent: 0xf0c94a, width: 1.8, seed: 31 }), at(overflow.at), overflow.yaw);
  const overflowKeeper = keeperFor(zone, site, build, overflowStall, overflowStall.vendorAt, 3101, 'Fair overflow', ['The hall’s full to bursting, so here’s the rest.', 'Raffle tickets! The drum turns at six.', 'Clearance prices, no haggling, it’s all got to go.']);
  void dealerLot(build, `fair:${day}:overflow`, 'clearOut', 9000 + day, draw()).then((items) => {
    showOnStall(overflowStall, items.slice(0, FAIR_COPIES.overflow), { host: zone, covers, boxOptions: boxOptions('the Fair’s overflow stall', (line) => overflowKeeper.speak(line)), sold: () => overflowKeeper.speak(pick(random, FAIR_SOLD)) });
  });
  overflowStall.updateMatrixWorld(true);
  const drumAt = zone.toLocal(overflowStall.localToWorld(overflowStall.crateTop(0.62)));
  const prizeAt = zone.toLocal(overflowStall.localToWorld(new THREE.Vector3(-0.55, overflowStall.topHeight + 0.016, 0.12)));
  zone.place(
    new RaffleDrum({
      day: () => today.gameDay,
      hours: () => dayNight.state.hours % 24,
      keeper: overflowKeeper,
      viewer: build.listener,
      prize: () => rafflePrize(market.stock, day),
      prizeAt,
      prizeYaw: overflow.yaw + 0.2,
      host: zone,
      covers,
      wallet: money.wallet,
      cheer: () => site.cues?.cheer(overflow.at),
    }),
    drumAt,
    overflow.yaw,
  );

  // The dealer from out of town: boxed copies, one platform a Fair.
  const roadshowSpot = plan.fair.imports;
  const roadshow = zone.place(new MarketStall({ sign: 'ROADSHOW RETRO', cloth: 0x2a3a6a, accent: 0x5fe6ff, width: 1.8, seed: 47 }), at(roadshowSpot.at), roadshowSpot.yaw);
  const dealer = keeperFor(zone, site, build, roadshow, roadshow.vendorAt, 4703, 'Roadshow Retro', ['Only here on Fair days. Drove up at five this morning.', 'Everything boxed. Complete, most of it. Look at the manuals.', 'Next Fair I’m bringing another console’s worth.']);
  void dealerLot(build, `fair:${day}:roadshow`, 'collector', 9100 + day, draw()).then((items) => {
    showOnStall(roadshow, items.slice(0, FAIR_COPIES.roadshow), { host: zone, covers, boxOptions: boxOptions('Roadshow Retro, at the Fair', (line) => dealer.speak(line)), sold: () => dealer.speak(pick(random, FAIR_SOLD)) });
  });

  // The crêpe cart by RETRO GAMES.
  const crepes = plan.fair.crepes;
  const season = seasonOf(today.realDate()).name;
  let crepeLine = 0;
  const cook = new Walker({ viewer: build.listener, seed: 5101, look: randomLook(5101, 'vendor', { season }), label: 'The crêpe man', talk: () => CREPE_LINES[crepeLine++ % CREPE_LINES.length]!, labelWithin: 5 });
  const cart = zone.place(new CrepeCart(cook), at(crepes.at), crepes.yaw);
  cart.updateMatrixWorld(true);
  site.placeWalker(cook, zone.toLocal(cart.localToWorld(new THREE.Vector3(0.3, 0, -0.75))));
  cook.stand(crepes.yaw, 'stand', 'viewer');
  zone.keep(cook);
}

/** December's stall: gift wrapping (a game of the collection into paper for someone), hot chestnuts. */
function placeChristmasStall(zone: Zone, build: StreetEventsBuild, site: StreetEventsSite, dayNight: DayNight): void {
  const { today, listener, collection, money, panels } = build;
  const spot = plan.christmas;
  const season = seasonOf(today.realDate()).name;
  const keeper = new Walker({ viewer: listener, seed: STALL_KEEPER_SEED, look: randomLook(STALL_KEEPER_SEED, 'vendor', { season }), label: 'The Christmas stall', talk: () => 'Wrapped while you wait. Ribbon’s free.', labelWithin: 5 });
  const wrapGames = () => collection.games.games.filter((g) => (g.status ?? 'owned') === 'owned' && !isKeepsake(g));
  const serve = (session: SessionActions): void => {
    const chestnuts = (): void =>
      session.pay({
        price: CHESTNUTS_PRICE,
        title: 'Hot chestnuts',
        paid: () => {
          keeper.speak('Mind your fingers.');
          return 'A paper cone of hot chestnuts. You burn your fingers on the first one, as always.';
        },
      });
    const wrap = (): void => {
      const panel = panels.wrap;
      const purse = money.purse;
      if (!panel || !purse) {
        session.react('“Bring me something to wrap, love.”');
        return;
      }
      panel.show({
        games: wrapGames,
        isWrapped: (id) => giftWrap.isWrapped(id),
        price: WRAP_PRICE,
        keeper: { name: 'The stallholder', seed: STALL_KEEPER_SEED },
        wrap: (game) => {
          if (giftWrap.isWrapped(game.id)) return `${game.title} is wrapped already.`;
          if (giftWrap.count >= WRAPPED_MAX) return '“That’s all the paper I can spare you. Give some away first!”';
          if (!purse.spend(WRAP_PRICE)) return `The paper is ${formatCoins(WRAP_PRICE)} and you have ${formatCoins(purse.coins)}.`;
          giftWrap.wrap(game.id);
          keeper.speak('There. Bow on top. Whoever gets that is lucky.');
          return null;
        },
      });
      session.openPanel(panel);
    };
    const choice = panels.choice;
    if (!choice) {
      wrap();
      return;
    }
    choice.show({
      title: 'The Christmas stall',
      intro: 'Merry Christmas',
      look: { kind: 'stall' },
      who: { name: 'The stallholder', seed: STALL_KEEPER_SEED, line: 'What’ll it be, love? Ribbon’s free.' },
      choices: [
        { id: 'wrap', label: 'Gift wrapping', price: WRAP_PRICE, picture: 'gift', detail: 'One of your games in paper and ribbon, to give' },
        { id: 'chestnuts', label: 'Hot chestnuts', price: CHESTNUTS_PRICE, picture: 'cone', detail: 'A paper cone, straight off the brazier' },
      ],
      pick: (id) => (id === 'wrap' ? wrap() : chestnuts()),
    });
    session.openPanel(choice);
  };
  const stall = zone.place(new ChristmasStall({ hours: () => dayNight.state.hours % 24, open: spot.hours, keeper, serve }), at(spot.at), spot.yaw);
  stall.updateMatrixWorld(true);
  site.placeWalker(keeper, zone.toLocal(stall.localToWorld(ChristmasStall.keeperAt)));
  keeper.stand(spot.yaw, 'stand', 'viewer');
}

/** Halloween's evenings: the residents' doors with a pumpkin on the step answer a knock. */
function placeHalloweenDoors(zone: Zone, build: StreetEventsBuild, site: StreetEventsSite, dayNight: DayNight): void {
  const { today, covers, money, market, collection } = build;
  const year = today.realDate().getFullYear();
  // Only the doors on stretches that can be walked today (the far ones once the works have moved on).
  const doors = plan.halloween.filter((door) => !door.opened || frontWorksMoved());
  // One door of the year hands out an old game from a loft.
  const gameDoor = doors[Math.floor(gameDayRandom('halloween-door', year)() * doors.length)]?.id;
  const pumpkins: DecorEntry[] = [];
  for (const [i, door] of doors.entries()) {
    // Whoever lives there comes to the door: out on the step, a word and a wave.
    const out = new THREE.Vector3(Math.sin(door.yaw), 0, Math.cos(door.yaw));
    const step = at(door.at).addScaledVector(out, 0.45);
    const answerer = zone.place(new StepAnswerer({ viewer: build.listener, seed: 7700 + i * 13, label: door.who, step, yaw: door.yaw }), new THREE.Vector3());
    site.placeWalker(answerer.walker, step.clone());
    answerer.walker.setPresent(false);
    const knock = zone.place(
      new DoorKnock({
        door,
        hours: () => dayNight.state.hours % 24,
        year: () => year,
        ...(money.purse ? { purse: money.purse } : {}),
        givesGame: door.id === gameDoor,
        game: () => market.stock.randomGames(`halloween:${year}`, 3).then((games) => {
          const game = games.find((g) => !collection.owns(g.id));
          return game ? new StockItem(game, 'worn', 'bin', { list: 0, final: true }) : null;
        }),
        host: zone,
        covers,
        wallet: money.wallet,
        answerer,
      }),
      at(door.at),
      door.yaw,
    );
    knock.relay();
    // A pumpkin beside the step, out of the door's way.
    const side = new THREE.Vector3(0.75, 0, 0.35).applyAxisAngle(new THREE.Vector3(0, 1, 0), door.yaw);
    pumpkins.push({ kind: 'pumpkin', at: { floor: [door.at[0] + side.x, door.at[1] + side.z], rotationY: door.yaw + 0.3 }, options: { radius: 0.13 + (i % 3) * 0.02, seed: 70 + i }, holiday: 'halloween' });
  }
  placeDecor(zone, pumpkins);
  // Children in costume going round them of an evening.
  zone.place(new TrickOrTreaters(dayNight, { doors, viewer: build.listener, place: site.placeWalker, hours: () => dayNight.state.hours % 24, drawDistance: 40, fade: 6 }), new THREE.Vector3());
}

/** Every shop's opening a bench waits for, by name. */
const OPENINGS: readonly [ShopKind, string][] = [
  ['bakery', 'the bakery opens'],
  ['cafe', 'the café opens'],
  ['tabac', 'the newsagent’s opens'],
  ['retro', 'RETRO GAMES opens'],
  ['furniture', 'the shops open'],
];
/** A while on a bench with nothing to wait for (game minutes). */
const A_WHILE = 30;
const OVERHEARD = [
  '…and he paid what for it? For a cartridge?',
  'My lad still has his old console in the loft, you know.',
  'They say the arcade’s getting a new cabinet.',
  'Twenty years that shop’s been there. Twenty years.',
  '…so I said to her, if it’s got batteries, it’s not a present, it’s a chore.',
  'The bus was late again. Third time this week. I’m writing a letter.',
  'Have you tried the new croissants? Too much butter. I had three.',
  'My granddaughter beat me at the snake game. Eight years old. I let her. I didn’t let her.',
];
/** What is overheard on the park's bench: the gardens' own talk. */
const PARK_OVERHEARD = [
  'Don’t feed the ducks bread, it’s bad for them. …Fine, one crust.',
  'That bandstand had a brass band every Sunday when I was a girl.',
  'He proposed on this bench. Then he dropped the ring in the pond. We fished it out with a coat hanger.',
  'The swings squeak worse every year. I like it. It sounds like summer.',
  'Look, the heron’s back. It stands there like it’s waiting for a bus.',
  'Shh. Just listen. You can’t hear the street from here.',
];
const parkSaid = { at: 0 };
/** What is overheard on the bandstand's steps: the lawn's talk round it, and while the band plays by the gate, the band. */
const BANDSTAND_OVERHEARD = [
  'They roped the boards off after the storm. Thirty years I played up there.',
  'Lean on that railing and it’ll lean back. Don’t.',
  'My dad proposed under this roof. It rained the whole time. They said it was perfect.',
  'You can see the whole pond from the top step. The heron, the fountain, all of it.',
];
const BANDSTAND_CONCERT = 'From here the band by the gate is just brass on the wind, and the odd cheer.';

/** Something overheard on the park's bench, one after another. */
export function parkOverheard(): string {
  return PARK_OVERHEARD[parkSaid.at++ % PARK_OVERHEARD.length]!;
}

/**
 * What a bench of Front Street adds to sitting (`details/BenchSeats`): a while waited out in a fade (until the next of
 * the street's shops opens within the household's limit, else half an hour), and after a little while something
 * overheard from a passer-by (the street's news, else a bit of chatter), as a voice beside the bench.
 */
export function benchExtras(build: Pick<BuildContext, 'listener' | 'notices'> & { home: Pick<HomeContext, 'household'> }, dayNight: DayNight, news?: () => string[]): Pick<BenchSpot, 'wait' | 'pastimes' | 'overhear' | 'tell' | 'viewer'> {
  const pastimes = build.home.household?.pastimes;
  const wait = (): BenchWait => {
    const hours = dayNight.state.hours % 24;
    let best: BenchWait | null = null;
    for (const [kind, what] of OPENINGS) {
      // Today's hours (the week's rhythm: a short Sunday, the butcher's Monday off), not the plain ones.
      const today = hoursOn(kind);
      const open = today?.open;
      if (!today || open === undefined || inHours(hours, { from: open, to: today.close })) continue;
      const minutes = Math.ceil(((((open - hours) % 24) + 24) % 24) * 60) + 1;
      if (minutes <= HOUSEHOLD.pastimeMaxMinutes && (!best || minutes < best.minutes)) best = { minutes, until: `until ${what}`, after: `It is ${clockShort(open)}: ${what.replace(' opens', '’s door opens').replace(' open', ' open their doors')}.` };
    }
    return best ?? { minutes: A_WHILE, until: 'a while', after: 'Half an hour of the street going by.' };
  };
  const overhear = (): string => {
    const heard = news?.() ?? [];
    return heard.length && random() < 0.6 ? pick(random, heard) : pick(random, OVERHEARD);
  };
  return {
    wait,
    ...(pastimes ? { pastimes } : {}),
    overhear,
    tell: (line) => build.notices.say(line, 'Someone on the next bench'),
    viewer: build.listener,
  };
}
