import type { Game } from '@/catalog/types';
import type { RivalCollector } from '@/economy/rivalCollector';
import type { NoticeActions } from '@/notices';
import { gameDayRandom } from '@/time/daily';
import { onInteraction } from './conversation';
import { addExtras } from './extras';
import type { TalkExtra } from './talk';
import { has } from './perks';
import { nudge } from './standing';
import { COFFEE_PRICE } from '@/economy/pricing';
import { formatCoins } from '@/text/money';
import { makeWager, payEspresso, playerOwesEspresso, victorOwesEspresso, wagerOpen, welshed } from './street/wager';

/*
 * Victor Crane's side of the social layer (docs/social.md "Victor"): how talking to him lands the day the player
 * beat him (a kind word is respected, a gloat makes a nemesis), and the arc's end: once he is a close friend he
 * asks the player round to see his collection, and gives them one of his duplicates. The rivalry's own nudges
 * (a copy taken, a copy lost) are in `economy/rivalCollector`.
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
  onInteraction((id, interaction, outcome, ctx) => {
    if (id !== VICTOR) return;
    // His challenge taken up (and not a gloat on a day he was beaten): a wager on his next hunt at the flea market.
    if (interaction === 'challenge' && outcome.ok && !rival.beatenOn(ctx.day) && makeWager(ctx.day)) {
      nudge(VICTOR, { trust: 2, why: 'likes a sporting bet', reason: 'wager', day: ctx.day, memory: 'you took my wager' });
      return;
    }
    if (!rival.beatenOn(ctx.day)) return;
    if (outcome.ok && (interaction === 'compliment' || interaction === 'talkGames' || interaction === 'chat')) {
      nudge(VICTOR, { warmth: 4, trust: 3, why: 'respected you being gracious about it', reason: 'gracious', day: ctx.day, memory: 'you were gracious when you won' });
    } else if (interaction === 'tease' || interaction === 'challenge') {
      nudge(VICTOR, { warmth: -12, trust: -4, why: 'you gloated', reason: 'gloat', day: ctx.day, memory: 'you gloated', memoryWeight: -14 });
    }
  });
  deps.onNewDay?.((day) => {
    if (welshed(day)) nudge(VICTOR, { warmth: -6, trust: -6, why: 'you never paid the espresso you owed him', day, memory: 'you welshed on our wager', memoryWeight: -10 });
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
        run: () => {
          if (!ctx.session) return { line: 'Later, then. I never forget a debt.' };
          // Settled only once the coins are actually spent (`pay` refuses when the pockets are short).
          let paid = false;
          ctx.session.pay({
            price: COFFEE_PRICE,
            paid: () => {
              paid = true;
              return 'An espresso for Victor, as wagered.';
            },
          });
          if (!paid) return { line: 'Can’t stretch to an espresso? I’ll wait. Not for ever.' };
          payEspresso();
          nudge(VICTOR, { warmth: 5, trust: 3, why: 'you paid your wager like a gentleman', day: ctx.day, memory: 'you paid up', memoryWeight: 5 });
          return { line: 'A debt honoured. Sit down, you can watch me enjoy it.' };
        },
      });
    } else if (victorOwesEspresso()) {
      out.push({ id: 'victor:owes', group: 'talk', label: 'About that espresso you owe me…', run: () => ({ line: 'Yes, yes. It’s behind the counter at the café, under your name. Don’t make a song of it.' }) });
    } else if (wagerOpen()) {
      out.push({ id: 'victor:bet', group: 'talk', label: 'Still on for our bet?', run: () => ({ line: 'Next time I go hunting at the flea market. First to the copy I’m after. Set your alarm.' }) });
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
    effect: gift ? `${gift.title}: a duplicate of his, for you.` : 'He has nothing you don’t have: he says that is a first, too.',
    look: 'note',
  });
  if (gift) {
    collection.add({ ...gift, status: 'owned', condition: 'complete', acquired: { price: 0, where: 'a gift from Victor', day } });
    notices.reward({ title: `A gift from Victor: ${gift.title}`, detail: 'One of his duplicates. In the parcel in the hall.', big: true });
  }
  nudge(VICTOR, { warmth: 5, trust: 5, why: 'showed you his collection', day, memory: 'you came to see my collection', memoryWeight: 20 });
  return { line: 'Tuesday, seven o’clock. Bring nothing. Well… bring an opinion.' };
}
