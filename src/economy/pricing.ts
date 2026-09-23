import type { BoxCondition, Game, PlatformId } from '@/catalog/types';
import type { Views } from './Fame';

/*
 * THE ECONOMY'S NUMBERS, all in one place. Coins buy games and arcade plays; the cabinets pay in
 * tickets, exchanged at the prize counter. No public price source exists without an API key, so
 * prices are made up: a base per platform, times how famous the game is (its Wikipedia page views,
 * see `Fame`), times a small deterministic jitter from the game's id so two classics differ.
 */

/** Coins in a brand-new wallet: enough for a few arcade plays, not for a game. */
export const STARTING_COINS = 10;
/** One arcade play. */
export const PLAY_COST = 1;
/** The prize counter's rate. */
export const TICKETS_PER_COIN = 10;
/** Arcade score points per ticket paid out: a middling 15-second play scores 500-1000, a great one 2000+. */
export const POINTS_PER_TICKET = 50;

/**
 * Shop price of an ordinary game per platform, before the fame factor. Calibrated against the
 * arcade: a good player makes ~20 coins a minute there, so an ordinary market copy (about half the
 * shop price) is 4-5 minutes of play, a famous shop title 20-40.
 */
const BASE_PRICE: Record<PlatformId, number> = { nes: 160, snes: 240, gb: 120, megadrive: 200, n64: 280, ps1: 200 };

/**
 * Fame factor by monthly Wikipedia page views: no article 0.6x, an ordinary title with a stub
 * (~2 000 views) about 1x, a well-known one (~40 000) near 3x, the handful of legends 4x. Set as
 * `[log10(views), factor]` points, straight lines in between, flat beyond the ends.
 */
const FAME_CURVE: readonly (readonly [number, number])[] = [[2.5, 0.6], [3.3, 1], [4, 1.8], [4.6, 3], [5.3, 4]];
/** A game whose fame is unknown (offline, or Wikipedia unreachable) is priced as ordinary. */
const UNKNOWN_FAME_FACTOR = 1;
/** Per-title jitter around the fame factor, from the id. */
const JITTER = { min: 0.85, max: 1.15 };

/** Second-hand copies are cheaper the worse their state. */
const CONDITION_FACTOR: Record<BoxCondition, number> = { complete: 1, noManual: 0.8, worn: 0.6 };

/** The market's discount off the shop price, before the copy's condition (a daily factor within this range). */
export const MARKET_DISCOUNT = { min: 0.55, max: 0.85 };

/** Multiplier on the base price for a game with `views` monthly Wikipedia views (`null`: no article; `undefined`: unknown). */
export function fameFactor(views: Views): number {
  if (views === undefined) return UNKNOWN_FAME_FACTOR;
  const x = Math.log10(Math.max(1, views ?? 0));
  const first = FAME_CURVE[0]!;
  const last = FAME_CURVE[FAME_CURVE.length - 1]!;
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < FAME_CURVE.length; i++) {
    const [x1, y1] = FAME_CURVE[i]!;
    if (x > x1) continue;
    const [x0, y0] = FAME_CURVE[i - 1]!;
    return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return last[1];
}

/** What a copy of `game` costs new in the shop (integer coins, at least 1), given its fame. */
export function shopPrice(game: Pick<Game, 'id' | 'platform'>, views: Views): number {
  const jitter = JITTER.min + hash01(game.id) * (JITTER.max - JITTER.min);
  return Math.max(1, Math.round(BASE_PRICE[game.platform] * fameFactor(views) * jitter));
}

/** What the market asks for a copy in `condition`, given its fame and the day's discount in [MARKET_DISCOUNT.min, max]. */
export function marketPrice(game: Pick<Game, 'id' | 'platform'>, views: Views, condition: BoxCondition, discount: number): number {
  return Math.max(1, Math.round(shopPrice(game, views) * discount * CONDITION_FACTOR[condition]));
}

export function ticketsFor(score: number): number {
  return Math.max(0, Math.floor(score / POINTS_PER_TICKET));
}

/** Plain-English state of a copy, for labels and rows ('' for a complete one). */
export function describeCondition(condition: BoxCondition | undefined): string {
  switch (condition) {
    case 'noManual': return 'no manual';
    case 'worn': return 'worn, no manual';
    default: return '';
  }
}

/** Deterministic [0, 1) from a string (FNV-1a, folded). */
export function hash01(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 100000) / 100000;
}
