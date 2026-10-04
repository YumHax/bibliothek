import { TIERS, WARMTH } from '@/social/socialPlan';
import { tierInfo, tierOf, tierRank } from '@/social/tiers';
import type { PersonState } from '@/social/types';
import { html, type Html } from '../panel/html';
import { icon } from './icons';

/*
 * How a standing is drawn (the conversation panel, the People book): warmth as a gauge from cold to warm with the
 * tiers' thresholds ticked on it and a fill from neutral to where you stand; trust as ten segments; the way to the
 * next tier as the share a portrait's ring is drawn round; the odds of an interaction as three pips.
 */

/** Warmth as a share of the gauge, 0 (coldest) .. 1 (warmest). */
function share(warmth: number): number {
  return (warmth - WARMTH.min) / (WARMTH.max - WARMTH.min);
}

/** The warmth gauge's variables for `warmth`: where the marker stands, where the fill from neutral starts and how wide it is. */
export function warmthVars(warmth: number): Record<string, string> {
  const at = share(warmth) * 100;
  const zero = share(0) * 100;
  return { '--at': `${at.toFixed(1)}%`, '--from': `${Math.min(at, zero).toFixed(1)}%`, '--span': `${Math.abs(at - zero).toFixed(1)}%` };
}

function styleOf(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
}

/** The warmth gauge: the tiers' thresholds ticked, filled from neutral to where you stand, a marker on it (all placed by its variables). */
export function warmthGauge(s: Readonly<PersonState>, options: { compact?: boolean } = {}): Html {
  const ticks = TIERS.slice(1).map((t) => html`<i class="social-gauge__tick" style="left:${(share(t.from) * 100).toFixed(1)}%"></i>`);
  const tier = tierInfo(tierOf(s.warmth, s.trust));
  return html`<span class="social-gauge social-gauge--warmth${options.compact ? ' social-gauge--compact' : ''}" style="--tier:${tier.colour};${styleOf(warmthVars(s.warmth))}" role="meter" aria-label="Warmth" aria-valuemin="${WARMTH.min}" aria-valuemax="${WARMTH.max}" aria-valuenow="${Math.round(s.warmth)}">
    <span class="social-gauge__track">${ticks}<b class="social-gauge__fill"></b></span>
    <span class="social-gauge__marker">${icon('heart', 0.85)}</span>
  </span>`;
}

/** Trust as ten segments, the last one part-filled: each segment reads `--trust` (0..100) and its own `--i`. */
export function trustGauge(s: Readonly<PersonState>, options: { compact?: boolean } = {}): Html {
  const segments = Array.from({ length: 10 }, (_, i) => html`<i style="--i:${i}"></i>`);
  return html`<span class="social-gauge social-gauge--trust${options.compact ? ' social-gauge--compact' : ''}" style="--trust:${s.trust.toFixed(1)}" role="meter" aria-label="Trust" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(s.trust)}">${segments}</span>`;
}

/**
 * How far along the way to the next tier the warmth is, 0..1 (1 at the top). Trust short of the next tier's holds it
 * at its tier: the ring then shows full warmth but the "held" note explains it.
 */
export function tierProgress(s: Readonly<PersonState>): number {
  const rank = tierRank(tierOf(s.warmth, s.trust));
  const here = TIERS[rank]!;
  const next = TIERS[rank + 1];
  if (!next) return 1;
  return Math.max(0, Math.min(1, (s.warmth - here.from) / (next.from - here.from)));
}

/** The odds as three pips (likely, fair, risky), or a question mark for someone the player can't read yet. */
export function oddsPips(odds: number, known: boolean): Html {
  if (!known) return html`<span class="social-odds social-odds--unknown" aria-hidden="true">?</span>`;
  const n = odds >= 0.75 ? 3 : odds >= 0.5 ? 2 : odds >= 0.3 ? 1 : 0;
  return html`<span class="social-odds social-odds--${n}" aria-hidden="true">${[0, 1, 2].map((i) => html`<i class="${i < n ? 'on' : ''}"></i>`)}</span>`;
}
