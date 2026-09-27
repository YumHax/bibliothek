/*
 * THE FLAT'S NUMBERS: what the kitchen, the bathroom and the bedroom are good for (see
 * docs/household.md). Nothing here is ever a penalty: doing nothing leaves the game exactly as it
 * was; doing something is a plus, mostly for a day that matters (a grail, a friend coming round).
 */

export const HOUSEHOLD = {
  /** Cleaning a worn box at the kitchen table (the kit from the bathroom cabinet): this many a market day. */
  restorePerDay: 1,
  /** A hot bath: the next stallholder the player haggles with meets someone unhurried (offers of patience added). */
  soak: { patience: 1 },
  /**
   * A cake on the kitchen table: it keeps `days` market days (the day it is baked and the next). A friend who
   * visits while it is out has a slice, stays `linger` times as long, and on leaving leaves a thank-you:
   * `giftChance` a game they no longer want (else coins in `tip`).
   */
  cake: { days: 2, linger: 1.5, giftChance: 0.45, tip: [4, 9] as [number, number] },
  /**
   * A treat for the cat, once a market day. The next morning, `giftChance` it left something by its kitchen
   * bowl: a lost booklet (`manualChance`, when a game on the shelves lacks one) or a few coins from under the sofa.
   */
  treat: { giftChance: 0.55, manualChance: 0.35, coins: [2, 6] as [number, number] },
  /** Radio Brocante's morning chronicle: once a market day, the radio switched on between these hours of the clock. */
  radio: { from: 6, until: 11, grailDays: 6 },
  /**
   * The day's first purchase at a stall, made early (before `before` on the clock): stallholders say the first
   * sale brings luck, and go easier on it (`floor`, a share of the tag).
   */
  firstSale: { before: 9.5, floor: -0.05 },
  /** The alarm clock's settings (hours of the clock the player wakes at), and the one it starts on (`Sleep`'s own). */
  alarm: { hours: [6, 7, 8, 9, 10, 12] as readonly number[], initial: 7 },
  /** A night's sleep brings a dream of one of the morning's copies this often. */
  dreamChance: 0.5,
  /**
   * Manuals read in the reading chair, per platform: from `eye` the player notices a fake's print without
   * opening the box; from `respect` the platform's stallholders go easier on them (`respectFloor`).
   */
  knowHow: { eye: 3, respect: 6, respectFloor: -0.03 },
  /**
   * The phone: stallholders pick up in the market's hours (RETRO GAMES', `SHOP_HOURS.retro`) and put a copy aside
   * for a regular of theirs (loyalty `regularFrom` or more); a friend asked round comes the same day if asked
   * before `friendsUntil`, `inHours` later, once a market day.
   */
  phone: { regularFrom: 1, friendsUntil: 19, inHours: 1.5 },
} as const;
