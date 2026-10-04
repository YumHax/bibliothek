import type { BoxCondition } from '@/catalog/types';

/*
 * THE SMALL ADS' NUMBERS (docs/economy.md "Small ads and the seller's flat"): how many private sellers advertise in
 * THE GAMING WEEKLY, when they are in, what they have and how they haggle. All first guesses. A game day is ten real
 * minutes (`DayNight`): an hour of the clock is 25 s, so a visit's window is a whole stretch of the day, never an hour.
 */

/** Who puts an ad in the paper: the parent clearing a grown-up child's games, someone moving away, a collector thinning out, a loft found full. */
export type SellerKind = 'clearOut' | 'mover' | 'collector' | 'loft';

interface SellerProfile {
  /** One platform (a child's console, a collector's speciality), or a mix. */
  platforms: 'one' | 'mixed';
  /** How many games in the lot. */
  lot: readonly [min: number, max: number];
  /** Their asking price as a share of the market's usual (`marketPrice`'s discount); the loft's is per copy, they have no idea. */
  discount: readonly [min: number, max: number];
  /** The box's state: shares of worn and of no-manual copies (the rest complete). */
  condition: { worn: number; noManual: number };
  /** Odds a copy is a first print. */
  firstPrint: number;
  /** How they haggle: the lowest share moved (negative: they go lower; capped like any sway, `NEGOTIATION.maxSway`), offers of patience added. */
  haggle: { floor: number; patience: number };
  /** Odds the console the games were played on is for sale too, broken (`src/repair/`). */
  console: number;
  /** When they are in: hours of the clock [from, to] (the visit's window, `visit` round it). */
  hours: readonly (readonly [from: number, to: number])[];
}

export const SELLERS: Readonly<Record<SellerKind, SellerProfile>> = {
  clearOut: { platforms: 'one', lot: [4, 7], discount: [0.35, 0.5], condition: { worn: 0.3, noManual: 0.4 }, firstPrint: 0.04, haggle: { floor: -0.1, patience: 2 }, console: 0.65, hours: [[17, 22], [10, 14]] },
  mover: { platforms: 'mixed', lot: [3, 6], discount: [0.5, 0.65], condition: { worn: 0.15, noManual: 0.3 }, firstPrint: 0.06, haggle: { floor: -0.05, patience: 1 }, console: 0.3, hours: [[8, 12], [17, 21]] },
  collector: { platforms: 'one', lot: [3, 5], discount: [0.7, 0.85], condition: { worn: 0, noManual: 0.1 }, firstPrint: 0.3, haggle: { floor: 0.06, patience: -1 }, console: 0.15, hours: [[18, 22]] },
  loft: { platforms: 'mixed', lot: [5, 8], discount: [0.25, 1.05], condition: { worn: 0.35, noManual: 0.35 }, firstPrint: 0.1, haggle: { floor: -0.08, patience: 1 }, console: 0.45, hours: [[10, 19], [12, 20]] },
};

export const CLASSIFIEDS = {
  /** Ads put in on a game day: none this often, two this often, else one. */
  perDay: { none: 0.3, two: 0.25 },
  /** Each kind's share of the ads. */
  kinds: { clearOut: 0.35, mover: 0.25, collector: 0.2, loft: 0.2 } as Readonly<Record<SellerKind, number>>,
  /** Game days an ad stays in the paper (the day it goes in and the next). */
  lasts: 3,
  /** The flat lets the player up from this long (h) before the window opens, and keeps them up to this long after it shuts. */
  visit: { early: 0.5, late: 1.5 },
  /**
   * A visit is booked for today only with at least this much of the window left (h of the clock: three are 75 real
   * seconds, about the walk from the bedroom's phone down the stairs and along Front Street to the mansion block's bell).
   */
  todayIfLeft: 3,
  /** Ads read in the paper remembered this many days. */
  seenDays: 6,
} as const;

/** What a condition drawn from `u` (0..1) is, by a seller's odds. */
export function sellerCondition(u: number, odds: SellerProfile['condition']): BoxCondition {
  return u < odds.worn ? 'worn' : u < odds.worn + odds.noManual ? 'noManual' : 'complete';
}
