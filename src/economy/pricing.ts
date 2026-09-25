import type { BoxCondition, Edition, Game, PlatformId } from '@/catalog/types';
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
/** Arcade score points per ticket paid out, for a game `PAYOUT` does not list. */
export const POINTS_PER_TICKET = 50;

/**
 * Points per ticket, per arcade game (by the id its machine reports). The games score on very
 * different scales (a pinball ball is worth tens of thousands, a roll up the alley a few hundred)
 * and last differently long (BRICK STORM runs 30 s, the others 15, a pinball game a minute or
 * two), so each rate is set for a decent play to pay about the same tickets per minute: roughly
 * 35-40 tickets for a decent 15-second cabinet play. First estimates: retune a rate when one game
 * turns out to be the obvious earner (see docs/economy.md).
 */
export const PAYOUT: Readonly<Record<string, number>> = {
  breakout: 70,
  invaders: 40,
  stacker: 50,
  arrows: 32,
  snake: 40,
  comets: 40,
  pinball: 200,
  alley: 6,
  duel: 15,
  stepbeat: 120,
  sheriff: 120,
  hoops: 6,
  /** LexiPunk's scale is its own: a first guess until the site's scores are seen. */
  lexipunk: 50,
  /** The ticket wheel's score is the tickets it landed on. */
  wheel: 1,
};

/** Points one ticket costs on `gameId`. */
export function pointsPerTicket(gameId: string): number {
  return PAYOUT[gameId] ?? POINTS_PER_TICKET;
}

/** Tickets a score of `score` on `gameId` pays. */
export function ticketsFor(gameId: string, score: number): number {
  return Math.max(0, Math.floor(score / pointsPerTicket(gameId)));
}

/**
 * Broke, and not even a coin's worth of tickets: the house stands the play (ticket machines only),
 * so the loop never dead-ends.
 */
export function playIsFree(wallet: { readonly coins: number; readonly tickets: number }): boolean {
  return wallet.coins === 0 && wallet.tickets < TICKETS_PER_COIN;
}

/** What the change machine coughs up on a day it works: coins, and how often a day it works. */
export const CHANGE_MACHINE = { minCoins: 1, maxCoins: 3, workingOdds: 0.25 };

/** The daily challenge's reward range in tickets (the day picks one in it). */
export const CHALLENGE_REWARD = { min: 50, max: 90 };

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

/** Everything in the bargain bin goes at this flat price, whatever it is (worn copies; the odd gem is the point). */
export const BARGAIN_PRICE = 25;

/**
 * What the WE BUY desk pays for a game from the collection, as a share of its shop price (then the
 * copy's condition). Below the cheapest a market copy ever goes after haggling, so selling and
 * buying back never makes money.
 */
export const BUY_BACK_SHARE = 0.3;

/*
 * THE FLEA MARKET'S FINER RULES: haggling as a negotiation, editions and fakes, holds and orders,
 * lots, swaps, the notice board, the coffee, the regulars. See docs/economy.md.
 */

/**
 * A negotiation: the stallholder has a secret lowest price (a share of the tag, by kind of copy)
 * and a patience of `patience` offers. The three offers are shares of the tag. An offer at or over
 * the lowest price is taken; one under it gets a counter-offer, and one far under it (`insult`)
 * costs an extra point of patience and sours the stall's mood for the day.
 */
export const NEGOTIATION = {
  offers: { cheeky: 0.65, fair: 0.8, polite: 0.9 },
  /** The lowest share of the tag the stallholder will take, drawn per copy and day in this range. */
  floor: {
    ordinary: [0.72, 0.9],
    worn: [0.62, 0.82],
    showpiece: [0.86, 0.97],
  } as Record<'ordinary' | 'worn' | 'showpiece', [number, number]>,
  patience: 3,
  /**
   * Whatever sways them, no stallholder goes under this share of the tag: with the day's deepest
   * discount and a fair's 10 % off it stays above what the WE BUY desk pays at the top reputation,
   * so buying to sell back never pays.
   */
  lowest: 0.7,
  /** An offer this far (share of the tag) under the lowest price is an insult. */
  insult: 0.12,
  /** Each soured mood point today raises the lowest price by this share (and costs a point of patience). */
  moodPenalty: 0.04,
  /** A coffee today: the player is in a good mood and it shows. */
  coffee: { floor: -0.03, patience: 1 },
  /** Rain keeps the crowd away: stallholders are keener. */
  rain: -0.03,
  /** Per loyalty tier with that stall. */
  loyalty: -0.03,
} as const;

/** How a copy's printing moves its price, and how often a stall copy is a first print or a budget re-release. */
export const EDITION_FACTOR = { firstPrint: 1.45, standard: 1, budget: 0.75 } as const;
export const EDITION_ODDS = { firstPrint: 0.08, budget: 0.18 };
/** What each platform's budget re-release line was called. */
export const BUDGET_LABEL: Record<PlatformId, string> = {
  nes: 'Classic Series',
  snes: "Player's Choice",
  gb: "Player's Choice",
  megadrive: 'Sega Classics',
  n64: "Player's Choice",
  ps1: 'Greatest Hits',
};

/** Share of a stall's ordinary finds that are Japanese imports, and their price against a western copy's. */
export const IMPORT = { odds: 0.07, price: 0.7 };
/** Chance a market day that one stall has a first print of a game the player owns in an ordinary printing. */
export const UPGRADE_ODDS = 0.5;

/** Share of ordinary stall copies that are reproductions passed off as real (the tell is inside the box). */
export const REPRO_ODDS = 0.06;
/** What the WE BUY desk pays for a reproduction, whatever it claims to be. */
export const REPRO_BUY_BACK = 1;
/** A reproduction found out while it is still on the stall: the stallholder lets it go for this share of the tag to be rid of it. */
export const REPRO_CAUGHT = 0.3;
/** Chance a market day that a well-known game hides in the bargain bin, at the bin's price. */
export const BIN_GEM_ODDS = 0.15;

/** Holding a copy for the day: a share of its price, paid now, counted towards the price. */
export const HOLD_DEPOSIT = 0.1;

/** A second-hand copy ordered at the mail-order counter: deposit share, the days it takes, and its price (a share of the shop price, complete). */
export const MARKET_ORDER = { deposit: 0.2, days: 2, share: 0.72 };

/** The day's job lot: this many games, sold together at this share of what they would cost one by one. */
export const JOB_LOT = { min: 4, max: 6, share: 0.55 };

/** A game swapped at a stall counts for this share of its shop price (times its condition): more than the WE BUY desk, less than a stall asks. */
export const TRADE_SHARE = 0.42;

/** The notice board: collectors pay this share of a game's shop price (drawn in the range), for this many market days. */
export const WANTED_AD = { perDay: 3, share: [0.62, 0.8] as [number, number], days: 3 };
/** Private sellers' cards: this many a day, at this share of the shop price, delivered to the parcel. */
export const FOR_SALE_AD = { perDay: 2, share: [0.45, 0.6] as [number, number] };

/** A coffee from the cart. */
export const COFFEE_PRICE = 2;

/** Changing one's mind after buying: within this many seconds, for this share back. */
export const UNDO_PURCHASE = { seconds: 8, refund: 0.9 };

/** Other shoppers buy too: one purchase every so many seconds on average while someone browses, never more than this share of the day's stall stock. */
export const RIVAL_BUYING = { meanSeconds: 55, maxShare: 0.25 };

/**
 * The market's view of the player, lifetime: reputation points per deed, and the levels they
 * reach. Level 2 opens the glass case; every level adds to what the WE BUY desk pays.
 */
export const REPUTATION = {
  points: { buy: 1, sell: 1, deal: 1, swap: 1, lot: 2, wanted: 3, set: 10 },
  levels: [
    { at: 0, name: 'Newcomer' },
    { at: 10, name: 'Regular' },
    { at: 30, name: 'Known face' },
    { at: 70, name: 'Trusted' },
    { at: 150, name: 'Legend of the market' },
  ],
  glassCaseLevel: 2,
  /** From this level, an estate sale keeps one more famous game back for the player. */
  earlyAccessLevel: 3,
  /** Added to `BUY_BACK_SHARE` per level (0.34 at the top: see `NEGOTIATION.lowest`). */
  buyBackBonus: 0.01,
} as const;

/** Buys at one stall that make the player a regular, a friend, the best customer there. */
export const LOYALTY = { tiers: [3, 8, 15], names: ['Regular', 'Friend', 'Best customer'], wantedOddsBoost: 1.75 } as const;

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

/** What the market asks for a copy in `condition` (and `edition`), given its fame and the day's discount in [MARKET_DISCOUNT.min, max]. */
export function marketPrice(game: Pick<Game, 'id' | 'platform'>, views: Views, condition: BoxCondition, discount: number, edition: Edition = 'standard'): number {
  return Math.max(1, Math.round(shopPrice(game, views) * discount * CONDITION_FACTOR[condition] * EDITION_FACTOR[edition]));
}

/**
 * What the WE BUY desk offers for `game` (its condition and edition; a reproduction fetches
 * `REPRO_BUY_BACK`), integer coins, at least 1. `bonus` is the player's reputation share on top.
 */
export function buyBackPrice(game: Pick<Game, 'id' | 'platform' | 'condition' | 'edition' | 'repro'>, views: Views, bonus = 0): number {
  if (game.repro) return REPRO_BUY_BACK;
  return Math.max(1, Math.round(shopPrice(game, views) * (BUY_BACK_SHARE + bonus) * CONDITION_FACTOR[game.condition ?? 'complete'] * EDITION_FACTOR[game.edition ?? 'standard']));
}

/** What `game` counts for in a swap at a stall (a reproduction nearly nothing), integer coins. */
export function tradeValue(game: Pick<Game, 'id' | 'platform' | 'condition' | 'edition' | 'repro'>, views: Views): number {
  if (game.repro) return REPRO_BUY_BACK;
  return Math.max(1, Math.round(shopPrice(game, views) * TRADE_SHARE * CONDITION_FACTOR[game.condition ?? 'complete'] * EDITION_FACTOR[game.edition ?? 'standard']));
}

/** How a copy's printing reads on a tag or a panel ('' for the standard run). */
export function describeEdition(edition: Edition | undefined, platform: PlatformId): string {
  switch (edition) {
    case 'firstPrint': return 'first print';
    case 'budget': return BUDGET_LABEL[platform];
    default: return '';
  }
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

/**
 * A bookcase kit for the bedroom, for the games the collection room has no room left for (about
 * 170 NES boxes): a bit over ten minutes at the cabinets, dearer than any ordinary copy.
 */
export const BOOKCASE_PRICE = 250;

// --- The arcade's extras: medals, streaks, the weekly league, the wheel, the mystery game -------

/** Tickets a medal pays, once, the first time a machine's bronze, silver or gold score is reached. */
export const MEDAL_REWARD = { bronze: 15, silver: 40, gold: 100 } as const;

/**
 * Coming back day after day: the first ticket play of a day pays `perDay` tickets for every day of
 * the streak so far (a day missed starts it again), up to `maxDays`.
 */
export const STREAK = { perDay: 10, maxDays: 7 } as const;

/**
 * The weekly league: the tickets won at the arcade this week (Monday to Sunday) against the
 * regulars'. Their totals grow through the week from a base drawn per week in `rivalWeek`
 * (tickets); first place on Sunday night takes the league pennant home.
 */
export const LEAGUE = { rivalWeek: { min: 250, max: 1400 }, rivals: 5 } as const;

/**
 * The ticket wheel: what each slice pays and how wide it is (weights, so the slices are drawn to
 * their odds). Expected about 12 tickets a spin, well under a decent skill play (35-40): the wheel
 * is for the thrill. `JACKPOT` is progressive: it starts at `start`, grows by `perSpin` every spin
 * anyone takes, and goes back to `start` when someone hits it.
 */
export const WHEEL_SLICES: readonly { tickets: number | 'jackpot'; weight: number }[] = [
  { tickets: 4, weight: 12 },
  { tickets: 20, weight: 6 },
  { tickets: 6, weight: 12 },
  { tickets: 50, weight: 2 },
  { tickets: 8, weight: 11 },
  { tickets: 15, weight: 7 },
  { tickets: 5, weight: 12 },
  { tickets: 'jackpot', weight: 0.6 },
  { tickets: 10, weight: 10 },
  { tickets: 30, weight: 4 },
  { tickets: 6, weight: 12 },
  { tickets: 100, weight: 1 },
  { tickets: 8, weight: 11 },
  { tickets: 25, weight: 5 },
  { tickets: 5, weight: 12 },
  { tickets: 12, weight: 9 },
];
export const JACKPOT = { start: 250, perSpin: 3 } as const;

/** A random game for the collection from the prize counter: the dearest thing on the list. */
export const MYSTERY_GAME_TICKETS = 900;
