import { WARMTH } from '@/social/socialPlan';
import { tierInfo, tierOf } from '@/social/tiers';
import type { PersonState } from '@/social/types';
import { html, type Html } from '../panel/html';

/*
 * How someone stands with the player, drawn the same everywhere (the conversation, the People book), the way The
 * Sims draws a friendship: one bar from cold on the left to warm on the right, neutral in the middle, filled from the
 * middle to where they stand, in their tier's colour. No ticks, no numbers: the tier's name beside it says the rest.
 */

/** Warmth as a share of the bar, 0 (coldest) .. 1 (warmest); neutral is the middle. */
function share(warmth: number): number {
  return (warmth - WARMTH.min) / (WARMTH.max - WARMTH.min);
}

/** Where `warmth` stands on the bar, in percent from its left end. */
function meterAt(warmth: number): number {
  return share(warmth) * 100;
}

/** The bar's variables for `warmth`: where the fill from the middle starts and how wide it is (set again to ease). */
export function meterVars(warmth: number): Record<string, string> {
  const at = meterAt(warmth);
  const zero = meterAt(0);
  return { '--from': `${Math.min(at, zero).toFixed(1)}%`, '--span': `${Math.abs(at - zero).toFixed(1)}%` };
}

/** The relationship bar for `s` (`compact` for a list's line). */
export function relationMeter(s: Readonly<PersonState>, options: { compact?: boolean } = {}): Html {
  const tier = tierInfo(tierOf(s.warmth, s.trust));
  const vars = Object.entries(meterVars(s.warmth))
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
  return html`<span class="social-meter${options.compact ? ' social-meter--compact' : ''}" style="--tier:${tier.colour};${vars}" role="meter" aria-label="How much they like you" aria-valuemin="${WARMTH.min}" aria-valuemax="${WARMTH.max}" aria-valuenow="${Math.round(s.warmth)}" aria-valuetext="${tier.name}"><b class="social-meter__fill"></b></span>`;
}
