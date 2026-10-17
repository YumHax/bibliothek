import type { Age, Sex } from '@/world/people/looks';

/*
 * The shapes of the social layer (docs/social.md): who the people are (`PersonCard`), what the player
 * stands at with each (`PersonState`), what talking does (`InteractionId`, `Fit`). Types only.
 */

/** A person's id: kebab-case, stable across saves ("leclerc", "mme-pereira", "victor"). */
export type PersonId = string;

/** Where the People book files them. */
export type SocialGroup = 'building' | 'street' | 'market' | 'arcade' | 'friends' | 'rivals';

/** Where a conversation takes place (some talk only fits some places: a dinner invitation is not made at a stall). */
export type SocialPlace = 'stairs' | 'theirFlat' | 'flat' | 'street' | 'shop' | 'market' | 'arcade' | 'saleroom' | 'courtyard' | 'phone' | 'elsewhere';

/** A personality trait: how a choice lands with them (`socialPlan.TRAITS`). */
export type Trait =
  | 'chatty'
  | 'grumpy'
  | 'nightOwl'
  | 'earlyBird'
  | 'nostalgic'
  | 'competitive'
  | 'proud'
  | 'generous'
  | 'gossip'
  | 'catPerson'
  | 'neat'
  | 'collector'
  | 'shy'
  | 'businesslike'
  | 'romantic'
  | 'funny';

/** The warmth tiers, coldest first (`tiers.ts`). `polite` is someone met, neither warm nor cold. */
export type TierId = 'nemesis' | 'hostile' | 'cold' | 'polite' | 'acquaintance' | 'friendly' | 'friend' | 'close';

/**
 * How deep the player can go with someone (docs/social.md "Two depths"): `deep` people (the residents, the old
 * friends, Mémé, Victor) have their own topics, needs and promises; `light` ones (clerks, stallholders, regulars)
 * are their trade first, read on a short ladder (`tiers.tierName`). Default `light`.
 */
export type Depth = 'deep' | 'light';

/**
 * How a choice lands with someone, the one thing their face shows before the click and their answer after it
 * (docs/social.md "How a choice lands"): it decides the warmth moved, not a hidden draw.
 */
export type Fit = 'loves' | 'likes' | 'meh' | 'dislikes';

/** A thing in the player's pocket or hand that can be given (errands' items, a game, coins). */
export type GiftKind = 'croissant' | 'flowers' | 'treats' | 'scrap' | 'coins' | 'game' | 'cake' | 'coffee' | 'plush' | 'record';

/** What they know about themselves that the player may learn, one fact at a time. */
export interface PersonFact {
  id: string;
  /** As the book shows it: "Plays the piano every evening". */
  text: string;
  /** Said when it comes up in talk: "I play every evening. You must hear it through the floor!" */
  says: string;
  /** Learned from this tier on (talking at a lower tier never brings it up). Default 'polite'. */
  from?: TierId;
}

/**
 * One of their topics (docs/social.md "Topics"): something that matters to them, offered to the player as the
 * player's own line. Open from `from` (default 'acquaintance'), or from the first meeting when `obvious`, or once
 * the fact `after` is known; talked about, it may teach a fact (`teaches`) and leave a memory.
 */
export interface PersonTopic {
  id: string;
  /** What the player says, as the menu shows it: "How's the piano coming along?" */
  say: string;
  /**
   * What the player says once it has been talked about ("Still playing every evening?"): a topic phrased for a first
   * meeting ("Was that you on the piano?") is not asked again without it.
   */
  again?: string;
  /** The icon of the row (`ui/social/icons` `TOPIC_ICONS`): 'piano', 'cat', 'family'… */
  icon: string;
  /** How they take it: always the same for the same person, so it can be learned. */
  fit: Fit;
  /** Their answers (one drawn each time). */
  answers: readonly string[];
  from?: TierId;
  /** Open from the first meeting (what anyone could see: the piano heard, the dog walked). */
  obvious?: boolean;
  /** Open once this fact of theirs is known. */
  after?: string;
  /** A fact of theirs learned the first time it lands. */
  teaches?: string;
  /** What they keep of it the first time it lands well ("you asked about my piano"). */
  memory?: string;
  /** As the People book lists it under "What matters to them": "The piano". */
  name: string;
}

/**
 * A perk (a tier reached) or a penalty (a tier fallen to): what it does, for the book and the banners, and the
 * value a system reads through `perks.effect(id, key)`.
 */
export interface SocialEffect {
  /** What a system asks for: 'noiseThreshold', 'holdsParcels', 'discount'. */
  key: string;
  /** From this tier up (a perk) or down (a penalty: `down`). */
  at: TierId;
  down?: boolean;
  /** Needs this trust at least too (a key, credit). */
  trust?: number;
  /** The value read (a share, a price factor, an hour); `true` when only on / off. */
  value?: number | boolean;
  /** As the book and the banner say it: "Holds your parcels at the lodge". */
  text: string;
}

/** The lines a card may give of its own (they replace the shared lines of `socialLines` when present). */
export type LineKey = 'hello' | 'cold' | 'hostile' | 'chat' | 'joke' | 'tease' | 'leaving' | 'bye' | 'repeat';

/** Someone the player can know. Data: `src/social/people/*`. */
export interface PersonCard {
  id: PersonId;
  /** As they introduce themselves, in full: "Rania Haddad". */
  name: string;
  /** As everyone calls them: "Mrs Haddad", "Victor". Default `name`. */
  short?: string;
  /** What they are to the player, a few words: "3rd floor, left", "the NES stall". */
  role: string;
  group: SocialGroup;
  /** How deep it goes with them (`Depth`). Default 'light'. */
  depth?: Depth;
  /** Where and when to find them, as the book says it once known: "On the stairs mornings and evenings". */
  whereabouts: string;
  /** How they introduce themselves the first time (the name is learned then). */
  intro: string;
  traits: readonly Trait[];
  /** Their tastes in games: platforms and genres they love (gifts of a game and game news land better). */
  tastes?: { platforms?: readonly string[]; genres?: readonly string[]; era?: [number, number] };
  /** Gifts they love and gifts they do not want. */
  likes?: readonly GiftKind[];
  dislikes?: readonly GiftKind[];
  /** Their birthday: a day of the social year (0 .. `BIRTHDAY_CYCLE` - 1, `socialPlan`). */
  birthday: number;
  /**
   * The look: the seed their body is drawn with, its role, and who they are (`sex`, `age`): every body built for them
   * and their portrait draw from the same (`world/people/looks.randomLook` with `world/people/castLook.castDress`).
   */
  look: { seed: number; role: 'vendor' | 'shopper'; sex?: Sex; age?: Age };
  /** They have a phone the player can be given the number of (asked from 'acquaintance'). */
  phone?: boolean;
  /** Their door on the stairs (`stairwell/building.doorKey`): the old friendship store was keyed by it. */
  door?: string;
  /** How they stand with others: -1 (can't stand them) .. 1 (close). What the player does to one reaches the others. */
  ties?: Readonly<Record<PersonId, number>>;
  facts?: readonly PersonFact[];
  /** What they like to talk about (`PersonTopic`): a deep person has four or more, a light one one or two. */
  topics?: readonly PersonTopic[];
  /** A light person's trade, for the shared lines of their line of work (`socialLines.TRADE_LINES`): 'clerk', 'stall'… */
  trade?: string;
  /** What puts them in a good or a low mood on a day, in words ("her son called"): the mood always has a cause. */
  moods?: { good?: readonly string[]; low?: readonly string[] };
  /** Perks and penalties of theirs (`SocialEffect`). */
  effects?: readonly SocialEffect[];
  /** Their own words (they replace the shared lines of `socialLines` when present). */
  lines?: Partial<Record<LineKey, readonly string[]>>;
  /** Where the warmth starts (a friend from before, the rival). Default 0. */
  startWarmth?: number;
  startTrust?: number;
  /** Not in the book until met (default); `always`: in it from the start (the friends). */
  listed?: 'met' | 'always';
  /** Family (Mémé): their warmth never drifts and never falls under `startWarmth`, whatever happens. */
  family?: boolean;
}

/** A moment they remember. */
export interface Memory {
  day: number;
  /** As they would say it: "you lent me Zelda". */
  text: string;
  /** How it felt: positive warms their lines, negative is a grudge. */
  weight: number;
  /** A game it is about (its id), for the cover beside it in the People book. */
  game?: string;
}

/** What the player stands at with one person (saved). */
export interface PersonState {
  warmth: number;
  /** What they can count on the player for: earned by promises kept (`PROMISE`), shown as stamps (`tiers.stampsOf`). */
  trust: number;
  /** The game day they were first met (introduced), or null: a stranger whose name the book does not know. */
  met: number | null;
  /**
   * Facts learned (`PersonFact.id`), and with a prefix what else was found out: `taste:<gift>` (how they take a
   * gift kind), `fit:<topic>` (how they take a topic).
   */
  known: string[];
  /** Traits found out (talk shows them over time). */
  traitsKnown: Trait[];
  memories: Memory[];
  /** `reason` -> the game day it last counted (a reason counts once a day; `topic:<id>`, `news:<id>`, `conversation`). */
  last: Record<string, number>;
  /** The game day of the last conversation or deed (drift starts after a while without one). */
  lastSeen: number;
  /** The tier last announced (a change is told once). */
  told: TierId;
  /** The player has their number (the phone can ring them). */
  number: boolean;
}

/**
 * What the player can do in a conversation (`socialPlan.INTERACTIONS`): their topics and the player's news
 * (`topic`, `news`), a little small talk, an apology, the asks and gifts, and being mean.
 */
export type InteractionId = 'topic' | 'news' | 'chat' | 'joke' | 'apologise' | 'askNumber' | 'tease' | 'insult' | 'giveGift' | 'giveGame' | 'giveCoins';

/** The panel's groups (a place's entries use them too: `TalkExtra.group`). */
export type InteractionGroup = 'talk' | 'give' | 'ask' | 'promise' | 'trade' | 'invite' | 'mean';

/** What a nudge changed: for the hearts, the banner, the listeners. */
export interface SocialChange {
  id: PersonId;
  warmth: number;
  trust: number;
  /** Why, as the card says it: "loved the flowers". */
  why?: string;
  before: TierId;
  after: TierId;
  /** Came through the grapevine (someone they know heard of it), not from the player directly: who told them. */
  heard?: boolean;
  from?: PersonId;
}
