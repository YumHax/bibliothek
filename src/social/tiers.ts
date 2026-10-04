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

/** How a tier reached is said, `{name}` theirs: a sentence, never a symbol. */
const BECAME: Record<TierId, string> = {
  nemesis: '{name} is your nemesis now',
  hostile: '{name} is hostile to you now',
  cold: '{name} has gone cold on you',
  stranger: '{name} is civil with you again',
  acquaintance: 'You and {name} know each other now',
  friendly: '{name} is friendly with you now',
  friend: '{name} is a friend now',
  close: '{name} is a close friend now',
};

/**
 * A tier change in words, for the banner, the card and the journal: "Mrs Dubois is a friend now", "Mrs Dubois has
 * gone cold on you"; a fall that stays on the warm side is "Things have cooled with Mrs Dubois".
 */
export function tierChangeLine(name: string, before: TierId, after: TierId): string {
  if (tierRank(after) < tierRank(before) && tierRank(after) >= tierRank('stranger')) return `Things have cooled with ${name}`;
  return BECAME[after].replace('{name}', name);
}

/** How the book names a bond. */
export const BOND_NAMES: Record<Bond, string> = {
  friend: 'Friends',
  charmer: 'Likes you, doesn’t rely on you',
  business: 'Strictly business',
  enemy: 'At odds',
  neutral: 'Getting to know each other',
};
