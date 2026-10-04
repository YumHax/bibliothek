import { findPerson, shortName } from './people';
import { isBirthday, moodOf } from './mood';
import { giftName, giftWarmth, type GameGift } from './gifts';
import { INTERACTIONS, MOODS, ODDS, TRAITS, BATTERY } from './socialPlan';
import { BIRTHDAY_LINES, COLD_LINES, HELLO_LINES, HOSTILE_LINES, SOCIAL_LINES, TIRED_LINES } from './socialLines';
import { countedToday, drawBattery, talkWarmth, giveNumber, learn, learnTrait, meet, nudge, standing } from './standing';
import { atLeast, tierOf, tierRank } from './tiers';
import type { GiftKind, InteractionId, PersonFact, PersonId, SocialChange, SocialPlace, Trait } from './types';
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

/** How their body takes what was said (`world/people` acts it: a laugh, a nod, a shrug, arms folded). */
export type Reaction = 'pleased' | 'laugh' | 'thanks' | 'nod' | 'shrug' | 'annoyed' | 'hurt';

/** An interaction as the panel offers it. */
export interface OptionView {
  id: InteractionId;
  label: string;
  group: (typeof INTERACTIONS)[InteractionId]['group'];
  /** The odds it lands, 0..1. */
  odds: number;
  /** Whether the player knows them well enough to read the odds (▲▲ ▲ ? ▼); else "?". */
  oddsKnown: boolean;
  /** Why it is not open now, or null. */
  disabled: string | null;
}

/** What trying an interaction did. */
export interface Outcome {
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

/** What goes with an interaction: the gift, the game, whom it is about. */
export interface InteractionExtra {
  gift?: GiftKind;
  game?: GameGift;
  about?: PersonId;
}

/** Whether `id` knows the player well enough for the odds to show: a trait found out, or acquaintance reached. */
function readable(id: PersonId): boolean {
  const s = standing(id);
  return s.traitsKnown.length > 0 || atLeast(tierOf(s.warmth, s.trust), 'acquaintance');
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

/** The interactions open with `id` here and now, in the panel's order. */
export function optionsFor(id: PersonId, ctx: TalkContext): OptionView[] {
  const s = standing(id);
  const tier = tierOf(s.warmth, s.trust);
  const known = readable(id);
  const out: OptionView[] = [];
  for (const [key, rule] of Object.entries(INTERACTIONS) as [InteractionId, (typeof INTERACTIONS)[InteractionId]][]) {
    if (rule.notAt?.includes(ctx.place)) continue;
    if (rule.below && atLeast(tier, rule.below)) continue;
    if (key === 'askNumber' && (s.number || !findPerson(id)?.phone)) continue;
    let disabled: string | null = null;
    if (rule.from && !atLeast(tier, rule.from)) disabled = `Not close enough yet (${rule.from})`;
    out.push({ id: key, label: rule.label, group: rule.group, odds: oddsOf(id, key, ctx).odds, oddsKnown: known, disabled });
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
  return { line: pick(card?.lines?.hello ?? HELLO_LINES, r), introduced: false };
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
  let why: string = ok ? `liked the ${rule.label.toLowerCase()}` : `didn’t like the ${rule.label.toLowerCase()}`;
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
  }
  if (interaction === 'giveCoins' && ok && card?.traits.includes('businesslike')) why = 'appreciated the coins';
  const lines = card?.lines?.[interaction];
  line = fill(pick(ok && lines?.length ? lines : SOCIAL_LINES[interaction][ok ? 'win' : 'lose'], rand()), id, extra);

  // A daily interaction that landed counts once a day; a miss always counts.
  const daily = rule.daily && ok && countedToday(id, `talk:${interaction}`, ctx.day);
  const tired = drawBattery(id, ctx.day, rule.battery);
  if (tired) {
    warmth = Math.min(warmth, 0) + BATTERY.over;
    line = pick(TIRED_LINES, rand());
    why = 'had talked enough for one day';
    ok = false;
  }
  // Talk warms a person `GAIN.talkPerDay` a day at most (an apology mends past it); gifts and deeds are not capped.
  if (!daily && !tired && (rule.group === 'talk' || rule.group === 'mean') && interaction !== 'apologise') warmth = talkWarmth(id, ctx.day, warmth);
  const memory = interaction === 'insult' ? 'you insulted me' : interaction === 'giveGame' && ok ? `you gave me ${extra.game?.title ?? 'a game'}` : interaction === 'apologise' && ok ? 'you apologised' : undefined;
  const change = daily && !tired
    ? null
    : nudge(id, { warmth, trust: trustMove, why, day: ctx.day, reason: rule.daily && ok ? `talk:${interaction}` : undefined, memory, gossip: rule.heard === true });

  // Gossip: the one talked about may hear of it (a gossip listening passes it on).
  if (interaction === 'gossip' && ok && extra.about && card?.traits.includes('gossip')) {
    nudge(extra.about, { warmth: -3, why: `heard you talked about them to ${shortName(id)}`, day: ctx.day });
  }

  const outcome: Outcome = { ok, line, reaction: reactionOf(interaction, ok, warmth), change, tired };
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
