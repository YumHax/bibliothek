import { findPerson } from './people';
import { standing } from './standing';
import { atLeast, tierOf, tierRank } from './tiers';
import type { PersonId, SocialEffect, TierId } from './types';

/*
 * Perks and penalties (docs/social.md "What it does"): each person's `effects` say what their tier gives or takes.
 * A system asks `effect(id, key)` and uses its default when it is undefined, so nothing needs wiring:
 * `effect('leclerc', 'noiseThreshold') ?? 0.3`.
 */

/** Whether `e` is in force at tier `tier` with trust `trust`: a perk from its tier up, a penalty from its tier down. */
function inForce(e: SocialEffect, tier: TierId, trust: number): boolean {
  if (e.trust !== undefined && !e.down && trust < e.trust) return false;
  return e.down ? tierRank(tier) <= tierRank(e.at) : atLeast(tier, e.at);
}

/**
 * The value of `id`'s effect `key` now (`true` for an on / off one), or undefined when none of theirs is in force.
 * With several in force for one key (a perk and a deeper one), the one of the furthest tier wins.
 */
export function effect(id: PersonId, key: string): number | boolean | undefined {
  const card = findPerson(id);
  if (!card?.effects) return undefined;
  const s = standing(id);
  const tier = tierOf(s.warmth, s.trust);
  let best: SocialEffect | null = null;
  for (const e of card.effects) {
    if (e.key !== key || !inForce(e, tier, s.trust)) continue;
    if (!best || Math.abs(tierRank(e.at) - 3) > Math.abs(tierRank(best.at) - 3)) best = e;
  }
  return best ? (best.value ?? true) : undefined;
}

/** Whether `id`'s effect `key` is in force. */
export function has(id: PersonId, key: string): boolean {
  return effect(id, key) !== undefined;
}

/** A number effect of `id`'s, or `fallback`. */
export function effectValue(id: PersonId, key: string, fallback: number): number {
  const v = effect(id, key);
  return typeof v === 'number' ? v : fallback;
}

/** `id`'s effects, split: in force now, and the next ones up (what the book shows under "Next"). */
export function effectsOf(id: PersonId): { active: SocialEffect[]; next: SocialEffect[]; penalties: SocialEffect[] } {
  const card = findPerson(id);
  const s = standing(id);
  const tier = tierOf(s.warmth, s.trust);
  const active: SocialEffect[] = [];
  const next: SocialEffect[] = [];
  const penalties: SocialEffect[] = [];
  for (const e of card?.effects ?? []) {
    if (inForce(e, tier, s.trust)) active.push(e);
    else if (e.down) penalties.push(e);
    else next.push(e);
  }
  next.sort((a, b) => tierRank(a.at) - tierRank(b.at));
  return { active, next, penalties };
}

/** The effects that came into force (or went) between two tiers: what a banner says on a tier change. */
export function effectsCrossed(id: PersonId, before: TierId, after: TierId): { gained: SocialEffect[]; lost: SocialEffect[] } {
  const card = findPerson(id);
  const t = standing(id).trust;
  const gained: SocialEffect[] = [];
  const lost: SocialEffect[] = [];
  for (const e of card?.effects ?? []) {
    const was = inForce(e, before, t);
    const is = inForce(e, after, t);
    if (is && !was) gained.push(e);
    if (was && !is) lost.push(e);
  }
  return { gained, lost };
}
