import type { Game } from '@/catalog/types';
import type { NoticeActions } from '@/notices';
import { borrow, borrowedGames, giveBack, lastPostcard, lastSide, postcardSent, sideTaken } from '@/social/friendsLife';
import { everyone, shortName } from '@/social/people';
import { has } from '@/social/perks';
import { isMet, nudge, standing } from '@/social/standing';
import type { TalkExtra } from '@/social/talk';
import { tierOf, tierRank } from '@/social/tiers';
import { dayStream } from '@/time/daily';
import { tasteScore } from './friendLines';
import { FRIENDS, type FriendPlan } from './friendsPlan';

/*
 * The friends in the social layer (docs/social.md "Friends"): what a conversation with one offers beyond the talk
 * (a game of theirs to borrow, a hand with the furniture, the arcade, a word put in with someone cross with the
 * player), the games borrowed from them going back when due, Inès' postcards, and a game they gave the player
 * that leaves the collection (a memory, and trust lost).
 */

/** How long a game borrowed from a friend stays (game days). */
const BORROW_DAYS = 5;
/** A word put in with someone: once a week per friend, this much warmth. */
const SIDE = { everyDays: 7, warmth: 8 } as const;
/** Inès' postcards: at least this many game days apart, this likely on a day that may bring one; a game inside sometimes. */
const POSTCARD = { gap: 6, odds: 0.3, giftOdds: 0.35 } as const;
/** Where Inès writes from. */
const POSTCARD_PLACES: readonly { place: string; text: string }[] = [
  { place: 'Osaka', text: 'Den Den Town is ten streets of nothing but games. I have lost my mind and most of my luggage allowance. The arcades are SIX floors. Thinking of you and your shelves.' },
  { place: 'Lisbon', text: 'The trams are older than our consoles and the custard tarts are a religion. Found a flea market under a bridge: a box of Master System games, all in Portuguese.' },
  { place: 'Montréal', text: 'Minus eighteen. I have spent two days in a shop that sells nothing but RPGs. The owner knew Chrono Trigger by heart. I may stay.' },
  { place: 'Berlin', text: 'There is a computer games museum here with a wall of consoles, every one I ever wanted. I stood in front of the Neo Geo for an hour. They asked me to move.' },
  { place: 'Edinburgh', text: 'Rain, castle, rain, a second-hand shop with a Mega Drive in the window, rain. Bought it. Don’t tell anyone. It’s raining.' },
];

/** What the friends' side needs of the flat. */
export interface FriendSocialDeps {
  collection: { find(id: string): Game | undefined; add(game: Game): void; owns(id: string): boolean; remove?(id: string): void };
  giftPool?: readonly Game[];
  notices?: Pick<NoticeActions, 'react' | 'reward' | 'slip' | 'read' | 'tip'>;
  journal?: { note(kind: string, text: string, options?: { data?: Readonly<Record<string, string | number | boolean>> }): void };
  day(): number;
}

/** A game of `plan`'s taste the player does not own, drawn from `pool` by `random`, or undefined. */
export function tasteGift(plan: FriendPlan, pool: readonly Game[] | undefined, owns: (id: string) => boolean, random: () => number): Game | undefined {
  const unowned = pool?.filter((g) => !owns(g.id) && tasteScore(plan.taste, g) >= 2) ?? [];
  return unowned[Math.floor(random() * unowned.length)];
}

/** What a conversation with friend `plan` offers beyond the talk, now. */
export function friendExtras(plan: FriendPlan, deps: FriendSocialDeps, say: (line: string) => void): TalkExtra[] {
  const id = plan.id;
  const out: TalkExtra[] = [];
  if (has(id, 'lendsGames')) {
    const lent = borrowedGames().find((b) => b.from === id);
    out.push({
      id: `${id}:borrow`,
      group: 'ask',
      label: `Borrow one of ${plan.name}’s games`,
      disabled: () => (lent ? `You have their ${lent.title} still` : null),
      run: () => lendToPlayer(plan, deps),
    });
  }
  if (has(id, 'helpsCarry')) {
    out.push({
      id: `${id}:carry`,
      group: 'ask',
      label: 'Give me a hand with the furniture?',
      run: () => {
        return { line: id === 'marco' ? 'Point me at it. I moved a piano once. Well, I watched someone move a piano.' : 'Sure. You lift, I’ll supervise. Kidding! Which one?' };
      },
    });
  }
  if (has(id, 'arcadePartner')) {
    out.push({ id: `${id}:arcade`, group: 'invite', label: 'Fancy the arcade sometime?', run: () => ({ line: 'Duel, Saturday. Bring coins: I paid last time. Allegedly.' }) });
  }
  if (has(id, 'takesSide')) {
    const day = deps.day();
    const cross = coldest(id);
    if (cross) {
      out.push({
        id: `${id}:side`,
        group: 'ask',
        label: `Could you have a word with ${shortName(cross)}?`,
        disabled: () => (day - lastSide(id) < SIDE.everyDays ? 'They put in a word this week already' : null),
        run: () => {
          sideTaken(id, day);
          nudge(cross, { warmth: SIDE.warmth, why: `${plan.name} put in a good word for you`, day });
          say(`Leave it with me. I’ll tell ${shortName(cross)} you’re not as bad as all that.`);
          return {};
        },
      });
    }
  }
  return out;
}

/** The coldest person the player has met (cold or worse), not a friend from before, for a word put in. */
function coldest(friend: string): string | null {
  let worst: { id: string; warmth: number } | null = null;
  for (const p of everyone()) {
    if (p.id === friend || p.group === 'friends' || !isMet(p.id)) continue;
    const s = standing(p.id);
    if (tierRank(tierOf(s.warmth, s.trust)) > tierRank('cold')) continue;
    if (!worst || s.warmth < worst.warmth) worst = { id: p.id, warmth: s.warmth };
  }
  return worst?.id ?? null;
}

/** `lendsGames`: a game of their taste the player does not have, in the collection for `BORROW_DAYS` days. */
function lendToPlayer(plan: FriendPlan, deps: FriendSocialDeps): { line: string } {
  const day = deps.day();
  const game = tasteGift(plan, deps.giftPool, (id) => deps.collection.owns(id), dayStream(`friendLends:${plan.id}:${day}`));
  if (!game) return { line: 'Honestly? You’ve got everything I’d lend you. It’s a bit annoying.' };
  borrow({ gameId: game.id, title: game.title, from: plan.id, dueDay: day + BORROW_DAYS });
  deps.collection.add({ ...game, status: 'owned', condition: 'complete', acquired: { price: 0, where: `borrowed from ${plan.name}`, day } });
  nudge(plan.id, { trust: 2, why: 'lent you a game', day, memory: `I lent you ${game.title}`, memoryWeight: 4 });
  deps.notices?.slip({ title: `Borrowed ${game.title}`, detail: `From ${plan.name}, ${BORROW_DAYS} days: in the parcel in the hall.` });
  deps.journal?.note('visit', `Borrowed ${game.title} from ${plan.name}`, { data: { who: plan.id, id: game.id } });
  return { line: `Take my ${game.title}. ${BORROW_DAYS} days, and I want it back with the manual, thank you.` };
}

/** A new game day: what is borrowed and due goes back (their note on the mat); one gone from the collection is forgotten. */
export function returnBorrowed(deps: FriendSocialDeps): void {
  const day = deps.day();
  for (const b of borrowedGames()) {
    if (!deps.collection.find(b.gameId)) {
      giveBack(b.gameId);
      continue;
    }
    if (day < b.dueDay) continue;
    giveBack(b.gameId);
    // Only the borrowed copy goes back (one the player bought meanwhile replaced it: theirs stays).
    if (deps.collection.find(b.gameId)?.acquired?.where?.startsWith('borrowed from')) deps.collection.remove?.(b.gameId);
    const name = FRIENDS.find((f) => f.id === b.from)?.name ?? 'Your friend';
    nudge(b.from, { trust: 2, warmth: 1, why: 'got their game back on time', day, reason: 'gaveBack' });
    deps.notices?.read({ title: `${b.title} went back to ${name}`, text: `${name} picked it up on the landing: “Thanks for looking after it! Same time next week?”`, look: 'note' });
    deps.journal?.note('visit', `${b.title} back to ${name}`, { data: { who: b.from } });
  }
}

/** A new game day (the player at home): now and then, a postcard from Inès, sometimes with a game (`postcards`). */
export function maybePostcard(deps: FriendSocialDeps): void {
  const day = deps.day();
  const ines = FRIENDS.find((f) => f.id === 'ines');
  if (!ines || !has('ines', 'postcards') || day - lastPostcard() < POSTCARD.gap) return;
  const random = dayStream(`postcard:${day}`);
  if (random() >= POSTCARD.odds) return;
  postcardSent(day);
  const card = POSTCARD_PLACES[Math.floor(random() * POSTCARD_PLACES.length)]!;
  const gift = random() < POSTCARD.giftOdds ? tasteGift(ines, deps.giftPool, (id) => deps.collection.owns(id), random) : undefined;
  if (gift) deps.collection.add({ ...gift, status: 'owned', condition: 'noManual', acquired: { price: 0, where: `a gift from ${ines.name}`, day } });
  deps.notices?.read({
    title: `A postcard from ${card.place}`,
    text: card.text,
    effect: gift ? `A small parcel came with it: ${gift.title}. It waits in your parcel in the hall.` : undefined,
    look: 'postcard',
    place: card.place,
    from: ines.name,
  });
  deps.journal?.note('visit', `Postcard from ${ines.name}, ${card.place}`, { data: { who: ines.id } });
}

/**
 * Watches the games the friends gave: one that leaves the collection (sold, swapped, given away) is a memory and a
 * loss of trust with the friend who gave it. Returns the check to run on every collection change.
 */
export function watchGifts(deps: { games(): readonly Game[]; day(): number }): () => void {
  const giver = (g: Game): FriendPlan | undefined => {
    const name = /^a gift from (.+)$/i.exec(g.acquired?.where ?? '')?.[1];
    return name ? FRIENDS.find((f) => f.name === name) : undefined;
  };
  let gifts = new Map(deps.games().flatMap((g) => (giver(g) ? [[g.id, g] as const] : [])));
  return () => {
    const now = new Map(deps.games().map((g) => [g.id, g] as const));
    for (const [id, game] of gifts) {
      if (now.has(id)) continue;
      const plan = giver(game);
      if (plan) nudge(plan.id, { warmth: -8, trust: -10, why: `heard you got rid of the ${game.title} they gave you`, day: deps.day(), memory: `you got rid of the ${game.title} I gave you`, memoryWeight: -12 });
    }
    gifts = new Map([...now].filter(([, g]) => giver(g)));
  };
}
