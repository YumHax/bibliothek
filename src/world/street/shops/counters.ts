import type { SessionActions } from '@/game/SessionActions';
import type { ModalLike } from '@/game/SessionParts';
import type { Game, PlatformId } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import type { Views } from '@/economy/Fame';
import { EDITION_FACTOR, shopPrice, variantFactor } from '@/economy/pricing';
import type { TxResult } from '@/economy/Transactions';
import { SELLERS_BUILDING, type Ad, type ScriptedAd } from '@/classifieds/ads';
import { buyErrand } from '@/errands/buy';
import { errandOf } from '@/errands/errands';
import { pocket } from '@/errands/pocket';
import type { Pastime } from '@/household/pastime';
import type { Outcome } from '@/household/HomeLife';
import { isMet, nudge } from '@/social/standing';
import { findPerson } from '@/social/people';
import { effectValue } from '@/social/perks';
import { STREET_SHOPS } from '@/streetShops/rules';
import { gameWeekOf, streetShops } from '@/streetShops/store';
import { guidesOnShelf, lackingManuals, manualPrice, manualsInBox } from '@/streetShops/bookshop';
import { barOf, checkoutPrize, dartsOpen, gigOn, GIG_SETS, quizOn, tonightsCheckout } from '@/streetShops/bars';
import { quizRound, rivalsRight } from '@/streetShops/quizBank';
import { BOARD_CARDS, boardAdOn } from '@/streetShops/laundryBoard';
import { POP_UP_NAME, POP_UP_WHERE, popUpOpen, popUpOpened, popUpStock } from '@/streetShops/popUp';
import { currentSeason } from '@/time/season';
import { weekdayOf } from '@/time/wakefulness';
import { inHours } from '@/time/clock';
import { clockShort } from '@/text/clock';
import { formatCoins } from '@/text/money';
import { capitalise } from '@/text/strings';
import type { CounterDeal, CounterRow, CounterSection } from '@/ui/streetShops/CounterPanel';
import type { QuizNight } from '@/ui/streetShops/PubQuizPanel';
import type { DartsGo } from '@/ui/streetShops/DartsPanel';
import type { ShopDoor, Vec2 } from '../streetPlan';
import { SHOP_OWN_LOOKS } from './shopPlan';

/** What a door does beyond its plain offer (`ShopEntrance`): its caption now, the entry it is in a shopkeeper's conversation, and its click. */
export interface CounterTurn {
  caption: string;
  entry: string;
  act(session: SessionActions): void;
}

/** What Front Street's counters run on (`furnishStreet` hands them in): the clock and the day, the wallet, the panels, the flat. */
interface CountersDeps {
  day: () => number;
  hours: () => number;
  purse: { readonly coins: number; spend(coins: number): boolean; earnCoins(coins: number): void };
  panels: {
    counter: ModalLike & { show(deal: CounterDeal): void };
    quiz: ModalLike & { show(night: QuizNight): void };
    darts: ModalLike & { show(go: DartsGo): void };
  };
  /** The collection, live. */
  games: () => readonly Game[];
  owns: (id: string) => boolean;
  /** The flat's rules (the manual completes its copy, a guide is read); without them the bookshops only look in. */
  homeLife?: {
    completeWithManual(gameId: string): Outcome;
    readGuide(platform: PlatformId, guideId: string, title: string): Outcome;
  };
  /** The fade-to-black beat of a long thing (the gig's set). */
  pastimes?: { run<T>(pastime: Pastime, change: () => T): Promise<T | null> };
  /** The small ads (the launderette's card joins them). */
  classifieds?: { inject(spec: ScriptedAd): void; inPaper(): readonly Ad[]; markSeen(ads: readonly Ad[]): void };
  /** A game paid for and taken home (the pop-up's copies). */
  buyGame?: (game: Game, price: number, where: string) => TxResult<{ game: Game }>;
  /** How famous a game is (the pop-up's prices). */
  fame?: { lookup(game: Pick<Game, 'id' | 'title' | 'platform'>): Promise<Views> };
  /** The street's one-shots at a door (`audio/StreetCues`): a dart in the board, a cheer, the room's applause. */
  cues?: { dart(at: Vec2): void; cheer(at: Vec2): void; applause(at: Vec2, people: number): void };
}

/** Which of the street's empty shops the pop-up takes: the one by the butcher on our side (facade `n5`). */
export const POP_UP_FACADE = 'n5';
/** CORNER BOOKS' bookseller (`social/people/town`): her standing's discount, or markup, on the box's manuals. */
const BOOKSELLER = 'bookseller';

/** The name over a known shopkeeper's words on the counter: theirs once met, else `role`. */
function keeperName(id: string, role: string): string {
  const card = findPerson(id);
  return card && isMet(id) ? (card.short ?? card.name) : role;
}

/** A manual's price at CORNER BOOKS as Agnès asks it of the player (a friend's discount, a cold markup). */
function agnesPrice(base: number): number {
  return Math.max(1, Math.round(base * effectValue(BOOKSELLER, 'discount', 1) * effectValue(BOOKSELLER, 'markup', 1)));
}

/** The board cards read one after another, across the street's rebuilds. */
let boardRead = 0;

/**
 * Front Street's counters (docs/economy.md "Front Street's shops and finds"): what a shop's door does today beyond its
 * plain offer. CORNER BOOKS' box of loose manuals (and its orders), COMICS & MANGA's strategy guides, the greengrocer's
 * baking basket (cheaper on market mornings), the bakery's Friday tart, the launderette's cork board, THE ANCHOR's
 * gig on Thursdays, THE LOCAL's quiz on Tuesdays and its darts of an evening, and late in the game the pop-up in the
 * empty shop by the butcher. `at` answers per door and per moment; null leaves the door to `ShopEntrance`'s own offer.
 */
export class StreetCounters {
  /** The pop-up's prices, looked up once per copy (`Fame`), and who asked to hear of them. */
  private readonly prices = new Map<string, number>();
  private readonly priceListeners = new Set<() => void>();

  constructor(private readonly deps: CountersDeps) {}

  /** What `door` (its shop named `name`) does now, or null for its plain offer. */
  at(door: ShopDoor, name: string): CounterTurn | null {
    const { shop, facade } = door;
    const facadeId = facade.id;
    const day = this.deps.day();
    const hours = this.deps.hours();
    // The shops past the works with lines of their own (`SHOP_OWN_LOOKS`) are not the near ones' copies: no basket,
    // tart or board of their own kind's; only their plain offer.
    const own = shop.name !== undefined && shop.name in SHOP_OWN_LOOKS;
    switch (shop.kind) {
      case 'books':
        return shop.name === 'CORNER BOOKS' ? this.manuals(name) : shop.name === 'COMICS & MANGA' ? this.guides(name) : null;
      case 'grocer':
        return own ? null : this.basket(name, day, hours);
      case 'bakery':
        return own ? null : this.tart(name, day);
      case 'laundry':
        return own ? null : this.board(name, day);
      case 'bar': {
        const bar = barOf(shop.name);
        if (bar === 'anchor' && gigOn(day, hours)) return this.gig(name, day);
        if (bar === 'local' && quizOn(day, hours)) return this.quiz(name, day, door.at);
        if (bar === 'local' && dartsOpen(day, hours)) return this.darts(name, day, door.at);
        return null;
      }
      case 'shut':
        return facadeId === POP_UP_FACADE && popUpOpened(day) ? this.popUp(day, hours) : null;
      default:
        return null;
    }
  }

  // --- CORNER BOOKS: the box of loose manuals ---------------------------------------------------

  private manuals(name: string): CounterTurn | null {
    const life = this.deps.homeLife;
    if (!life) return null;
    return {
      caption: `${capitalise(name)} · the box of loose manuals`,
      entry: 'Have a dig in the box of manuals',
      act: (session) => {
        const handed = this.handOverOrders();
        this.openCounter(session, {
          title: name.toUpperCase(),
          paper: 'bookshop',
          keeper: { id: BOOKSELLER, name: keeperName(BOOKSELLER, 'The bookseller') },
          says: () => handed ?? 'Loose manuals in the box by the till, sorted by nobody. If yours isn’t there, I can order it in.',
          sections: () => this.manualSections(),
          coins: () => this.deps.purse.coins,
          take: (id) => this.takeManual(id),
        });
      },
    };
  }

  /** The orders come in by today handed over: each copy complete again; the bookseller's words, or null. */
  private handOverOrders(): string | null {
    const life = this.deps.homeLife;
    if (!life) return null;
    const ready = streetShops.takeReady(this.deps.day());
    const outcomes = ready.map((order) => ({ order, outcome: life.completeWithManual(order.gameId) }));
    const done = outcomes.filter((o) => o.outcome.done).map((o) => o.outcome);
    // A manual come in for a copy sold or completed since: the bookseller gives the money back.
    const refund = outcomes.filter((o) => !o.outcome.done).reduce((sum, o) => sum + (o.order.paid ?? 0), 0);
    if (refund > 0) this.deps.purse.earnCoins(refund);
    const back = refund > 0 ? ` “One you ordered isn’t needed any more: here’s your ${formatCoins(refund)} back.”` : '';
    if (!done.length) return back ? back.trim() : null;
    return `“Your order came in.” ${done.map((o) => o.line.split('\n')[0]).join(' ')}${back}`;
  }

  private manualSections(): CounterSection[] {
    const day = this.deps.day();
    const games = this.deps.games();
    const box = manualsInBox(gameWeekOf(day), games).filter((g) => !streetShops.orderFor(g.id));
    const inBox = new Set(box.map((g) => g.id));
    const { orderDays, orderExtra } = STREET_SHOPS.manuals;
    const boxRows: CounterRow[] = box.map((g) => ({ id: `box:${g.id}`, title: `The manual of ${g.title}`, detail: `${getPlatform(g.platform).shortName} · for your copy, which has none`, price: agnesPrice(manualPrice(g)), verb: 'Buy', game: g }));
    const lacking = lackingManuals(games).filter((g) => !inBox.has(g.id));
    const orderRows: CounterRow[] = lacking.slice(0, 8).map((g) => {
      const order = streetShops.orderFor(g.id);
      if (order) return { id: `wait:${g.id}`, title: `The manual of ${g.title}`, detail: 'On its way from the wholesaler', verb: 'Ordered', unavailable: order.ready <= day ? 'It is in: ask again at the till.' : `It comes in ${order.ready - day === 1 ? 'tomorrow' : `in ${order.ready - day} days`}.` };
      return { id: `order:${g.id}`, title: `The manual of ${g.title}`, detail: `${getPlatform(g.platform).shortName} · in ${orderDays} days`, price: agnesPrice(manualPrice(g)) + orderExtra, verb: 'Order', game: g };
    });
    return [
      { title: 'In the box this week', rows: boxRows, empty: 'Nothing in the box for your games this week. They come and go.' },
      { title: 'Order one in', rows: orderRows, empty: 'Every game on your shelves has its manual.' },
    ];
  }

  private takeManual(id: string): { ok: boolean; line: string; coins?: boolean } {
    const life = this.deps.homeLife;
    const [kind, gameId] = id.split(/:(.+)/) as [string, string];
    const game = this.deps.games().find((g) => g.id === gameId);
    if (!life || !game) return { ok: false, line: 'That one’s gone, I’m afraid.' };
    const price = agnesPrice(manualPrice(game)) + (kind === 'order' ? STREET_SHOPS.manuals.orderExtra : 0);
    if (!this.deps.purse.spend(price)) return { ok: false, line: `That is ${formatCoins(price)} and you have ${formatCoins(this.deps.purse.coins)}.` };
    if (kind === 'order') {
      const ready = this.deps.day() + STREET_SHOPS.manuals.orderDays;
      streetShops.order(game.id, ready, price);
      return { ok: true, coins: true, line: `The manual of ${game.title}: I’ll ring the wholesaler. Come back in ${STREET_SHOPS.manuals.orderDays} days.` };
    }
    const done = life.completeWithManual(game.id);
    if (!done.done) {
      this.deps.purse.earnCoins(price);
      return { ok: false, line: done.line };
    }
    return { ok: true, coins: true, line: done.line };
  }

  // --- COMICS & MANGA: strategy guides -----------------------------------------------------------

  private guides(name: string): CounterTurn | null {
    const life = this.deps.homeLife;
    if (!life) return null;
    return {
      caption: `${capitalise(name)} · strategy guides`,
      entry: 'Look at the strategy guides',
      act: (session) => {
        this.openCounter(session, {
          title: name.toUpperCase(),
          paper: 'comics',
          keeper: { name: 'Behind the till', seed: 2411 },
          says: () => 'Guides are on the back wall. Read one and you’ll talk like you made the game.',
          sections: () => {
            const shelf = guidesOnShelf(gameWeekOf(this.deps.day()), this.deps.games());
            const rows: CounterRow[] = shelf.map((g) => ({ id: g.id, title: g.title, detail: g.blurb, price: STREET_SHOPS.guides.price, verb: 'Buy', ...(streetShops.hasGuide(g.id) ? { unavailable: 'You have this one, and you read it cover to cover.' } : {}) }));
            return [{ title: 'Strategy guides this week', rows, empty: 'Nothing for your consoles this week. New stock comes in on Mondays.' }];
          },
          coins: () => this.deps.purse.coins,
          take: (id) => {
            const guide = guidesOnShelf(gameWeekOf(this.deps.day()), this.deps.games()).find((g) => g.id === id);
            if (!guide) return { ok: false, line: 'Sold that one this morning.' };
            const { price } = STREET_SHOPS.guides;
            if (streetShops.hasGuide(guide.id)) return { ok: false, line: 'You have this one, and you read it cover to cover.' };
            if (!this.deps.purse.spend(price)) return { ok: false, line: `That is ${formatCoins(price)} and you have ${formatCoins(this.deps.purse.coins)}.` };
            const read = life.readGuide(guide.platform, guide.id, guide.title);
            if (!read.done) {
              this.deps.purse.earnCoins(price);
              return { ok: false, line: read.line };
            }
            streetShops.addGuide(guide.id);
            return { ok: true, coins: true, line: read.line };
          },
        });
      },
    };
  }

  // --- the greengrocer's basket, the bakery's tart -----------------------------------------------

  /** Wednesday and Saturday mornings are market mornings on the street: crates out, the basket cheaper. */
  private marketMorning(day: number, hours: number): boolean {
    const weekday = weekdayOf(day);
    return (weekday === 2 || weekday === 5) && inHours(hours, [7, 13]);
  }

  private basket(name: string, day: number, hours: number): CounterTurn | null {
    const errand = errandOf('basket', currentSeason().name);
    if (pocket.count('basket') >= errand.max || pocket.boughtToday('basket') >= errand.perDay) return null;
    const morning = this.marketMorning(day, hours);
    const price = morning ? STREET_SHOPS.marketBasket : errand.price;
    return {
      caption: `${capitalise(name)} · buy ${errand.title}${morning ? ', market-morning price' : ''} (${formatCoins(price)})`,
      entry: `Buy ${errand.title} (${formatCoins(price)})`,
      act: (session) => buyErrand(session, { ...errand, price }, '“That’s the last basket, love.”'),
    };
  }

  private tart(name: string, day: number): CounterTurn | null {
    if (weekdayOf(day) !== 4) return null;
    const cake = errandOf('cake', currentSeason().name);
    if (pocket.count('cake') >= cake.max || pocket.boughtToday('cake') >= cake.perDay) return null;
    const { price } = STREET_SHOPS.tart;
    return {
      caption: `${capitalise(name)} · the Friday special, a fruit tart (${formatCoins(price)})`,
      entry: `Buy the Friday tart (${formatCoins(price)})`,
      act: (session) => buyErrand(session, { ...cake, title: 'a fruit tart', price, bought: 'A fruit tart in a white box with a ribbon: the Friday special. For someone with a sweet tooth.' }, '“The tarts are all gone, love. Fridays, early.”'),
    };
  }

  // --- the launderette's cork board --------------------------------------------------------------

  private board(name: string, day: number): CounterTurn | null {
    const book = this.deps.classifieds;
    const ad = boardAdOn(day);
    return {
      caption: `${capitalise(name)} · read the cork board`,
      entry: 'Read the cork board',
      act: (session) => {
        if (ad && book) {
          book.inject(ad);
          book.markSeen(book.inPaper().filter((a) => a.id === ad.id));
          session.read({
            title: 'A card on the cork board',
            text: `${ad.text}\n${ad.name}, ${SELLERS_BUILDING}.`,
            look: 'note',
            effect: 'Its number is on the tabs: ring it from the phone at home, or from the kiosk.',
          });
          return;
        }
        const line = BOARD_CARDS[boardRead++ % BOARD_CARDS.length]!;
        session.read({ title: 'The cork board', text: line, look: 'note' });
      },
    };
  }

  // --- THE ANCHOR's gig ------------------------------------------------------------------------

  private gig(name: string, day: number): CounterTurn {
    const { gig } = STREET_SHOPS;
    if (streetShops.wentToGig(day)) return { caption: `${capitalise(name)} · the band is still going`, entry: 'Listen at the door', act: (session) => session.react('You heard the set already. Your ears are still ringing.') };
    return {
      caption: `${capitalise(name)} · live tonight: Lou’s band · go in (${formatCoins(gig.cover)})`,
      entry: `Go in for the set (${formatCoins(gig.cover)})`,
      act: (session) => {
        if (!this.deps.purse.spend(gig.cover)) {
          session.refuse(`The door is ${formatCoins(gig.cover)} and you have ${formatCoins(this.deps.purse.coins)}.`);
          return;
        }
        const set = GIG_SETS[(streetShops.gigsSeen() + day) % GIG_SETS.length]!;
        const change = (): void => {
          streetShops.markGig(day);
          nudge('lou', { warmth: gig.warmth, reason: 'gig', day, why: 'came to hear the band', memory: 'you came to the gig at THE ANCHOR', gossip: true });
        };
        const told = (): void =>
          session.read({ title: 'Live at THE ANCHOR', text: `They played ${set.songs.join(', ')}.\n${set.night}`, look: 'flyer', accent: 0x6b2f2a, effect: 'Lou saw you in the crowd.' });
        const beat: Pastime = { minutes: gig.minutes, outMs: 900, darkMs: 2600, inMs: 900 };
        if (!this.deps.pastimes) {
          change();
          told();
          return;
        }
        void this.deps.pastimes.run(beat, change).then((done) => {
          if (done !== null) told();
        });
      },
    };
  }

  // --- THE LOCAL's quiz and darts ----------------------------------------------------------------

  private quiz(name: string, day: number, at: Vec2): CounterTurn {
    const { quiz } = STREET_SHOPS;
    if (streetShops.quizPlayed(day)) return { caption: `${capitalise(name)} · quiz night (your sheet is in)`, entry: 'How did the quiz go?', act: (session) => session.react('Your team’s sheet is in. The quizmaster reads the answers out to groans.') };
    return {
      caption: `${capitalise(name)} · quiz night · join a team (${formatCoins(quiz.fee)})`,
      entry: `Join a quiz team (${formatCoins(quiz.fee)})`,
      act: (session) => {
        if (!this.deps.purse.spend(quiz.fee)) {
          session.refuse(`It is ${formatCoins(quiz.fee)} a head and you have ${formatCoins(this.deps.purse.coins)}.`);
          return;
        }
        const questions = quizRound(day, this.deps.games().filter((g) => g.status !== 'wishlist'));
        const rivals = rivalsRight(day, questions.length);
        this.deps.panels.quiz.show({
          questions,
          rivals,
          finished: (right) => {
            streetShops.markQuiz(day, right);
            const prize = right > rivals ? (quiz.prizes[right] ?? 0) : 0;
            this.deps.cues?.applause(at, 14);
            if (prize) {
              this.deps.cues?.cheer(at);
              this.deps.purse.earnCoins(prize);
              session.reward({ title: 'Quiz night won', detail: `${right} right, THE USUAL SUSPECTS ${rivals}. The kitty is yours.`, coins: prize });
              return { won: true, says: `And the winners tonight, with ${right}… not THE USUAL SUSPECTS!`, aside: 'The kitty comes over in a pint glass.' };
            }
            if (right === rivals) return { won: false, says: `A tie on ${right}! THE USUAL SUSPECTS take the tie-break, as ever.`, aside: '“Next Tuesday,” they say, raising their glasses.' };
            return { won: false, says: `THE USUAL SUSPECTS win again, on ${rivals}! And ${right} for our newcomers: a big hand for them.`, aside: 'A round of applause from the tables.' };
          },
        });
        session.openPanel(this.deps.panels.quiz);
      },
    };
  }

  private darts(name: string, day: number, at: Vec2): CounterTurn | null {
    const { darts } = STREET_SHOPS;
    if (streetShops.darts(day).goes >= darts.perDay) return null;
    return {
      caption: `${capitalise(name)} · darts at the back (${formatCoins(darts.fee)} for three)`,
      entry: `Three darts at the back (${formatCoins(darts.fee)})`,
      act: (session) => {
        if (!this.deps.purse.spend(darts.fee)) {
          session.refuse(`Three darts are ${formatCoins(darts.fee)} and you have ${formatCoins(this.deps.purse.coins)}.`);
          return;
        }
        const checkout = tonightsCheckout(day);
        this.deps.panels.darts.show({
          checkout,
          fee: darts.fee,
          thrown: () => this.deps.cues?.dart(at),
          refund: () => this.deps.purse.earnCoins(darts.fee),
          over: (end, left) => {
            const paid = end === 'out' && !streetShops.darts(day).paid;
            streetShops.markDarts(day, paid);
            if (paid) {
              const prize = checkoutPrize(checkout);
              this.deps.cues?.cheer(at);
              this.deps.purse.earnCoins(prize);
              session.reward({ title: 'Checked out', detail: `${checkout} to nought, the last dart in the double. The barman chalks your name under it.`, coins: prize });
              return { says: `Game shot! ${checkout} checked out. I’ll chalk your name up.`, aside: 'The regulars buy you a lemonade.' };
            }
            if (end === 'out') return { says: `${checkout} out again! You’ve had the kitty already tonight, mind.`, aside: 'The regulars clap.' };
            if (end === 'bust') return { says: `Bust! ${checkout} stays on the board.`, aside: '“Happens to the best of us,” says somebody at the bar.' };
            return { says: `${left} left. The board still says ${checkout}.`, aside: 'Somebody pulls the darts out for you.' };
          },
          again: () => {
            if (streetShops.darts(day).goes >= darts.perDay) return 'That’s enough darts for one night, the others want a go.';
            if (!this.deps.purse.spend(darts.fee)) return `Three darts are ${formatCoins(darts.fee)} and you have ${formatCoins(this.deps.purse.coins)}.`;
            return null;
          },
        });
        session.openPanel(this.deps.panels.darts);
      },
    };
  }

  // --- the pop-up in the empty shop -----------------------------------------------------------------

  private popUp(day: number, hours: number): CounterTurn | null {
    const { buyGame } = this.deps;
    if (!buyGame) return null;
    if (!popUpOpen(day, hours)) {
      const { open, close } = STREET_SHOPS.popUp.hours;
      const when = weekdayOf(day) === 0 ? 'shut on Mondays' : hours < open ? `opens at ${clockShort(open)}` : `shut since ${clockShort(close)}`;
      return { caption: `${POP_UP_NAME} · ${when}`, entry: 'Read the sign', act: (session) => session.refuse(`${POP_UP_NAME} is ${when}. A hand-lettered sign: COLLECTOR-GRADE COPIES · ${clockShort(open)}–${clockShort(close)}, NOT MONDAYS.`) };
    }
    return {
      caption: `${POP_UP_NAME} · collector-grade copies · look in`,
      entry: 'Look at the copies',
      act: (session) => {
        const stock = popUpStock(gameWeekOf(day), this.deps.owns);
        this.price(stock);
        this.openCounter(session, {
          title: POP_UP_NAME,
          paper: 'popup',
          keeper: { name: 'The young dealer', seed: 3527 },
          says: () => 'Everything complete, everything checked. Some first prints. Prices are prices: I don’t haggle.',
          sections: () => [{ title: 'This week', rows: stock.filter((g) => !this.deps.owns(g.id)).map((g) => this.popUpRow(g)), empty: 'Sold out till next week. “I’ve got a van coming Monday.”' }],
          coins: () => this.deps.purse.coins,
          take: (id) => {
            const game = stock.find((g) => g.id === id);
            const price = game ? this.prices.get(game.id) : undefined;
            if (!game || price === undefined) return { ok: false, line: 'One moment, let me look that up.' };
            const done = buyGame(game, price, POP_UP_WHERE);
            if (done.ok) {
              session.slip({ title: `Bought ${game.title}`, detail: 'It waits in the parcel under the hall console.', coins: -price });
              return { ok: true, line: `${game.title}, a good copy. Look after it.` };
            }
            return { ok: false, line: done.reason === 'short' ? `That is ${formatCoins(price)} and you have ${done.have ?? 0}.` : done.reason === 'owned' ? `You have ${game.title} already.` : 'Can’t do that one, sorry.' };
          },
          onChange: (cb) => {
            this.priceListeners.add(cb);
            return () => this.priceListeners.delete(cb);
          },
        });
      },
    };
  }

  private popUpRow(game: Game): CounterRow {
    const price = this.prices.get(game.id);
    const badge = game.variant === 'sealed' ? 'sealed' : game.edition === 'firstPrint' ? 'first print' : undefined;
    return { id: game.id, title: game.title, detail: `${getPlatform(game.platform).shortName} · complete in box`, ...(badge ? { badge } : {}), price: price ?? 0, pending: price === undefined, verb: 'Buy', game };
  }

  /** Looks the copies' prices up (once each): the full shop price by edition and variant. */
  private price(stock: readonly Game[]): void {
    const fame = this.deps.fame;
    for (const game of stock) {
      if (this.prices.has(game.id)) continue;
      const settle = (views: Views): void => {
        this.prices.set(game.id, Math.max(1, Math.round(shopPrice(game, views) * EDITION_FACTOR[game.edition ?? 'standard'] * variantFactor(game))));
        for (const cb of [...this.priceListeners]) cb();
      };
      if (!fame) settle(null);
      else void fame.lookup(game).then(settle, () => settle(null));
    }
  }

  private openCounter(session: SessionActions, deal: CounterDeal): void {
    this.deps.panels.counter.show(deal);
    session.openPanel(this.deps.panels.counter);
  }
}
