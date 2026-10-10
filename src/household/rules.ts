/*
 * THE FLAT'S NUMBERS: what the kitchen, the bathroom and the bedroom are good for (see
 * docs/household.md). Nothing here is ever a penalty: doing nothing leaves the game exactly as it
 * was; doing something is a plus, mostly for a day that matters (a grail, a friend coming round).
 */

export const HOUSEHOLD = {
  /** Cleaning a worn box at the kitchen table (the kit from the bathroom cabinet): this many a rest (`restEvery`). */
  restorePerDay: 1,
  /**
   * The flat's small daily things (the box cleaned, the cat's treat, the drawers' finds) come back after a night's
   * sleep, or every `restEvery` market days for a player who never goes to bed: never a round to make every ten
   * minutes of play (`Household.rest`).
   */
  restEvery: 3,
  /** A hot bath: the next stallholder the player haggles with meets someone unhurried (offers of patience added). */
  soak: { patience: 1 },
  /**
   * A cake on the kitchen table: it keeps `days` market days (the day it is baked and the next). A friend who
   * visits while it is out has a slice, stays `linger` times as long, and on leaving leaves a thank-you:
   * `giftChance` a game they no longer want (else coins in `tip`).
   */
  cake: { days: 2, linger: 1.5, giftChance: 0.45, tip: [4, 9] as [number, number] },
  /**
   * A treat for the cat, once a rest (after a sleep). The next morning, `giftChance` it left something by its kitchen
   * bowl: a lost booklet (`manualChance`, when a game on the shelves lacks one) or a few coins from under the armchair.
   */
  treat: { giftChance: 0.55, manualChance: 0.35, coins: [2, 6] as [number, number] },
  /**
   * What lies behind a door or in a drawer of the flat, to be picked up (`rummage.ts`). The flat's own fittings (the
   * kitchen's cupboards, drawers, oven and fridge, the wardrobe, the mirror cabinet) each hold what the last tenant left
   * until it is taken: `leftover` coins, or a strip of arcade tickets (`ticketChance`). After that, each
   * spot holds something on `dailyChance` of rests (after a sleep, `restEvery`; bought furniture too): a few coins, a
   * few tickets, or in a drawer (`manualChance`, when a game on the shelves lacks one) a lost booklet. A rare surprise
   * on opening, never a round to make. Some 23 fitted doors and drawers: about 65 coins of leftovers in all, then
   * some 2 finds a rest.
   */
  rummage: {
    leftover: { coins: [2, 5] as [number, number], ticketChance: 0.3, tickets: [10, 25] as [number, number] },
    dailyChance: 0.08,
    daily: { coins: [1, 3] as [number, number], ticketChance: 0.35, tickets: [5, 15] as [number, number], manualChance: 0.12 },
  },
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
  /**
   * What the long jobs take, told in a fade to black (`pastime.ts`): `minutes` on the clock (as each one's line
   * says: an hour with cotton buds, a minute of warm air, forty minutes in the oven, a long soak), the fades (ms).
   * Every beat stays under `pastimeMaxMinutes`: a jump of 3 h or more between 5:00 and 11:00 reads as a night to
   * the cat (`CatBrain` TIME_SKIP_H, `cat/morning.placeForMorning`) and teleports it to its breakfast spot.
   * `Pastimes.run` complains in the console about a longer one.
   */
  pastimeMaxMinutes: 179,
  pastime: {
    clean: { minutes: 60, outMs: 700, darkMs: 1600, inMs: 800 },
    peel: { minutes: 1, outMs: 350, darkMs: 1500, inMs: 450 },
    bake: { minutes: 50, outMs: 900, darkMs: 2400, inMs: 900 },
    soak: { minutes: 45, outMs: 1100, darkMs: 2600, inMs: 1200 },
  },
} as const;
