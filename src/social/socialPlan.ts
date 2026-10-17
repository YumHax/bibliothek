import type { Fit, GiftKind, InteractionGroup, InteractionId, SocialPlace, TierId, Trait } from './types';

/*
 * The numbers of the social layer (docs/social.md): the tiers, the traits, what each choice does, the drift, the
 * gossip, the gifts, the promises. Data only: `standing`, `conversation`, `gossip`, `mood` read it.
 */

/** Warmth and trust run over these ranges. */
export const WARMTH = { min: -100, max: 100 } as const;
export const TRUST = { min: 0, max: 100 } as const;

/**
 * The warmth tiers, coldest first: `from` is the lowest warmth of the tier. A tier above `acquaintance` also needs
 * `trust` at least, which only promises kept bring (`PROMISE`: one is `STAMP` of trust): Friendly one, Friend two,
 * a close friend three. Short of it they stay a tier lower. `name` is what the player reads; `colour` says the side at
 * a glance, the same everywhere: reds and a cold blue below, grey in the middle, greens above, gold for a close
 * friend (red never means a friend). `light` is the short ladder a light person is read on (`tiers.tierName`).
 */
export const TIERS: readonly { id: TierId; from: number; trust: number; name: string; light: string; colour: string }[] = [
  { id: 'nemesis', from: -100, trust: 0, name: 'Nemesis', light: 'Hostile', colour: '#8f1d2c' },
  { id: 'hostile', from: -70, trust: 0, name: 'Hostile', light: 'Hostile', colour: '#c0392b' },
  { id: 'cold', from: -40, trust: 0, name: 'Cold', light: 'Cold', colour: '#5d8aa8' },
  { id: 'polite', from: -15, trust: 0, name: 'Polite', light: 'New face', colour: '#8a8f99' },
  { id: 'acquaintance', from: 10, trust: 0, name: 'Acquaintance', light: 'New face', colour: '#9db58a' },
  { id: 'friendly', from: 30, trust: 15, name: 'Friendly', light: 'Regular', colour: '#6cbf5a' },
  { id: 'friend', from: 55, trust: 30, name: 'Friend', light: 'Regular', colour: '#2fa86a' },
  { id: 'close', from: 80, trust: 45, name: 'Close friend', light: 'Old friend', colour: '#e2b33c' },
];

/** Trust a promise kept is worth, and one stamp of the book's and the card's (`tiers.stampsOf`). */
export const STAMP = 15;

/**
 * Promises (docs/social.md "Promises"): a favour said yes to is a promise; kept, it is a stamp of trust (raw, not
 * slowed) and warmth; broken, the stamp goes and it stings.
 */
export const PROMISE = { kept: { trust: STAMP, warmth: 5 }, broken: { trust: -STAMP, warmth: -6 } } as const;

/** A trait's say on one choice: how it lands (`fit`), maybe only at some game hours (a night owl at 8 a.m.). */
interface TraitBend {
  fit: Fit;
  hours?: [number, number];
}

/** What the player's news is about (`news.ts`): a trait likes or minds some kinds. */
export type NewsTag = 'games' | 'collection' | 'arcade' | 'bargain' | 'cat' | 'family' | 'building' | 'party' | 'street' | 'music';

/**
 * What each trait does and how the book shows it: how small talk lands with them (`bends`), the news they like or
 * mind, how long they hold a grudge, how far they carry gossip. A mood at some hours is `mood.ts`'s.
 */
export const TRAITS: Record<Trait, { name: string; blurb: string; bends: Partial<Record<'chat' | 'joke' | 'tease' | 'giveCoins' | 'apologise', TraitBend>>; news?: { likes?: readonly NewsTag[]; minds?: readonly NewsTag[] }; grudge?: number; gossipOut?: number }> = {
  chatty: { name: 'Chatty', blurb: 'Loves a long talk', bends: { chat: { fit: 'loves' } }, news: { likes: ['building', 'family', 'street'] } },
  grumpy: { name: 'Grumpy', blurb: 'Hard to please, especially early', bends: { joke: { fit: 'dislikes' }, chat: { fit: 'meh', hours: [6, 11] }, tease: { fit: 'dislikes' } }, news: { minds: ['party', 'arcade'] } },
  nightOwl: { name: 'Night owl', blurb: 'Not a morning person', bends: { chat: { fit: 'meh', hours: [6, 11] }, joke: { fit: 'meh', hours: [6, 11] } }, news: { likes: ['music', 'party'] } },
  earlyBird: { name: 'Early bird', blurb: 'Bright in the morning, done by evening', bends: { chat: { fit: 'meh', hours: [20, 24] } } },
  nostalgic: { name: 'Nostalgic', blurb: 'Lights up about the old days', bends: {}, news: { likes: ['collection', 'family', 'music'] } },
  competitive: { name: 'Competitive', blurb: 'Lives for a challenge', bends: { tease: { fit: 'loves' } }, news: { likes: ['arcade', 'games'] } },
  proud: { name: 'Proud', blurb: 'Holds a grudge', bends: { tease: { fit: 'dislikes' }, giveCoins: { fit: 'dislikes' }, apologise: { fit: 'meh' } }, grudge: 2 },
  generous: { name: 'Generous', blurb: 'Gives as good as they get', bends: { apologise: { fit: 'loves' } }, news: { likes: ['family', 'building'] } },
  gossip: { name: 'Gossip', blurb: 'Knows everything, tells everyone', bends: { chat: { fit: 'loves' } }, news: { likes: ['building', 'street', 'party'] }, gossipOut: 2 },
  catPerson: { name: 'Cat person', blurb: 'Asks after the cat', bends: {}, news: { likes: ['cat'] } },
  neat: { name: 'Neat', blurb: 'Notices noise and mess', bends: { joke: { fit: 'meh' } }, news: { minds: ['party', 'music'] } },
  collector: { name: 'Collector', blurb: 'Talks shop gladly', bends: {}, news: { likes: ['games', 'collection', 'bargain'] } },
  shy: { name: 'Shy', blurb: 'Warms up slowly', bends: { joke: { fit: 'meh' }, tease: { fit: 'dislikes' } } },
  businesslike: { name: 'Businesslike', blurb: 'Coins talk louder than words', bends: { giveCoins: { fit: 'loves' }, chat: { fit: 'meh' } }, news: { likes: ['bargain'] } },
  romantic: { name: 'Romantic', blurb: 'A soft spot for flowers', bends: {}, news: { likes: ['family', 'music'] } },
  funny: { name: 'Funny', blurb: 'Always up for a laugh', bends: { joke: { fit: 'loves' }, tease: { fit: 'loves' } } },
};

/**
 * One choice of the conversation panel: its group and label, where it is offered, from or below which tier, what it
 * moves when it is not a matter of fit (`win`: an insult, a number given, an apology). Topics, news and small talk
 * move by `TALK.fit`; gifts by `gifts.giftWarmth`.
 */
interface InteractionRule {
  group: InteractionGroup;
  label: string;
  win: { warmth: number; trust?: number };
  /** The tier it needs (inclusive). */
  from?: TierId;
  /** Only below this tier (an apology to someone cross). */
  below?: TierId;
  /** Not offered at these places. */
  notAt?: readonly SocialPlace[];
  /** A deed the grapevine passes on (gossip reaches their ties). */
  heard?: boolean;
  /** How it lands when no trait says otherwise. */
  fit?: Fit;
}

export const INTERACTIONS: Record<InteractionId, InteractionRule> = {
  topic: { group: 'talk', label: 'Their topic', win: { warmth: 0 } },
  news: { group: 'talk', label: 'Your news', win: { warmth: 0 } },
  chat: { group: 'talk', label: 'Small talk', win: { warmth: 0 }, fit: 'likes' },
  joke: { group: 'talk', label: 'A joke', win: { warmth: 0 }, fit: 'likes' },
  apologise: { group: 'talk', label: 'Apologise', win: { warmth: 10 }, below: 'polite', fit: 'likes' },
  askNumber: { group: 'ask', label: 'Ask for their number', win: { warmth: 1 }, from: 'acquaintance', notAt: ['phone'] },
  tease: { group: 'mean', label: 'Tease', win: { warmth: 0 }, from: 'friend', fit: 'likes' },
  insult: { group: 'mean', label: 'Insult', win: { warmth: -18, trust: -6 }, heard: true },
  giveGift: { group: 'give', label: 'Give…', win: { warmth: 0 }, notAt: ['phone'], heard: true },
  giveGame: { group: 'give', label: 'Give a game', win: { warmth: 0 }, from: 'acquaintance', notAt: ['phone'], heard: true },
  giveCoins: { group: 'give', label: 'Give a few coins', win: { warmth: 4 }, notAt: ['phone'], fit: 'likes' },
};

/**
 * How talk moves warmth (docs/social.md "How a choice lands"): by fit, scaled by their mood (a gain only: a bad day
 * dulls the good, it does not sharpen the bad), give or take `variance` of the amount, never of its sign. Only the day's
 * first conversation with someone counts (`exchanges` choices of it; after them they have to go), and two hits of
 * them make a good talk (`goodTalk`). A topic said again in a conversation drops a step each time; one talked about
 * within `repeatDays` drops a step.
 */
export const TALK = {
  fit: { loves: 3, likes: 1.5, meh: 0, dislikes: -1.5 } as Record<Fit, number>,
  mood: { good: 1.25, fine: 1, low: 0.7, annoyed: 0.4 },
  variance: 0.15,
  exchanges: 3,
  goodTalk: { hits: 2, warmth: 1 },
  repeatDays: 2,
  /** How many of their topics and of the player's news the menu offers at once. */
  topics: 3,
  news: 2,
} as const;

/**
 * Mood of the day (`mood.ts`): fine by default; good or low only with a cause the panel says (their card's `moods`,
 * the hour for a night owl, a mark of the day, their birthday). Each mood scales what talk brings (`TALK.mood`).
 */
export const MOODS = {
  good: { name: 'In a good mood' },
  fine: { name: 'Fine' },
  low: { name: 'Feeling low' },
  annoyed: { name: 'Annoyed' },
} as const;
export type MoodId = keyof typeof MOODS;

/** The day's draw of a mood with a cause from their card (`PersonCard.moods`): this share of days good, this low. */
export const MOOD_DAYS = { good: 0.18, low: 0.1 } as const;

/**
 * Gains slow as they grow: every warmth gained is × (1 - warmth / `span`) ^ `power` (never under `floor`), every trust
 * gained × (1 - trust / `trustSpan`) (never under `trustFloor`), but for a promise kept (raw). Gifts, favours and
 * deeds are slowed like talk.
 */
export const GAIN = { span: 120, power: 1.5, floor: 0.08, trustSpan: 160, trustFloor: 0.3 } as const;

/**
 * Drift: after `graceDays` game days without contact (a game day is ten minutes of play), warmth slides `perDay` a
 * day towards `rest` (from either side; a grudge, `TRAITS.proud.grudge`, slows the climb back). A friend or a close
 * friend waits `friendGraceDays` before drifting, close friends at `closeShare` of the pace: a friendship holds over
 * an evening away. Contact is anything that moves their standing, the grapevine and the phone included. Trust never
 * drifts.
 */
export const DRIFT = { graceDays: 8, friendGraceDays: 18, perDay: 1, rest: 5, closeShare: 0.4 } as const;

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
/** A loved gift counts this many times, an unwanted one is a flat loss. One gift a day counts; more are only polite. */
export const GIFT_LIKE = { liked: 1.5, disliked: -6 } as const;

/** Coins handed over by `giveCoins`. */
export const COIN_GIFT = 5;

/** The warmth of a game given, by how well it fits their tastes (`gifts.gameFit`, 0..1). */
export const GAME_GIFT = { base: 0.5, fit: 1.2 } as const;
/** A game given in the Christmas stall's paper and ribbon (`holidays/giftWrap`) means this much more. */
export const WRAPPED_GIFT = 1.35;

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
