import { findPerson, shortName } from './people';
import { isBirthday, moodOf } from './mood';
import { giftName, giftWarmth, tasteFact, type GameGift } from './gifts';
import { newsFit, newsFor, told, type PlayerNews } from './news';
import { INTERACTIONS, TALK, TRAITS } from './socialPlan';
import {
  BIRTHDAY_LINES,
  CALLBACK_LINES,
  COLD_LINES,
  FAREWELL_LINES,
  GRUDGE_LINES,
  HELD_LINES,
  HELLO_LINES,
  HOSTILE_LINES,
  LEAVING_LINES,
  MOOD_OPENINGS,
  NEWS_LINES,
  PLAYER_LINES,
  REPEAT_LINES,
  SOCIAL_LINES,
  TRADE_LINES,
} from './socialLines';
import { bumpCount, countOf, countedToday, giveNumber, learn, learnTrait, markCounted, meet, nudge, standing } from './standing';
import { atLeast, tierOf, tierRank, warmthTier } from './tiers';
import type { Fit, GiftKind, InteractionGroup, InteractionId, LineKey, PersonFact, PersonId, PersonTopic, SocialChange, SocialPlace, Trait } from './types';
import { random } from '@/random';

/*
 * The conversation's rules (docs/social.md "Talking"): what the player can say to someone here and now (their
 * topics, the player's news, a little small talk, an apology, an ask, something mean), how each would land (its
 * `Fit`: the one thing their face shows before the click), and what saying it does: their answer, how their body
 * takes it, the warmth it moves, what it teaches. No hidden draw decides: the same thing said to the same person in
 * the same mood lands the same way, so people can be learned. Only the day's first conversation with someone moves
 * the standing, for `TALK.exchanges` choices, then they have to go. Pure but for the standing it nudges; the panel
 * (`ui/social/ConversationPanel`) shows it, the world's body acts it.
 */

/** Where and when a conversation happens. */
export interface TalkContext {
  day: number;
  /** The game hour, 0..24. */
  hour: number;
  place: SocialPlace;
  /** A draw in 0..1 (seeded in a check, `Math.random` in play): only which line, and the amount's small give. */
  rand?: () => number;
}

/**
 * How their body takes what was said (`world/people` acts it, scaled by `Outcome.strength` and their temperament):
 * `delighted` (a loved topic: lights up, leans in), `bored` (polite, no more: a look away), a laugh, a nod, a shrug,
 * arms folded; and without words, `restless` (a look at the watch: they have to go), `bye` (a wave).
 */
export type Reaction = 'delighted' | 'pleased' | 'laugh' | 'thanks' | 'nod' | 'bored' | 'shrug' | 'annoyed' | 'hurt' | 'restless' | 'bye';

/** One conversation with someone: what it has moved so far (`begin` makes it; the panel keeps it while it is open). */
export interface Conversation {
  person: PersonId;
  day: number;
  /** The day's first conversation with them: what it moves counts (the next ones are talk, no more). */
  counts: boolean;
  /** Topics, news and small talk said so far (gifts and asks are not exchanges). */
  exchanges: number;
  /** Of them, the ones they loved or liked. */
  hits: number;
  /** How many times each choice (`Choice.key`) was said in it. */
  said: Record<string, number>;
  /** Their talk is done: they have to go (after `TALK.exchanges`, or a hurtful word). */
  leaving: boolean;
  /** A good talk was had (two hits): told once. */
  goodTalk: boolean;
}

/** What the player can say or do now, as the panel lists it. */
export interface Choice {
  /** Stable while it is offered: 'topic:piano', 'news:game:smb3', 'talk:chat', 'ask:askNumber', 'mean:insult'. */
  key: string;
  interaction: InteractionId;
  group: InteractionGroup;
  /** As the menu shows it: the player's own words ("How's the piano coming along?"), or the act ("Insult"). */
  label: string;
  /** Its icon (`ui/social/icons`). */
  icon: string;
  /** How they would take it: their face before the click (`SocialBody.anticipate`); the panel never shows it. */
  fit: Fit;
  topic?: PersonTopic;
  news?: PlayerNews;
  /** It is said for good (an insult): a long press, never a plain click. */
  once?: boolean;
}

/** What saying a choice did. */
export interface Outcome {
  /** It went down well (loved or liked). */
  ok: boolean;
  fit: Fit;
  /** What they say back. */
  line: string;
  reaction: Reaction;
  /** How big a moment it is for their body, 0..1. */
  strength: number;
  /** The standing moved (null: nothing changed, a second conversation of the day). */
  change: SocialChange | null;
  /** A fact the player learned of them just now (the panel sends it to the book). */
  fact?: PersonFact;
  /** A trait the player found out just now. */
  trait?: Trait;
  /** Their number was given. */
  number?: boolean;
  /** They will remember this (a memory kept): the panel shows the player's face over them, a second. */
  remembered?: string;
  /** Their talk is done now: they have to go (`leavingLine` follows). */
  leaving?: boolean;
  /** Two hits: a good talk, a little more warmth and a memory. */
  goodTalk?: boolean;
}

/** What goes with a choice: the gift, the game, whom it is about. */
export interface InteractionExtra {
  gift?: GiftKind;
  game?: GameGift;
  topic?: PersonTopic;
  news?: PlayerNews;
}

/** How a choice is told in a tier's banner or card, by how it landed. */
const WHY: Record<'chat' | 'joke' | 'tease' | 'news', Record<Fit, string>> = {
  chat: { loves: 'loved the chat', likes: 'enjoyed the chat', meh: 'wasn’t much for chatting', dislikes: 'wasn’t in the mood to chat' },
  joke: { loves: 'laughed at the joke', likes: 'smiled at the joke', meh: 'didn’t get the joke', dislikes: 'didn’t find it funny' },
  tease: { loves: 'gave as good as they got', likes: 'took the teasing well', meh: 'let the teasing pass', dislikes: 'didn’t like the teasing' },
  news: { loves: 'loved your news', likes: 'was glad of your news', meh: 'didn’t care for the news', dislikes: 'didn’t like your news' },
};

/** The icon of each interaction's row (a topic and a piece of news carry their own). */
const ICONS: Record<InteractionId, string> = {
  topic: 'chat',
  news: 'star',
  chat: 'chat',
  joke: 'laugh',
  apologise: 'sorry',
  askNumber: 'phone',
  tease: 'wink',
  insult: 'insult',
  giveGift: 'gift',
  giveGame: 'gift',
  giveCoins: 'coin',
};

/** Where what the player does is seen by whoever is around (`witnesses.ts` passes it on); elsewhere their ties hear of it (`gossip`). */
const PUBLIC: ReadonlySet<SocialPlace> = new Set(['stairs', 'courtyard', 'street', 'shop', 'market', 'arcade', 'saleroom']);

/** What a good talk leaves them (mild: it fades, and it is never called back). */
const GOOD_TALK_MEMORY = 'we had a good talk';

/** The order of fits, best first (a repetition steps down it). */
const FITS: readonly Fit[] = ['loves', 'likes', 'meh', 'dislikes'];

function stepDown(fit: Fit, steps: number): Fit {
  return FITS[Math.min(FITS.length - 1, FITS.indexOf(fit) + steps)]!;
}

function pick<T>(list: readonly T[], r: number): T {
  return list[Math.floor(r * list.length) % list.length]!;
}

/** A line of `key` from their card, else their trade's (a light person), else none. */
function ownLines(id: PersonId, key: LineKey): readonly string[] | undefined {
  const card = findPerson(id);
  const own = card?.lines?.[key];
  if (own?.length) return own;
  const trade = card?.trade ? TRADE_LINES[card.trade]?.[key] : undefined;
  return trade?.length ? trade : undefined;
}

function fill(line: string, id: PersonId, extra: InteractionExtra): string {
  return line
    .replaceAll('{name}', shortName(id))
    .replaceAll('{gift}', extra.gift ? giftName(extra.gift) : 'this')
    .replaceAll('{game}', extra.game?.title ?? extra.news?.game?.title ?? 'that');
}

/** Starts a conversation with `id`: whether it is the day's first (what it moves counts). */
export function beginConversation(id: PersonId, ctx: TalkContext): Conversation {
  return { person: id, day: ctx.day, counts: !countedToday(id, 'conversation', ctx.day), exchanges: 0, hits: 0, said: {}, leaving: false, goodTalk: false };
}

/** Whether one of `card`'s topics is open: obvious, its fact known, its tier reached. */
function topicOpen(id: PersonId, topic: PersonTopic): boolean {
  const s = standing(id);
  const tier = tierOf(s.warmth, s.trust);
  if (topic.obvious) return true;
  if (topic.after && !s.known.includes(topic.after)) return false;
  return atLeast(tier, topic.from ?? 'acquaintance');
}

/** The topics of `id`'s open now, best to offer first: not said in this conversation, not talked about lately. */
export function openTopics(id: PersonId): PersonTopic[] {
  return (findPerson(id)?.topics ?? []).filter((t) => topicOpen(id, t));
}

/** How a trait of theirs bends a small-talk choice at this hour, and which trait (found out when it shows). */
function bent(id: PersonId, interaction: 'chat' | 'joke' | 'tease' | 'giveCoins' | 'apologise', hour: number): { fit: Fit; by: Trait } | null {
  for (const t of findPerson(id)?.traits ?? []) {
    const bend = TRAITS[t].bends[interaction];
    if (!bend) continue;
    if (bend.hours && !(hour >= bend.hours[0] && hour < bend.hours[1])) continue;
    return { fit: bend.fit, by: t };
  }
  return null;
}

/** How `id` would take `choice` now: the one thing their face shows before the click. */
function fitOf(id: PersonId, choice: Pick<Choice, 'key' | 'interaction' | 'topic' | 'news'>, ctx: TalkContext, convo?: Conversation): Fit {
  const again = convo?.said[choice.key] ?? 0;
  switch (choice.interaction) {
    case 'topic': {
      const topic = choice.topic;
      if (!topic) return 'meh';
      const last = standing(id).last[`topic:${topic.id}`];
      const lately = last !== undefined && ctx.day - last <= TALK.repeatDays && !(convo && again);
      // Everything they had to say about it said: it is old news to them now.
      const told = countOf(id, `topic:${topic.id}`) >= topic.answers.length && topic.fit !== 'dislikes';
      return stepDown(topic.fit, again + (lately ? 1 : 0) + (told ? 1 : 0));
    }
    case 'news':
      return choice.news ? stepDown(newsFit(id, choice.news), again) : 'meh';
    case 'chat':
    case 'joke':
    case 'tease':
    case 'giveCoins':
    case 'apologise': {
      const base = bent(id, choice.interaction, ctx.hour)?.fit ?? INTERACTIONS[choice.interaction].fit ?? 'likes';
      return stepDown(base, choice.interaction === 'chat' || choice.interaction === 'joke' ? again : 0);
    }
    case 'insult':
      return 'dislikes';
    default:
      return 'likes';
  }
}

/** What the player can say to `id` here and now, in the panel's order (topics, news, small talk, the rest). */
export function choicesFor(id: PersonId, ctx: TalkContext, convo: Conversation): Choice[] {
  const card = findPerson(id);
  if (!card || convo.leaving) return [];
  const s = standing(id);
  const tier = tierOf(s.warmth, s.trust);
  const out: Choice[] = [];
  const offered = (interaction: InteractionId): boolean => {
    const rule = INTERACTIONS[interaction];
    if (rule.notAt?.includes(ctx.place)) return false;
    if (rule.from && !atLeast(tier, rule.from)) return false;
    if (rule.below && atLeast(tier, rule.below)) return false;
    return true;
  };
  // Each thing is said once a conversation: nobody asks the same question twice running.
  const add = (c: Omit<Choice, 'fit'>): void => {
    if (convo.said[c.key]) return;
    out.push({ ...c, fit: fitOf(id, c, ctx, convo) });
  };
  // Someone cold or worse is not for talking: an apology, a word, or worse.
  const cold = tierRank(tier) <= tierRank('cold');
  if (!cold) {
    const topics = openTopics(id)
      .map((topic) => ({ topic, key: `topic:${topic.id}`, times: countOf(id, `topic:${topic.id}`) }))
      .filter(({ topic, key, times }) => {
        if (convo.said[key]) return false;
        // A sore spot found out is not brought up again; a first meeting's question is not asked twice.
        if (topic.fit === 'dislikes' && s.known.includes(`fit:${topic.id}`)) return false;
        return !(times > 0 && topic.obvious && !topic.again);
      })
      // The fresh ones first: not talked about yet, then the longest ago; the ones they have told all about last.
      .sort((a, b) => Number(a.times >= a.topic.answers.length) - Number(b.times >= b.topic.answers.length) || (s.last[`topic:${a.topic.id}`] ?? -1) - (s.last[`topic:${b.topic.id}`] ?? -1))
      .slice(0, TALK.topics);
    for (const { topic, key, times } of topics) add({ key, interaction: 'topic', group: 'talk', label: times > 0 && topic.again ? topic.again : topic.say, icon: topic.icon, topic });
    for (const news of newsFor(id, ctx.day).slice(0, TALK.news)) add({ key: `news:${news.id}`, interaction: 'news', group: 'talk', label: news.say, icon: news.icon, news });
  }
  add({ key: 'talk:chat', interaction: 'chat', group: 'talk', label: pick(PLAYER_LINES.chat, (ctx.day / 7) % 1), icon: ICONS.chat });
  if (!cold) add({ key: 'talk:joke', interaction: 'joke', group: 'talk', label: pick(PLAYER_LINES.joke, ((ctx.day * 3) / 7) % 1), icon: ICONS.joke });
  if (offered('apologise') && !countedToday(id, 'talk:apologise', ctx.day)) add({ key: 'talk:apologise', interaction: 'apologise', group: 'talk', label: pick(PLAYER_LINES.apologise, ctx.day / 5 % 1), icon: ICONS.apologise });
  if (offered('askNumber') && card.phone && !s.number) add({ key: 'ask:askNumber', interaction: 'askNumber', group: 'ask', label: PLAYER_LINES.askNumber[0]!, icon: ICONS.askNumber });
  if (offered('tease')) add({ key: 'mean:tease', interaction: 'tease', group: 'mean', label: pick(PLAYER_LINES.tease, ctx.day / 3 % 1), icon: ICONS.tease });
  if (offered('insult')) add({ key: 'mean:insult', interaction: 'insult', group: 'mean', label: pick(PLAYER_LINES.insult, ctx.day / 2 % 1), icon: ICONS.insult, once: true });
  return out;
}

/** What the player says choosing `interaction` without a line of its own (a gift: "I brought you flowers."). */
export function playerLine(id: PersonId, interaction: InteractionId, extra: InteractionExtra = {}, r: number = random()): string {
  return fill(pick(PLAYER_LINES[interaction], r), id, extra);
}

/** The kind of first word they said (the panel may show it differently: an introduction, a memory called back). */
export type OpeningKind = 'intro' | 'hostile' | 'cold' | 'birthday' | 'held' | 'memory' | 'mood' | 'hello';

/**
 * Their first word on opening the conversation: an introduction the first time; a cold or hostile word; their
 * birthday; once a day, what they would like when trust is what holds them back (the only hint of how to get
 * closer); now and then a memory of the player called back ("Remember when you lent me Zelda?"); their mood when it
 * is not fine; else their hello.
 */
export function opening(id: PersonId, ctx: TalkContext): { line: string; introduced: boolean; kind: OpeningKind } {
  const card = findPerson(id);
  const r = (ctx.rand ?? random)();
  if (card && meet(id, ctx.day)) return { line: card.intro, introduced: true, kind: 'intro' };
  const s = standing(id);
  const tier = tierOf(s.warmth, s.trust);
  if (tierRank(tier) <= tierRank('hostile')) return { line: pick(ownLines(id, 'hostile') ?? HOSTILE_LINES, r), introduced: false, kind: 'hostile' };
  if (tier === 'cold') return { line: pick(ownLines(id, 'cold') ?? COLD_LINES, r), introduced: false, kind: 'cold' };
  if (isBirthday(id, ctx.day) && !countedToday(id, 'birthdaySaid', ctx.day)) {
    nudge(id, { reason: 'birthdaySaid', day: ctx.day });
    return { line: pick(BIRTHDAY_LINES, r), introduced: false, kind: 'birthday' };
  }
  if (!card?.family && warmthTier(s.warmth) !== tier && !countedToday(id, 'heldSaid', ctx.day)) {
    nudge(id, { reason: 'heldSaid', day: ctx.day });
    return { line: pick(HELD_LINES, r), introduced: false, kind: 'held' };
  }
  // A memory called back, once a day at most, one from a day or more ago.
  if (!countedToday(id, 'recalled', ctx.day) && r < 0.45) {
    // Something particular, not a talk like any other (`goodTalk`'s memory).
    const memory = s.memories.find((m) => ctx.day - m.day >= 1 && ctx.day - m.day <= 12 && Math.abs(m.weight) >= 3 && m.text !== GOOD_TALK_MEMORY);
    if (memory) {
      nudge(id, { reason: 'recalled', day: ctx.day });
      const lines = memory.weight > 0 ? CALLBACK_LINES : GRUDGE_LINES;
      return { line: pick(lines, r * 2 % 1).replace('{memory}', memory.text), introduced: false, kind: 'memory' };
    }
  }
  const { mood } = moodOf(id, ctx.day, ctx.hour);
  if (mood !== 'fine' && !countedToday(id, 'moodSaid', ctx.day)) {
    nudge(id, { reason: 'moodSaid', day: ctx.day });
    return { line: pick(MOOD_OPENINGS[mood], r), introduced: false, kind: 'mood' };
  }
  return { line: pick(ownLines(id, 'hello') ?? HELLO_LINES, r), introduced: false, kind: 'hello' };
}

/** Their goodbye when the player leaves, by how warm they are. */
export function farewell(id: PersonId, r: number = random()): string {
  const s = standing(id);
  const rank = tierRank(tierOf(s.warmth, s.trust));
  const own = ownLines(id, 'bye');
  if (own && rank >= tierRank('polite')) return pick(own, r);
  const band = rank >= tierRank('friendly') ? 'warm' : rank >= tierRank('polite') ? 'even' : rank >= tierRank('cold') ? 'cold' : 'hostile';
  return pick(FAREWELL_LINES[band], r);
}

/** What they say when their talk is done ("Right, I must dash!"). */
export function leavingLine(id: PersonId, r: number = random()): string {
  return pick(ownLines(id, 'leaving') ?? LEAVING_LINES, r);
}

/** The reaction a choice gets, and how big a moment it is for their body. */
function reactionOf(interaction: InteractionId, fit: Fit): { reaction: Reaction; strength: number } {
  if (interaction === 'insult') return { reaction: 'hurt', strength: 1 };
  if (fit === 'dislikes') return { reaction: 'annoyed', strength: 0.7 };
  if (fit === 'meh') return { reaction: interaction === 'joke' ? 'shrug' : 'bored', strength: 0.35 };
  if (interaction === 'joke' || interaction === 'tease') return { reaction: 'laugh', strength: fit === 'loves' ? 1 : 0.6 };
  if (interaction.startsWith('give') || interaction === 'askNumber') return { reaction: 'thanks', strength: fit === 'loves' ? 1 : 0.6 };
  if (fit === 'loves') return { reaction: 'delighted', strength: 1 };
  return { reaction: interaction === 'apologise' ? 'nod' : 'pleased', strength: 0.6 };
}

/** A fact of theirs the player does not know yet that their tier allows, or null. */
function nextFact(id: PersonId): PersonFact | null {
  const s = standing(id);
  const tier = tierOf(s.warmth, s.trust);
  return findPerson(id)?.facts?.find((f) => !s.known.includes(f.id) && atLeast(tier, f.from ?? 'polite')) ?? null;
}

const performed = new Set<(id: PersonId, interaction: InteractionId, outcome: Outcome, ctx: TalkContext, extra: InteractionExtra) => void>();

/** Hears every choice said (a favour's gift handed over, a birthday learned, a rival gloated at). Returns the unsubscribe. */
export function onInteraction(listener: (id: PersonId, interaction: InteractionId, outcome: Outcome, ctx: TalkContext, extra: InteractionExtra) => void): () => void {
  performed.add(listener);
  return () => performed.delete(listener);
}

/** The warmth a talk choice of fit `fit` moves in this conversation (none past its first of the day or its exchanges). */
function talkWarmth(id: PersonId, fit: Fit, ctx: TalkContext, convo: Conversation, rand: () => number): number {
  if (!convo.counts || convo.exchanges > TALK.exchanges) return 0;
  const base = TALK.fit[fit];
  if (base <= 0) return base;
  const { mood } = moodOf(id, ctx.day, ctx.hour);
  const give = 1 + (rand() * 2 - 1) * TALK.variance;
  return Math.round(base * TALK.mood[mood] * give * 10) / 10;
}

/**
 * Says `choice` (or gives, with `extra`): their answer, how their body takes it, what it moves, what it teaches.
 * Gifts (`giveGift`, `giveGame`, `giveCoins`) come with `extra`; a choice of `choicesFor` with its own.
 */
export function say(id: PersonId, choice: Pick<Choice, 'key' | 'interaction' | 'topic' | 'news'>, ctx: TalkContext, convo: Conversation, extra: InteractionExtra = {}): Outcome {
  const rand = ctx.rand ?? random;
  const card = findPerson(id);
  const interaction = choice.interaction;
  const rule = INTERACTIONS[interaction];
  let fit = fitOf(id, choice, ctx, convo);
  const again = convo.said[choice.key] ?? 0;
  convo.said[choice.key] = again + 1;
  let warmth = 0;
  let trust = 0;
  let why = '';
  let line = '';
  let memory: string | undefined;
  let memoryWeight: number | undefined;
  let memoryGame: string | undefined;
  let reason: string | undefined;
  let fact: PersonFact | undefined;
  let trait: Trait | undefined;
  const talk = interaction === 'topic' || interaction === 'news' || interaction === 'chat' || interaction === 'joke' || interaction === 'tease';
  if (talk) {
    convo.exchanges++;
    if (convo.counts && convo.exchanges === 1) markCounted(id, 'conversation', ctx.day);
    warmth = talkWarmth(id, fit, ctx, convo, rand);
    if (fit === 'loves' || fit === 'likes') convo.hits++;
  }
  const lineDraw = rand();

  if (interaction === 'topic' && choice.topic) {
    const topic = choice.topic;
    const first = !standing(id).known.includes(`fit:${topic.id}`);
    learn(id, `fit:${topic.id}`);
    nudge(id, { reason: `topic:${topic.id}`, day: ctx.day });
    // Their answers in turn, never the same one twice running.
    const times = bumpCount(id, `topic:${topic.id}`);
    line = again ? pick(ownLines(id, 'repeat') ?? REPEAT_LINES, lineDraw) : topic.answers[times % topic.answers.length]!;
    why = fit === 'dislikes' ? `didn’t want to talk about ${topic.name.toLowerCase()}` : fit === 'meh' ? 'wasn’t much for talking' : `loved talking about ${topic.name.toLowerCase()}`;
    if ((fit === 'loves' || fit === 'likes') && warmth > 0) {
      if (topic.teaches) {
        const f = card?.facts?.find((x) => x.id === topic.teaches);
        if (f && learn(id, f.id)) fact = f;
      }
      if (first && topic.memory) [memory, memoryWeight] = [topic.memory, 3];
    }
  } else if (interaction === 'news' && choice.news) {
    const news = choice.news;
    told(id, news.id);
    // A game's news in game words only to someone who plays; anyone else is glad for the player, not the game.
    line = fill(pick(news.game && card?.tastes ? NEWS_LINES.game[fit] : NEWS_LINES.any[fit], lineDraw), id, { news });
    why = WHY.news[fit];
  } else if (interaction === 'chat' || interaction === 'joke' || interaction === 'tease') {
    const own = fit === 'loves' || fit === 'likes' ? ownLines(id, interaction) : undefined;
    line = again && interaction === 'chat' ? pick(ownLines(id, 'repeat') ?? REPEAT_LINES, lineDraw) : pick(own ?? SOCIAL_LINES[interaction][fit], lineDraw);
    why = WHY[interaction][fit];
    const by = bent(id, interaction, ctx.hour)?.by;
    if (by && learnTrait(id, by)) trait = by;
    // A good chat teaches now and then.
    if (interaction === 'chat' && (fit === 'loves' || fit === 'likes') && warmth > 0 && rand() < 0.5) {
      const f = nextFact(id);
      if (f && learn(id, f.id)) {
        fact = f;
        line = f.says;
      }
    }
  } else if (interaction === 'apologise') {
    reason = 'talk:apologise';
    const by = bent(id, 'apologise', ctx.hour)?.by;
    if (by && learnTrait(id, by)) trait = by;
    warmth = { loves: 14, likes: rule.win.warmth, meh: 5, dislikes: 2 }[fit] + (countedToday(id, 'gift', ctx.day) ? 4 : 0);
    line = pick(SOCIAL_LINES.apologise[fit], lineDraw);
    why = fit === 'meh' || fit === 'dislikes' ? 'isn’t quite ready to forgive' : 'accepted the apology';
    [memory, memoryWeight] = ['you apologised', 6];
  } else if (interaction === 'askNumber') {
    warmth = rule.win.warmth;
    giveNumber(id);
    line = pick(SOCIAL_LINES.askNumber.likes, lineDraw);
    why = 'gave you their number';
  } else if (interaction === 'insult') {
    warmth = rule.win.warmth;
    trust = rule.win.trust ?? 0;
    line = pick(SOCIAL_LINES.insult.dislikes, lineDraw);
    why = 'took offence';
    [memory, memoryWeight] = ['you insulted me', -18];
    convo.leaving = true;
    // An insult is no good talk, however well it went before.
    convo.hits = 0;
  } else if (interaction === 'giveGift' || interaction === 'giveGame') {
    const kind: GiftKind = interaction === 'giveGame' ? 'game' : (extra.gift ?? 'croissant');
    warmth = giftWarmth(id, kind, ctx.day, extra.game);
    // One gift a day counts; more are only polite.
    if (countedToday(id, 'gift', ctx.day) && warmth > 0) warmth = 0;
    reason = 'gift';
    fit = warmth >= 10 ? 'loves' : warmth > 0 ? 'likes' : warmth === 0 ? 'meh' : 'dislikes';
    why = warmth >= 0 ? `loved ${kind === 'game' ? (extra.game?.title ?? 'the game') : giftName(kind)}` : `didn’t want ${giftName(kind)}`;
    if (kind !== 'game') learn(id, tasteFact(kind));
    line = fill(pick(SOCIAL_LINES[interaction][fit], lineDraw), id, extra);
    if (kind === 'game' && warmth > 0) [memory, memoryWeight, memoryGame] = [`you gave me ${extra.game?.title ?? 'a game'}`, 12, extra.game?.id];
  } else if (interaction === 'giveCoins') {
    reason = 'coins';
    const by = bent(id, 'giveCoins', ctx.hour)?.by;
    if (by && learnTrait(id, by)) trait = by;
    warmth = countedToday(id, 'coins', ctx.day) ? 0 : { loves: 8, likes: rule.win.warmth, meh: 0, dislikes: -4 }[fit];
    line = pick(SOCIAL_LINES.giveCoins[fit], lineDraw);
    why = fit === 'dislikes' ? 'was offended by the coins' : 'appreciated the coins';
  }

  const change = warmth !== 0 || trust !== 0 || memory
    ? nudge(id, { warmth, trust, why, day: ctx.day, reason, memory, memoryWeight, memoryGame, gossip: rule.heard === true && !PUBLIC.has(ctx.place) && (warmth !== 0 || interaction === 'insult') })
    : null;
  const { reaction, strength } = reactionOf(interaction, fit);
  const outcome: Outcome = { ok: fit === 'loves' || fit === 'likes', fit, line, reaction, strength, change, fact, trait, remembered: change && memory ? memory : undefined };
  if (interaction === 'askNumber') outcome.number = true;
  if (talk && convo.exchanges >= TALK.exchanges) convo.leaving = true;
  if (convo.leaving) {
    outcome.leaving = true;
    outcome.goodTalk = settleGoodTalk(id, ctx, convo);
  }
  for (const listener of [...performed]) listener(id, interaction, outcome, ctx, extra);
  return outcome;
}

/** Two hits in the day's first conversation make a good talk: a little more warmth and a memory, once. */
function settleGoodTalk(id: PersonId, ctx: TalkContext, convo: Conversation): boolean {
  if (convo.goodTalk || !convo.counts || convo.hits < TALK.goodTalk.hits) return false;
  convo.goodTalk = true;
  nudge(id, { warmth: TALK.goodTalk.warmth, why: 'enjoyed the talk', day: ctx.day, memory: GOOD_TALK_MEMORY, memoryWeight: 2 });
  return true;
}

/** The conversation is over (Goodbye, Esc): a good talk is told if it was one. */
export function endConversation(id: PersonId, ctx: TalkContext, convo: Conversation): { goodTalk: boolean } {
  return { goodTalk: settleGoodTalk(id, ctx, convo) };
}
