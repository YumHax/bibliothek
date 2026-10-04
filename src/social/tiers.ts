import { BOND, TIERS } from './socialPlan';
import type { Bond, TierId } from './types';

/*
 * The warmth tiers and the bonds (docs/social.md "Two axes"). Pure: a tier is read from warmth and trust each
 * time, never stored but as the last one announced (`PersonState.told`).
 */

/** The tiers' order, coldest first. */
const ORDER: readonly TierId[] = TIERS.map((t) => t.id);

/** The tier `id`'s place in the order (0 = nemesis). */
export function tierRank(id: TierId): number {
  return ORDER.indexOf(id);
}

/** Whether tier `a` is `b` or warmer. */
export function atLeast(a: TierId, b: TierId): boolean {
  return tierRank(a) >= tierRank(b);
}

/** The tier of a warmth and a trust: the warmest whose `from` the warmth reaches and whose `trust` the trust does. */
export function tierOf(warmth: number, trust: number): TierId {
  let tier: TierId = 'nemesis';
  for (const t of TIERS) if (warmth >= t.from && trust >= t.trust) tier = t.id;
  return tier;
}

/** The tier the warmth alone would reach (the book shows "trust holds them at Friendly"). */
export function warmthTier(warmth: number): TierId {
  let tier: TierId = 'nemesis';
  for (const t of TIERS) if (warmth >= t.from) tier = t.id;
  return tier;
}

/** How the tier is shown: its name, glyph, colour. */
export function tierInfo(id: TierId): (typeof TIERS)[number] {
  return TIERS[tierRank(id)]!;
}

/** What the two axes make together: a friend (warm, trusted), a charmer (warm, not relied on), business (trusted, cool), an enemy. */
export function bondOf(warmth: number, trust: number): Bond {
  const warm = warmth >= BOND.warm;
  const trusted = trust >= BOND.trusted;
  if (warm && trusted) return 'friend';
  if (warm) return 'charmer';
  if (warmth <= BOND.cold) return trusted ? 'business' : 'enemy';
  return trusted ? 'business' : 'neutral';
}

/** How the book names a bond. */
export const BOND_NAMES: Record<Bond, string> = {
  friend: 'Friends',
  charmer: 'Likes you, doesn’t rely on you',
  business: 'Strictly business',
  enemy: 'At odds',
  neutral: 'Getting to know each other',
};
