import type { GiftKind, InteractionGroup, InteractionId, SocialPlace, TierId, Trait } from './types';

/*
 * The numbers of the social layer (docs/social.md): the tiers, the traits, what each interaction does, the
 * battery, the drift, the gossip, the gifts. Data only: `standing`, `conversation`, `drift`, `gossip` read it.
 */

/** Warmth and trust run over these ranges. */
export const WARMTH = { min: -100, max: 100 } as const;
export const TRUST = { min: 0, max: 100 } as const;

/**
 * The warmth tiers, coldest first: `from` is the lowest warmth of the tier. A tier above `acquaintance` also needs
 * `trust` at least: short of it, they stay a tier lower (a charmer who is liked but not relied on). `name` is what
 * the player reads (the ids stay as saved: `stranger` reads "Polite", someone met but neither warm nor cold);
 * `colour` says the side at a glance, the same everywhere: reds and a cold blue below, grey in the middle, greens
 * above, gold for a close friend (red never means a friend).
 */
export const TIERS: readonly { id: TierId; from: number; trust: number; name: string; colour: string }[] = [
  { id: 'nemesis', from: -100, trust: 0, name: 'Nemesis', colour: '#8f1d2c' },
  { id: 'hostile', from: -70, trust: 0, name: 'Hostile', colour: '#c0392b' },
  { id: 'cold', from: -40, trust: 0, name: 'Cold', colour: '#5d8aa8' },
  { id: 'stranger', from: -15, trust: 0, name: 'Polite', colour: '#8a8f99' },
  { id: 'acquaintance', from: 10, trust: 0, name: 'Acquaintance', colour: '#9db58a' },
  { id: 'friendly', from: 30, trust: 10, name: 'Friendly', colour: '#6cbf5a' },
  { id: 'friend', from: 55, trust: 30, name: 'Friend', colour: '#2fa86a' },
  { id: 'close', from: 80, trust: 55, name: 'Close friend', colour: '#e2b33c' },
];

/** The bonds read off both axes (`tiers.bondOf`): warm is `warm` or more, trusted `trusted` or more. */
export const BOND = { warm: 30, cold: -15, trusted: 35 } as const;

/** How a trait bends an interaction: a factor on the odds and on the warmth it moves; `hour` limits it to some hours. */
interface TraitBend {
  odds?: number;
  warmth?: number;
  /** Only between these game hours (a night owl at 8 a.m.). */
  hours?: [number, number];
}

/** What each trait does, and how the book shows it. */
export const TRAITS: Record<Trait, { name: string; blurb: string; bends: Partial<Record<InteractionId, TraitBend>>; battery?: number; grudge?: number; gossipOut?: number }> = {
  chatty: { name: 'Chatty', blurb: 'Loves a long talk', bends: { chat: { odds: 1.25, warmth: 1.3 }, askDay: { odds: 1.2 } }, battery: 1.6 },
  grumpy: { name: 'Grumpy', blurb: 'Hard to please, especially early', bends: { joke: { odds: 0.6 }, compliment: { odds: 0.8 }, chat: { odds: 0.75, hours: [6, 11] }, complain: { odds: 1.4, warmth: 1.3 } }, battery: 0.7 },
  nightOwl: { name: 'Night owl', blurb: 'Not a morning person', bends: { chat: { odds: 0.6, hours: [6, 11] }, joke: { odds: 0.6, hours: [6, 11] } } },
  earlyBird: { name: 'Early bird', blurb: 'Bright in the morning, done by evening', bends: { chat: { odds: 0.7, hours: [20, 24] } } },
  nostalgic: { name: 'Nostalgic', blurb: 'Lights up about the old days', bends: { talkGames: { odds: 1.3, warmth: 1.4 }, giveGame: { warmth: 1.3 } } },
  competitive: { name: 'Competitive', blurb: 'Lives for a challenge', bends: { challenge: { odds: 1.5, warmth: 1.5 }, tease: { odds: 1.3 } } },
  proud: { name: 'Proud', blurb: 'Holds a grudge', bends: { tease: { odds: 0.5 }, joke: { odds: 0.85 }, apologise: { odds: 0.7 }, giveCoins: { odds: 0.4 } }, grudge: 2 },
  generous: { name: 'Generous', blurb: 'Gives as good as they get', bends: { askFavour: { odds: 1.3 }, askTip: { odds: 1.3 }, askDiscount: { odds: 1.2 } } },
  gossip: { name: 'Gossip', blurb: 'Knows everything, tells everyone', bends: { gossip: { odds: 1.5, warmth: 1.6 } }, gossipOut: 2 },
  catPerson: { name: 'Cat person', blurb: 'Asks after the cat', bends: { chat: { odds: 1.1 }, giveGift: { warmth: 1.1 } } },
  neat: { name: 'Neat', blurb: 'Notices noise and mess', bends: { complain: { odds: 1.2 }, joke: { odds: 0.9 } } },
  collector: { name: 'Collector', blurb: 'Talks shop gladly', bends: { talkGames: { odds: 1.4, warmth: 1.3 }, giveGame: { warmth: 1.4 } } },
  shy: { name: 'Shy', blurb: 'Warms up slowly', bends: { chat: { odds: 0.85, warmth: 0.7 }, joke: { odds: 0.8 }, compliment: { odds: 0.9 } }, battery: 0.6 },
  businesslike: { name: 'Businesslike', blurb: 'Coins talk louder than words', bends: { giveCoins: { odds: 1.6, warmth: 1.4 }, chat: { warmth: 0.7 }, askDiscount: { odds: 0.8 } } },
  romantic: { name: 'Romantic', blurb: 'A soft spot for flowers', bends: { compliment: { odds: 1.3, warmth: 1.3 }, giveGift: { warmth: 1.2 } } },
  funny: { name: 'Funny', blurb: 'Always up for a laugh', bends: { joke: { odds: 1.5, warmth: 1.5 }, tease: { odds: 1.3, warmth: 1.2 } } },
};

/**
 * One interaction of the conversation panel: its group, the odds it lands (`odds`, before mood, warmth and traits),
 * what it moves when it lands and when it does not (`win` / `lose`: warmth, trust), what it costs of the day's battery,
 * the warmth it needs (`from`: an apology is open to anyone; a favour is not asked of a stranger), where it is offered.
 */
interface InteractionRule {
  group: InteractionGroup;
  label: string;
  odds: number;
  win: { warmth: number; trust?: number };
  lose: { warmth: number; trust?: number };
  battery: number;
  /** The tier it needs (inclusive). */
  from?: TierId;
  /** Only below this tier (an apology to someone cross, a tease that is not yet a friendship's). */
  below?: TierId;
  /** Counts once a game day towards the standing (the rest of the day it is talk, no more). */
  daily?: boolean;
  /** Not offered at these places. */
  notAt?: readonly SocialPlace[];
  /** A deed the grapevine passes on (gossip reaches their ties). */
  heard?: boolean;
}

export const INTERACTIONS: Record<InteractionId, InteractionRule> = {
  chat: { group: 'talk', label: 'Chat', odds: 0.85, win: { warmth: 3 }, lose: { warmth: -1 }, battery: 1, daily: true },
  askDay: { group: 'talk', label: 'Ask about their day', odds: 0.8, win: { warmth: 3, trust: 1 }, lose: { warmth: -1 }, battery: 1, daily: true },
  talkGames: { group: 'talk', label: 'Talk games', odds: 0.6, win: { warmth: 5 }, lose: { warmth: -2 }, battery: 2, daily: true },
  compliment: { group: 'talk', label: 'Pay a compliment', odds: 0.7, win: { warmth: 4 }, lose: { warmth: -2 }, battery: 1, daily: true },
  joke: { group: 'talk', label: 'Tell a joke', odds: 0.55, win: { warmth: 6 }, lose: { warmth: -3 }, battery: 1, daily: true },
  gossip: { group: 'talk', label: 'Gossip about…', odds: 0.6, win: { warmth: 5 }, lose: { warmth: -3, trust: -2 }, battery: 2, from: 'acquaintance', daily: true },
  complain: { group: 'talk', label: 'Complain about the building', odds: 0.5, win: { warmth: 4 }, lose: { warmth: -2 }, battery: 1, daily: true },
  apologise: { group: 'talk', label: 'Apologise', odds: 0.6, win: { warmth: 10, trust: 3 }, lose: { warmth: 0 }, battery: 2, below: 'stranger', daily: true },
  askNumber: { group: 'ask', label: 'Ask for their number', odds: 0.75, win: { warmth: 1, trust: 2 }, lose: { warmth: -1 }, battery: 1, from: 'acquaintance', notAt: ['phone'] },
  askFavour: { group: 'ask', label: 'Ask a favour', odds: 0.6, win: { warmth: 0, trust: 2 }, lose: { warmth: -2 }, battery: 2, from: 'friendly' },
  askTip: { group: 'ask', label: 'Ask for a tip', odds: 0.55, win: { warmth: 0 }, lose: { warmth: -1 }, battery: 2, from: 'acquaintance', daily: true },
  askDiscount: { group: 'ask', label: 'Ask for a discount', odds: 0.4, win: { warmth: -1 }, lose: { warmth: -3 }, battery: 2, from: 'friendly', daily: true },
  tease: { group: 'mean', label: 'Tease', odds: 0.45, win: { warmth: 4 }, lose: { warmth: -8 }, battery: 1, daily: true },
  insult: { group: 'mean', label: 'Insult', odds: 1, win: { warmth: -18, trust: -6 }, lose: { warmth: -18, trust: -6 }, battery: 1, heard: true },
  challenge: { group: 'mean', label: 'Challenge them', odds: 0.6, win: { warmth: 5 }, lose: { warmth: -3 }, battery: 2, daily: true, notAt: ['phone'] },
  giveGift: { group: 'give', label: 'Give…', odds: 1, win: { warmth: 6, trust: 1 }, lose: { warmth: -3 }, battery: 0, notAt: ['phone'], heard: true },
  giveGame: { group: 'give', label: 'Give a game', odds: 1, win: { warmth: 14, trust: 4 }, lose: { warmth: -2 }, battery: 0, from: 'acquaintance', notAt: ['phone'], heard: true },
  giveCoins: { group: 'give', label: 'Give a few coins', odds: 0.5, win: { warmth: 4 }, lose: { warmth: -4 }, battery: 0, notAt: ['phone'] },
};

/**
 * The daily social battery: how much talk a person has in them a game day (`TRAITS[t].battery` multiplies it).
 * Past it, every more costs `over` warmth.
 */
export const BATTERY = { perDay: 6, over: -2 } as const;

/**
 * Mood of the day (`mood.ts`): drawn per person and game day, moved by the weather and by the events of the day
 * (`markMood`). Each mood bends the odds of everything.
 */
export const MOODS = {
  good: { name: 'In a good mood', glyph: '☀', odds: 1.2 },
  fine: { name: 'Fine', glyph: '⛅', odds: 1 },
  low: { name: 'Feeling low', glyph: '☁', odds: 0.85 },
  annoyed: { name: 'Annoyed', glyph: '⚡', odds: 0.65 },
} as const;
export type MoodId = keyof typeof MOODS;

/**
 * Gains slow as they grow: every warmth gained is × (1 - warmth / `span`) ^ `power` (never under `floor`), every trust gained
 * × (1 - trust / `trustSpan`) (never under `trustFloor`); and talk (the Talk and Mean groups) brings one person
 * `talkPerDay` warmth a game day at most, however well it goes. Gifts, favours and deeds are not capped.
 */
export const GAIN = { span: 120, power: 1.2, floor: 0.15, trustSpan: 160, trustFloor: 0.3, talkPerDay: 4 } as const;

/** How warmth and odds pull each other: every point of warmth adds this to the odds (capped by `oddsRange`). */
export const ODDS = { perWarmth: 0.004, range: [0.05, 0.97] as [number, number] } as const;

/**
 * Drift: after `graceDays` game days without contact, warmth slides `perDay` a day towards `rest` (from either
 * side; a grudge, `TRAITS.proud.grudge`, slows the climb back). Close friends drift at `closeShare` of the pace.
 * Trust never drifts.
 */
export const DRIFT = { graceDays: 6, perDay: 1, rest: 5, closeShare: 0.4 } as const;

/** The grapevine: a deed reaches those tied to them at `share` × the tie (inverted for a negative tie), `min` points at least to bother. */
export const GOSSIP = { share: 0.3, min: 1 } as const;

/** Memories: how many each keeps, and after how many game days a mild one (|weight| < `strong`) is forgotten. */
export const MEMORY = { keep: 8, fadeDays: 30, strong: 10 } as const;

/** The social year: birthdays come round every this many game days. */
export const BIRTHDAY_CYCLE = 60;
/** A gift on their birthday counts this many times. */
export const BIRTHDAY_GIFT = 3;

/** What a gift is worth to anyone (warmth), before their likes (`liked` ×) and dislikes (`disliked`, a flat loss). */
export const GIFTS: Record<GiftKind, { name: string; warmth: number }> = {
  croissant: { name: 'a croissant', warmth: 5 },
  flowers: { name: 'flowers', warmth: 7 },
  treats: { name: 'cat treats', warmth: 3 },
  scrap: { name: 'a butcher’s scrap', warmth: 1 },
  coins: { name: 'a few coins', warmth: 3 },
  game: { name: 'a game', warmth: 10 },
  cake: { name: 'cake', warmth: 8 },
  coffee: { name: 'a coffee', warmth: 4 },
  plush: { name: 'a plush', warmth: 5 },
  record: { name: 'a record', warmth: 8 },
};
export const GIFT_LIKE = { liked: 2, disliked: -6, perDay: 2 } as const;

/** Coins handed over by `giveCoins`. */
export const COIN_GIFT = 5;

/** The odds and warmth of a game given, by how well it fits their tastes (`gifts.gameFit`, 0..1). */
export const GAME_GIFT = { base: 0.5, fit: 1.2 } as const;

/** The building's opinion of the player: the average warmth of the residents met (`reputation.ts`). */
export const BUILDING_NAMES: readonly { from: number; name: string }[] = [
  { from: -100, name: 'the one everyone avoids' },
  { from: -40, name: 'the noisy one' },
  { from: -10, name: 'the new one' },
  { from: 15, name: 'the nice one on the 5th' },
  { from: 45, name: 'everyone’s favourite neighbour' },
];

/** The weekly digest in the journal: a change shows when a person moved this much warmth in the week. */
export const DIGEST = { everyDays: 7, notable: 8 } as const;
