import type { Game } from '@/catalog/types';
import type { RivalCollector } from '@/economy/rivalCollector';
import type { NoticeActions } from '@/notices';
import { gameDayRandom } from '@/time/daily';
import { onInteraction } from './conversation';
import { addExtras } from './extras';
import type { TalkExtra } from './talk';
import { dueWords } from './life/due';
import { has } from './perks';
import { PROMISE } from './socialPlan';
import { nudge, standing } from './standing';
import { addThreadSource } from './threads';
import { tierOf, tierRank } from './tiers';
import { COFFEE_PRICE } from '@/economy/pricing';
import { formatCoins } from '@/text/money';
import { espressoOwed, makeWager, payEspresso, playerOwesEspresso, victorOwesEspresso, wagerOpen, welshed } from './street/wager';

/*
 * Victor Crane's side of the social layer (docs/social.md "Victor"): how talking to him lands the day the player
 * beat him (a topic or a chat that lands is respected, a tease is a gloat), his wager offered in conversation (a
 * promise: the loser's espresso), and the arc's end: once he is a close friend he asks the player round to see his
 * collection, and gives them one of his duplicates. The rivalry's own nudges (a copy taken, a copy lost) are in
 * `economy/rivalCollector`.
 */

const VICTOR = 'victor';

/** What the arc's end needs: the rival's file, the collection a duplicate goes into, the notices, the games he may give. */
interface RivalryDeps {
  rival: RivalCollector;
  collection: { owns(id: string): boolean; add(game: Game): void };
  notices: Pick<NoticeActions, 'read' | 'reward'>;
  /** The games he might have a duplicate of (the built-in list). */
  pool: readonly Game[];
  day(): number;
  /** Hears each new game day (an espresso owed too long is welshing on the wager). */
  onNewDay?: (cb: (day: number) => void) => void;
}

/** Wires the rivalry's talk and the collection's invitation. Call once at start-up. */
export function wireRivalry(deps: RivalryDeps): void {
  const { rival } = deps;
  rivalRef = rival;
  onInteraction((id, interaction, outcome, ctx) => {
    if (id !== VICTOR || !rival.beatenOn(ctx.day)) return;
    if (outcome.ok && (interaction === 'topic' || interaction === 'chat')) {
      nudge(VICTOR, { warmth: 4, why: 'respected you being gracious about it', reason: 'gracious', day: ctx.day, memory: 'you were gracious when you won' });
    } else if (interaction === 'tease') {
      nudge(VICTOR, { warmth: -12, why: 'you gloated', reason: 'gloat', day: ctx.day, memory: 'you gloated', memoryWeight: -14 });
    }
  });
  // An espresso owed past its days is a promise broken.
  deps.onNewDay?.((day) => {
    if (welshed(day)) nudge(VICTOR, { ...PROMISE.broken, why: 'you never paid the espresso you owed him', day, memory: 'you welshed on our wager', memoryWeight: -10 });
  });
  // The espresso owed, as a promise in the People book.
  addThreadSource((id, day) => {
    const owed = id === VICTOR ? espressoOwed() : null;
    return owed?.state === 'open' ? [{ person: VICTOR, kind: 'promise', text: 'Buy me the espresso you owe me. A wager is a wager.', due: dueWords(owed.due, day), day: owed.made }] : [];
  });
  // The wager: how it stands in a word, and the espresso the player owes him, bought here.
  addExtras((ctx) => {
    if (ctx.person !== VICTOR) return [];
    const out: TalkExtra[] = [];
    if (playerOwesEspresso()) {
      out.push({
        id: 'victor:espresso',
        group: 'give',
        label: `Buy him the espresso you owe (${formatCoins(COFFEE_PRICE)})`,
        icon: 'coffee',
        fit: 'loves',
        run: () => {
          if (!ctx.session) return { line: 'Later, then. I never forget a debt.' };
          // Settled only once the coins are actually spent (`pay` refuses when the pockets are short).
          let paid = false;
          ctx.session.pay({
            price: COFFEE_PRICE,
            title: 'An espresso for Victor',
            paid: () => {
              paid = true;
              return 'As wagered. He will hear of it.';
            },
          });
          if (!paid) return { line: 'Can’t stretch to an espresso? I’ll wait. Not for ever.' };
          payEspresso();
          // A wager paid is a promise kept: a stamp of trust, whole.
          nudge(VICTOR, { ...PROMISE.kept, raw: true, why: 'you paid your wager like a gentleman', day: ctx.day, memory: 'you paid up', memoryWeight: 8 });
          return { line: 'A debt honoured. Sit down, you can watch me enjoy it.' };
        },
      });
    } else if (victorOwesEspresso()) {
      out.push({ id: 'victor:owes', group: 'talk', label: 'About that espresso you owe me…', run: () => ({ line: 'Yes, yes. It’s behind the counter at the café, under your name. Don’t make a song of it.' }) });
    } else if (wagerOpen()) {
      out.push({ id: 'victor:bet', group: 'talk', label: 'Still on for our bet?', run: () => ({ line: 'Next time I go hunting at the flea market. First to the copy I’m after. Set your alarm.' }) });
    } else if (wagerOffered(ctx.day)) {
      // His wager, offered when the rivalry allows it: never the day he was beaten (that would be a gloat), never by an enemy.
      out.push({
        id: 'victor:wager',
        group: 'invite',
        label: 'Fancy a wager on the next market?',
        icon: 'trophy',
        fit: 'loves',
        run: () => {
          if (!makeWager(ctx.day)) return { line: 'One wager at a time. Settle the last one first.' };
          nudge(VICTOR, { warmth: 3, why: 'likes a sporting bet', reason: 'wager', day: ctx.day, memory: 'you took my wager', memoryWeight: 4 });
          return { line: 'A wager? Next market day, first to the copy I’m after. Loser buys the espresso.' };
        },
      });
    }
    return out;
  });
  addExtras((ctx) => {
    if (ctx.person !== VICTOR || rival.shown || !has(VICTOR, 'showsCollection')) return [];
    return [{
      id: 'victor:collection',
      group: 'invite',
      label: 'Accept his invitation to see his collection',
      run: () => showCollection(deps),
    }];
  });
}

/** Whether Victor would take a wager on `day`: none going, not the day he was beaten, and he is not cold or worse with the player. */
function wagerOffered(day: number): boolean {
  if (wagerOpen() || playerOwesEspresso() || victorOwesEspresso() || rivalRef?.beatenOn(day)) return false;
  const s = standing(VICTOR);
  return tierRank(tierOf(s.warmth, s.trust)) >= tierRank('polite');
}

/** The rival's file, for the wager's offer (set by `wireRivalry`). */
let rivalRef: RivalCollector | null = null;

/** The visit to his collection: a card about it, and a duplicate of his for the player. */
function showCollection(deps: RivalryDeps): { line: string } {
  const { rival, collection, notices, pool } = deps;
  const day = deps.day();
  rival.showCollection();
  const random = gameDayRandom('victor:duplicate', day);
  const unowned = pool.filter((g) => !collection.owns(g.id));
  const gift = unowned[Math.floor(random() * unowned.length)];
  notices.read({
    title: 'Victor’s collection',
    text: 'A third-floor flat by the river, every wall shelved floor to ceiling, the boxes in archival sleeves, a ladder on a rail. Eleven thousand games, catalogued in his father’s handwriting and then his own. He talks for two hours and you do not notice them pass. At the door he says it is the first time anyone has looked at it properly.',
    // The gift is the banner's to tell (it waits for the card): the card says only when there is none.
    ...(gift ? {} : { effect: 'He has nothing you don’t have: he says that is a first, too.' }),
    look: 'note',
  });
  if (gift) {
    collection.add({ ...gift, status: 'owned', condition: 'complete', acquired: { price: 0, where: 'a gift from Victor', day } });
    notices.reward({ title: `A gift from Victor: ${gift.title}`, detail: 'One of his duplicates. In the parcel in the hall.', big: true });
  }
  nudge(VICTOR, { warmth: 5, trust: 5, why: 'showed you his collection', day, memory: 'you came to see my collection', memoryWeight: 20 });
  return { line: 'Tuesday, seven o’clock. Bring nothing. Well… bring an opinion.' };
}
