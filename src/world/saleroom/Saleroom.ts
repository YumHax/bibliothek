import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { SessionActions } from '@/game/SessionActions';
import type { TxResult } from '@/economy/Transactions';
import { AUCTION } from '@/economy/pricing';
import { LotRun, RIVAL_BIDDER, YOU, bidderById, drawInterest, type LotEvent } from '@/economy/auction';
import { isAuctionDay, nextAuctionDay, type AuctionLot } from '@/economy/AuctionHouse';
import { RIVAL_COLLECTOR, RIVAL_PERSON } from '@/economy/rivalCollector';
import { has } from '@/social/perks';
import { nudge } from '@/social/standing';
import { leavesLotToYou, outbidBy } from '@/social/saleroom';
import { gameDayRandom } from '@/time/daily';
import { playGavel } from '@/audio/gavel';
import type { LotServices } from '../buildContext';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import type { Walker } from '../people/Walker';
import type { Rostrum } from './Rostrum';
import type { LotStand } from './LotStand';
import type { SaleBoard } from './SaleBoard';
import { formatCoins } from '@/text/money';

/** How the receipts of what is bought here name the place. */
const SALEROOM_WHERE = 'the saleroom';

interface SaleroomOptions {
  lots: LotServices;
  dayNight: DayNight;
  day: () => number;
  wallet: { readonly coins: number };
  /** Victor's half of a lot split with him (`splitWithRival`). */
  purse?: { earnCoins(coins: number): void };
  owns: (id: string) => boolean;
  /** Whether a game is on the player's wishlist (a friend of the room leaves such a lot to them, `social/saleroom`). */
  wanted?: (id: string) => boolean;
  rostrum: Rostrum;
  stand: LotStand;
  board: SaleBoard;
  auctioneer: Walker;
  /** The room's bidders' bodies, by id (`SALEROOM_BIDDERS`). */
  bidders: ReadonlyMap<string, Walker>;
}

type State =
  | { kind: 'loading' }
  /** No sale now: the board's notice says why; looked at again every few seconds (the clock, a new day). */
  | { kind: 'idle'; recheck: number }
  | { kind: 'between'; wait: number; lot: AuctionLot }
  | { kind: 'calling'; lot: AuctionLot; run: LotRun; youBid: boolean; rivalBid: boolean; split: boolean };

const RECHECK_S = 4;
/** A nemesis bids on whatever the player bids on, up to this share of the estimate (times his keenness): `spiteBids`. */
const SPITE_CEILING = 1.25;
/** Going halves with Victor: once a sale day (`splitLots`). */
const SPLIT_SHARE = 0.5;

/**
 * Runs the saleroom: on a sale day (`isAuctionDay`) between `AUCTION.hours`, the day's lots one after the other
 * (`AuctionHouse.lotsFor`; a lot settled already is skipped, so leaving and coming back carries on from the next):
 * the lot goes up on the stand, the auctioneer says what it is and asks for the opening bid, the room bids on its
 * own clock (`auction.ts`: who wants it and up to what is drawn per lot and day), the player bids by clicking the
 * rostrum or the stand (the caption says how much), silence calls "going once", "twice", the hammer. The player's
 * win is paid then (`Transactions`: a game into the parcel, a carton to the hallway), or goes to the underbidder
 * if they cannot pay. The rival bids hardest on the star lot and keeps what he wins (his suitcase on Front Street).
 * The board shows it all; other days, the next sale and its lots. Ticked only while the room is the player's zone:
 * a lot left half called starts again on the way back.
 */
export class Saleroom extends THREE.Object3D implements Furniture, Updatable {
  readonly contactShadow = false;
  private state: State = { kind: 'loading' };
  private lots: AuctionLot[] | null = null;
  private lotsDay = -1;
  /** The session of the player's last bid: what the hammer tells them goes through it. */
  private session: SessionActions | null = null;
  private live = true;
  /** The room's regulars who bid on the lot being called (the player winning it outbids them: `social/saleroom`). */
  private readonly biddersOnLot = new Set<string>();
  /** What each regular won today, still theirs to sell on (a close one sells it at what they paid). */
  private readonly wonToday = new Map<string, { lot: AuctionLot; price: number; day: number }>();
  /** The game day a lot was last split with Victor (once a sale day). */
  private splitDay = -1;

  constructor(private readonly options: SaleroomOptions) {
    super();
    this.refresh();
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  /** Today's star lot's title (a close regular's tip), or null when there is no sale today. */
  starLot(): string | null {
    const day = this.options.day();
    if (!isAuctionDay(day) || this.lotsDay !== day) return null;
    return this.lots?.find((l) => l.star)?.title ?? null;
  }

  /** The game lot `bidder` won today that is still theirs, or null. */
  wonBy(bidder: string): { title: string; price: number } | null {
    const won = this.wonToday.get(bidder);
    return won && won.day === this.options.day() ? { title: won.lot.title, price: won.price } : null;
  }

  /** Buys `bidder`'s lot of today off them at what they paid. */
  buyFrom(bidder: string, name: string): { ok: true } | { ok: false; why: string } {
    const won = this.wonToday.get(bidder);
    if (!won?.lot.game || won.day !== this.options.day()) return { ok: false, why: 'I didn’t win anything worth selling today.' };
    const result = this.options.lots.tx.winAuctionLot(won.lot.game, won.price, `${name}, after the sale`);
    if (!result.ok) return { ok: false, why: result.reason === 'owned' ? 'You’ve got it already, haven’t you?' : result.reason === 'short' ? `It’s ${formatCoins(won.price)}. Come back when you have them.` : 'Not today.' };
    this.wonToday.delete(bidder);
    return { ok: true };
  }

  /** The caption on the rostrum and the stand: what a click does now. */
  caption(): string | null {
    const s = this.state;
    if (s.kind !== 'calling' || !s.run.open) return s.kind === 'between' ? `Lot ${s.lot.number}: ${s.lot.title} · coming up` : 'The rostrum';
    const { run, lot } = s;
    if (lot.game && this.options.owns(lot.game.id)) return `${lot.title}: you have it already`;
    if (run.leader === YOU) return `You lead at ${formatCoins(run.amount)}`;
    return `${lot.title} · bid ${formatCoins(run.ask)}`;
  }

  /** The player's click on the rostrum or the stand. */
  bid(session: SessionActions): void {
    const s = this.state;
    if (s.kind !== 'calling' || !s.run.open) {
      session.react(s.kind === 'between' ? 'The next lot is coming up.' : 'Nothing is being sold just now.');
      return;
    }
    const { run, lot } = s;
    if (lot.game && this.options.owns(lot.game.id)) {
      session.refuse(`You have ${lot.title} already.`);
      return;
    }
    if (run.leader === YOU) {
      session.react(`Your paddle is up at ${formatCoins(run.amount)}.`);
      return;
    }
    const ask = run.ask;
    if (this.options.wallet.coins < ask) {
      session.refuse(`The bid is ${formatCoins(ask)} and you have ${this.options.wallet.coins}.`);
      return;
    }
    this.session = session;
    const first = !s.youBid;
    s.youBid = true;
    // A friend of the room who knows the player wants it lets it go (`social/saleroom`).
    const day = this.options.day();
    const wanted = !!lot.game && (this.options.wanted?.(lot.game.id) ?? false);
    for (const id of this.options.bidders.keys()) if (leavesLotToYou(id, day, wanted)) this.handle(s, run.withdraw(id));
    if (!run.open) return;
    this.handle(s, run.bid(YOU));
    if (first && !s.split) this.spite(s);
  }

  /**
   * A nemesis (`spiteBids`, docs/social.md "Victor"): the player's first bid on a lot brings him in on it, whatever it
   * is, and higher than he would go for himself.
   */
  private spite(s: Extract<State, { kind: 'calling' }>): void {
    if (!has(RIVAL_PERSON, 'spiteBids') || !this.options.bidders.has(RIVAL_BIDDER)) return;
    const ceiling = Math.floor(s.lot.estimate * SPITE_CEILING * this.options.lots.rival.keenness);
    if (ceiling < s.run.ask) return;
    s.run.join(RIVAL_BIDDER, ceiling);
    this.options.bidders.get(RIVAL_BIDDER)?.speak(`Oh, you want that one? Then so do I.`);
  }

  /** Whether a lot is being called that could be split with Victor now (his `splitLots`, once a sale day). */
  canSplit(): string | null {
    const s = this.state;
    if (s.kind !== 'calling' || !s.run.open) return 'Wait for a lot to be called';
    if (s.split) return 'Agreed already';
    if (this.splitDay === this.options.day()) return 'Once a sale';
    if (s.lot.game && this.options.owns(s.lot.game.id)) return 'You have it already';
    return null;
  }

  /**
   * Going halves with Victor on the lot being called (`splitLots`): he stops bidding against the player, and pays
   * half the hammer price if they win it. The lot is the player's.
   */
  splitWithRival(): string {
    const s = this.state;
    if (s.kind !== 'calling' || this.canSplit()) return 'Not now, the hammer’s about to fall.';
    s.split = true;
    this.splitDay = this.options.day();
    s.run.drop(RIVAL_BIDDER);
    return `Halves on the ${s.lot.title}? Done. You bid, I'll pay my share. And I'm holding you to the next star lot.`;
  }

  update(dt: number): void {
    const s = this.state;
    this.options.rostrum.tick(dt);
    if (s.kind === 'idle') {
      s.recheck -= dt;
      if (s.recheck <= 0) this.refresh();
    } else if (s.kind === 'between') {
      s.wait -= dt;
      if (s.wait <= 0) this.call(s.lot);
    } else if (s.kind === 'calling') {
      if (!this.withinHours()) {
        // Closing time mid-lot: it is withdrawn, called again at the next sale... which is another day: passed.
        this.refresh();
        return;
      }
      this.handle(s, s.run.tick(dt));
    }
  }

  dispose(): void {
    // The stand and the board are the zone's: it disposes them with the rest.
    this.live = false;
  }

  /** Looks at the day and the clock and sets the room going (or says why not). */
  private refresh(): void {
    const day = this.options.day();
    const { auction } = this.options.lots;
    if (!isAuctionDay(day)) {
      this.idle();
      this.preview(day);
      return;
    }
    if (this.lotsDay !== day) {
      this.state = { kind: 'loading' };
      this.lotsDay = day;
      this.lots = null;
      void auction.lotsFor(day).then((lots) => {
        if (!this.live || this.lotsDay !== day) return;
        this.lots = lots;
        this.refresh();
      }, () => this.idle());
      return;
    }
    if (!this.lots) return;
    const next = this.lots.find((lot) => !auction.resultOf(day, lot.number));
    const [from] = AUCTION.hours;
    if (!next) {
      this.idle();
      this.showResults(day);
    } else if (!this.withinHours()) {
      this.idle();
      const hours = this.options.dayNight.state.hours % 24;
      this.options.board.show({ kind: 'notice', title: 'TODAY’S SALE', lines: [hours < from ? `from ${from} o’clock` : 'closed for the night', ...this.lots.map((l) => `${l.number}. ${l.title}`)] });
      this.peopleIn(false);
    } else {
      this.peopleIn(true);
      this.state = { kind: 'between', wait: AUCTION.pause, lot: next };
      this.options.stand.show(next);
      this.options.board.show({ kind: 'lot', number: next.number, of: this.lots.length, title: next.title, estimate: next.estimate, bid: null, leader: null, status: 'NEXT LOT', you: false });
    }
  }

  private idle(): void {
    this.state = { kind: 'idle', recheck: RECHECK_S };
  }

  private withinHours(): boolean {
    const hours = this.options.dayNight.state.hours % 24;
    const [from, to] = AUCTION.hours;
    return hours >= from && hours < to;
  }

  /** The lot is called: who wants it is drawn, the auctioneer asks for the opening bid. */
  private call(lot: AuctionLot): void {
    const day = this.options.day();
    const rng = gameDayRandom(`auction:${lot.number}`, day);
    const interest = drawInterest({ estimate: lot.estimate, reserve: lot.reserve, ...(lot.platform ? { platform: lot.platform } : {}), star: lot.star }, rng, this.options.lots.rival.keenness);
    const run = new LotRun(lot.reserve, interest);
    this.biddersOnLot.clear();
    const state: Extract<State, { kind: 'calling' }> = { kind: 'calling', lot, run, youBid: false, rivalBid: false, split: false };
    this.state = state;
    // On the star lot the rival says so first: fair warning.
    if (lot.star && interest.some((i) => i.bidder === RIVAL_BIDDER)) this.options.bidders.get(RIVAL_BIDDER)?.speak(`The ${lot.title}. That one's coming home with me.`);
    this.options.auctioneer.speak(`Lot ${lot.number}: ${lot.title}. ${lot.blurb} Who'll start me at ${run.ask}?`);
    this.handle(state, run.start());
  }

  private handle(state: Extract<State, { kind: 'calling' }>, events: readonly LotEvent[]): void {
    const { auctioneer, bidders, board, rostrum } = this.options;
    const { lot, run } = state;
    for (const event of events) {
      switch (event.kind) {
        case 'bid': {
          if (event.by === RIVAL_BIDDER) state.rivalBid = true;
          if (event.by !== YOU) this.biddersOnLot.add(event.by);
          const body = bidders.get(event.by);
          body?.gesture('wave');
          auctioneer.say(event.by === YOU ? `${event.amount}, by the door. Thank you.` : `${event.amount}, ${nameOf(event.by)}.`, 1.6);
          break;
        }
        case 'out':
          bidders.get(event.by)?.gesture('headShake');
          break;
        case 'once':
          auctioneer.say(`At ${event.amount}… going once.`, 2);
          break;
        case 'twice':
          auctioneer.say(`Going twice…`, 2);
          auctioneer.gesture('point');
          break;
        case 'sold':
          rostrum.strike();
          playGavel();
          this.sold(state, event.to, event.price);
          return;
        case 'passed':
          auctioneer.speak('No interest? Then it’s passed.');
          this.settle(lot, { to: 'passed', price: 0 });
          return;
        case 'open':
          break;
      }
    }
    const leader = run.leader;
    const status = run.phase === 'once' ? 'GOING ONCE' : run.phase === 'twice' ? 'GOING TWICE' : leader ? `NEXT BID ${run.ask}` : `OPENING AT ${run.ask}`;
    board.show({ kind: 'lot', number: lot.number, of: this.lots?.length ?? lot.number, title: lot.title, estimate: lot.estimate, bid: leader ? run.amount : null, leader: leader ? nameOf(leader) : null, status, you: leader === YOU });
  }

  /** The hammer fell: to the player (paid now, or to the underbidder if they cannot), or to someone of the room. */
  private sold(state: Extract<State, { kind: 'calling' }>, to: string, price: number): void {
    const today = this.options.day();
    if (to === YOU) {
      const underbid = this.soldToPlayer(state, price, today);
      if (!underbid) return;
      ({ to, price } = underbid);
    }
    this.soldToRoom(state, to, price, today);
  }

  /**
   * The player's hammer: paid now, the lot is theirs (null: nothing more to sell); unable to pay, the underbidder's
   * bid to sell on (or null once the lot is passed for want of one).
   */
  private soldToPlayer(state: Extract<State, { kind: 'calling' }>, price: number, today: number): { to: string; price: number } | null {
    const { lot, run } = state;
    const result = this.payFor(lot, price, today);
    if (result.ok) {
      this.paidByPlayer(state, price, today);
      return null;
    }
    this.session?.refuse(result.reason === 'short' ? `You cannot cover ${formatCoins(price)}: the lot goes to the underbidder.` : result.reason === 'owned' ? `You have ${lot.title} already: the lot goes to the underbidder.` : 'The sale fell through.');
    const fallback = run.fallBack();
    if (fallback.kind === 'passed') {
      this.options.auctioneer.speak('Then it’s passed.');
      this.settle(lot, { to: 'passed', price: 0 });
      return null;
    }
    return { to: fallback.to, price: fallback.price };
  }

  /** The player paid: the rival beaten or paid his half, the room outbid, the applause, the reward and the board, then the next lot. */
  private paidByPlayer(state: Extract<State, { kind: 'calling' }>, price: number, today: number): void {
    const { lot } = state;
    const { lots: services, auctioneer, bidders } = this.options;
    if (state.rivalBid) services.rival.beatenOnce(today);
    outbidBy(this.biddersOnLot, today);
    if (state.split) this.payRivalHalf(lot, price, today);
    auctioneer.speak(`Sold! To the bidder by the door, for ${price}.`);
    for (const [, body] of bidders) body.gesture('clap');
    this.session?.reward({ title: `Sold to you: ${lot.title}`, detail: lot.sealed ? 'The carton is taken round to the flat: it waits in the hallway, to be opened.' : 'It goes in the parcel: unpack it in the hallway at home.', coins: -price });
    this.options.board.show({ kind: 'lot', number: lot.number, of: this.lots?.length ?? lot.number, title: lot.title, estimate: lot.estimate, bid: price, leader: 'you', status: 'SOLD', you: true });
    this.next();
  }

  /**
   * The lot went halves with the rival: his share, never taking the player's cost under the reserve (a lot kept at
   * less than its opening bid would sell back at the WE BUY desk for more than it cost: docs/economy.md,
   * `assertBuyingToSellNeverPays`), and the standing it earns.
   */
  private payRivalHalf(lot: AuctionLot, price: number, today: number): void {
    const { bidders } = this.options;
    const half = Math.max(0, Math.min(Math.floor(price * SPLIT_SHARE), price - lot.reserve));
    if (half > 0) {
      this.options.purse?.earnCoins(half);
      bidders.get(RIVAL_BIDDER)?.speak(`My half: ${formatCoins(half)}. Pleasure doing business, partner.`);
      this.session?.reward({ title: `Victor’s half: ${formatCoins(half)}`, detail: 'You went halves on the lot.', coins: half });
    } else bidders.get(RIVAL_BIDDER)?.speak(`At the opening bid? Nothing to split. Keep it, partner.`);
    nudge(RIVAL_PERSON, { trust: 4, warmth: 2, why: 'went halves on a lot with you', day: today, memory: 'we went halves at the saleroom' });
  }

  /** Sold to someone of the room: the record of who took what today (the rival's wins go into his suitcase), the board, the settlement. */
  private soldToRoom(state: Extract<State, { kind: 'calling' }>, to: string, price: number, today: number): void {
    const { lot } = state;
    const { lots: services, auctioneer, bidders } = this.options;
    auctioneer.speak(`Sold! To ${nameOf(to)}, for ${price}.`);
    if (to !== RIVAL_BIDDER && lot.game) this.wonToday.set(to, { lot, price, day: today });
    const winner = bidders.get(to);
    winner?.gesture(to === RIVAL_BIDDER ? 'fistPump' : 'clap');
    if (to === RIVAL_BIDDER && lot.game) {
      // What he wins goes into his suitcase; it counts against the player only if they were bidding.
      const taken = { game: lot.game, price };
      if (state.youBid) services.rival.tookOne(today, taken);
      else services.rival.keep(today, taken);
      if (state.youBid) winner?.speak(`Better luck next time. You'll find it on my table on Front Street.`);
    }
    this.options.board.show({ kind: 'lot', number: lot.number, of: this.lots?.length ?? lot.number, title: lot.title, estimate: lot.estimate, bid: price, leader: nameOf(to), status: 'SOLD', you: false });
    this.settle(lot, { to, price });
  }

  private payFor(lot: AuctionLot, price: number, day: number): TxResult {
    const { tx, auction, sealed } = this.options.lots;
    const settle = () => auction.settle(day, lot.number, { to: YOU, price });
    if (lot.game) return tx.winAuctionLot(lot.game, price, SALEROOM_WHERE, settle);
    if (lot.sealed) {
      const carton = lot.sealed;
      return tx.buySealedLot(price, () => {
        sealed.add({ ...carton, price }, SALEROOM_WHERE, price, day);
        settle();
      });
    }
    return { ok: false, reason: 'unavailable' };
  }

  private settle(lot: AuctionLot, result: { to: string; price: number }): void {
    this.options.lots.auction.settle(this.options.day(), lot.number, result);
    this.next();
  }

  /** On to the next lot after a pause (the board keeps the last result up meanwhile). */
  private next(): void {
    const day = this.options.day();
    const next = this.lots?.find((l) => !this.options.lots.auction.resultOf(day, l.number));
    if (!next) {
      this.options.auctioneer.speak('That concludes today’s sale. Thank you all.');
      this.idle();
      return;
    }
    this.state = { kind: 'between', wait: AUCTION.pause, lot: next };
    // The stand changes after a moment: the lot just sold stays up while the room claps.
    window.setTimeout(() => {
      if (this.live && this.state.kind === 'between' && this.state.lot === next) this.options.stand.show(next);
    }, 2000);
  }

  /** The day's results on the board, the sale over. */
  private showResults(day: number): void {
    const { auction } = this.options.lots;
    this.options.stand.show(null);
    this.peopleIn(false);
    this.options.board.show({
      kind: 'notice',
      title: 'TODAY’S RESULTS',
      lines: (this.lots ?? []).map((l) => {
        const r = auction.resultOf(day, l.number);
        return `${l.number}. ${l.title}: ${!r || r.to === 'passed' ? 'passed' : `${r.price} (${nameOf(r.to)})`}`;
      }),
    });
  }

  /** No sale today: the next one, and its lots once known. */
  private preview(day: number): void {
    const next = nextAuctionDay(day);
    const inDays = next - day;
    const head = `market day ${next} · ${inDays === 1 ? 'tomorrow' : `in ${inDays} days`}`;
    this.peopleIn(false);
    this.options.stand.show(null);
    this.options.board.show({ kind: 'notice', title: 'NEXT SALE', lines: [head] });
    void this.options.lots.auction.lotsFor(next).then((lots) => {
      if (!this.live || this.options.day() !== day) return;
      this.options.board.show({ kind: 'notice', title: 'NEXT SALE', lines: [head, ...lots.map((l) => `${l.number}. ${l.title}`)] });
    }, () => undefined);
  }

  /** The room's bidders come in for a sale and go home after. */
  private peopleIn(present: boolean): void {
    for (const [, body] of this.options.bidders) if (body.isPresent !== present) body.setPresent(present);
  }
}

/** What the room calls a bidder ("the player": you). */
function nameOf(id: string): string {
  if (id === YOU) return 'you';
  if (id === RIVAL_BIDDER) return RIVAL_COLLECTOR.short;
  return bidderById(id)?.name ?? id;
}
