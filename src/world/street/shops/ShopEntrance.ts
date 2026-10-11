import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { StockItem } from '@/economy/StockItem';
import type { MarketDayTheme } from '@/economy';
import type { MarketNews } from '@/economy/marketEvents';
import { stallRumour } from '@/economy/rumours';
import type { ScratchCardPanel } from '@/ui/ScratchCardPanel';
import { playCoins } from '@/audio/coins';
import { invisibleHitbox } from '../../meshUtils';
import type { Furniture } from '../../Furniture';
import type { ShopDoor } from '../streetPlan';
import { hoursOn, isShopOpen, opensAgain, streetWeekday } from './shopHours';
import { clockShort } from '@/text/clock';
import { formatCoins } from '@/text/money';
import { capitalise } from '@/text/strings';
import { BARISTAS, BAR_GOSSIP, SHOP_TALK, WEEKDAY_LOOKS, shopName, type ShopOffer } from './shopPlan';
import { BAR_LOOKS, barOf } from '@/streetShops/bars';
import type { CounterTurn, StreetCounters } from './counters';
import { SCRATCH_PER_DAY, cardInProgress, cardsToday, drawCard, keepCardInProgress, recordCard, type CardInProgress } from './scratchCard';
import { STREET_TREATS_PER_DAY } from '@/economy/pricing';
import { currentSeason } from '@/time/season';
import { errandOf } from '@/errands/errands';
import { buyErrand } from '@/errands/buy';
import { pocket } from '@/errands/pocket';
import type { ShopKind } from '../streetPlan';
import { lcg, random as liveRandom } from '@/random';
import { socialCaption } from '@/social/caption';
import type { SocialServices } from '@/social/talk';
import type { PersonId } from '@/social/types';
import { baristaTalk } from './baristaTalk';
import { markStreet } from '@/social/street/streetMarks';
import { shopkeeperOf, shopkeeperTalk } from '../townsfolk/shopkeeperTalk';

/** A scratch-card win this big (the card's top line) is a moment for the collector's book. */
const SCRATCH_BIG_WIN = 25;

/** What the shops draw on: the clock, the coins, the flea market (the café's tips and coffee), the tabac's card. */
export interface ShopServices {
  hours: () => number;
  purse: { readonly coins: number; spend(coins: number): boolean; earnCoins(coins: number): void };
  market: { peekToday(): readonly StockItem[] | null; readonly hadCoffee: boolean; drinkCoffee(): void };
  /** What kind of market day it is, and the talk of the days ahead (the barista's tips). */
  marketDay: { readonly theme: MarketDayTheme; news(): readonly MarketNews[] };
  isWanted: (id: string) => boolean;
  scratch: ScratchCardPanel;
  /** What is on along the street today and tomorrow (`streetNews`): the bar's regulars pass it on. */
  streetNews: () => readonly string[];
  /** The people the player talks to (docs/social.md): a named café's counter is a conversation with its barista (`BARISTAS`). */
  social?: SocialServices;
  /** The game day (the barista's free coffee, once a day). */
  day?: () => number;
  /** What the doors do beyond their plain offers (`counters.ts`: the bookshops, the bars' nights, the pop-up). */
  counters?: StreetCounters;
}

/** Which line each shop said last (by kind and name), across the street's rebuilds this page (a look in goes on to the next line). */
const looked = new Map<string, number>();
/** The weekday each shop last said its day's own line on (`WEEKDAY_LOOKS`), by kind and name. */
const saidToday = new Map<string, number>();

/**
 * A shop's door on Front Street, as the player meets it: the caption says whose it is and what it
 * sells over the counter, or that it is shut and when it opens (`SHOP_HOURS`); a click buys the
 * offer (`SHOP_TALK`), or has a look in (a line). The café's coffee is the flea market's coffee of
 * the day (the stallholders go easier) and comes with the barista's tip about today's stock; the
 * tabac's scratch card opens `ScratchCardPanel`. The shops that sell for the flat (the furniture shop, the TV repair
 * shop, the pet shop, the florist) are walked into instead (`SHOP_ZONE_OF`, a `StreetDoor`). The door itself is
 * painted on the facade: this is the click on it. Origin on the pavement at the door,
 * +z facing the street; never collides.
 */
export class ShopEntrance extends THREE.Group implements Furniture, Interactable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly shopName: string;

  constructor(private readonly door: ShopDoor, private readonly services: ShopServices) {
    super();
    const { shop } = door;
    this.name = `ShopEntrance:${shop.kind}`;
    this.shopName = shopName(shop);
    const hitbox = invisibleHitbox(1.3, 2.5, 0.25, { y: 1.25, z: 0.08 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setHovered(): void {
    // Painted on the facade: the caption says it all.
  }

  label(): string {
    const { kind } = this.door.shop;
    const name = capitalise(this.shopName);
    if (kind === 'shut') return this.turn()?.caption ?? `${name} · shut for good`;
    if (SHOP_TALK[kind].offer?.id === 'scratch' && cardInProgress()) return `${name} · finish your scratch card`;
    if (!this.isOpen) return `${name} · closed, ${opensAgain(kind, this.services.hours())}`;
    const till = this.closesAt();
    const offer = SHOP_TALK[kind].offer;
    // What the door does today beyond its plain offer (the bookshops' counters, the bars' nights: `counters.ts`).
    const turn = this.turn();
    const keeper = this.keeper();
    if (keeper) return `${name} · ${socialCaption(keeper, turn ? `${turn.entry.toLowerCase()} and a chat` : offer ? `${offer.title} and a chat` : 'a chat')}${till}`;
    if (turn) return `${turn.caption}${till}`;
    if (!offer) return `${name} · look in${till}`;
    const barista = this.barista();
    if (barista) return `${name} · ${socialCaption(barista, 'coffee and a chat')}${till}`;
    if (offer.id === 'coffee' && this.services.market.hadCoffee) return `${name} · a word with the barista (you have had your coffee today)`;
    if (offer.id === 'scratch' && cardsToday() >= SCRATCH_PER_DAY) return `${name} · “That’s enough cards for today, love.”`;
    if (this.soldOut(offer)) return `${name} · a word (no more ${offer.id === 'drink' ? 'lemonade' : offer.id} today)`;
    return `${name} · buy ${offer.title} (${formatCoins(offer.price)})${till}`;
  }

  /** What the door does today beyond its plain offer (`counters.ts`), or null. */
  private turn(): CounterTurn | null {
    return this.services.counters?.at(this.door, this.shopName) ?? null;
  }

  /** " · till 19:30": when the shop shuts today (nothing for one open past midnight's small hours, or never shut). */
  private closesAt(): string {
    const hours = hoursOn(this.door.shop.kind);
    if (!hours || hours.close - hours.open >= 24) return '';
    return ` · till ${clockShort(hours.close)}`;
  }

  /** The croissants, lemonades and scraps a real day are counted (`errands/pocket`). */
  private soldOut(offer: ShopOffer): boolean {
    if (offer.id === 'drink') return pocket.boughtToday('lemonade') >= STREET_TREATS_PER_DAY.lemonade;
    if (offer.id === 'croissant' || offer.id === 'scrap') return pocket.boughtToday(offer.id) >= STREET_TREATS_PER_DAY[offer.id];
    return false;
  }

  activate(session: SessionActions): void {
    const { kind } = this.door.shop;
    const talk = SHOP_TALK[kind];
    // A card paid for and left half-scratched (the page went): the tabac hands it back, open or not.
    const unfinished = talk.offer?.id === 'scratch' ? cardInProgress() : null;
    if (unfinished) {
      this.lay(unfinished);
      session.openPanel(this.services.scratch);
      return;
    }
    if (kind !== 'shut' && !this.isOpen) {
      session.refuse(`${capitalise(this.shopName)} is closed. ${talk.closed} ${capitalise(opensAgain(kind, this.services.hours()))}.`);
      return;
    }
    const turn = this.turn();
    const barista = this.barista();
    const { social } = this.services;
    if (barista && social && talk.offer?.id === 'coffee') {
      social.open(session, baristaTalk({ id: barista, price: talk.offer.price, services: this.services, tips: () => this.tips() }, session));
      return;
    }
    // Someone behind the counter the player can know (`townsfolk/shopkeeperTalk`): the shop's business is their first entry.
    const keeper = this.keeper();
    if (keeper && social && kind !== 'shut') {
      const offer = talk.offer && !this.soldOut(talk.offer) ? talk.offer : null;
      const counter = turn ? { label: turn.entry, run: () => turn.act(session) } : offer ? { label: `Buy ${offer.title} (${formatCoins(offer.price)})`, run: () => this.counter(session) } : undefined;
      social.open(session, shopkeeperTalk({ person: keeper, counter, look: () => this.nextLook(kind), day: () => this.services.day?.() ?? 0 }, session));
      return;
    }
    if (turn) {
      turn.act(session);
      return;
    }
    if (kind === 'shut') {
      session.react(this.nextLook(kind));
      return;
    }
    this.counter(session);
  }

  /** The shop's own business, as a click on its door does it: the offer bought, else a look in. */
  private counter(session: SessionActions): void {
    const { kind } = this.door.shop;
    const talk = SHOP_TALK[kind];
    if (talk.offer && !this.soldOut(talk.offer)) {
      this.sell(session, talk.offer);
      return;
    }
    session.react(this.nextLook(kind));
  }

  /** Who serves at this counter and can be known (the butcher, CORNER BOOKS' bookseller), when the social layer is there. */
  private keeper(): PersonId | null {
    if (!this.services.social) return null;
    return shopkeeperOf(this.door.shop.kind, this.door.shop.name);
  }

  /** Who serves at this café's counter (`BARISTAS`), when the social layer is there. */
  private barista(): PersonId | null {
    if (!this.services.social || this.door.shop.kind !== 'cafe') return null;
    return BARISTAS[this.door.shop.name ?? ''] ?? null;
  }

  /**
   * The shop's next line (one after the other, carried across the street's rebuilds): first the day's own when the week
   * gives it one (`WEEKDAY_LOOKS`: the market morning, the launderette's Monday), a named bar's its own (`BAR_LOOKS`).
   */
  private nextLook(kind: ShopKind): string {
    const weekday = streetWeekday();
    const todays = WEEKDAY_LOOKS[kind]?.[weekday];
    const key = `${kind}:${this.door.shop.name ?? ''}`;
    if (todays && saidToday.get(key) !== weekday) {
      saidToday.set(key, weekday);
      return todays;
    }
    const bar = kind === 'bar' ? barOf(this.door.shop.name) : null;
    const lines = bar ? BAR_LOOKS[bar] : SHOP_TALK[kind].looks;
    const n = looked.get(key) ?? 0;
    looked.set(key, n + 1);
    return lines[n % lines.length] ?? '';
  }

  private get isOpen(): boolean {
    return isShopOpen(this.door.shop.kind, this.services.hours());
  }

  private sell(session: SessionActions, offer: ShopOffer): void {
    const { market, purse } = this.services;
    switch (offer.id) {
      case 'coffee':
        if (market.hadCoffee) {
          session.say('Another one? You’ll be haggling in your sleep.', 'Café');
          session.refuse('One coffee a day is plenty.');
          session.tip(this.tip(), { id: 'barista', head: 'Market tip' });
          return;
        }
        session.pay({
          price: offer.price,
          paid: () => {
            market.drinkCoffee();
            session.tip(this.tip(), { id: 'barista', head: 'Market tip' });
            return 'A coffee at the counter.\nThe stallholders will go easier on you today.';
          },
        });
        return;
      case 'scratch':
        if (cardsToday() >= SCRATCH_PER_DAY) {
          session.say('That’s enough cards for today, love. Come back tomorrow.', 'Tabac');
          session.refuse('No more scratch cards today.');
          return;
        }
        if (!purse.spend(offer.price)) {
          session.refuse(`A scratch card is ${formatCoins(offer.price)} and you have ${purse.coins}.`);
          return;
        }
        this.dealCard();
        session.openPanel(this.services.scratch);
        return;
      case 'croissant':
      case 'scrap':
        buyErrand(session, errandOf(offer.id, currentSeason().name), offer.id === 'croissant' ? '“Last batch is gone, love.”' : '“That’s all the scraps I’ve got.”');
        return;
      case 'drink':
        session.pay({
          price: offer.price,
          paid: () => {
            pocket.recordBuy('lemonade');
            return `A lemonade at the bar. ${this.gossip()}`;
          },
        });
        return;
    }
  }

  /** What the regulars go on about: what is on along the street (the collector, a garage sale, the arcade), else their old lines. */
  private gossip(): string {
    const news = this.services.streetNews();
    const n = looked.get('bar:gossip') ?? 0;
    looked.set('bar:gossip', n + 1);
    if (news.length && n % 3 !== 2) return `“${news[n % news.length]}”`;
    return BAR_GOSSIP[n % BAR_GOSSIP.length]!;
  }

  /** Lays a new card on the tabac's panel (paid for already); "Another" buys the next one from the panel. */
  private dealCard(): void {
    recordCard();
    const card: CardInProgress = { seed: Math.floor(liveRandom() * 0x7fffffff), revealed: [] };
    keepCardInProgress(card);
    this.lay(card);
  }

  /**
   * Shows `card` (its symbols drawn from its seed, the cells already scratched cleared). It is kept
   * in storage until every cell shows and it has paid, so a reload mid-card hands it back here.
   */
  private lay(card: CardInProgress): void {
    const { scratch, purse } = this.services;
    scratch.show({
      card: drawCard(lcg(card.seed)),
      revealed: card.revealed,
      onReveal: (index) => {
        card.revealed[index] = true;
        keepCardInProgress(card);
      },
      done: (win) => {
        keepCardInProgress(null);
        if (!win) return 'Nothing. “Better luck next time.”';
        purse.earnCoins(win.prize);
        playCoins();
        // The top line of the card (the 7s): a moment of the street's for the collector's book.
        if (win.prize >= SCRATCH_BIG_WIN) markStreet('scratchBig');
        return `Three ${win.name}! ${formatCoins(win.prize)}, counted out on the counter.`;
      },
      again: () => {
        if (cardsToday() >= SCRATCH_PER_DAY) return '“That’s enough cards for today, love.”';
        if (!purse.spend(SHOP_TALK.tabac.offer!.price)) return `A card is ${formatCoins(SHOP_TALK.tabac.offer!.price)} and you have ${purse.coins}.`;
        this.dealCard();
        return null;
      },
    });
  }

  /** The barista's tip: the first of `tips`. */
  private tip(): string {
    return this.tips()[0]!;
  }

  /** What the barista knows, the most useful first: a wishlisted game on a stall today, a gem in the bin, a grail's rumour, what kind of day the market has. */
  private tips(): string[] {
    const out: string[] = [];
    const { market, marketDay, isWanted } = this.services;
    const stock = market.peekToday();
    const wanted = stock?.find((item) => isWanted(item.game.id));
    if (wanted) out.push(`“Someone saw ${wanted.game.title} on a stall this morning. Be quick.”`);
    const gem = stock?.find((item) => item.gem);
    if (gem) out.push(`“There’s a ${gem.game.title} in the bargain bin. Nobody’s noticed yet.”`);
    const news = marketDay.news()[0];
    if (news?.kind === 'grail') out.push(`“${stallRumour(news, 0)}”`);
    const { title } = marketDay.theme;
    out.push(stock ? `“${title} at the flea market today.”` : `“${title} at the flea market today, behind RETRO GAMES. The dealers get there early.”`);
    return out;
  }

}
