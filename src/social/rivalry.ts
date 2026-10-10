import type { Game } from '@/catalog/types';
import type { RivalCollector } from '@/economy/rivalCollector';
import type { NoticeActions } from '@/notices';
import { gameDayRandom } from '@/time/daily';
import { onInteraction } from './conversation';
import { addExtras } from './extras';
import { has } from './perks';
import { nudge } from './standing';

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
}

/** Wires the rivalry's talk and the collection's invitation. Call once at start-up. */
export function wireRivalry(deps: RivalryDeps): void {
  const { rival } = deps;
  onInteraction((id, interaction, outcome, ctx) => {
    if (id !== VICTOR || !rival.beatenOn(ctx.day)) return;
    if (outcome.ok && (interaction === 'compliment' || interaction === 'talkGames' || interaction === 'chat')) {
      nudge(VICTOR, { warmth: 4, trust: 3, why: 'respected you being gracious about it', reason: 'gracious', day: ctx.day, memory: 'you were gracious when you won' });
    } else if (interaction === 'tease' || interaction === 'challenge') {
      nudge(VICTOR, { warmth: -12, trust: -4, why: 'you gloated', reason: 'gloat', day: ctx.day, memory: 'you gloated', memoryWeight: -14 });
    }
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
