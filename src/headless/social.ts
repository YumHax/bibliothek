/*
 * What `scripts/social-sim.mjs` runs (part of `npm run typecheck`, docs/checks.md "Social sim"): simulated players
 * living with the cast of `social/people` for some game days, through the real rules (`conversation.choicesFor` /
 * `say`, the standing, the drift, the perks, promises kept and broken), a careless clicker on the first day, and the
 * cast's coverage (every deep person has topics with answers; no choice the engine offers is a dead end). The store is
 * module-level: the script bundles this module afresh for each run.
 */
import { fnv1a, hashInts, mulberry32, shuffled } from '@/random';
import { beginConversation, choicesFor, endConversation, factSays, newsPool, playerPool, say, socialPool, topicHere, type Choice, type Conversation, type TalkContext } from '@/social/conversation';
import { MOOD_SAYS } from '@/social/moodLines';
import { BIRTHDAY_LINES, CALLBACK_LINES, COLD_LINES, GRUDGE_LINES, HELD_LINES, HOSTILE_LINES, KEEPSAKE_LINES, MOOD_OPENINGS, PHONE_FAREWELL_LINES, PHONE_HELLO_LINES, PHONE_LEAVING_LINES, PHONE_TWICE_LINES, REPEAT_LINES } from '@/social/socialLines';
import { voiced } from '@/social/voices';
import { extrasFor } from '@/social/extras';
import { FAVOURS } from '@/social/life/favoursPlan';
import { addNews } from '@/social/news';
import { everyone } from '@/social/people';
import { effectsOf } from '@/social/perks';
import { INTERACTIONS, PROMISE, TALK, TIERS, type NewsTag } from '@/social/socialPlan';
import { hasNumber, meet, nudge, setStanding, settleDay, standing } from '@/social/standing';
import { atLeast, tierOf } from '@/social/tiers';
import type { Fit, GiftKind, InteractionId, LineKey, PersonCard, SocialGroup, SocialPlace } from '@/social/types';

/** How a simulated player lives: whom they meet, how well they read faces, how much they give and promise. */
interface Profile {
  meet: Record<SocialGroup, number>;
  /** Odds a choice is the best-looking one on offer (their face read right); else one at random. */
  readsFaces: number;
  /** Odds a meeting comes with a gift they like, a game given; odds a favour they ask is said yes to (a promise). */
  gift: number;
  game: number;
  promise: number;
  /** Odds a promise made is kept. */
  keeps: number;
  /** They ask for a number when it is offered. */
  asksNumbers: boolean;
  /** Odds a meeting with a light person (a clerk, a stallholder) comes with a deal: a copy bought, a coffee (`TRADE`). */
  trade: number;
  /** Odds a meeting with the rival comes on a day the player beat him to a copy (`RivalCollector.beatenOnce`: respect). */
  beatsRival: number;
}

/**
 * A deal with a light person, as the trades' own systems move them (`social/market` MARKET_SOCIAL.buy: a copy bought
 * is +3 warmth +1 trust, the first few a day): what a regular earns that talk does not.
 */
const TRADE = { warmth: 3, trust: 1 } as const;

/**
 * The co-owners' meeting (`building/coproPlan` COPRO_PLAN.every): each resident met who has a stance asks for the
 * player's vote as a promise (`social/conflicts/votes`), about one in two.
 */
const MEETING = { every: 14, asks: 0.35, oneCamp: 0.5 } as const;

/** Beating the rival to a copy, as `economy/rivalCollector.beatenOnce` moves him: it stings, but he respects it. */
const BEATEN = { warmth: -3, trust: 4 } as const;

export const PROFILES: Record<'typical' | 'diligent', Profile> = {
  typical: { meet: { building: 0.35, friends: 0.25, street: 0.3, market: 0.25, arcade: 0.2, rivals: 0.12 }, readsFaces: 0.75, gift: 1 / 6, game: 1 / 40, promise: 0.6, keeps: 0.85, asksNumbers: false, trade: 0.5, beatsRival: 0.15 },
  diligent: { meet: { building: 1, friends: 1, street: 1, market: 1, arcade: 1, rivals: 1 }, readsFaces: 1, gift: 1 / 2, game: 1 / 10, promise: 1, keeps: 1, asksNumbers: true, trade: 1, beatsRival: 0.3 },
};

/** Where each group is talked to. */
const PLACE: Record<SocialGroup, SocialPlace> = { building: 'stairs', friends: 'flat', street: 'street', market: 'market', arcade: 'arcade', rivals: 'saleroom' };

/** The fits best first: a player who reads faces takes the first. */
const FIT_ORDER: readonly Fit[] = ['loves', 'likes', 'meh', 'dislikes'];

/** What the player's news is about, drawn for the sim's news (`news.addNews`). */
const NEWS_TAGS: readonly NewsTag[] = ['games', 'collection', 'arcade', 'bargain', 'cat', 'family', 'building', 'party', 'street', 'music'];

/** A seeded draw: the game's own generator (`@/random`), so the sim and the play draw alike. */
const rng = mulberry32;

/** What a person's sim ended on. */
export interface SimRow {
  id: string;
  group: SocialGroup;
  deep: boolean;
  warmth: number;
  trust: number;
  tier: string;
  perks: string[];
  /** Perks still out of reach (`key@tier`). */
  missing: string[];
}

function isDeep(card: PersonCard): boolean {
  return card.depth === 'deep';
}

function likedGift(card: PersonCard): GiftKind {
  return card.likes?.find((g) => g !== 'game' && g !== 'coins') ?? 'croissant';
}

/** The talk choice a player picks: the best-looking one when they read the face, else any. */
function pickTalk(choices: readonly Choice[], readsFaces: number, rand: () => number): Choice | null {
  const talk = choices.filter((c) => c.group === 'talk');
  if (!talk.length) return null;
  if (rand() >= readsFaces) return talk[Math.floor(rand() * talk.length)] ?? null;
  const best = Math.min(...talk.map((c) => FIT_ORDER.indexOf(c.fit)));
  const top = talk.filter((c) => FIT_ORDER.indexOf(c.fit) === best);
  return top[Math.floor(rand() * top.length)] ?? null;
}

/**
 * The day's favours asked, as `life/favours` draws them: someone met at Acquaintance or warmer, without one going
 * and `FAVOURS.gapDays` after their last, asks with `FAVOURS.odds`; `FAVOURS.perDay` across everyone at most.
 */
function drawFavours(cast: readonly PersonCard[], day: number, rand: () => number, free: Map<string, number>): Set<string> {
  const asked = new Set<string>();
  // As `life/favours` draws them: in a fresh order each day.
  const order = shuffled(rand, cast);
  for (const card of order) {
    if (asked.size >= FAVOURS.perDay) break;
    const s = standing(card.id);
    if (s.met === null || !atLeast(tierOf(s.warmth, s.trust), 'acquaintance') || day < (free.get(card.id) ?? 0)) continue;
    if (rand() >= Math.min(FAVOURS.odds.max, FAVOURS.odds.base + s.warmth * FAVOURS.odds.perWarmth)) continue;
    asked.add(card.id);
    free.set(card.id, day + FAVOURS.gapDays);
  }
  return asked;
}

/** One meeting: a conversation of the day (its exchanges), maybe a gift, the favour they asked if any. */
function meeting(card: PersonCard, profile: Profile, ctx: TalkContext, rand: () => number, asked: boolean): void {
  meet(card.id, ctx.day);
  const convo = beginConversation(card.id, ctx);
  for (let i = 0; i < TALK.exchanges && !convo.leaving; i++) {
    const choices = choicesFor(card.id, ctx, convo);
    const ask = choices.find((c) => c.interaction === 'askNumber');
    if (ask && profile.asksNumbers) say(card.id, ask, ctx, convo);
    const choice = pickTalk(choices, profile.readsFaces, rand);
    if (!choice) break;
    say(card.id, choice, ctx, convo);
  }
  const s = standing(card.id);
  const tier = tierOf(s.warmth, s.trust);
  if (rand() < profile.gift) say(card.id, { key: 'give:gift', interaction: 'giveGift' }, ctx, convo, { gift: likedGift(card) });
  if (atLeast(tier, 'acquaintance') && rand() < profile.game) {
    const game = { title: 'A game they like', platform: card.tastes?.platforms?.[0] ?? 'nes', genres: card.tastes?.genres ? [...card.tastes.genres] : [] };
    say(card.id, { key: 'give:game', interaction: 'giveGame' }, ctx, convo, { game });
  }
  endConversation(card.id, ctx, convo);
  if (card.group === 'rivals' && card.id === 'victor' && rand() < profile.beatsRival) nudge(card.id, { warmth: BEATEN.warmth, trust: BEATEN.trust, why: 'stung, but you beat him fairly', day: ctx.day, reason: 'beaten' });
  if (!isDeep(card) && rand() < profile.trade) nudge(card.id, { warmth: TRADE.warmth, trust: TRADE.trust, why: 'a regular', day: ctx.day, reason: 'trade' });
  // The favour they asked, said yes to: a promise (docs/social.md "Promises"), kept or broken.
  if (asked && rand() < profile.promise) {
    const kept = rand() < profile.keeps;
    const move = kept ? PROMISE.kept : PROMISE.broken;
    nudge(card.id, { warmth: move.warmth, trust: move.trust, raw: kept, why: kept ? 'you kept your word' : 'you broke your word', day: ctx.day, reason: 'promise' });
  }
}

/** Now and then a piece of news to tell (a game found, something of the street's). */
function newsOf(day: number, rand: () => number, cast: readonly PersonCard[]): void {
  const tag = NEWS_TAGS[Math.floor(rand() * NEWS_TAGS.length)]!;
  const fan = cast[Math.floor(rand() * cast.length)];
  const game = tag === 'games' || tag === 'collection' ? { id: `sim-${day}`, title: 'A find', platform: fan?.tastes?.platforms?.[0] ?? 'nes', genres: fan?.tastes?.genres ? [...fan.tastes.genres] : [] } : undefined;
  addNews({ id: `sim:${day}`, say: 'Guess what happened!', tags: [tag], game, icon: 'star', day });
}

/** `days` game days of `profile`'s player; returns everyone's standing at the end. */
export function simulate(profile: Profile, days: number, seed: number): SimRow[] {
  const cast = everyone();
  // A stream per person: someone joining the cast does not reshuffle everyone else's draws.
  const streams = new Map(cast.map((card) => [card.id, rng(hashInts(seed, fnv1a(card.id)))]));
  const world = rng(hashInts(seed, fnv1a('news')));
  const favourFree = new Map<string, number>();
  for (let day = 1; day <= days; day++) {
    settleDay(day);
    if (day % 2 === 0) newsOf(day, world, cast);
    const asked = drawFavours(cast, day, world, favourFree);
    if (day % MEETING.every === 0) {
      for (const card of cast) {
        if (!card.door || standing(card.id).met === null || !atLeast(tierOf(standing(card.id).warmth, standing(card.id).trust), 'acquaintance')) continue;
        // Asked only if met while the ballot is open (three days); promised to one camp of each resolution, not both.
        const metInWindow = 1 - (1 - profile.meet.building) ** 3;
        if (world() >= MEETING.asks * metInWindow || world() >= profile.promise * MEETING.oneCamp) continue;
        const kept = world() < profile.keeps;
        const move = kept ? PROMISE.kept : PROMISE.broken;
        nudge(card.id, { warmth: move.warmth, trust: move.trust, raw: kept, why: kept ? 'you voted with them, as you said' : 'you said you’d vote with them', day, reason: 'vote' });
      }
    }
    for (const card of cast) {
      const rand = streams.get(card.id)!;
      if (rand() >= profile.meet[card.group]) continue;
      const ctx: TalkContext = { day, hour: 9 + rand() * 11, place: PLACE[card.group], rand };
      meeting(card, profile, ctx, rand, asked.has(card.id));
    }
  }
  return cast.map((card) => {
    const s = standing(card.id);
    const { active, next } = effectsOf(card.id);
    return { id: card.id, group: card.group, deep: isDeep(card), warmth: s.warmth, trust: s.trust, tier: tierOf(s.warmth, s.trust), perks: active.filter((e) => !e.down).map((e) => e.key), missing: next.map((e) => `${e.key}@${e.at}`) };
  });
}

/** What clicking anything did to one person on day 1. */
export interface CarelessRow {
  id: string;
  /** Warmth at the end less at the start. */
  gain: number;
  /** The lowest warmth reached less the start (negative: it cost warmth on the way). */
  lowest: number;
}

/**
 * A careless clicker on day 1: `times` choices in a row with each deep person (everyone when the cast has no deep
 * one yet), any choice offered but those that take a long press (an insult), a new conversation whenever one ends.
 */
export function careless(times: number, seed: number): CarelessRow[] {
  const cast = everyone();
  const deep = cast.filter(isDeep);
  const out: CarelessRow[] = [];
  for (const card of deep.length ? deep : cast) {
    const rand = rng(hashInts(seed, fnv1a(card.id)));
    const ctx: TalkContext = { day: 1, hour: 14, place: PLACE[card.group], rand };
    meet(card.id, 1);
    const start = standing(card.id).warmth;
    let lowest = start;
    let convo: Conversation = beginConversation(card.id, ctx);
    for (let i = 0; i < times; i++) {
      let choices = choicesFor(card.id, ctx, convo).filter((c) => !c.once);
      if (!choices.length) {
        endConversation(card.id, ctx, convo);
        convo = beginConversation(card.id, ctx);
        choices = choicesFor(card.id, ctx, convo).filter((c) => !c.once);
      }
      const choice = choices[Math.floor(rand() * choices.length)];
      if (!choice) break;
      say(card.id, choice, ctx, convo);
      lowest = Math.min(lowest, standing(card.id).warmth);
    }
    endConversation(card.id, ctx, convo);
    out.push({ id: card.id, gain: Math.round((standing(card.id).warmth - start) * 10) / 10, lowest: Math.round((lowest - start) * 10) / 10 });
  }
  return out;
}

/** The tiers the coverage walks every person through (the warm side: where the menu has the most to offer). */
const COVERAGE_TIERS = ['polite', 'acquaintance', 'friendly', 'friend', 'close'] as const;

/**
 * The cast's coverage, as problems in words: a deep person with fewer than four topics, a topic with no answer or no
 * words, and any choice the engine offers that is a dead end (no answer said, a number asked that is not given).
 * Also counts the place entries the features registered headless (none unless a feature starts at import).
 */
export function coverage(): { problems: string[]; deep: number; extras: number } {
  const problems: string[] = [];
  const cast = everyone();
  let extras = 0;
  for (const card of cast) {
    const topics = card.topics ?? [];
    if (isDeep(card) && topics.length < 4) problems.push(`${card.id}: a deep person with ${topics.length} topic(s), 4 at least`);
    for (const t of topics) {
      if (!t.answers.length || t.answers.some((a) => !a.trim())) problems.push(`${card.id}: topic ${t.id} has no answer`);
      if (!t.say.trim() || !t.name.trim()) problems.push(`${card.id}: topic ${t.id} has no words (say, name)`);
      if (t.teaches && !card.facts?.some((f) => f.id === t.teaches)) problems.push(`${card.id}: topic ${t.id} teaches ${t.teaches}, not one of their facts`);
      if (t.after && !card.facts?.some((f) => f.id === t.after)) problems.push(`${card.id}: topic ${t.id} opens after ${t.after}, not one of their facts`);
    }
    if (isDeep(card) && topics.length && !topics.some((t) => t.obvious)) problems.push(`${card.id}: no obvious topic (nothing to say at the first meeting)`);
    for (const tierId of COVERAGE_TIERS) {
      const t = TIERS.find((x) => x.id === tierId)!;
      setStanding(card.id, t.from + 1, t.trust, 1, true);
      const ctx: TalkContext = { day: 1, hour: 14, place: PLACE[card.group], rand: () => 0.5 };
      for (const choice of choicesFor(card.id, ctx, beginConversation(card.id, ctx))) {
        // Each said in a conversation of its own, from the same standing.
        setStanding(card.id, t.from + 1, t.trust, 1, true);
        const outcome = say(card.id, choice, ctx, beginConversation(card.id, ctx));
        if (!outcome.line?.trim()) problems.push(`${card.id} at ${tierId}: "${choice.label}" gets no answer`);
        if (choice.interaction === 'askNumber' && (!outcome.number || !hasNumber(card.id))) problems.push(`${card.id}: asked for a number that is not given`);
      }
      for (const extra of extrasFor({ person: card.id, place: PLACE[card.group], day: 1, hour: 14, session: null })) {
        extras++;
        if (!extra.label.trim()) problems.push(`${card.id}: a place entry (${extra.id}) with no words`);
      }
    }
  }
  return { problems: [...new Set(problems)], deep: cast.filter(isDeep).length, extras };
}

/*
 * Down the phone (docs/social.md "The phone", docs/checks.md "Social sim"): every line a call can show, for everyone
 * with a number, read for words that need the player in front of them. Nobody passes the salt down a line.
 */

/** Words that need the two of them in one place: a thing handed over, a seat, a look, a smell. Kept tight on purpose. */
const IN_PERSON: readonly RegExp[] = [
  // A request said to someone there: at the start of a sentence ("Sit, sit.", "Taste."), not a story ("I had to sit down").
  /(^|[.!?…]\s+)(sit|taste|come here|come in)\b/, /\bsit, sit\b/, /\bcome here\b/,
  /\bpass me\b/, /\bhand me\b/, /\bgrab a stool\b/, /\blet me look\b/,
  /\blook at you\b/, /\byou look\b(?! for)/, /\blook at (this|that)\b/, /\bsmells? good\b/, /\bthis smell\b/, /\btaste (it|this|properly)\b/,
  /(^|[.!?…]\s+)take some\b/, /\bhere,? (take|have)\b/, /\bhere you (go|are)\b/, /\bmind the (step|bags?|boxes)\b/, /\bthe kettle'?s on\b/,
  /\b(good|nice|lovely) to see you\b/, /\bdon'?t look at me\b/, /\byou'?re blocking\b/, /\bover here\b/, /\blet me show you\b/,
];

/** The keys of a person's own lines a call can say (`thanks`: gifts are not given on a call; `call`: written for it). */
const PHONE_KEYS: readonly LineKey[] = ['hello', 'cold', 'hostile', 'chat', 'joke', 'tease', 'leaving', 'bye', 'repeat', 'news', 'birthday', 'hurt', 'twice'];
const FITS: readonly Fit[] = ['loves', 'likes', 'meh', 'dislikes'];

/** Every line a call can show, with where it comes from: their card (with its phone words), then the shared pools. */
function phoneReachable(): { where: string; line: string }[] {
  const out: { where: string; line: string }[] = [];
  const add = (where: string, lines: readonly string[] | undefined): void => {
    for (const line of lines ?? []) out.push({ where, line });
  };
  for (const card of everyone().filter((c) => c.phone)) {
    // Their first conversation can be a call only when their number comes from the start (a friend from before, Mémé).
    if (card.listed === 'always') add(`${card.id} intro`, [card.phoneIntro ?? card.intro]);
    for (const t of card.topics ?? []) {
      const seen = topicHere(t, 'phone');
      if (!seen) continue;
      add(`${card.id} topic ${t.id}`, [seen.say, ...(seen.again ? [seen.again] : []), ...seen.answers, ...(seen.deeper ? [seen.deeper] : [])]);
    }
    for (const f of card.facts ?? []) add(`${card.id} fact ${f.id}`, [factSays(f, 'phone')]);
    for (const key of PHONE_KEYS) add(`${card.id} ${key}`, voiced(card.id, key, 'phone'));
  }
  const onCall = (Object.keys(INTERACTIONS) as InteractionId[]).filter((i) => !INTERACTIONS[i].notAt?.includes('phone'));
  for (const i of onCall) {
    add(`player ${i}`, i === 'topic' || i === 'news' ? [] : playerPool(i, 'phone'));
    if (i === 'chat' || i === 'joke' || i === 'tease' || i === 'apologise' || i === 'insult') for (const fit of FITS) add(`shared ${i} ${fit}`, socialPool(i, fit, 'phone'));
  }
  for (const fit of FITS) add(`shared news ${fit}`, [...newsPool('any', fit, 'phone'), ...newsPool('game', fit, 'phone')]);
  add('shared hello', PHONE_HELLO_LINES);
  add('shared leaving', PHONE_LEAVING_LINES);
  add('shared bye', Object.values(PHONE_FAREWELL_LINES).flat());
  add('shared twice', PHONE_TWICE_LINES);
  add('shared repeat', [...REPEAT_LINES.today, ...REPEAT_LINES.lately]);
  add('shared opening', [...HELD_LINES, ...CALLBACK_LINES, ...KEEPSAKE_LINES, ...GRUDGE_LINES, ...BIRTHDAY_LINES, ...COLD_LINES, ...HOSTILE_LINES, ...Object.values(MOOD_OPENINGS).flat()]);
  add('mood', Object.values(MOOD_SAYS));
  return out;
}

/** The lines a call can show that need the player there, as problems in words (none: every call sounds like one). */
export function phoneProblems(): string[] {
  return phoneReachable()
    .filter(({ line }) => {
      const plain = line.toLowerCase().replaceAll('’', "'");
      return IN_PERSON.some((re) => re.test(plain));
    })
    .map(({ where, line }) => `${where}: “${line}” needs the player there (a \`phone\` / \`phoneLines\` word for it, or \`phone: false\`)`);
}
