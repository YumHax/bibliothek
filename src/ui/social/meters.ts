import { STAMP, TIERS } from '@/social/socialPlan';
import { stampsOf, tierInfo, tierName, tierProgress, tierRank } from '@/social/tiers';
import type { PersonId, PersonState } from '@/social/types';
import { html, type Html } from '../panel/html';

/*
 * How someone stands with the player, drawn the same everywhere (the conversation, the People book): one bar, the
 * way to the next tier (empty at this tier's floor, full at the next one's), in the tier's colour, so a few points
 * of warmth show; full and waiting while trust is what holds them (`tierProgress.held`). Beside it the stamps of trust
 * (`stampsOf`): each a promise kept's worth. No ticks, no numbers: the badge beside it says the rest.
 */

/** The bar's share (0..1) for `s`. */
export function meterShare(s: Readonly<PersonState>): number {
  const p = tierProgress(s.warmth, s.trust);
  return p.held ? 1 : p.share;
}

/** The relationship bar for `s` (`compact` for a list's line; `person` for the words their depth reads the tier by). */
export function relationMeter(s: Readonly<PersonState>, options: { compact?: boolean; person?: PersonId } = {}): Html {
  const p = tierProgress(s.warmth, s.trust);
  const tier = tierInfo(p.tier);
  const share = p.held ? 1 : p.share;
  const word = tierName(p.tier, options.person);
  const next = p.next ? tierName(p.next, options.person) : null;
  const said = next && next !== word ? (p.held ? `${word}, waiting to count on you` : `${word}, on the way to ${next}`) : word;
  return html`<span class="social-meter${options.compact ? ' social-meter--compact' : ''}${p.held ? ' social-meter--held' : ''}" style="--tier:${tier.colour};--share:${(share * 100).toFixed(1)}%" role="meter" aria-label="How close you are" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(share * 100)}" aria-valuetext="${said}"><b class="social-meter__fill"></b></span>`;
}

/**
 * The stamps of trust: the ones earned, filled, and the ones the next tier still asks, empty (at most four: a close
 * friend's). Nothing when no tier above asks for any (a light person's shop counter, a close friend's full set).
 */
export function trustStamps(s: Readonly<PersonState>): Html {
  const have = stampsOf(s.trust);
  const p = tierProgress(s.warmth, s.trust);
  const nextNeed = p.next ? Math.ceil((TIERS[tierRank(p.next)]?.trust ?? 0) / STAMP) : 0;
  const shown = Math.min(4, Math.max(have, nextNeed));
  if (!shown) return html``;
  const dots = Array.from({ length: shown }, (_, i) => html`<i class="social-stamp${i < have ? ' social-stamp--kept' : ''}"></i>`);
  return html`<span class="social-stamps" role="img" aria-label="${have ? `Kept your word ${have === 1 ? 'once' : `${have} times`}` : 'Not counted on you yet'}">${dots}</span>`;
}
