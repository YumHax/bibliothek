import type { BoxCondition, CopyVariant, Edition, Game, PlatformId } from '@/catalog/types';
import type { Views } from './Fame';
import { hash01 } from './seeded';

export { hash01 } from './seeded';

/*
 * THE ECONOMY'S NUMBERS, all in one place. Coins buy games and arcade plays; the cabinets pay in
 * tickets, exchanged at the prize counter. No public price source exists without an API key, so
 * prices are made up: a base per platform, times how famous the game is (its Wikipedia page views,
 * see `Fame`), times a small deterministic jitter from the game's id so two classics differ.
 */

/**
 * Coins in a brand-new wallet: a first round of arcade plays with enough left over that the first
 * bargain-bin game (`BARGAIN_PRICE`) is a few good plays away, not an evening's.
 */
export const STARTING_COINS = 20;
/** One arcade play. */
export const PLAY_COST = 1;
/** The prize counter's rate. */
export const TICKETS_PER_COIN = 10;
/** Arcade score points per ticket paid out, for a game `PAYOUT` does not list. */
export const POINTS_PER_TICKET = 50;

/**
 * Points per ticket, per arcade game (by the id its machine reports). The games score on very
 * different scales (a pinball ball is worth tens of thousands, a roll up the alley a few hundred)
 * and last differently long, so each rate is set on what an ordinary player nets there a minute,
 * the coin each play costs paid: about 60 tickets (6 coins) a minute on every machine, some 25-30 a
 * play on a short one, 40-50 on a long one; a first-timer nets 20-55 (`COIN_BACK` keeps a flop from
 * costing the coin), a good player one and a half to two times the ordinary one. The plays are measured by `npm run balance` (scripts/arcade-balance.mjs:
 * every cabinet game and the alley, hoops and pinball played headless by simulated people, a novice,
 * an ordinary player and a good one: their reactions, their timing, their slips); retune a rate
 * from its table, and check the real plays with `?payout` (see docs/economy.md).
 */
export const PAYOUT: Readonly<Record<string, number>> = {
  breakout: 57,
  invaders: 65,
  stacker: 134,
  frog: 78,
  snake: 12,
  comets: 47,
  pinball: 240,
  alley: 10,
  duel: 18,
  stepbeat: 195,
  sheriff: 100,
  hoops: 14,
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
 * Beginner's luck: the first `plays` ticket plays on each machine pay at least `tickets` (twice the coin they
 * cost), so learning a cabinet is already a profit and the first minutes in the hall feel like winning.
 */
export const BEGINNER = { plays: 3, tickets: 20 } as const;

/**
 * Coin back: however badly it went, a paid ticket play pays at least the coin it cost, in tickets. A flop costs
 * only the time, so trying a new machine or a risky run never hurts; skill is all profit on top. Not on the
 * wheel (pure luck) nor a play the house stood or the cabinet gave free (nothing was paid to give back).
 */
export const COIN_BACK = TICKETS_PER_COIN * PLAY_COST;

/**
 * Broke, and not even a coin's worth of tickets: the house stands the play (ticket machines only),
 * so the loop never dead-ends.
 */
export function playIsFree(wallet: { readonly coins: number; readonly tickets: number }): boolean {
  return wallet.coins < PLAY_COST && wallet.tickets < TICKETS_PER_COIN * PLAY_COST;
}

/** What the change machine coughs up on a day it works: coins, and how often a day it works. */
export const CHANGE_MACHINE = { minCoins: 1, maxCoins: 3, workingOdds: 0.25 };

/** The daily challenge's reward range in tickets (the day picks one in it). */
export const CHALLENGE_REWARD = { min: 50, max: 90 };
/**
 * Where the daily challenge's target falls on a game's starting table (`rivals.ts`, 0-based ranks,
 * best first): between the `low` rank's score and the `high` one's, the fourth and the second
 * score (an ordinary player's good play to a good player's best in ten). A game whose table sits
 * higher or lower than the others' can have its own band here.
 */
export const CHALLENGE_BAND: Readonly<Record<string, { low: number; high: number }>> & { default: { low: number; high: number } } = {
  default: { low: 3, high: 1 },
};

/** How often a day has an arcade machine out of order. */
export const OUT_OF_ORDER_ODDS = 0.35;

/**
 * Shop price of an ordinary game per platform, before the fame factor. Calibrated against the
 * arcade (`PAYOUT`): an ordinary player nets about 6 coins a minute there once the coin each play
 * costs is paid, a good one 8-10 (more on a challenge or a medal); for a good player an ordinary
 * market copy (about 0.7 of the shop price: a NES one about 110) is 12-15 minutes of play, a famous
 * shop title an hour or more, a bargain-bin game three (four for an ordinary player).
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
/** How a bargain-bin copy's receipt names where it came from (`Acquisition.where`). */
export const BIN_WHERE = 'the bargain bin';
/** The street's flat-price copies' receipts (a garage sale, the box of cast-offs): capped at the desk like the bin's. */
export const GARAGE_WHERE = 'a garage sale on Front Street';
export const GIVEAWAY_WHERE = 'a box of cast-offs on Front Street';
/** A game out of a sealed box lot (`economy/boxLots.ts`): its receipt is its share of the carton's price, capped at the desk like the bin's. */
export const SEALED_WHERE = 'a sealed box lot';
const FLAT_PRICE_WHERES: ReadonlySet<string> = new Set([BIN_WHERE, GARAGE_WHERE, GIVEAWAY_WHERE, SEALED_WHERE]);
/** How the mystery game's receipt names where it came from (paid in tickets: its price on the receipt is 0). */
export const PRIZE_WHERE = 'the prize counter';

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
  offers: { cheeky: 0.72, fair: 0.8, polite: 0.9 },
  /** The lowest share of the tag the stallholder will take, drawn per copy and day in this range. */
  floor: {
    ordinary: [0.72, 0.9],
    worn: [0.62, 0.82],
    showpiece: [0.86, 0.97],
  } as Record<'ordinary' | 'worn' | 'showpiece', [number, number]>,
  patience: 3,
  /**
   * Whatever sways them, no stallholder goes under this share of the tag: with the day's deepest
   * discount and the Flea Fair's 5 % off (`BROCANTE.priceFactor`) it stays above what the WE BUY desk pays at the top reputation,
   * so buying to sell back never pays.
   */
  lowest: 0.7,
  /**
   * A worn copy's stallholder is keener: its lowest share. Still above the desk: the day's deepest
   * discount (0.55) at the Flea Fair (0.95) times this is over the top desk share (0.34), both
   * sides times the worn factor.
   */
  lowestWorn: 0.66,
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
  /**
   * Everything that sways a stallholder down (loyalty, a coffee, the rain, the player's perks: `household/perks`) adds up
   * to this share of the tag at most, so each still counts and a cheeky offer is not always taken.
   */
  maxSway: 0.1,
} as const;

/** How a copy's printing moves its price, and how often a stall copy is a first print or a budget re-release. */
export const EDITION_FACTOR = { firstPrint: 1.45, standard: 1, budget: 0.75 } as const;
export const EDITION_ODDS = { firstPrint: 0.08, budget: 0.18 };
/** What each platform's budget re-release line was called. */
/**
 * What sets a copy apart (`economy/copyTraits`): how often an ordinary stall copy is one, and what it does to its
 * price, everywhere alike (the stall, the WE BUY desk, a swap, a WANTED card, the collection's value), so buying to
 * sell back still never pays. `sealed` only on a complete, genuine copy (never opened: the stallholder will not let it
 * be, and the seal broken at home it is worth its ordinary price); `crushed` is commoner in the bargain bin.
 * `showpieceBoost` multiplies the sealed odds on a collector's piece (a showpiece, an estate sale).
 */
export const VARIANT = {
  sealed: { odds: 0.025, factor: 2.2 },
  misprint: { odds: 0.012, factor: 2.6 },
  crushed: { odds: 0.07, binOdds: 0.25, factor: 0.75 },
  showpieceBoost: 4,
} as const satisfies Record<CopyVariant, { odds: number; factor: number; binOdds?: number }> & { showpieceBoost: number };

/** How a copy's variant moves its price (1 for none). */
export function variantFactor(game: Pick<Game, 'variant'>): number {
  // A save from another build may name a variant this one does not know: no factor, never a throw.
  const known: { factor: number } | undefined = game.variant ? VARIANT[game.variant] : undefined;
  return known?.factor ?? 1;
}

/**
 * A copy's past (`copyTraits`): the share of second-hand copies that carry one (a name in marker, a save, a note...),
 * found on opening the box. Flavour only: it moves no price.
 */
export const PAST_ODDS = 0.3;

/**
 * Unlicensed cartridges (`catalog/bootlegs`): the chance a market day's bargain bin holds one, and that an ordinary
 * stall find on a cartridge platform is one instead. Priced like any game no article knows (fame "none").
 */
export const BOOTLEG = { binOdds: 0.45, stallOdds: 0.02 } as const;

export const BUDGET_LABEL: Record<PlatformId, string> = {
  nes: 'Classic Series',
  snes: "Player's Choice",
  gb: "Player's Choice",
  megadrive: 'Sega Classics',
  n64: "Player's Choice",
  ps1: 'Greatest Hits',
};

/**
 * What each stall shows a day: `perPlatform` ordinary copies (drawn in the range; a theme may add
 * some), `bin` copies in the bargain bin, `wantedOdds` that a wishlisted game turns up on its stall,
 * `showpieceFirstPrint` that the showpiece is a first print.
 */
export const MARKET_STOCK = { perPlatform: { min: 2, max: 8 }, bin: 8, wantedOdds: 0.4, showpieceFirstPrint: 0.3 } as const;
/** How second-hand copies turn up: one in ten worn, a fifth without the manual, the rest complete. */
export const CONDITION_ODDS = { worn: 0.1, noManual: 0.2 } as const;

/** Share of a stall's ordinary finds that are Japanese imports, and their price against a western copy's. */
export const IMPORT = { odds: 0.07, price: 0.7 };
/**
 * A homebrew NES cart (`emulator/homebrew`: plays for real on the TV) on the NES stall: the share of market days one
 * is there (one the player does not own yet), and its price (coins: new, from a small run, whatever its fame).
 */
export const HOMEBREW = { odds: 0.45, price: 90 };
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

/** A game sold at the WE BUY desk goes on its platform's stall the next day, and stays this many market days. */
export const CONSIGNMENT_DAYS = 3;
/** Notice-board cards (and which were dealt with) are kept this many market days: longer than any card stays up. */
export const CARD_MEMORY_DAYS = 7;

/** A second-hand copy ordered at the mail-order counter: deposit share, the days it takes, and its price (a share of the shop price, complete). */
export const MARKET_ORDER = { deposit: 0.2, days: 2, share: 0.72 };

/** The day's job lot: this many games, sold together at this share of what they would cost one by one. */
export const JOB_LOT = { min: 4, max: 6, share: 0.55 };

/** A game swapped at a stall counts for this share of its shop price (times its condition): more than the WE BUY desk, less than a stall asks. */
export const TRADE_SHARE = 0.42;

/** The notice board: collectors pay this share of a game's shop price (drawn in the range), for this many market days. */
export const WANTED_AD = { perDay: 3, share: [0.62, 0.8] as [number, number], days: 3, premium: 1.15 };
/**
 * Private sellers' cards: this many a day, at this share of the shop price, delivered to the parcel;
 * `completeOdds` of them complete (the rest without the manual, at `noManualFactor` of the price).
 */
export const FOR_SALE_AD = { perDay: 2, share: [0.45, 0.6] as [number, number], completeOdds: 0.6, noManualFactor: 0.8 };

/** A coffee from the cart. */
export const COFFEE_PRICE = 2;

// --- Front Street and the landing: the street's prices, the collector's markup, the neighbours' swaps ---

/**
 * What the shops along Front Street sell over the counter to be used up (`errands/`), coins: the bakery's croissant,
 * the bar's lemonade, the butcher's scrap for the stray, the pet shop's pouch of treats (three portions), the florist's
 * bunch of the season's flowers.
 */
export const STREET_TREATS = { croissant: 1, lemonade: 2, scrap: 1, treats: 2, bunch: 2 } as const;
/** How many of each a real day a shop will sell (the rest: "that's enough for today"). */
export const STREET_TREATS_PER_DAY = { croissant: 2, lemonade: 3, scrap: 2, treats: 1, bunch: 2 } as const;

/**
 * The newsagent's PIXEL SCRATCH card (`street/shops/scratchCard.ts`): its price, how many one player
 * may buy in a real day, what three of each symbol pay (cherries, pads, cartridges, stars, sevens) and
 * the odds of each outcome (a loss, then three of `prizes[i]`): 1.35 coins paid out a card on average,
 * under its price (the house wins).
 */
export const SCRATCH = {
  price: 2,
  perDay: 5,
  prizes: [2, 3, 5, 10, 25],
  odds: { lose: 0.62, win: [0.2, 0.09, 0.06, 0.025, 0.005] },
} as const;

/** The collector outside RETRO GAMES (`street/shops/Trader.ts`) sells what he took off the stalls at this times their price. */
export const TRADER_MARKUP = 1.25;

/**
 * The saleroom behind the flea market (`economy/auction.ts`, `AuctionHouse`): a sale every `every` market days from
 * `offset` (a quiet day of the week round, the first one three days into a new game), `lots.games` games and `lots.sealed` sealed cartons, called between
 * game hours `hours`. A lot opens at `reserve` of its shop price (times its condition and printing, like the stalls:
 * over the WE BUY desk's top share, so a lot nobody else wants is a bargain, never a press); the room expects it to
 * fetch about `estimate` of that. Silence after a bid: `call` seconds to "going once", as much to "twice", as much to
 * the hammer; a lot nobody opens in `openSilence` seconds is passed. `pause` between two lots.
 */
export const AUCTION = {
  every: 7,
  offset: 3,
  lots: { games: 4, sealed: 2 },
  hours: [9, 22] as readonly [number, number],
  reserve: 0.36,
  estimate: [0.68, 0.95] as readonly [number, number],
  firstPrintOdds: 0.25,
  call: 2.6,
  openSilence: 7,
  pause: 5,
} as const;

/**
 * Sealed box lots (`economy/boxLots.ts`): a taped carton bought blind, unpacked at home one thing at a time.
 * `items` things in it, each a game with `gameOdds` (else junk: cables, a magazine, now and then loose coins);
 * a game is now and then (`bootlegOdds`) an unlicensed cartridge; one carton in `gemOdds` hides a well-known title. Priced by weight: `perItem` coins a thing, so a heavy carton costs
 * more and says so, not what is in it. The flea market sells `perDay` by the job lot (`marketShare` of that price);
 * the saleroom puts `AUCTION.lots.sealed` under the hammer. A game the player has already counts `duplicateShare` of
 * its share of the price in coins (the buyer takes it off them).
 */
export const SEALED_LOT = { items: [3, 7] as readonly [number, number], gameOdds: 0.5, bootlegOdds: 0.12, gemOdds: 0.16, perItem: 34, marketShare: 1, perDay: 1, duplicateShare: 0.6, coinsOdds: 0.25, coins: [1, 4] as readonly [number, number] } as const;

/**
 * The rival collector (`economy/rivalCollector.ts`): at the flea market on `marketOdds` of market days between
 * `hall.hours`, after the priciest copy on the stalls; he says which and where, browses `hall.browse` seconds first
 * (the player's head start), then takes it if it is still there. His takes wait in his suitcase on Front Street for
 * `haulDays` market days at `TRADER_MARKUP`. In the saleroom he bids hardest on the star lot, a little harder each
 * time the player beat him (`keenness`: per win, capped).
 */
export const RIVAL = { marketOdds: 0.45, hall: { hours: [9, 17] as readonly [number, number], arrive: 9, browse: 55, look: 4 }, haulDays: 3, keenness: { perWin: 0.04, max: 0.2 } } as const;

/**
 * The neighbours' swaps (`NeighbourTrades`): the share of market days a resident slips a note under the
 * door (`odds`), the market days an offer stands (`lasts`), the owned games before anyone asks
 * (`minOwned`), the resident's games considered (`candidates`), and what they give against what they
 * get (`fair`: its worth over the player's game's, within the range, nearest `ideal`).
 */
export const NEIGHBOUR_SWAPS = { odds: 0.35, lasts: 3, minOwned: 3, candidates: 10, fair: [0.8, 1.35] as readonly [number, number], ideal: 1.05 } as const;

/**
 * The estate sale in the entrance hall (`building/estateSale`): once, from game day `fromDay` (or `notice` days after
 * a save first looks), for `days` days. `copies` games on the tables, at `discount` of the shop price (a family
 * clearing a flat, haggled like a stall); a grail at the bottom of the crate at `grailShare` of its own price (they
 * do not know what it is).
 */
export const ESTATE_SALE = { fromDay: 25, notice: 3, mourning: 5, days: 3, copies: 9, discount: 0.62, grailShare: 0.3 } as const;

/**
 * Changing one's mind after buying: within this many seconds, for this share of the full price back
 * (the price less the rest, rounded: a 1-coin copy comes back whole); a held copy goes back on hold
 * with its deposit, which stays paid down.
 */
export const UNDO_PURCHASE = { seconds: 8, refund: 0.9 };

/** A deliberate second click: a first click arms a sale (a row, a tag, a button) for this long, the second within it goes through. */
export const CONFIRM_MS = 4000;
/** Something for the flat dearer than this (coins) asks for that second click wherever it is bought (a shop's tag or till, the household stall, the bookcase kit). */
export const ARM_ABOVE = 30;
/** How many coin clinks a purchase of `price` coins makes (the same everywhere something is bought on the spot). */
export function purchaseClinks(price: number): number {
  return Math.min(8, Math.max(2, Math.round(price / 20)));
}

/** Other shoppers buy too: one purchase every so many seconds on average while someone browses, never more than this share of the day's stall stock. */
export const RIVAL_BUYING = { meanSeconds: 55, maxShare: 0.25 };

/**
 * The market's view of the player, lifetime: reputation points per deed, and the levels they
 * reach. Level 2 opens the glass case; every level adds to what the WE BUY desk pays.
 */
export const REPUTATION = {
  // `openHouse`: an open house the paper wrote up (`visitors/gathering/OpenHouse`).
  points: { buy: 1, sell: 1, deal: 1, swap: 1, lot: 2, wanted: 3, set: 10, openHouse: 5 },
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
export function marketPrice(game: Pick<Game, 'id' | 'platform' | 'variant'>, views: Views, condition: BoxCondition, discount: number, edition: Edition = 'standard'): number {
  return Math.max(1, Math.round(shopPrice(game, views) * discount * CONDITION_FACTOR[condition] * EDITION_FACTOR[edition] * variantFactor(game)));
}

/** What a dealer reads off a copy: `Game` minus what does not move its price. */
export type DealtCopy = Pick<Game, 'id' | 'platform' | 'condition' | 'edition' | 'repro' | 'restored' | 'sticker' | 'region' | 'acquired' | 'variant'>;

/**
 * What the WE BUY desk offers for `game` (its condition, edition, a Japanese import's lower price;
 * a reproduction fetches `REPRO_BUY_BACK`), integer coins, at least 1. `bonus` is the player's
 * reputation share on top. A bargain-bin copy never fetches more than the bin asked for it.
 */
export function buyBackPrice(game: DealtCopy, views: Views, bonus = 0): number {
  if (game.repro) return REPRO_BUY_BACK;
  const offer = Math.max(1, Math.round(shopPrice(game, views) * (BUY_BACK_SHARE + bonus) * dealerFactor(game) * EDITION_FACTOR[game.edition ?? 'standard']));
  return Math.min(offer, receiptCap(game));
}

/** What `game` counts for in a swap at a stall (a reproduction nearly nothing), integer coins; a bargain-bin copy at most what it cost. */
export function tradeValue(game: DealtCopy, views: Views): number {
  if (game.repro) return REPRO_BUY_BACK;
  const value = Math.max(1, Math.round(shopPrice(game, views) * TRADE_SHARE * dealerFactor(game) * EDITION_FACTOR[game.edition ?? 'standard']));
  return Math.min(value, receiptCap(game), paidCap(game));
}

/**
 * A copy bought at a price counts in a swap for no more than was paid for it: `TRADE_SHARE` is over what the
 * cheapest stall copy goes for, so without this a clearance buy swapped straight back would be credit for nothing.
 */
function paidCap(game: Pick<Game, 'acquired'>): number {
  const paid = boughtFor(game);
  return paid > 0 ? paid : Infinity;
}

/**
 * What a copy was bought for, when its receipt says so; 0 for a gift, a prize, a swap (its receipt holds only the
 * coins added, not what the copy was worth) or no receipt at all.
 */
function boughtFor(game: Pick<Game, 'acquired'>): number {
  const receipt = game.acquired;
  if (!receipt || receipt.where.startsWith(SWAP_WHERE_PREFIX)) return 0;
  return receipt.price;
}

/** How a swapped-in copy's receipt starts (`Transactions.swap`: "a swap at the NES stall"). */
export const SWAP_WHERE_PREFIX = 'a swap at ';

/**
 * What a collector answering a WANTED card pays for `copy`, the card offering `base` for a complete
 * copy: the copy's state as a dealer counts it and its printing move it like at the desk, a
 * reproduction fetches `REPRO_BUY_BACK`, and a flat-price copy (the bin, the mystery game) never more
 * than its receipt allows.
 */
export function wantedPay(base: number, copy: DealtCopy): number {
  if (copy.repro) return REPRO_BUY_BACK;
  const pay = Math.max(1, Math.round(base * dealerFactor(copy) * EDITION_FACTOR[copy.edition ?? 'standard']));
  return Math.min(pay, receiptCap(copy), wantedCap(copy));
}

/**
 * A collector pays a finder's premium over what the copy cost (`WANTED_AD.premium`), not a share of the shop price
 * whatever it cost: otherwise a copy bought off the stall that morning and handed over at noon is a sure profit.
 */
function wantedCap(copy: Pick<Game, 'acquired'>): number {
  const paid = boughtFor(copy);
  return paid > 0 ? Math.max(paid + 1, Math.round(paid * WANTED_AD.premium)) : Infinity;
}

/** A Japanese import (the stall's odd find: its box and manual are in Japanese). */
export function isImport(game: Pick<Game, 'region'>): boolean {
  return game.region === 'Japan';
}

/**
 * The most a dealer gives for a copy by its receipt: a flat-price copy (the bin, a garage sale, the cast-offs) what it cost,
 * the mystery game what its tickets were worth in coins (`MYSTERY_GAME_VALUE`), so none of them is a way to print coins
 * at the desk; anything else no cap.
 */
export function receiptCap(game: Pick<Game, 'acquired'>): number {
  const receipt = game.acquired;
  if (!receipt) return Infinity;
  if (receipt.where === PRIZE_WHERE) return MYSTERY_GAME_VALUE;
  return FLAT_PRICE_WHERES.has(receipt.where) ? Math.max(1, receipt.price) : Infinity;
}

/**
 * The state of a copy as a dealer counts it (the WE BUY desk, a swap): its condition, a worn copy
 * cleaned at home still counted as worn (so a cheap worn copy bought, cleaned and sold back never
 * pays), less an old price sticker left on the cover, less again for a Japanese import (the stall
 * sold it at `IMPORT.price`, so must the desk).
 */
function dealerFactor(game: Pick<Game, 'condition' | 'restored' | 'sticker' | 'region' | 'variant'>): number {
  const condition = game.restored ? 'worn' : game.condition ?? 'complete';
  return CONDITION_FACTOR[condition] * (game.sticker ? STICKER.factor : 1) * (isImport(game) ? IMPORT.price : 1) * variantFactor(game);
}

/**
 * An old shop's price sticker on some second-hand covers (`odds` of a stall copy): the copy goes at
 * `factor` of its price, and is worth that much less (value, desk, swap) until it is peeled off at
 * home. A haggle over a stickered copy stops at the lowest price an unstickered one would (the
 * negotiation divides its lowest share by `factor`), so buying, peeling and selling back never pays.
 */
export const STICKER = { odds: 0.12, factor: 0.85 } as const;

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


/**
 * A bookcase (about 40 NES boxes): the collection room starts with one, those bought stand along its
 * walls, then in the bedroom. About half an hour at the cabinets for a good player (net of the plays), dearer than any ordinary copy.
 */
export const BOOKCASE_PRICE = 250;

// --- The arcade's extras: medals, streaks, the weekly league, the wheel, the mystery game -------

/** Tickets a medal pays, once, the first time a machine's bronze, silver or gold score is reached. */
export const MEDAL_REWARD = { bronze: 25, silver: 60, gold: 150 } as const;

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
export const LEAGUE = { rivalWeek: { min: 1500, max: 6000 }, rivals: 5 } as const;

/**
 * The Saturday tournament: `entry` coins to sign the sheet (once a Saturday), then three rounds on
 * the day's cabinet, each a normal paid play that must beat the opponent's score. `reward[n]` is
 * the tickets for going out after winning n rounds (3: the champion, who also takes the cup home).
 */
export const TOURNAMENT = { entry: 3, reward: [0, 60, 180, 450], prize: 'saturdayCup' } as const;

/**
 * The ticket wheel: what each slice pays and how wide it is (weights, so the slices are drawn to
 * their odds). Expected about 9.4 tickets a spin at the jackpot's start (10 with it at 450), under a
 * coin's worth and well under an ordinary skill play (25-50): the wheel is for the thrill, and worth a spin when the jackpot has grown. `JACKPOT` is progressive: it starts at `start`, grows by `perSpin` every spin
 * anyone takes, and goes back to `start` when someone hits it.
 */
export const WHEEL_SLICES: readonly { tickets: number | 'jackpot'; weight: number }[] = [
  { tickets: 4, weight: 14 },
  { tickets: 20, weight: 3.5 },
  { tickets: 6, weight: 13 },
  { tickets: 50, weight: 1 },
  { tickets: 8, weight: 11 },
  { tickets: 15, weight: 5 },
  { tickets: 5, weight: 14 },
  { tickets: 'jackpot', weight: 0.35 },
  { tickets: 10, weight: 9 },
  { tickets: 30, weight: 1.5 },
  { tickets: 6, weight: 13 },
  { tickets: 100, weight: 0.4 },
  { tickets: 8, weight: 11 },
  { tickets: 25, weight: 2.5 },
  { tickets: 5, weight: 14 },
  { tickets: 12, weight: 8 },
];
export const JACKPOT = { start: 250, perSpin: 3 } as const;

/** A random game for the collection from the prize counter: the dearest thing on the list. */
export const MYSTERY_GAME_TICKETS = 900;
/**
 * The mystery game is never a grail, nor anything whose shop price is over this (coins): 900 tickets
 * are 90 coins, so it may be a pleasant surprise (a good shop title), never a jackpot to sell on.
 */
export const MYSTERY_GAME_MAX_PRICE = 320;
/** What the mystery game counts for at the WE BUY desk and in a swap, at most: its tickets' worth in coins (90). */
export const MYSTERY_GAME_VALUE = Math.round(MYSTERY_GAME_TICKETS / TICKETS_PER_COIN);

/** The prize counter's list, in tickets, by prize id (`Prizes.ts` has what each one is). */
export const PRIZE_TICKETS = {
  keyring: 30,
  ball: 40,
  yoyo: 50,
  duck: 60,
  catToy: 80,
  poster: 120,
  bear: 150,
  cat: 150,
  rocket: 250,
  moodLamp: 300,
  lavaLamp: 350,
  trophy: 400,
  miniCabinet: 600,
  mysteryGame: MYSTERY_GAME_TICKETS,
} as const;

/**
 * What the flat's furniture costs, in coins (the bookcase is `BOOKCASE_PRICE`; `homeGoods.ts` has the list, who sells
 * what and how many). The flat starts bare (a bookcase, the TV, a mattress): at a good player's 8-10 coins a minute at the
 * cabinets (net of the plays; an ordinary player's 6) a print or a plant is a couple of minutes, an armchair or a lamp seven to ten, a bed or a dresser
 * about a quarter of an hour, the projector the long goal (about an hour). The whole flat is some eight hours.
 */
export const HOME_GOOD_PRICES = {
  // The market's household stall.
  rug: 120, lamp: 90, poster: 60, record: 25,
  // The furniture shop.
  armchair: 70, floorLamp: 55, sideTable: 30, livingRug: 45, floorCushions: 20, sideboard: 110, framedPrint: 15,
  bed: 120, nightstands: 50, dresser: 90, readingCorner: 80, bedroomRug: 35, mirror: 30,
  kitchenTable: 70, kitchenRug: 20, bathMat: 10, hallStand: 30, bistroSet: 60,
  // The displays for the collection's showpieces, and the label maker for the shelves (`world/showcase`, `world/labels`).
  displayCase: 95, pedestal: 65, labelMaker: 8,
  // The TV repair shop.
  crt: 300, projector: 550, speakers: 120, bedroomTv: 150, radio: 40, appliances: 45, homeArcade: 420,
  // The TV repair shop's region converters (`economy/regionLock`): a Japanese copy runs at home with its platform's.
  famicomAdapter: 35, superFamicomAdapter: 45, megaDriveConverter: 35, n64Passthrough: 50, ps1ModChip: 60,
  // The florist.
  houseplant: 14, plant: 12,
  // The pet shop.
  cat: 60, scratcher: 25, catToy: 5,
  // Mrs Roux's two rooms next door (the agency's sign on her door): the endgame's goal, near three projectors.
  annex: 1500,
} as const;

// --- The market's calendar of events: grails, the monthly big market, sales (see `marketEvents.ts`) ---

/**
 * The grails (`grails.ts`): one comes to the market every `every` market days from day `offset`
 * (an in-game day is ten minutes, so a little over an hour apart) and stays `stays` market days
 * (the market is open about six real minutes a day: one day was too short to catch), talked about
 * `rumourDays` days before. A haggle over one never goes under `floor` of its tag.
 */
export const GRAIL = { every: 8, offset: 5, stays: 2, rumourDays: 3, floor: 0.92 } as const;

/**
 * The Grand Flea Fair: once a market "month" (`month` days, from day `offset`; it falls on the week
 * round's last day), the hall fills up: `extraCopies` more per stall, the bin `bin.size` times as
 * deep at `bin.price` of its price, `gems` more gems in it, `crowd` times the shoppers, and every
 * stall `priceFactor` of its usual prices (with a haggle, still above what the WE BUY desk pays).
 * Announced `announceDays` days before.
 */
export const BROCANTE = { month: 28, offset: 13, extraCopies: 4, bin: { size: 2.5, price: 0.8 }, gems: 1, crowd: 1.8, priceFactor: 0.95, announceDays: 3 } as const;

/**
 * Sale days. The mail-order counter takes `catalogue.factor` off new copies every `catalogue.every`
 * market days (from `catalogue.offset`). Some days (`clearance.odds`) one stall clears out: its
 * copies go at `clearance.factor` of their price, no haggling (a haggle on top would go under the
 * WE BUY desk's offer). Neither touches the bargain bin, orders or copies held.
 */
export const SALES = {
  catalogue: { every: 6, offset: 3, factor: 0.8 },
  /** 0.66, not less: at the day's deepest discount on a Flea Fair day it still stays over the top desk share (see the check at the end). */
  clearance: { odds: 0.2, factor: 0.66 },
} as const;

// --- The collector's book: milestones (see `milestoneList.ts`) ---

/**
 * What each milestone of the collector's book pays once claimed there (coins, or arcade tickets);
 * a milestone missing here pays nothing but its place in the book (or the thing it brings home).
 */
export const MILESTONE_REWARD: Readonly<Record<string, { coins?: number; tickets?: number }>> = {
  'games-10': { coins: 15 },
  'games-25': { coins: 30 },
  'games-50': { coins: 60 },
  'games-100': { coins: 150 },
  'games-250': { coins: 400 },
  'platform-10': { tickets: 150 },
  'platform-25': { coins: 120 },
  'platforms-5': { coins: 40 },
  'set-1': { tickets: 100 },
  'sets-3': { coins: 100 },
  'medal-1': { tickets: 30 },
  'medals-10': { tickets: 150 },
  'deal-1': { coins: 10 },
  'sale-1': { coins: 10 },
  'league-1': { tickets: 200 },
  'value-1000': { coins: 50 },
  'value-5000': { coins: 200 },
  'grail-1': { coins: 100 },
};

// --- The one rule every number above must keep: buying to sell back never pays -------------------

/**
 * Checked once when the module loads (a constant check, so it either always holds or a retune broke
 * it): the cheapest a stall copy can ever go (the day's deepest discount, the Flea Fair's cut, a
 * stallholder's lowest share, a worn copy's lower one, a clearance with no haggle, a stickered copy's
 * haggle, which stops where an unstickered one's would) must stay over what the WE BUY desk pays at the
 * top reputation, both sides times the same condition factor. So must every other way a copy comes in
 * for coins: the job lot, a private seller's card, a mail order. A swap and a WANTED card are capped by
 * what the copy cost (`paidCap`, `wantedCap`), checked here too. The margin is thin (`lowestWorn`:
 * about 0.345 against 0.34), so a retune of any of these trips it.
 */
function assertBuyingToSellNeverPays(): void {
  const topDesk = BUY_BACK_SHARE + REPUTATION.buyBackBonus * (REPUTATION.levels.length - 1);
  const deepest = MARKET_DISCOUNT.min * BROCANTE.priceFactor;
  const ways: Record<string, number> = {
    haggle: deepest * NEGOTIATION.lowest,
    worn: deepest * NEGOTIATION.lowestWorn,
    clearance: deepest * SALES.clearance.factor,
    // A stickered copy's haggle stops at `lowest / STICKER.factor` of its already-cut tag (`haggle.ts`); clearance stalls carry no sticker.
    sticker: deepest * STICKER.factor * Math.min(1, NEGOTIATION.lowest / STICKER.factor),
    // The job lot is priced at the day's middle discount (`JobLot.ts`).
    lot: ((MARKET_DISCOUNT.min + MARKET_DISCOUNT.max) / 2) * JOB_LOT.share,
    forSale: FOR_SALE_AD.share[0] * FOR_SALE_AD.noManualFactor / CONDITION_FACTOR.noManual,
    order: MARKET_ORDER.share * SALES.catalogue.factor,
    // The saleroom's opening bid (a lot nobody else wants goes at it); a sealed lot's games are capped at their share.
    auction: AUCTION.reserve,
    // The building's own seller: the estate sale's tables (a family's haggle). A neighbour's shelf sells nothing.
    estate: ESTATE_SALE.discount * NEGOTIATION.lowestWorn,
  };
  for (const [way, share] of Object.entries(ways)) {
    if (share <= topDesk) {
      console.error(`[pricing] buying to sell back pays (${way}): a copy can come in at ${share.toFixed(3)} of the shop price, the WE BUY desk pays up to ${topDesk.toFixed(3)}. Retune NEGOTIATION, MARKET_DISCOUNT, BROCANTE.priceFactor, SALES, JOB_LOT, FOR_SALE_AD, MARKET_ORDER or REPUTATION.buyBackBonus.`);
    }
  }
  // A swap counts a copy for at most what it cost, a WANTED card pays at most its premium over that: neither is a press.
  if (!(TRADE_SHARE < 1) || !(WANTED_AD.premium < 1.5)) console.error('[pricing] TRADE_SHARE or WANTED_AD.premium out of range.');
}
assertBuyingToSellNeverPays();
