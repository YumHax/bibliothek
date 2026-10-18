/*
 * The numbers of Front Street's counters (docs/economy.md "Front Street's shops and finds"): the bookshops, the
 * greengrocer's basket and the bakery's Friday tart, the launderette's board, the two bars' nights (THE ANCHOR's gig,
 * THE LOCAL's quiz and darts), TV REPAIR's bench and Karim's swaps, the pop-up in the empty shop, the newsagent's
 * paper. All first guesses. The flea market's own prices stay in `economy/pricing`.
 */

export const STREET_SHOPS = {
  /** CORNER BOOKS' box of loose manuals: one for a copy on the shelves that lacks it, now and then. */
  manuals: {
    /** Coins for a loose manual: a cartridge's booklet, a disc's insert. */
    price: { cart: 6, disc: 4 },
    /** Each copy without its manual has this chance a game week that its booklet is in the box. */
    weeklyOdds: 0.35,
    /** At most this many in the box at once. */
    shown: 5,
    /** A manual ordered (one not in the box) comes in this many game days later, paid when ordered. */
    orderDays: 2,
    /** The order costs this much over the box's price (the postage from the wholesaler). */
    orderExtra: 2,
  },
  /** COMICS & MANGA's strategy guides: a platform's know-how (as a manual read in the reading chair). */
  guides: { price: 5, perWeek: 3 },
  /** The greengrocer's baking basket (eggs, butter, lemons): a cake baked with it keeps a day longer. */
  basket: { price: 3, perDay: 1, max: 1, cakeDays: 1 },
  /** The bakery's Friday special: a fruit tart, carried as the pocket's cake (a gift for anyone who likes cake). */
  tart: { price: 4 },
  /** Market mornings (Wednesday and Saturday, `weekly.ts`): the greengrocer's basket at this price. */
  marketBasket: 2,
  /** The launderette's cork board: a card from a private seller one game day in `oneDayIn`. */
  board: { oneDayIn: 3 },
  /** THE ANCHOR's gig: Lou's band on Thursdays, from `from` to `to`; the cover at the door; the set takes `minutes`. */
  gig: { weekday: 3, from: 20.5, to: 23.5, cover: 3, minutes: 75, warmth: 6 },
  /** THE LOCAL's quiz: Tuesdays from `from` to `to`, `fee` a head; `questions` a round; the prizes by how many were right. */
  quiz: { weekday: 1, from: 19.5, to: 22.5, fee: 2, questions: 6, prizes: { 6: 20, 5: 12, 4: 6 } as Readonly<Record<number, number>> },
  /**
   * THE LOCAL's dartboard: three darts for `fee`, every evening, `perDay` goes. The chalkboard sets the night's checkout
   * (one of `checkouts`): taken to nought, the last dart in a double, it pays the first of `prizes` it is `upTo`, once a night.
   */
  darts: {
    from: 17,
    fee: 1,
    perDay: 3,
    checkouts: [50, 56, 60, 61, 64, 70, 76, 81, 90, 100] as readonly number[],
    prizes: [{ upTo: 60, coins: 6 }, { upTo: 70, coins: 9 }, { upTo: 100, coins: 14 }] as readonly { upTo: number; coins: number }[],
  },
  /** TV REPAIR's bench: Karim mends a console left with him for `feeShare` of what he would pay for it working, back after `days`. */
  repair: { feeShare: 0.45, days: 1 },
  /** Karim's box of doubles (his NES, Mega Drive and SNES spares): `count` in it a game week, one swap a week. */
  karim: { count: 3, perWeek: 1 },
  /** The pop-up in the empty shop by the butcher (CONTINUE?, imports and oddities): open from market day `fromDay`, `count` copies a week. */
  popUp: { fromDay: 21, count: 4, hours: { open: 11, close: 20 } },
  /** The newsagent's kiosk: the paper to keep, a subscription (the paper on the mat each morning), the cover cards. */
  paper: { price: 1, subscription: { price: 10, days: 14 }, cardEvery: 2 },
} as const;

/** The cover cards THE GAMING WEEKLY slips into its issues, one every `paper.cardEvery` game days: a set to collect. */
export const COVER_CARDS: readonly { id: string; title: string; line: string }[] = [
  { id: 'plumber', title: 'The Plumber', line: 'A moustache, a red cap, a jump heard round the world.' },
  { id: 'hedgehog', title: 'The Blue Blur', line: 'Gotta go fast, and he did, on every cover in 1991.' },
  { id: 'hero', title: 'The Hero in Green', line: 'A sword, a shield, a cave: it is dangerous to go alone.' },
  { id: 'ghosts', title: 'The Four Ghosts', line: 'Blinky, Pinky, Inky and Clyde, chasing round the maze.' },
  { id: 'blocks', title: 'The Falling Blocks', line: 'Seven shapes and a Russian folk song.' },
  { id: 'ape', title: 'The Big Ape', line: 'Barrels down the girders, and a carpenter climbing.' },
  { id: 'bounty', title: 'The Bounty Hunter', line: 'In the suit, and nobody knew who was inside till the end.' },
  { id: 'racer', title: 'The Kart Racer', line: 'A banana skin on the last bend, and friendships ended.' },
  { id: 'fighter', title: 'The Street Fighter', line: 'A blue gi, a red headband, a hadouken.' },
  { id: 'pocket', title: 'The Pocket Monster', line: 'Yellow, electric, and on every pencil case of 1999.' },
  { id: 'vampire', title: 'The Vampire Hunter', line: 'A whip, a castle, and the night is long.' },
  { id: 'spaceship', title: 'The Last Ship', line: 'One ship against a whole armada, again.' },
];
