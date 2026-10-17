import { findPerson } from './people';
import { STAMP, TIERS } from './socialPlan';
import type { PersonId, TierId } from './types';

/*
 * The warmth tiers (docs/social.md "Two axes"). Pure: a tier is read from warmth and trust each time, never stored
 * but as the last one announced (`PersonState.told`).
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

/** Whether `id` is one of the tier ids (a save read back, a debug command). */
export function isTier(id: unknown): id is TierId {
  return typeof id === 'string' && (ORDER as readonly string[]).includes(id);
}

/** The tier of a warmth and a trust: the warmest whose `from` the warmth reaches and whose `trust` the trust does. */
export function tierOf(warmth: number, trust: number): TierId {
  let tier: TierId = 'nemesis';
  for (const t of TIERS) if (warmth >= t.from && trust >= t.trust) tier = t.id;
  return tier;
}

/** The tier the warmth alone would reach (trust holds them a tier lower: "I'd like to know I can count on you"). */
export function warmthTier(warmth: number): TierId {
  let tier: TierId = 'nemesis';
  for (const t of TIERS) if (warmth >= t.from) tier = t.id;
  return tier;
}

/** How the tier is shown: its name, colour. */
export function tierInfo(id: TierId): (typeof TIERS)[number] {
  return TIERS[tierRank(id)]!;
}

/**
 * The tier's word for `person`: a light person (a clerk, a stallholder) is read on the short ladder (New face,
 * Regular, Old friend), anyone else by the tier's name.
 */
export function tierName(id: TierId, person?: PersonId): string {
  const t = tierInfo(id);
  return person && (findPerson(person)?.depth ?? 'light') === 'light' ? t.light : t.name;
}

/**
 * Where a standing is on the way to the next tier (the bar of the card and the book, docs/social.md "The bar"): the
 * share of the warmth between this tier's floor and the next one's (0 at the floor, 1 at the next), the next tier,
 * and whether trust, not warmth, is what holds them (`held`: the bar is full and stays so until a promise is kept).
 * At a close friend the bar is full; below polite it fills towards polite.
 */
export function tierProgress(warmth: number, trust: number): { tier: TierId; next: TierId | null; share: number; held: boolean } {
  const tier = tierOf(warmth, trust);
  const rank = tierRank(tier);
  const next = TIERS[rank + 1];
  if (!next) return { tier, next: null, share: 1, held: false };
  const from = TIERS[rank]!.from;
  const share = Math.max(0, Math.min(1, (warmth - from) / (next.from - from)));
  return { tier, next: next.id, share, held: warmth >= next.from && trust < next.trust };
}

/** The stamps of trust (each a promise kept's worth, `STAMP`): what the card and the book show of trust. */
export function stampsOf(trust: number): number {
  return Math.floor(trust / STAMP + 1e-6);
}

/** How a tier reached is said, `{name}` theirs: a sentence, never a symbol. */
const BECAME: Record<TierId, string> = {
  nemesis: '{name} is your nemesis now',
  hostile: '{name} is hostile to you now',
  cold: '{name} has gone cold on you',
  polite: '{name} is civil with you again',
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
  if (tierRank(after) < tierRank(before) && tierRank(after) >= tierRank('polite')) return `Things have cooled with ${name}`;
  return BECAME[after].replace('{name}', name);
}
