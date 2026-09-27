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
import { SHOP_HOURS, clockTime, isShopOpen } from './shopHours';
import { BAR_GOSSIP, SHOP_TALK, shopName, type ShopOffer } from './shopPlan';
import { seededRandom } from '@/graphics/canvas';
import { SCRATCH_PER_DAY, cardInProgress, cardsToday, drawCard, keepCardInProgress, recordCard, type CardInProgress } from './scratchCard';

/** What the shops draw on: the clock, the coins, the flea market (the café's tips and coffee), the tabac's card. */
export interface ShopServices {
  hours: () => number;
  purse: { readonly coins: number; spend(coins: number): boolean; earnCoins(coins: number): void };
  market: { peekToday(): readonly StockItem[] | null; readonly hadCoffee: boolean; drinkCoffee(): void };
  /** What kind of market day it is, and the talk of the days ahead (the barista's tips). */
  marketDay: { readonly theme: MarketDayTheme; news(): readonly MarketNews[] };
  isWanted: (id: string) => boolean;
  scratch: ScratchCardPanel;
}

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
  private looked = 0;

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
    if (kind === 'shut') return `${name} · shut for good`;
    if (SHOP_TALK[kind].offer?.id === 'scratch' && cardInProgress()) return `${name} · click to finish your scratch card`;
    if (!this.isOpen) return `${name} · closed, opens at ${clockTime(SHOP_HOURS[kind]?.open ?? 8)}`;
    const offer = SHOP_TALK[kind].offer;
    if (!offer) return `Click to look in ${this.shopName}`;
    if (offer.id === 'coffee' && this.services.market.hadCoffee) return `${name} · you have had your coffee today · click for a word with the barista`;
    if (offer.id === 'scratch' && cardsToday() >= SCRATCH_PER_DAY) return `${name} · “That’s enough cards for today, love.”`;
    return `Click for ${offer.title}: ${offer.price} coin${offer.price > 1 ? 's' : ''} · ${this.shopName}`;
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
      session.refuse(`${capitalise(this.shopName)} is closed. ${talk.closed} Opens at ${clockTime(SHOP_HOURS[kind]?.open ?? 8)}.`);
      return;
    }
    if (talk.offer) {
      this.sell(session, talk.offer);
      return;
    }
    session.react(talk.looks[this.looked++ % talk.looks.length] ?? '');
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
          session.refuse(`A scratch card is ${offer.price} coins and you have ${purse.coins}.`);
          return;
        }
        this.dealCard();
        session.openPanel(this.services.scratch);
        return;
      case 'croissant':
        session.pay({ price: offer.price, paid: () => 'A warm croissant in a paper bag. The pigeons watch you eat it.' });
        return;
      case 'drink':
        session.pay({ price: offer.price, paid: () => `A lemonade at the bar. ${BAR_GOSSIP[this.looked++ % BAR_GOSSIP.length]}` });
        return;
    }
  }

  /** Lays a new card on the tabac's panel (paid for already); "Another" buys the next one from the panel. */
  private dealCard(): void {
    recordCard();
    const card: CardInProgress = { seed: Math.floor(Math.random() * 0x7fffffff), revealed: [] };
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
      card: drawCard(seededRandom(card.seed)),
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
        return `Three ${win.name}! ${win.prize} coins, counted out on the counter.`;
      },
      again: () => {
        if (cardsToday() >= SCRATCH_PER_DAY) return '“That’s enough cards for today, love.”';
        if (!purse.spend(SHOP_TALK.tabac.offer!.price)) return `A card is ${SHOP_TALK.tabac.offer!.price} coins and you have ${purse.coins}.`;
        this.dealCard();
        return null;
      },
    });
  }

  /** The barista's tip: a wishlisted game on a stall today, a gem in the bin, or what kind of day the market has. */
  private tip(): string {
    const { market, marketDay, isWanted } = this.services;
    const stock = market.peekToday();
    const wanted = stock?.find((item) => isWanted(item.game.id));
    if (wanted) return `The barista leans over: “Someone saw ${wanted.game.title} on a stall this morning. Be quick.”`;
    const gem = stock?.find((item) => item.gem);
    if (gem) return `The barista winks: “There’s a ${gem.game.title} in the bargain bin. Nobody’s noticed yet.”`;
    const news = marketDay.news()[0];
    if (news?.kind === 'grail') return `The barista lowers their voice: “${stallRumour(news, 0)}”`;
    const { title, blurb } = marketDay.theme;
    return stock
      ? `The barista says it’s ${title} at the flea market today. ${blurb}`
      : `“${title} at the flea market today, behind RETRO GAMES. ${blurb} The dealers get there early.”`;
  }
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
