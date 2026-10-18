import type { AuctionHouse, AuctionLot, Consignment } from './AuctionHouse';
import { lotSeed } from './AuctionHouse';
import { RIVAL_BIDDER, YOU, bidderById, drawInterest, unseenHammer } from './auction';
import { RIVAL_COLLECTOR } from './rivalCollector';
import { consignNet } from './pricing';
import type { Transactions } from './Transactions';
import type { Game } from '@/catalog/types';
import { gameDayRandom } from '@/time/daily';
import { formatCoins } from '@/text/money';

/*
 * A COPY OF THE PLAYER'S UNDER THE HAMMER (docs/economy.md "Consigning a copy"): how its sale is settled, whether the
 * player sat in the room for it (`saleroom/Saleroom`) or not (`settleConsignmentsDaily`, the morning after: the house
 * posts the cheque). The interest is the room's own draw, seeded by the copy, so both tell the same story.
 */

/** What the player is told of their copy's sale: a slip in the room, the house's letter otherwise. */
interface ConsignmentNews {
  title: string;
  detail: string;
  /** Coins handed over (none when it was passed and came home). */
  coins?: number;
}

/** The rival keeps what he wins (his suitcase on Front Street). */
interface RivalKeeps {
  keep(day: number, taken: { game: Game; price: number }): void;
}

/** Who took it, said the way the room says it. */
function buyer(id: string): string {
  if (id === RIVAL_BIDDER) return RIVAL_COLLECTOR.short;
  return bidderById(id)?.name ?? 'a bidder';
}

/**
 * Settles the copy entered for `day`: `hammer` is who took it for how much (null: passed; `reserve` its opening bid, at
 * which the house buys in a passed copy that cannot come home). Pays the house's cheque or
 * brings the copy home, takes it off the waiting list, and says what to tell the player.
 */
export function settleConsignment(house: AuctionHouse, tx: Transactions, entry: Consignment, hammer: { to: string; price: number } | null, reserve: number, rival?: RivalKeeps): ConsignmentNews {
  house.settleConsignment(entry.day);
  const { game } = entry;
  if (!hammer || hammer.to === YOU) {
    const back = tx.consignmentBack(game);
    if (back.ok || back.reason !== 'owned') return { title: `Passed: ${game.title}`, detail: 'Nobody in the room would open it. It comes home in the parcel.' };
    // A copy of it bought again meanwhile: the house buys the passed one in at its opening bid.
    hammer = { to: 'house', price: reserve };
  }
  if (hammer.to === RIVAL_BIDDER) rival?.keep(entry.day, { game, price: hammer.price });
  const net = consignNet(Math.max(1, hammer.price), game);
  tx.consignmentSold(net);
  const who = hammer.to === 'house' ? 'the house' : buyer(hammer.to);
  return { title: `Sold: ${game.title}`, detail: `It went to ${who}${hammer.price ? ` for ${formatCoins(hammer.price)}` : ''}. The house’s cheque, after its cut:`, coins: net };
}

/** How the room would have taken the lot, called without the player in it (the same interest `Saleroom.call` draws). */
function unseen(lot: AuctionLot, day: number, keenness: number): { to: string; price: number } | null {
  const interest = drawInterest({ estimate: lot.estimate, reserve: lot.reserve, ...(lot.platform ? { platform: lot.platform } : {}), star: false }, gameDayRandom(lotSeed(lot), day), keenness);
  return unseenHammer(interest, lot.reserve);
}

interface DailyDeps {
  house: AuctionHouse;
  tx: Transactions;
  today: { readonly gameDay: number; onNewGameDay(cb: (day: number) => void): () => void };
  notices: { reward(notice: { title: string; detail: string; coins?: number }): void };
  rival?: RivalKeeps & { readonly keenness: number };
}

/**
 * A sale day gone by with the player's copy still waiting (they were not in the room, or left before it was called):
 * the house settles it as the room would have, and its letter says how it went. At start and every new game day.
 */
export function settleConsignmentsDaily({ house, tx, today, notices, rival }: DailyDeps): void {
  const settling = new Set<number>();
  const settle = (): void => {
    for (const entry of house.waiting) {
      if (entry.day >= today.gameDay || settling.has(entry.day)) continue;
      settling.add(entry.day);
      void house.consignedLot(entry).then((lot) => {
        settling.delete(entry.day);
        if (!house.waiting.includes(entry)) return;
        const news = settleConsignment(house, tx, entry, unseen(lot, entry.day, rival?.keenness ?? 1), lot.reserve, rival);
        notices.reward({ title: `The saleroom: ${news.title}`, detail: news.detail, ...(news.coins ? { coins: news.coins } : {}) });
      }, () => settling.delete(entry.day));
    }
  };
  settle();
  today.onNewGameDay(settle);
}

/** The sale a copy goes into, as the sheet says it. */
function saleWhen(day: number, today: number): string {
  const inDays = day - today;
  return inDays === 1 ? 'tomorrow’s sale' : `Sunday’s sale, in ${inDays} days`;
}

/**
 * The saleroom's consignment sheet, as a buyer of the WE BUY desk's panel (`ui/SellPanel`): each copy at the room's
 * estimate; the press enters it for the next sale (the copy leaves the collection now, the coins come with the hammer).
 * One copy a sale; under `AUCTION.consign.min` of estimate the house sends the player to the desk.
 */
export function consignBuyer(house: AuctionHouse, tx: Transactions, today: { readonly gameDay: number }, minimum: number) {
  const estimate = (game: Game, views: Parameters<AuctionHouse['estimateFor']>[1] | undefined): number => (views === undefined ? 0 : house.estimateFor(game, views).estimate);
  return {
    heading: 'Enter a copy',
    who: { name: 'The clerk' },
    greeting: '“One of yours for the next sale? Let me see what the room might make of it.”',
    blurb: 'One copy of yours a sale goes under the hammer with the room’s lots. The house takes its cut and posts the rest after the sale.',
    bonus: 0,
    verb: 'Enter',
    paysLater: true as const,
    offer: estimate,
    armed: (offer: number) => `Enter it? (about ${formatCoins(offer)})`,
    refuse: (game: Game, views: Parameters<AuctionHouse['estimateFor']>[1] | undefined): string | null => {
      const day = house.consignDay(today.gameDay);
      const waiting = house.consignedFor(day);
      if (waiting) return `The ${saleWhen(day, today.gameDay)} has your ${waiting.game.title} already. One a sale.`;
      if (game.repro) return '“A reproduction? Not in this room, I’m afraid.”';
      if (views !== undefined && estimate(game, views) < minimum) return '“That one would go for pennies here. Try the WE BUY desk at the market.”';
      return null;
    },
    sell: (game: Game) => tx.consignToSale(game, () => house.consign(game, today.gameDay)),
    soldLine: (game: Game) => `“${game.title}, entered for ${saleWhen(house.consignDay(today.gameDay), today.gameDay)}. Come and watch it go, if you like.”`,
  };
}
