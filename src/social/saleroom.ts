import { addExtras } from './extras';
import { has } from './perks';
import { countedToday, meet, nudge } from './standing';
import { findPerson, shortName } from './people';
import type { TalkExtra } from './talk';
import type { PersonId } from './types';
import { formatCoins } from '@/text/money';

/*
 * The saleroom's regulars as people (docs/social.md "The saleroom"): Doris, Mr Okafor, Mrs Pettibone, Lenny (their
 * ids are `economy/auction`'s bidders'). A friend leaves a lot to the player (one on the wishlist, or any lot the day
 * the player asked); a close one tips the star lot and sells one lot they won at what they paid. Being outbid by the
 * player costs a little warmth (a competitive one enjoys the fight).
 */

/** The regulars this covers (Victor, the rival, is his own story: `rivalCollector`). */
const REGULARS: readonly PersonId[] = ['doris', 'okafor', 'pettibone', 'lenny'];

/** Whether `bidder` leaves a lot to the player: a friend who knows the player wants it (the wishlist) or was asked today. */
export function leavesLotToYou(bidder: string, day: number, wanted: boolean): boolean {
  if (!REGULARS.includes(bidder) || !has(bidder, 'dropsOut')) return false;
  return wanted || countedToday(bidder, 'leaveIt', day);
}

/** The player won a lot `bidders` had bid on: each takes it their way (once a day). */
export function outbidBy(bidders: Iterable<string>, day: number): void {
  for (const id of bidders) {
    if (!REGULARS.includes(id)) continue;
    const competitive = findPerson(id)?.traits.includes('competitive') ?? false;
    nudge(id, competitive ? { warmth: 1, reason: 'outbid', day, why: 'enjoyed the fight' } : { warmth: -2, reason: 'outbid', day, why: 'outbid by you' });
  }
}

/** What the saleroom's scene tells the conversation: the star lot today, and what each regular won. */
interface SaleroomFacts {
  starLot(): string | null;
  /** The lot `bidder` won today that is still theirs to sell on, or null. */
  wonBy(bidder: string): { title: string; price: number } | null;
  /** Buys it off them at `price`; the result's reason when it could not be done. */
  buyFrom(bidder: string): { ok: true } | { ok: false; why: string };
}

/** The saleroom's entries in a regular's conversation, given what the room knows (`furnishSaleroom` registers it while built). */
export function saleroomExtras(facts: SaleroomFacts): () => void {
  return addExtras(({ person, day, session }): TalkExtra[] => {
    if (!REGULARS.includes(person)) return [];
    meet(person, day);
    const name = shortName(person);
    const out: TalkExtra[] = [
      {
        id: 'leaveIt',
        group: 'ask',
        label: 'Leave me the lots I bid on today?',
        disabled: () => (countedToday(person, 'leaveIt', day) ? 'Asked already today' : null),
        run: () => {
          if (!has(person, 'dropsOut')) {
            nudge(person, { warmth: -1, day, why: 'thought it a cheek' });
            return { line: 'Every bidder for themselves, dear. That’s the fun of it.' };
          }
          nudge(person, { reason: 'leaveIt', day });
          return { line: 'For you? All right. I’ll keep my paddle down when you bid.' };
        },
      },
    ];
    if (has(person, 'starLotTip')) {
      out.push({
        id: 'starTip',
        group: 'ask',
        label: 'Any tip for today?',
        run: () => {
          const star = facts.starLot();
          return { line: star ? `Between us: the ${star}. That’s the lot to watch. Victor wants it, so bid early or not at all.` : 'Nothing worth a tip today. Save your coins.' };
        },
      });
    }
    const won = has(person, 'tradePrice') ? facts.wonBy(person) : null;
    if (won) {
      out.push({
        id: 'tradePrice',
        group: 'trade',
        label: `Buy the ${won.title} off ${name} (${formatCoins(won.price)}, what they paid)`,
        disabled: () => (countedToday(person, 'tradePrice', day) ? 'Once a sale' : null),
        run: () => {
          const result = facts.buyFrom(person);
          if (!result.ok) return { line: result.why };
          nudge(person, { trust: 2, reason: 'tradePrice', day, why: 'did you a favour' });
          session?.reward({ title: `Bought ${won.title} from ${name}`, detail: 'It goes in the parcel: unpack it in the hallway at home.', coins: -won.price });
          return { line: 'There. Trade price, because it’s you. Don’t tell the room.' };
        },
      });
    }
    return out;
  });
}
