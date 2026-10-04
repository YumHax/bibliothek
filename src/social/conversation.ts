import { findPerson, shortName } from './people';
import { isBirthday, moodOf } from './mood';
import { giftName, giftWarmth, tasteFact, type GameGift } from './gifts';
import { INTERACTIONS, MOODS, ODDS, TRAITS, BATTERY } from './socialPlan';
import { BIRTHDAY_LINES, COLD_LINES, FAREWELL_LINES, HELD_LINES, HELLO_LINES, HOSTILE_LINES, PLAYER_LINES, REPEAT_LINES, SOCIAL_LINES, TIRED_LINES } from './socialLines';
import { countedToday, drawBattery, talkWarmth, giveNumber, learn, learnTrait, meet, nudge, standing } from './standing';
import { atLeast, tierOf, tierRank, warmthTier } from './tiers';
import type { GiftKind, InteractionId, PersonFact, PersonId, SocialChange, SocialPlace, TierId, Trait } from './types';
import { random } from '@/random';

/*
 * The conversation's rules (docs/social.md "Talking"): which interactions are open with someone, their odds (the
 * base, their mood, the warmth between you, their traits at that hour), and what one does when tried: the line
 * they answer, how their body takes it, what it moves, what it teaches the player about them. Pure but for the
 * standing it nudges; the panel (`ui/social/ConversationPanel`) shows it, the world's body acts it.
 */

/** Where and when a conversation happens. */
export interface TalkContext {
  day: number;
  /** The game hour, 0..24. */
  hour: number;
  place: SocialPlace;
  /** A draw in 0..1 (seeded in a check, `Math.random` in play). */
  rand?: () => number;
}

/**
 * How their body takes what was said (`world/people` acts it: a laugh, a nod, a shrug, arms folded), and how it says
 * the rest without words: `restless` (a look at the watch: their talk is running out), `bye` (a wave).
 */
export type Reaction = 'pleased' | 'laugh' | 'thanks' | 'nod' | 'shrug' | 'annoyed' | 'hurt' | 'restless' | 'bye';

/** An interaction as the panel offers it. */
export interface OptionView {
  id: InteractionId;
  label: string;
  group: (typeof INTERACTIONS)[InteractionId]['group'];
  /** The odds it lands, 0..1 (the rules' and the checks'; the panel never shows them). */
  odds: number;
  /** Why it is not open now, or null. */
  disabled: string | null;
  /** The tier it opens at, while they are short of it (the panel leaves it out until then); else null. */
  needs: TierId | null;
}

/** What trying an interaction did. */
interface Outcome {
  ok: boolean;
  /** What they say back. */
  line: string;
  reaction: Reaction;
  /** The standing moved (null: nothing changed, e.g. a second chat today that went well). */
  change: SocialChange | null;
  /** A fact the player learned of them just now. */
  fact?: PersonFact;
  /** A trait the player found out just now. */
  trait?: Trait;
  /** Their number was given. */
  number?: boolean;
  /** Their talk for the day was spent: it cost warmth. */
  tired?: boolean;
}

/** How a landed (`win`) or missed (`lose`) interaction is told in a tier's banner or card ("Laughed at the joke."). */
const WHY: Record<Exclude<InteractionId, 'giveGift' | 'giveGame'>, { win: string; lose: string }> = {
  chat: { win: 'enjoyed the chat', lose: 'wasn’t in the mood to chat' },
  askDay: { win: 'liked being asked', lose: 'didn’t want to talk about it' },
  talkGames: { win: 'loved talking games', lose: 'isn’t one for games talk' },
  compliment: { win: 'liked the compliment', lose: 'didn’t buy the compliment' },
  joke: { win: 'laughed at the joke', lose: 'didn’t find it funny' },
  gossip: { win: 'enjoyed the gossip', lose: 'didn’t like the gossip' },
  complain: { win: 'agreed about the building', lose: 'didn’t like the moaning' },
  apologise: { win: 'accepted the apology', lose: 'isn’t ready to forgive' },
  askNumber: { win: 'gave you their number', lose: 'kept their number to themselves' },
  askFavour: { win: 'was glad to help', lose: 'didn’t like being asked' },
  askTip: { win: 'let you in on something', lose: 'didn’t like being asked' },
  askDiscount: { win: 'knocked a bit off', lose: 'didn’t like the haggling' },
  tease: { win: 'took the teasing well', lose: 'didn’t like the teasing' },
  insult: { win: 'took offence', lose: 'took offence' },
  challenge: { win: 'loved the challenge', lose: 'didn’t want a challenge' },
  giveCoins: { win: 'took the coins', lose: 'was offended by the coins' },
};

/** What goes with an interaction: the gift, the game, whom it is about. */
export interface InteractionExtra {
  gift?: GiftKind;
  game?: GameGift;
  about?: PersonId;
}

/** The odds `interaction` lands with `id` now, and the trait that bent them most (found out when it shows). */
function oddsOf(id: PersonId, interaction: InteractionId, ctx: TalkContext): { odds: number; bentBy: Trait | null } {
  const rule = INTERACTIONS[interaction];
  const s = standing(id);
  const card = findPerson(id);
  const { mood } = moodOf(id, ctx.day, ctx.hour);
  let odds = rule.odds * MOODS[mood].odds;
  let bentBy: Trait | null = null;
  let strongest = 0;
  for (const t of card?.traits ?? []) {
    const bend = TRAITS[t].bends[interaction];
    if (!bend?.odds) continue;
    if (bend.hours && !(ctx.hour >= bend.hours[0] && ctx.hour < bend.hours[1])) continue;
    odds *= bend.odds;
    if (Math.abs(bend.odds - 1) > strongest) {
      strongest = Math.abs(bend.odds - 1);
      bentBy = t;
    }
  }
  if (rule.odds < 1) odds += s.warmth * ODDS.perWarmth;
  if (interaction === 'apologise' && countedToday(id, 'gift', ctx.day)) odds += 0.25;
  const [lo, hi] = ODDS.range;
  return { odds: rule.odds >= 1 ? 1 : Math.max(lo, Math.min(hi, odds)), bentBy };
}

/** Whether talk's daily warmth cap (`GAIN.talkPerDay`) applies to `interaction`: the Talk and Mean groups, not an apology. */
function talkCapped(interaction: InteractionId): boolean {
  const group = INTERACTIONS[interaction].group;
  return (group === 'talk' || group === 'mean') && interaction !== 'apologise';
}

/** The interactions open with `id` here and now, in the panel's order. */
export function optionsFor(id: PersonId, ctx: TalkContext): OptionView[] {
  const s = standing(id);
  const tier = tierOf(s.warmth, s.trust);
  const out: OptionView[] = [];
  for (const [key, rule] of Object.entries(INTERACTIONS) as [InteractionId, (typeof INTERACTIONS)[InteractionId]][]) {
    if (rule.notAt?.includes(ctx.place)) continue;
    if (rule.below && atLeast(tier, rule.below)) continue;
    if (key === 'askNumber' && (s.number || !findPerson(id)?.phone)) continue;
    const needs = rule.from && !atLeast(tier, rule.from) ? rule.from : null;
    out.push({ id: key, label: rule.label, group: rule.group, odds: oddsOf(id, key, ctx).odds, disabled: needs ? `Not close enough yet (${needs})` : null, needs });
  }
  return out;
}

function pick<T>(list: readonly T[], r: number): T {
  return list[Math.floor(r * list.length) % list.length]!;
}

function fill(line: string, id: PersonId, extra: InteractionExtra): string {
  return line
    .replaceAll('{name}', shortName(id))
    .replaceAll('{about}', extra.about ? shortName(extra.about) : 'them')
    .replaceAll('{gift}', extra.gift ? giftName(extra.gift) : 'this')
    .replaceAll('{game}', extra.game?.title ?? 'that');
}

/** What the player says choosing `interaction` with `id` (`PLAYER_LINES`, its placeholders filled): the panel shows it as theirs. */
export function playerLine(id: PersonId, interaction: InteractionId, extra: InteractionExtra = {}, r: number = random()): string {
  return fill(pick(PLAYER_LINES[interaction], r), id, extra);
}

/** The first word on opening the conversation: an introduction the first time, their hello, a cold word. */
export function opening(id: PersonId, ctx: TalkContext): { line: string; introduced: boolean } {
  const card = findPerson(id);
  const r = (ctx.rand ?? random)();
  if (card && meet(id, ctx.day)) return { line: card.intro, introduced: true };
  const tier = tierOf(standing(id).warmth, standing(id).trust);
  if (tierRank(tier) <= tierRank('hostile')) return { line: pick(card?.lines?.hostile ?? HOSTILE_LINES, r), introduced: false };
  if (tier === 'cold') return { line: pick(card?.lines?.cold ?? COLD_LINES, r), introduced: false };
  if (isBirthday(id, ctx.day) && !countedToday(id, 'birthdaySaid', ctx.day)) {
    nudge(id, { reason: 'birthdaySaid', day: ctx.day });
    return { line: pick(BIRTHDAY_LINES, r), introduced: false };
  }
  // Trust is what holds them back: once a day they say what they would like, the only hint of how to get closer.
  const s = standing(id);
  if (warmthTier(s.warmth) !== tier && !countedToday(id, 'heldSaid', ctx.day)) {
    nudge(id, { reason: 'heldSaid', day: ctx.day });
    return { line: pick(HELD_LINES, r), introduced: false };
  }
  return { line: pick(card?.lines?.hello ?? HELLO_LINES, r), introduced: false };
}

/** Their goodbye when the player leaves, by how warm they are. */
export function farewell(id: PersonId, r: number = random()): string {
  const s = standing(id);
  const rank = tierRank(tierOf(s.warmth, s.trust));
  const band = rank >= tierRank('friendly') ? 'warm' : rank >= tierRank('stranger') ? 'even' : rank >= tierRank('cold') ? 'cold' : 'hostile';
  return pick(FAREWELL_LINES[band], r);
}

/** The reaction a landed or missed interaction gets. */
function reactionOf(interaction: InteractionId, ok: boolean, warmthMoved: number): Reaction {
  if (interaction === 'insult') return 'hurt';
  if (!ok) return warmthMoved <= -5 ? 'annoyed' : 'shrug';
  if (interaction === 'joke' || interaction === 'tease') return 'laugh';
  if (interaction.startsWith('give')) return 'thanks';
  if (warmthMoved >= 5) return 'pleased';
  return 'nod';
}

/** A fact of theirs the player does not know yet that their tier allows, or null. */
function nextFact(id: PersonId): PersonFact | null {
  const s = standing(id);
  const tier = tierOf(s.warmth, s.trust);
  return findPerson(id)?.facts?.find((f) => !s.known.includes(f.id) && atLeast(tier, f.from ?? 'stranger')) ?? null;
}

const performed = new Set<(id: PersonId, interaction: InteractionId, outcome: Outcome, ctx: TalkContext, extra: InteractionExtra) => void>();

/** Hears every interaction tried (a favour asked, a challenge taken up, a gift given). Returns the unsubscribe. */
export function onInteraction(listener: (id: PersonId, interaction: InteractionId, outcome: Outcome, ctx: TalkContext, extra: InteractionExtra) => void): () => void {
  performed.add(listener);
  return () => performed.delete(listener);
}

/**
 * Tries `interaction` with `id`: the draw, the line, the body's reaction, the standing moved (a daily one counts
 * once a day when it lands; a miss always costs), a fact or a trait found out, the battery drawn.
 */
export function perform(id: PersonId, interaction: InteractionId, ctx: TalkContext, extra: InteractionExtra = {}): Outcome {
  const rand = ctx.rand ?? random;
  const rule = INTERACTIONS[interaction];
  const card = findPerson(id);
  const { odds, bentBy } = oddsOf(id, interaction, ctx);
  let ok = rand() < odds;
  let warmth = ok ? rule.win.warmth : rule.lose.warmth;
  let trustMove = ok ? (rule.win.trust ?? 0) : (rule.lose.trust ?? 0);
  // Their traits bend how much it moves them too.
  if (ok) for (const t of card?.traits ?? []) warmth = Math.round(warmth * (TRAITS[t].bends[interaction]?.warmth ?? 1));
  let why: string = interaction === 'giveGift' || interaction === 'giveGame' ? '' : WHY[interaction][ok ? 'win' : 'lose'];
  let line: string;

  if (interaction === 'giveGift' || interaction === 'giveGame') {
    const kind: GiftKind = interaction === 'giveGame' ? 'game' : (extra.gift ?? 'croissant');
    warmth = giftWarmth(id, kind, ctx.day, extra.game);
    ok = warmth > 0;
    // Two gifts a day count; more are only polite.
    const second = countedToday(id, 'gift', ctx.day);
    if (second && countedToday(id, 'gift2', ctx.day)) warmth = Math.min(warmth, 1);
    nudge(id, { reason: second ? 'gift2' : 'gift', day: ctx.day });
    why = ok ? `loved ${kind === 'game' ? (extra.game?.title ?? 'the game') : giftName(kind)}` : `didn’t want ${giftName(kind)}`;
    if (!ok) trustMove = 0;
    // How they take this kind of gift is known from now on (the People book lists the tastes found out, one by one).
    if (kind !== 'game') learn(id, tasteFact(kind));
  }
  if (interaction === 'giveCoins' && ok && card?.traits.includes('businesslike')) why = 'appreciated the coins';
  const lines = card?.lines?.[interaction];
  // One draw for the line, whichever it ends up being (the draws that follow stay as they were).
  const lineDraw = rand();
  line = fill(pick(ok && lines?.length ? lines : SOCIAL_LINES[interaction][ok ? 'win' : 'lose'], lineDraw), id, extra);

  // A daily interaction that landed counts once a day; a miss always counts.
  const daily = rule.daily && ok && countedToday(id, `talk:${interaction}`, ctx.day);
  const tired = drawBattery(id, ctx.day, rule.battery);
  // Said again today, it moves nothing: they say so, unimpressed, rather than a label saying it.
  let reaction: Reaction | null = null;
  if (daily && !tired) {
    line = pick(REPEAT_LINES, lineDraw);
    reaction = 'shrug';
  }
  if (tired) {
    warmth = Math.min(warmth, 0) + BATTERY.over;
    line = pick(TIRED_LINES, rand());
    why = 'had talked enough for one day';
    ok = false;
    reaction = 'restless';
  }
  // Talk warms a person `GAIN.talkPerDay` a day at most (an apology mends past it); gifts and deeds are not capped.
  if (!daily && !tired && talkCapped(interaction)) warmth = talkWarmth(id, ctx.day, warmth);
  const memory = interaction === 'insult' ? 'you insulted me' : interaction === 'giveGame' && ok ? `you gave me ${extra.game?.title ?? 'a game'}` : interaction === 'apologise' && ok ? 'you apologised' : undefined;
  const change = daily && !tired
    ? null
    : nudge(id, { warmth, trust: trustMove, why, day: ctx.day, reason: rule.daily && ok ? `talk:${interaction}` : undefined, memory, gossip: rule.heard === true });

  // Gossip: the one talked about may hear of it (a gossip listening passes it on).
  if (interaction === 'gossip' && ok && extra.about && card?.traits.includes('gossip')) {
    nudge(extra.about, { warmth: -3, why: `heard you talked about them to ${shortName(id)}`, day: ctx.day });
  }

  const outcome: Outcome = { ok, line, reaction: reaction ?? reactionOf(interaction, ok, warmth), change, tired };
  if (ok && !tired) {
    if (interaction === 'askNumber') {
      giveNumber(id);
      outcome.number = true;
    }
    // Talking teaches: a fact now and then on a good talk, the trait that bent the odds when it showed.
    if (['chat', 'askDay', 'talkGames', 'gossip'].includes(interaction) && rand() < 0.5) {
      const fact = nextFact(id);
      if (fact && learn(id, fact.id)) {
        outcome.fact = fact;
        outcome.line = fact.says;
      }
    }
  }
  if (bentBy && learnTrait(id, bentBy)) outcome.trait = bentBy;
  for (const listener of [...performed]) listener(id, interaction, outcome, ctx, extra);
  return outcome;
}

/** Whether `id` agreed to a discount today (`askDiscount` landed): a shop takes 10% off once. */
export function discountToday(id: PersonId, day: number): boolean {
  return countedToday(id, 'talk:askDiscount', day);
}
