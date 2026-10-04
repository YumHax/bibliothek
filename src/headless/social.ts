/*
 * What `scripts/social-sim.mjs` runs (`npm run social`, docs/checks.md): simulated players living with the cast of
 * `social/people` for some game days, through the real rules (`conversation.perform`, the standing, the drift, the
 * perks). The store is module-level: the script bundles this module afresh for each run.
 */
import { mulberry32 } from '@/random';
import { optionsFor, perform, type TalkContext } from '@/social/conversation';
import { FAVOURS } from '@/social/life/favoursPlan';
import { everyone } from '@/social/people';
import { effectsOf } from '@/social/perks';
import { meet, nudge, settleDay, standing } from '@/social/standing';
import { atLeast, tierOf } from '@/social/tiers';
import type { GiftKind, InteractionId, PersonCard, SocialGroup, SocialPlace } from '@/social/types';

/** How a simulated player lives: how likely they meet someone of each group a day, how much they talk, give, help. */
interface Profile {
  meet: Record<SocialGroup, number>;
  /** Interactions per meeting. */
  talks: number;
  /** Odds a meeting comes with a gift they like, a game given, a favour done. */
  gift: number;
  game: number;
  favour: number;
}

export const PROFILES: Record<'typical' | 'diligent', Profile> = {
  typical: { meet: { building: 0.35, friends: 0.25, street: 0.3, market: 0.25, arcade: 0.2, rivals: 0.12 }, talks: 2, gift: 1 / 6, game: 1 / 40, favour: 1 / 20 },
  diligent: { meet: { building: 1, friends: 1, street: 1, market: 1, arcade: 1, rivals: 1 }, talks: 4, gift: 1 / 2, game: 1 / 10, favour: 1 / 6 },
};

/** Where each group is talked to. */
const PLACE: Record<SocialGroup, SocialPlace> = { building: 'stairs', friends: 'flat', street: 'street', market: 'market', arcade: 'arcade', rivals: 'saleroom' };

/** A seeded draw: the game's own generator (`@/random`), so the sim and the play draw alike. */
const rng = mulberry32;

/** What a person's sim ended on. */
export interface SimRow {
  id: string;
  group: SocialGroup;
  warmth: number;
  trust: number;
  tier: string;
  perks: string[];
  /** Perks still out of reach (`key@tier`). */
  missing: string[];
}

/** The best talk on offer: the likeliest, not done today (a landed daily one counts once). */
function bestTalk(card: PersonCard, ctx: TalkContext, done: Set<InteractionId>): InteractionId | null {
  const options = optionsFor(card.id, ctx).filter((o) => !o.disabled && o.group === 'talk' && o.id !== 'gossip' && !done.has(o.id));
  options.sort((a, b) => b.odds - a.odds);
  return options[0]?.id ?? null;
}

function likedGift(card: PersonCard): GiftKind {
  return card.likes?.find((g) => g !== 'game' && g !== 'coins') ?? 'croissant';
}

/** `days` game days of `profile`'s player; returns everyone's standing at the end. */
export function simulate(profile: Profile, days: number, seed: number): SimRow[] {
  const rand = rng(seed);
  const cast = everyone();
  for (let day = 1; day <= days; day++) {
    settleDay(day);
    for (const card of cast) {
      if (rand() >= profile.meet[card.group]) continue;
      const hour = 9 + rand() * 11;
      const ctx: TalkContext = { day, hour, place: PLACE[card.group], rand };
      meet(card.id, day);
      const done = new Set<InteractionId>();
      for (let i = 0; i < profile.talks; i++) {
        const id = bestTalk(card, ctx, done);
        if (!id) break;
        done.add(id);
        perform(card.id, id, ctx);
      }
      const open = new Set(optionsFor(card.id, ctx).filter((o) => !o.disabled).map((o) => o.id));
      if (open.has('giveGift') && rand() < profile.gift) perform(card.id, 'giveGift', ctx, { gift: likedGift(card) });
      if (open.has('giveGame') && rand() < profile.game) perform(card.id, 'giveGame', ctx, { game: { title: 'A game they like', platform: card.tastes?.platforms?.[0] ?? 'nes', genres: card.tastes?.genres ? [...card.tastes.genres] : [] } });
      const s = standing(card.id);
      if (atLeast(tierOf(s.warmth, s.trust), 'acquaintance') && rand() < profile.favour) nudge(card.id, { warmth: FAVOURS.done.warmth, trust: FAVOURS.done.trust, why: 'favour', day });
    }
  }
  return cast.map((card) => {
    const s = standing(card.id);
    const { active, next } = effectsOf(card.id);
    return { id: card.id, group: card.group, warmth: s.warmth, trust: s.trust, tier: tierOf(s.warmth, s.trust), perks: active.filter((e) => !e.down).map((e) => e.key), missing: next.map((e) => `${e.key}@${e.at}`) };
  });
}

/** One day's spam: `times` interactions with `id` in a row, from a stranger. Returns the warmth and trust it gained. */
export function spam(id: string, times: number, seed: number): { warmth: number; trust: number } {
  const rand = rng(seed);
  const card = everyone().find((p) => p.id === id)!;
  const before = standing(id);
  const w0 = before.warmth;
  const t0 = before.trust;
  const ctx: TalkContext = { day: 1, hour: 14, place: PLACE[card.group], rand };
  meet(id, 1);
  for (let i = 0; i < times; i++) {
    const option = optionsFor(id, ctx).filter((o) => !o.disabled && o.group === 'talk').sort((a, b) => b.odds - a.odds)[i % 3];
    if (option) perform(id, option.id, ctx);
  }
  const after = standing(id);
  return { warmth: after.warmth - w0, trust: after.trust - t0 };
}
